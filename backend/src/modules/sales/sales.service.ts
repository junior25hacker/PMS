import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { paginate } from '../../common/dto/pagination-query.dto';
import { PaymentMethod, SaleStatus } from '../../common/enums';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { Batch } from '../entities/batch.entity';
import { Medicine } from '../entities/medicine.entity';
import { SaleItem } from '../entities/sale-item.entity';
import { Sale } from '../entities/sale.entity';
import { CreateSaleDto } from './dto/create-sale.dto';
import { SaleQueryDto } from './dto/sale-query.dto';
import { ilikeOp } from '../../common/db.util';

/** Rounds to 2 decimals using banker-safe arithmetic on cents. */
const round2 = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100;

/** Discount above this % of the order total requires a manager approval code. */
const DISCOUNT_APPROVAL_THRESHOLD_PERCENT = 10;

interface ConsumedLine {
  medicine: Medicine;
  batch: Batch;
  quantity: number;
  unitPrice: number;
  taxRate: number;
}

@Injectable()
export class SalesService {
  private readonly logger = new Logger(SalesService.name);

  constructor(
    @InjectRepository(Sale)
    private readonly salesRepository: Repository<Sale>,
    @InjectRepository(SaleItem)
    private readonly saleItemsRepository: Repository<SaleItem>,
    private readonly dataSource: DataSource,
  ) {}

  // -------------------------------------------------------------------------
  // Checkout
  // -------------------------------------------------------------------------

  /**
   * Records a sale, consuming stock across batches with a FEFO policy.
   * Everything happens inside a single transaction with row-level locks so
   * two concurrent tills can never oversell the same batch.
   */
  async create(dto: CreateSaleDto, cashier: AuthenticatedUser): Promise<Sale> {
    // Merge duplicate lines for the same medicine so stock math stays exact.
    const mergedLines = new Map<number, { quantity: number; unitPrice?: number }>();
    dto.items.forEach((item) => {
      const current = mergedLines.get(item.medicineId);
      mergedLines.set(item.medicineId, {
        quantity: (current?.quantity ?? 0) + item.quantity,
        unitPrice: item.unitPrice ?? current?.unitPrice,
      });
    });

    const saleId = await this.dataSource.transaction(async (manager) => {
      const consumed: ConsumedLine[] = [];

      for (const [medicineId, line] of mergedLines.entries()) {
        consumed.push(...(await this.consumeStock(manager, medicineId, line.quantity, line.unitPrice)));
      }

      const subtotal = round2(
        consumed.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0),
      );
      const taxAmount = round2(
        consumed.reduce(
          (sum, line) => sum + line.quantity * line.unitPrice * line.taxRate,
          0,
        ),
      );

      // ── Discount resolution ───────────────────────────────────────────────
      let resolvedDiscount = 0;
      let resolvedDiscountType: 'fixed' | 'percentage' | null = null;
      let resolvedDiscountPercentage: number | null = null;

      if (dto.discountType === 'percentage' && dto.discountPercentage != null) {
        resolvedDiscountPercentage = dto.discountPercentage;
        resolvedDiscountType = 'percentage';
        resolvedDiscount = round2((subtotal + taxAmount) * (dto.discountPercentage / 100));
      } else if (dto.discountAmount != null && dto.discountAmount > 0) {
        resolvedDiscountType = 'fixed';
        resolvedDiscount = dto.discountAmount;
      }

      const discountPercent = subtotal + taxAmount > 0
        ? (resolvedDiscount / (subtotal + taxAmount)) * 100
        : 0;

      // ── Manager approval check ────────────────────────────────────────────
      if (discountPercent > DISCOUNT_APPROVAL_THRESHOLD_PERCENT) {
        if (!dto.discountApprovalCode || dto.discountApprovalCode.trim().length === 0) {
          throw new BadRequestException(
            `Discounts above ${DISCOUNT_APPROVAL_THRESHOLD_PERCENT}% require a manager approval code. ` +
            `This discount is ${discountPercent.toFixed(1)}% of the order total.`,
          );
        }
      }

      const discountAmount = round2(Math.min(resolvedDiscount, subtotal + taxAmount));
      const totalAmount = round2(subtotal + taxAmount - discountAmount);

      if (totalAmount < 0) {
        throw new BadRequestException('The discount cannot exceed the sale total');
      }

      const paymentMethod = dto.paymentMethod;
      const amountPaid =
        dto.amountPaid === undefined || dto.amountPaid === null
          ? totalAmount
          : round2(dto.amountPaid);

      if (
        (paymentMethod === PaymentMethod.CASH || paymentMethod === PaymentMethod.CARD) &&
        amountPaid < totalAmount
      ) {
        throw new BadRequestException(
          `Amount tendered (${amountPaid.toFixed(2)}) is less than the total due (${totalAmount.toFixed(2)})`,
        );
      }

      const invoiceNumber = await this.nextInvoiceNumber(manager);

      const sale = manager.create(Sale, {
        invoiceNumber,
        cashierId: cashier.id,
        customerName: dto.customerName ?? null,
        customerPhone: dto.customerPhone ?? null,
        subtotal,
        discountAmount,
        discountType: resolvedDiscountType,
        discountPercentage: resolvedDiscountPercentage,
        discountApprovalCode: dto.discountApprovalCode?.trim() ?? null,
        discountApprovedBy: discountPercent > DISCOUNT_APPROVAL_THRESHOLD_PERCENT
          ? (cashier.fullName ?? cashier.email)
          : null,
        taxAmount,
        totalAmount,
        paymentMethod,
        amountPaid,
        changeDue: round2(Math.max(0, amountPaid - totalAmount)),
        status: SaleStatus.COMPLETED,
        items: consumed.map((line) =>
          manager.create(SaleItem, {
            medicineId: line.medicine.id,
            batchId: line.batch.id,
            medicineName: line.medicine.name,
            batchNumber: line.batch.batchNumber,
            quantity: line.quantity,
            unitPrice: round2(line.unitPrice),
            taxRate: line.taxRate,
            lineTotal: round2(line.quantity * line.unitPrice * (1 + line.taxRate)),
          }),
        ),
      });

      const saved = await manager.save(Sale, sale);
      this.logger.log(
        `Sale ${invoiceNumber} completed by ${cashier.email} — ${consumed.length} line(s), total ${totalAmount.toFixed(2)}`,
      );
      return saved.id;
    });

    return this.findOne(saleId);
  }

  // -------------------------------------------------------------------------
  // Queries
  // -------------------------------------------------------------------------

  async findAll(query: SaleQueryDto) {
    const qb = this.salesRepository
      .createQueryBuilder('sale')
      .leftJoinAndSelect('sale.cashier', 'cashier')
      .leftJoinAndSelect('sale.items', 'items');

    if (query.from) {
      qb.andWhere('sale.createdAt >= :from', { from: `${query.from}T00:00:00.000Z` });
    }
    if (query.to) {
      qb.andWhere('sale.createdAt <= :to', { to: `${query.to}T23:59:59.999Z` });
    }
    if (query.status) {
      qb.andWhere('sale.status = :status', { status: query.status });
    }
    if (query.paymentMethod) {
      qb.andWhere('sale.paymentMethod = :paymentMethod', {
        paymentMethod: query.paymentMethod,
      });
    }
    if (query.cashierId) {
      qb.andWhere('sale.cashierId = :cashierId', { cashierId: query.cashierId });
    }
    if (query.search) {
      const op = ilikeOp(this.salesRepository);
      qb.andWhere(
        `(sale.invoiceNumber ${op} :term OR sale.customerName ${op} :term OR items.medicineName ${op} :term)`,
        { term: `%${query.search}%` },
      );
    }

    const allowedSort: Record<string, string> = {
      createdAt: 'sale.createdAt',
      totalAmount: 'sale.totalAmount',
      invoiceNumber: 'sale.invoiceNumber',
    };
    qb.orderBy(allowedSort[query.sortBy] ?? 'sale.createdAt', query.sortOrder.toUpperCase() as 'ASC' | 'DESC')
      .skip(query.skip)
      .take(query.limit);

    const [items, total] = await qb.getManyAndCount();
    return paginate(items, total, query);
  }

  async findOne(id: number): Promise<Sale> {
    const sale = await this.salesRepository.findOne({
      where: { id },
      relations: { items: true, cashier: true },
    });
    if (!sale) throw new NotFoundException(`Sale #${id} was not found`);
    return sale;
  }

  async findByInvoice(invoiceNumber: string): Promise<Sale> {
    const sale = await this.salesRepository.findOne({
      where: { invoiceNumber },
      relations: { items: true, cashier: true },
    });
    if (!sale) throw new NotFoundException(`Invoice ${invoiceNumber} was not found`);
    return sale;
  }

  /** Receipt payload — everything the printable HTML receipt needs. */
  async getReceipt(id: number) {
    const sale = await this.findOne(id);
    return {
      invoiceNumber: sale.invoiceNumber,
      issuedAt: sale.createdAt,
      cashier: sale.cashier?.fullName ?? 'Staff',
      customer: {
        name: sale.customerName ?? 'Walk-in customer',
        phone: sale.customerPhone ?? null,
      },
      paymentMethod: sale.paymentMethod,
      status: sale.status,
      currency: 'USD',
      totals: {
        subtotal: sale.subtotal,
        discount: sale.discountAmount,
        discountType: sale.discountType ?? null,
        discountPercentage: sale.discountPercentage ?? null,
        tax: sale.taxAmount,
        total: sale.totalAmount,
        amountPaid: sale.amountPaid,
        changeDue: sale.changeDue,
      },
      lines: sale.items.map((item) => ({
        name: item.medicineName,
        batchNumber: item.batchNumber,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        taxRate: item.taxRate,
        lineTotal: item.lineTotal,
      })),
    };
  }

  // -------------------------------------------------------------------------
  // Refunds / voids
  // -------------------------------------------------------------------------

  /** Refunds a completed sale and returns the stock to its original batches. */
  async refund(id: number, user: AuthenticatedUser): Promise<Sale> {
    await this.dataSource.transaction(async (manager) => {
      const sale = await manager.findOne(Sale, {
        where: { id },
        relations: { items: true },
        lock: { mode: 'pessimistic_write' },
      });

      if (!sale) throw new NotFoundException(`Sale #${id} was not found`);
      if (sale.status !== SaleStatus.COMPLETED) {
        throw new BadRequestException(`Only completed sales can be refunded (this one is ${sale.status})`);
      }

      for (const item of sale.items) {
        if (item.batchId) {
          await manager
            .createQueryBuilder()
            .update(Batch)
            .set({ quantity: () => `quantity + ${item.quantity}` })
            .where('id = :id', { id: item.batchId })
            .execute();
        }
      }

      sale.status = SaleStatus.REFUNDED;
      await manager.save(sale);
      this.logger.warn(`Sale ${sale.invoiceNumber} refunded by ${user.email}`);
    });

    return this.findOne(id);
  }

  // -------------------------------------------------------------------------
  // Analytics helpers used by the dashboard
  // -------------------------------------------------------------------------

  async getDailySummary(date?: string) {
    const target = date ?? new Date().toISOString().slice(0, 10);

    const [row] = await this.salesRepository
      .createQueryBuilder('sale')
      .select('COALESCE(SUM(sale.total_amount), 0)', 'revenue')
      .addSelect('COUNT(*)', 'transactionCount')
      .addSelect('COALESCE(AVG(sale.total_amount), 0)', 'averageBasket')
      .addSelect('COALESCE(SUM(sale.tax_amount), 0)', 'taxCollected')
      .addSelect('COALESCE(SUM(sale.discount_amount), 0)', 'discountsGiven')
      .where('sale.status = :status', { status: SaleStatus.COMPLETED })
      .andWhere('DATE(sale.created_at) = :target', { target })
      .getRawMany<Record<string, string>>();

    const revenue = Number.parseFloat(row?.revenue ?? '0');
    const transactionCount = Number.parseInt(row?.transactionCount ?? '0', 10);

    return {
      date: target,
      revenue: round2(revenue),
      transactionCount,
      averageBasket: round2(Number.parseFloat(row?.averageBasket ?? '0')),
      taxCollected: round2(Number.parseFloat(row?.taxCollected ?? '0')),
      discountsGiven: round2(Number.parseFloat(row?.discountsGiven ?? '0')),
      itemsSold: await this.countItemsSold(target),
    };
  }

  /** Revenue + units sold for each of the last N days (dashboard sparkline). */
  async getSalesTrend(days = 7) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - (days - 1));
    const startStr = startDate.toISOString().slice(0, 10);

    return this.salesRepository
      .createQueryBuilder('sale')
      .select('DATE(sale.created_at)', 'date')
      .addSelect('COALESCE(SUM(sale.total_amount), 0)', 'revenue')
      .addSelect('COUNT(*)', 'transactionCount')
      .where('sale.status = :status', { status: SaleStatus.COMPLETED })
      .andWhere('DATE(sale.created_at) >= :startStr', { startStr })
      .groupBy('DATE(sale.created_at)')
      .orderBy('DATE(sale.created_at)', 'ASC')
      .getRawMany<{ date: string | Date; revenue: string; transactionCount: string }>()
      .then((rows) =>
        rows.map((row) => ({
          date: row.date instanceof Date ? row.date.toISOString().slice(0, 10) : String(row.date),
          revenue: round2(Number.parseFloat(row.revenue)),
          transactionCount: Number.parseInt(row.transactionCount, 10),
        })),
      );
  }

  async getTopProducts(limit = 5, days = 30) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    const startStr = startDate.toISOString().slice(0, 10);

    return this.saleItemsRepository
      .createQueryBuilder('item')
      .innerJoin('item.sale', 'sale')
      .select('item.medicineId', 'medicineId')
      .addSelect('item.medicineName', 'medicineName')
      .addSelect('SUM(item.quantity)', 'unitsSold')
      .addSelect('SUM(item.line_total)', 'revenue')
      .where('sale.status = :status', { status: SaleStatus.COMPLETED })
      .andWhere('DATE(sale.created_at) >= :startStr', { startStr })
      .groupBy('item.medicineId')
      .addGroupBy('item.medicineName')
      .orderBy('SUM(item.quantity)', 'DESC')
      .limit(limit)
      .getRawMany<{
        medicineId: number;
        medicineName: string;
        unitsSold: string;
        revenue: string;
      }>()
      .then((rows) =>
        rows.map((row) => ({
          medicineId: Number(row.medicineId),
          medicineName: row.medicineName,
          unitsSold: Number.parseInt(row.unitsSold, 10),
          revenue: round2(Number.parseFloat(row.revenue)),
        })),
      );
  }

  async getRecentSales(limit = 8) {
    return this.salesRepository.find({
      relations: { cashier: true, items: true },
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  /**
   * Pulls `quantity` units for a medicine from its batches in FEFO order,
   * writing back the reduced quantities and returning one line per batch.
   */
  private async consumeStock(
    manager: EntityManager,
    medicineId: number,
    quantity: number,
    priceOverride?: number,
  ): Promise<ConsumedLine[]> {
    const medicine = await manager.findOne(Medicine, { where: { id: medicineId } });
    if (!medicine) throw new NotFoundException(`Medicine #${medicineId} was not found`);
    if (!medicine.isActive) {
      throw new BadRequestException(`"${medicine.name}" has been discontinued and cannot be sold`);
    }

    const batches = await manager
      .createQueryBuilder(Batch, 'batch')
      .where('batch.medicineId = :medicineId', { medicineId })
      .andWhere('batch.quantity > 0')
      .orderBy('batch.expiry_date', 'ASC')
      .addOrderBy('batch.id', 'ASC')
      .setLock('pessimistic_write')
      .getMany();

    const available = batches.reduce((sum, batch) => sum + batch.quantity, 0);
    if (available < quantity) {
      throw new BadRequestException(
        `Insufficient stock for "${medicine.name}": requested ${quantity}, available ${available}`,
      );
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const lines: ConsumedLine[] = [];
    let remaining = quantity;

    for (const batch of batches) {
      if (remaining === 0) break;

      if (new Date(batch.expiryDate).getTime() < today.getTime()) {
        throw new BadRequestException(
          `Batch ${batch.batchNumber} of "${medicine.name}" expired on ${batch.expiryDate} and cannot be dispensed. Write it off first.`,
        );
      }

      const take = Math.min(batch.quantity, remaining);
      batch.quantity -= take;
      remaining -= take;
      await manager.save(batch);

      lines.push({
        medicine,
        batch,
        quantity: take,
        unitPrice: priceOverride ?? batch.sellingPrice,
        taxRate: medicine.taxRate,
      });
    }

    return lines;
  }

  /**
   * Sequential, gap-free invoice numbers (`INV-20260915-0007`).
   * A transaction-scoped advisory lock serialises concurrent checkouts so two
   * tills can never be handed the same number.
   */
  private async nextInvoiceNumber(manager: EntityManager): Promise<string> {
    const day = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    if (this.dataSource.options.type === 'postgres') {
      await manager.query('SELECT pg_advisory_xact_lock($1)', [
        Number.parseInt(day, 10) % 2_147_483_647,
      ]);
    }

    const [{ count }] = await manager.query<Array<{ count: string | number }>>(
      `SELECT COUNT(*) AS count FROM sales WHERE DATE(created_at) = CURRENT_DATE`,
    );

    const sequence = Number.parseInt(String(count), 10) + 1;
    return `INV-${day}-${sequence.toString().padStart(4, '0')}`;
  }

  private async countItemsSold(date: string): Promise<number> {
    const row = await this.saleItemsRepository
      .createQueryBuilder('item')
      .innerJoin('item.sale', 'sale')
      .select('COALESCE(SUM(item.quantity), 0)', 'units')
      .where('sale.status = :status', { status: SaleStatus.COMPLETED })
      .andWhere('DATE(sale.created_at) = :date', { date })
      .getRawOne<{ units: string }>();

    return Number.parseInt(row?.units ?? '0', 10);
  }
}
