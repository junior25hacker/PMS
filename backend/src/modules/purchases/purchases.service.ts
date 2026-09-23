import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { paginate } from '../../common/dto/pagination-query.dto';
import { PurchaseOrderStatus } from '../../common/enums';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { Batch } from '../entities/batch.entity';
import { Medicine } from '../entities/medicine.entity';
import { PurchaseOrderItem } from '../entities/purchase-order-item.entity';
import { PurchaseOrder } from '../entities/purchase-order.entity';
import { Supplier } from '../entities/supplier.entity';
import {
  CreatePurchaseOrderDto,
  PurchaseOrderQueryDto,
  ReceivePurchaseOrderDto,
  UpdatePurchaseOrderDto,
} from './dto/purchase-order.dto';

const round2 = (value: number): number =>
  Math.round((value + Number.EPSILON) * 100) / 100;

@Injectable()
export class PurchasesService {
  private readonly logger = new Logger(PurchasesService.name);

  constructor(
    @InjectRepository(PurchaseOrder)
    private readonly purchaseOrdersRepository: Repository<PurchaseOrder>,
    @InjectRepository(PurchaseOrderItem)
    private readonly itemsRepository: Repository<PurchaseOrderItem>,
    @InjectRepository(Supplier)
    private readonly suppliersRepository: Repository<Supplier>,
    @InjectRepository(Medicine)
    private readonly medicinesRepository: Repository<Medicine>,
    private readonly dataSource: DataSource,
  ) {}

  // -------------------------------------------------------------------------

  async create(
    dto: CreatePurchaseOrderDto,
    user: AuthenticatedUser,
  ): Promise<PurchaseOrder> {
    const supplier = await this.suppliersRepository.findOne({
      where: { id: dto.supplierId },
    });
    if (!supplier) throw new NotFoundException(`Supplier #${dto.supplierId} was not found`);

    if (dto.expectedDate && new Date(dto.expectedDate) < new Date(dto.orderDate)) {
      throw new BadRequestException('The expected date cannot be before the order date');
    }

    const medicines = await this.medicinesRepository.find({
      where: dto.items.map((item) => ({ id: item.medicineId })),
    });
    const medicineMap = new Map(medicines.map((medicine) => [medicine.id, medicine]));

    const missing = dto.items.find((item) => !medicineMap.has(item.medicineId));
    if (missing) {
      throw new NotFoundException(`Medicine #${missing.medicineId} was not found`);
    }

    const poId = await this.dataSource.transaction(async (manager) => {
      const poNumber = await this.nextPoNumber(manager);

      const items = dto.items.map((item) =>
        manager.create(PurchaseOrderItem, {
          medicineId: item.medicineId,
          quantity: item.quantity,
          receivedQuantity: 0,
          unitCost: round2(item.unitCost),
          lineTotal: round2(item.quantity * item.unitCost),
          batchNumber: item.batchNumber ?? null,
          expiryDate: item.expiryDate ?? null,
        }),
      );

      const totalAmount = round2(items.reduce((sum, item) => sum + item.lineTotal, 0));

      const purchaseOrder = manager.create(PurchaseOrder, {
        poNumber,
        supplierId: supplier.id,
        status: PurchaseOrderStatus.DRAFT,
        orderDate: dto.orderDate,
        expectedDate: dto.expectedDate ?? null,
        notes: dto.notes ?? null,
        totalAmount,
        createdById: user.id,
        items,
      });

      const saved = await manager.save(PurchaseOrder, purchaseOrder);
      this.logger.log(
        `Purchase order ${poNumber} created by ${user.email} — ${items.length} line(s), ${totalAmount.toFixed(2)}`,
      );
      return saved.id;
    });

    return this.findOne(poId);
  }

  async findAll(query: PurchaseOrderQueryDto) {
    const qb = this.purchaseOrdersRepository
      .createQueryBuilder('po')
      .leftJoinAndSelect('po.supplier', 'supplier')
      .leftJoinAndSelect('po.items', 'items');

    if (query.status) qb.andWhere('po.status = :status', { status: query.status });
    if (query.supplierId) {
      qb.andWhere('po.supplierId = :supplierId', { supplierId: query.supplierId });
    }
    if (query.search) {
      qb.andWhere('(po.poNumber ILIKE :term OR supplier.name ILIKE :term)', {
        term: `%${query.search}%`,
      });
    }

    qb.orderBy('po.createdAt', 'DESC').skip(query.skip).take(query.limit);

    const [items, total] = await qb.getManyAndCount();
    return paginate(items, total, query);
  }

  async findOne(id: number): Promise<PurchaseOrder> {
    const purchaseOrder = await this.purchaseOrdersRepository.findOne({
      where: { id },
      relations: {
        supplier: true,
        items: { medicine: true, batch: true },
        createdBy: true,
      },
    });
    if (!purchaseOrder) {
      throw new NotFoundException(`Purchase order #${id} was not found`);
    }
    return purchaseOrder;
  }

  async update(id: number, dto: UpdatePurchaseOrderDto): Promise<PurchaseOrder> {
    const purchaseOrder = await this.findOne(id);

    if (purchaseOrder.status !== PurchaseOrderStatus.DRAFT) {
      throw new ConflictException('Only draft purchase orders can be edited');
    }

    if (dto.supplierId) {
      const supplier = await this.suppliersRepository.findOne({
        where: { id: dto.supplierId },
      });
      if (!supplier) throw new NotFoundException(`Supplier #${dto.supplierId} was not found`);
      purchaseOrder.supplierId = supplier.id;
    }

    if (dto.orderDate) purchaseOrder.orderDate = dto.orderDate;
    if (dto.expectedDate !== undefined) purchaseOrder.expectedDate = dto.expectedDate;
    if (dto.notes !== undefined) purchaseOrder.notes = dto.notes;

    if (dto.items) {
      await this.itemsRepository.delete({ purchaseOrderId: id });
      purchaseOrder.items = dto.items.map((item) =>
        this.itemsRepository.create({
          purchaseOrderId: id,
          medicineId: item.medicineId,
          quantity: item.quantity,
          receivedQuantity: 0,
          unitCost: round2(item.unitCost),
          lineTotal: round2(item.quantity * item.unitCost),
          batchNumber: item.batchNumber ?? null,
          expiryDate: item.expiryDate ?? null,
        }),
      );
      purchaseOrder.totalAmount = round2(
        purchaseOrder.items.reduce((sum, item) => sum + item.lineTotal, 0),
      );
    }

    await this.purchaseOrdersRepository.save(purchaseOrder);
    return this.findOne(id);
  }

  async updateStatus(
    id: number,
    status: PurchaseOrderStatus,
  ): Promise<PurchaseOrder> {
    const purchaseOrder = await this.findOne(id);

    if (
      purchaseOrder.status === PurchaseOrderStatus.RECEIVED &&
      status !== PurchaseOrderStatus.RECEIVED
    ) {
      throw new ConflictException('A received purchase order cannot be reopened');
    }

    if (
      status === PurchaseOrderStatus.RECEIVED &&
      purchaseOrder.status !== PurchaseOrderStatus.RECEIVED
    ) {
      throw new BadRequestException(
        'Use the receive endpoint to book goods in — it creates the stock batches',
      );
    }

    purchaseOrder.status = status;
    await this.purchaseOrdersRepository.save(purchaseOrder);
    return this.findOne(id);
  }

  /**
   * Books goods in: creates one batch per received line and increments the
   * received quantities. Partial deliveries leave the PO in
   * `partially_received`.
   */
  async receive(
    id: number,
    dto: ReceivePurchaseOrderDto,
    user: AuthenticatedUser,
  ): Promise<PurchaseOrder> {
    await this.dataSource.transaction(async (manager) => {
      // Lock the PO row only — `pessimistic_write` with joined relations emits
      // `FOR UPDATE` on the nullable side of the LEFT JOIN, which Postgres
      // rejects. The PO row lock is enough: concurrent receives serialize on
      // it, and items are only mutated by this flow.
      const purchaseOrder = await manager.findOne(PurchaseOrder, {
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });

      if (!purchaseOrder) {
        throw new NotFoundException(`Purchase order #${id} was not found`);
      }

      const items = await manager.find(PurchaseOrderItem, {
        where: { purchaseOrderId: id },
        order: { id: 'ASC' },
      });
      purchaseOrder.items = items;

      if (
        purchaseOrder.status === PurchaseOrderStatus.CANCELLED ||
        purchaseOrder.status === PurchaseOrderStatus.DRAFT
      ) {
        throw new ConflictException(
          `Purchase order ${purchaseOrder.poNumber} is "${purchaseOrder.status}" and cannot receive goods`,
        );
      }

      for (const line of dto.items) {
        const item = purchaseOrder.items.find((candidate) => candidate.id === line.itemId);
        if (!item) {
          throw new NotFoundException(
            `Line item #${line.itemId} does not belong to purchase order ${purchaseOrder.poNumber}`,
          );
        }
        if (line.receivedQuantity <= 0) continue;

        const outstanding = item.quantity - item.receivedQuantity;
        if (line.receivedQuantity > outstanding) {
          throw new BadRequestException(
            `Line #${item.id}: only ${outstanding} unit(s) are still outstanding`,
          );
        }

        // poNumber already carries the "PO-" prefix (e.g. PO-20260916-0003).
        const batchNumber = line.batchNumber ?? item.batchNumber ?? `${purchaseOrder.poNumber}-${item.id}`;
        const expiryDate = line.expiryDate ?? item.expiryDate;
        if (!expiryDate) {
          throw new BadRequestException(
            `Line #${item.id}: an expiry date is required to book stock in`,
          );
        }

        const manufacturingDate =
          line.manufacturingDate ??
          new Date(new Date(expiryDate).getTime() - 365 * 24 * 60 * 60 * 1000)
            .toISOString()
            .slice(0, 10);

        const batch = await manager.save(
          manager.create(Batch, {
            medicineId: item.medicineId,
            supplierId: purchaseOrder.supplierId,
            batchNumber,
            manufacturingDate,
            expiryDate,
            quantity: line.receivedQuantity,
            initialQuantity: line.receivedQuantity,
            unitCost: item.unitCost,
            sellingPrice:
              line.sellingPrice ?? round2(item.unitCost * 1.35), // default 35% markup
          }),
        );

        item.receivedQuantity += line.receivedQuantity;
        item.batchId = batch.id;
        item.batchNumber = batchNumber;
        item.expiryDate = expiryDate;
        await manager.save(item);
      }

      const refreshed = await manager.find(PurchaseOrderItem, {
        where: { purchaseOrderId: id },
      });
      const fullyReceived = refreshed.every(
        (item) => item.receivedQuantity >= item.quantity,
      );
      const anyReceived = refreshed.some((item) => item.receivedQuantity > 0);

      purchaseOrder.status = fullyReceived
        ? PurchaseOrderStatus.RECEIVED
        : anyReceived
          ? PurchaseOrderStatus.PARTIALLY_RECEIVED
          : purchaseOrder.status;

      await manager.save(purchaseOrder);
      this.logger.log(
        `Purchase order ${purchaseOrder.poNumber} received by ${user.email} → ${purchaseOrder.status}`,
      );
    });

    return this.findOne(id);
  }

  async cancel(id: number): Promise<PurchaseOrder> {
    const purchaseOrder = await this.findOne(id);

    if (purchaseOrder.status === PurchaseOrderStatus.RECEIVED) {
      throw new ConflictException('A received purchase order cannot be cancelled');
    }

    purchaseOrder.status = PurchaseOrderStatus.CANCELLED;
    await this.purchaseOrdersRepository.save(purchaseOrder);
    return this.findOne(id);
  }

  async remove(id: number): Promise<{ message: string }> {
    const purchaseOrder = await this.findOne(id);

    if (purchaseOrder.status !== PurchaseOrderStatus.DRAFT) {
      throw new ConflictException('Only draft purchase orders can be deleted');
    }

    await this.purchaseOrdersRepository.remove(purchaseOrder);
    return { message: `Purchase order ${purchaseOrder.poNumber} deleted` };
  }

  async getLowStockSuggestions() {
    const rawMedicines = await this.medicinesRepository
      .createQueryBuilder('m')
      .leftJoinAndSelect('m.category', 'category')
      .where('m.isActive = :isActive', { isActive: true })
      .andWhere(
        `(SELECT COALESCE(SUM(b.quantity), 0) FROM batches b WHERE b.medicine_id = m.id) <= m.reorder_level`,
      )
      .getMany();

    const suppliers = await this.suppliersRepository.find({
      where: { isActive: true },
    });

    const batchRepo = this.dataSource.getRepository(Batch);
    const recentBatches = await batchRepo.find({
      relations: { supplier: true },
      order: { createdAt: 'DESC' },
    });

    const suggestions = await Promise.all(
      rawMedicines.map(async (medicine) => {
        const stockRow = await batchRepo
          .createQueryBuilder('b')
          .select('COALESCE(SUM(b.quantity), 0)', 'totalStock')
          .where('b.medicineId = :id', { id: medicine.id })
          .getRawOne();

        const totalStock = Number.parseInt(stockRow?.totalStock ?? '0', 10);
        const reorderLevel = medicine.reorderLevel;
        const suggestedQuantity = Math.max(reorderLevel * 2 - totalStock, 20);

        const medBatches = recentBatches.filter((b) => b.medicineId === medicine.id);
        const previousSuppliers = new Map<number, { cost: number; name: string }>();
        for (const b of medBatches) {
          if (b.supplierId && !previousSuppliers.has(b.supplierId)) {
            previousSuppliers.set(b.supplierId, {
              cost: Number(b.unitCost),
              name: b.supplier?.name ?? `Supplier #${b.supplierId}`,
            });
          }
        }

        const recommendedSuppliers: Array<{
          id: number;
          name: string;
          contactPerson?: string | null;
          email?: string | null;
          phone?: string | null;
          drugsSupplied?: string | null;
          matchReason: string;
          lastUnitCost?: number | null;
        }> = [];

        for (const supplier of suppliers) {
          const prev = previousSuppliers.get(supplier.id);
          const drugsText = (supplier.drugsSupplied || '').toLowerCase();
          const medName = medicine.name.toLowerCase();
          const genericName = (medicine.genericName || '').toLowerCase();

          const catalogMatch =
            (medName && drugsText.includes(medName)) ||
            (genericName && drugsText.includes(genericName)) ||
            drugsText
              .split(',')
              .some(
                (part) =>
                  part.trim().length > 2 &&
                  (medName.includes(part.trim()) || genericName.includes(part.trim())),
              );

          if (prev) {
            recommendedSuppliers.push({
              id: supplier.id,
              name: supplier.name,
              contactPerson: supplier.contactPerson,
              email: supplier.email,
              phone: supplier.phone,
              drugsSupplied: supplier.drugsSupplied,
              matchReason: `Previous supplier (Last unit cost: $${prev.cost.toFixed(2)})`,
              lastUnitCost: prev.cost,
            });
          } else if (catalogMatch) {
            recommendedSuppliers.push({
              id: supplier.id,
              name: supplier.name,
              contactPerson: supplier.contactPerson,
              email: supplier.email,
              phone: supplier.phone,
              drugsSupplied: supplier.drugsSupplied,
              matchReason: `Catalog match: ${supplier.drugsSupplied}`,
              lastUnitCost: null,
            });
          }
        }

        return {
          medicineId: medicine.id,
          name: medicine.name,
          genericName: medicine.genericName,
          sku: medicine.sku,
          totalStock,
          reorderLevel,
          suggestedQuantity,
          recommendedSuppliers,
        };
      }),
    );

    return suggestions;
  }

  // -------------------------------------------------------------------------

  private async nextPoNumber(manager: EntityManager): Promise<string> {
    const day = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    await manager.query('SELECT pg_advisory_xact_lock($1)', [
      (Number.parseInt(day, 10) % 2_147_483_000) + 500,
    ]);

    const [{ count }] = await manager.query<Array<{ count: string }>>(
      `SELECT COUNT(*)::text AS count FROM purchase_orders WHERE DATE(created_at) = CURRENT_DATE`,
    );

    return `PO-${day}-${(Number.parseInt(count, 10) + 1).toString().padStart(4, '0')}`;
  }
}
