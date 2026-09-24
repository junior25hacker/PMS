import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import type { AppConfig } from '../../config/configuration';
import { paginate } from '../../common/dto/pagination-query.dto';
import { Batch } from '../entities/batch.entity';
import { Category } from '../entities/category.entity';
import { Medicine } from '../entities/medicine.entity';
import { Supplier } from '../entities/supplier.entity';
import { MedicineType } from '../../common/enums';
import {
  CreateMedicineDto,
  MedicineQueryDto,
  UpdateMedicineDto,
} from './dto/medicine.dto';
import type { StockedMedicine } from './dto/stock.dto';
import {
  NEAREST_EXPIRY_SUBQUERY,
  SELLING_PRICE_SUBQUERY,
  StockAggregateRow,
  TOTAL_STOCK_SUBQUERY,
  mapMedicineRow,
  toNumber,
} from './stock.util';

@Injectable()
export class MedicinesService {
  constructor(
    @InjectRepository(Medicine)
    private readonly medicinesRepository: Repository<Medicine>,
    @InjectRepository(Batch)
    private readonly batchesRepository: Repository<Batch>,
    @InjectRepository(Category)
    private readonly categoriesRepository: Repository<Category>,
    @InjectRepository(Supplier)
    private readonly suppliersRepository: Repository<Supplier>,
    private readonly configService: ConfigService<AppConfig, true>,
  ) {}

  // -------------------------------------------------------------------------
  // CRUD
  // -------------------------------------------------------------------------

  async create(dto: CreateMedicineDto): Promise<StockedMedicine> {
    const sku = dto.sku.trim().toUpperCase();

    const existing = await this.medicinesRepository.findOne({ where: { sku } });
    if (existing) {
      throw new ConflictException(`A medicine with SKU "${sku}" already exists`);
    }

    if (dto.barcode) {
      const barcodeClash = await this.medicinesRepository.findOne({
        where: { barcode: dto.barcode.trim() },
      });
      if (barcodeClash) {
        throw new ConflictException('This barcode is already assigned to another product');
      }
    }

    if (dto.categoryId) await this.assertCategory(dto.categoryId);

    // Flag duplicate batch numbers before persisting
    if (dto.batchNumber && dto.batchNumber.trim()) {
      const cleanBatch = dto.batchNumber.trim();
      const batchClash = await this.batchesRepository.findOne({
        where: { batchNumber: cleanBatch },
      });
      if (batchClash) {
        throw new ConflictException(
          `Duplicate batch number: A batch with number "${cleanBatch}" already exists in inventory`,
        );
      }
      if (dto.supplierId) {
        await this.assertSupplier(dto.supplierId);
      }
    }

    const medicine = this.medicinesRepository.create({
      sku,
      name: dto.name.trim(),
      genericName: dto.genericName?.trim() ?? null,
      barcode: dto.barcode?.trim() ?? null,
      unit: dto.unit ?? 'tablet',
      dosageForm: dto.dosageForm ?? 'tablet',
      manufacturer: dto.manufacturer?.trim() ?? null,
      strength: dto.strength?.trim() ?? null,
      type: dto.type ?? MedicineType.OTC,
      categoryId: dto.categoryId ?? null,
      taxRate: dto.taxRate ?? this.configService.get('business.defaultTaxRate', { infer: true }),
      reorderLevel: dto.reorderLevel ?? 20,
      description: dto.description ?? null,
      isActive: dto.isActive ?? true,
    });

    const saved = await this.medicinesRepository.save(medicine);

    // Persist initial batch if batch details were provided
    if (dto.batchNumber && dto.batchNumber.trim()) {
      const today = new Date().toISOString().slice(0, 10);
      const batch = this.batchesRepository.create({
        medicineId: saved.id,
        batchNumber: dto.batchNumber.trim(),
        quantity: dto.quantity ?? 0,
        initialQuantity: dto.quantity ?? 0,
        expiryDate: dto.expiryDate ?? today,
        manufacturingDate: dto.manufacturingDate ?? today,
        supplierId: dto.supplierId ?? null,
        unitCost: dto.unitCost ?? 0,
        sellingPrice: dto.sellingPrice ?? 0,
      });
      await this.batchesRepository.save(batch);
    }

    return this.decorate(await this.reloadWithCategory(saved.id));
  }

  async findAll(query: MedicineQueryDto) {
    const qb = this.medicinesRepository
      .createQueryBuilder('medicine')
      .leftJoinAndSelect('medicine.category', 'category');

    if (query.search) {
      qb.andWhere(
        '(medicine.name ILIKE :term OR medicine.genericName ILIKE :term OR medicine.sku ILIKE :term OR medicine.barcode = :exact OR medicine.manufacturer ILIKE :term)',
        { term: `%${query.search}%`, exact: query.search },
      );
    }

    if (query.categoryId) {
      qb.andWhere('medicine.categoryId = :categoryId', {
        categoryId: query.categoryId,
      });
    }

    if (query.type) {
      qb.andWhere('medicine.type = :type', { type: query.type });
    }

    if (query.isActive !== undefined) {
      qb.andWhere('medicine.isActive = :isActive', { isActive: query.isActive });
    }

    if (query.lowStock) {
      qb.andWhere(`${TOTAL_STOCK_SUBQUERY} <= medicine.reorder_level`);
    }

    if (query.expiringInDays !== undefined) {
      qb.andWhere(
        `${NEAREST_EXPIRY_SUBQUERY} IS NOT NULL AND ${NEAREST_EXPIRY_SUBQUERY} <= (CURRENT_DATE + (:days || ' days')::interval)`,
        { days: query.expiringInDays },
      );
    }

    const sortable: Record<string, string> = {
      name: 'medicine.name',
      sku: 'medicine.sku',
      createdAt: 'medicine.createdAt',
      updatedAt: 'medicine.updatedAt',
      reorderLevel: 'medicine.reorderLevel',
    };
    qb.orderBy(
      sortable[query.sortBy] ?? 'medicine.name',
      query.sortOrder.toUpperCase() as 'ASC' | 'DESC',
    )
      .skip(query.skip)
      .take(query.limit);

    const [items, total] = await qb.getManyAndCount();
    const decorated = await this.decorateMany(items);

    return paginate(decorated, total, query);
  }

  async findOne(id: number): Promise<StockedMedicine & { batches: Batch[] }> {
    const medicine = await this.medicinesRepository.findOne({
      where: { id },
      relations: { category: true, batches: { supplier: true } },
    });

    if (!medicine) throw new NotFoundException(`Medicine #${id} was not found`);

    const decorated = await this.decorate(medicine);
    const batches = (medicine.batches ?? []).sort(
      (a, b) => new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime(),
    );

    return { ...decorated, batches };
  }

  async update(id: number, dto: UpdateMedicineDto): Promise<StockedMedicine> {
    const medicine = await this.medicinesRepository.findOne({ where: { id } });
    if (!medicine) throw new NotFoundException(`Medicine #${id} was not found`);

    if (dto.sku && dto.sku.trim().toUpperCase() !== medicine.sku) {
      const clash = await this.medicinesRepository.findOne({
        where: { sku: dto.sku.trim().toUpperCase() },
      });
      if (clash) throw new ConflictException('This SKU is already in use');
      medicine.sku = dto.sku.trim().toUpperCase();
    }

    if (dto.barcode && dto.barcode !== medicine.barcode) {
      const clash = await this.medicinesRepository.findOne({
        where: { barcode: dto.barcode.trim() },
      });
      if (clash) throw new ConflictException('This barcode is already in use');
    }

    if (dto.categoryId !== undefined && dto.categoryId !== null) {
      await this.assertCategory(dto.categoryId);
    }

    Object.assign(medicine, {
      ...dto,
      barcode: dto.barcode !== undefined ? dto.barcode : medicine.barcode,
      name: dto.name !== undefined ? dto.name.trim() : medicine.name,
    });

    await this.medicinesRepository.save(medicine);
    return this.decorate(await this.reloadWithCategory(id));
  }

  async remove(id: number): Promise<{ message: string }> {
    const medicine = await this.findOne(id);

    const inStock = medicine.batches.filter((batch) => batch.quantity > 0);
    if (inStock.length > 0) {
      throw new ConflictException(
        'This product still has stock in one or more batches. Adjust the stock to zero before discontinuing it.',
      );
    }

    await this.medicinesRepository.update(id, { isActive: false });
    return { message: `"${medicine.name}" has been discontinued` };
  }

  // -------------------------------------------------------------------------
  // POS helpers
  // -------------------------------------------------------------------------

  /**
   * Fast lookup for the POS search / barcode field. Matches an exact barcode
   * (scanned input) or a fuzzy name/SKU/generic-name search.
   */
  async searchForPos(term: string, limit = 15): Promise<StockedMedicine[]> {
    if (!term || term.trim().length === 0) return [];

    const trimmed = term.trim();
    const qb = this.medicinesRepository
      .createQueryBuilder('medicine')
      .leftJoinAndSelect('medicine.category', 'category')
      .where('medicine.isActive = :active', { active: true })
      .andWhere(
        '(medicine.barcode = :exact OR medicine.sku ILIKE :term OR medicine.name ILIKE :term OR medicine.genericName ILIKE :term)',
        { exact: trimmed, term: `%${trimmed}%` },
      )
      .orderBy('medicine.name', 'ASC')
      .take(limit);

    const items = await qb.getMany();
    const decorated = await this.decorateMany(items);
    // Exact barcode/SKU hits float to the top so scanners feel instant.
    return decorated.sort((a, b) => {
      const score = (item: StockedMedicine) =>
        item.barcode === trimmed || item.sku === trimmed ? 0 : 1;
      return score(a) - score(b);
    });
  }

  /** Products at or below their reorder level. */
  async findLowStock(limit = 20): Promise<StockedMedicine[]> {
    const items = await this.medicinesRepository
      .createQueryBuilder('medicine')
      .leftJoinAndSelect('medicine.category', 'category')
      .where('medicine.isActive = :active', { active: true })
      .andWhere(`${TOTAL_STOCK_SUBQUERY} <= medicine.reorder_level`)
      .take(limit)
      .getMany();

    const decorated = await this.decorateMany(items);
    // Sort by live stock ascending in JS — ordering by a raw sub-select
    // expression breaks TypeORM's pagination alias handling.
    return decorated.sort((a, b) => a.totalStock - b.totalStock);
  }

  /** Batches whose expiry date falls inside the alert window. */
  async findExpiringSoon(withinDays?: number, limit = 20) {
    const days = withinDays ?? this.configService.get('business.expiryAlertDays', { infer: true });

    const rows = await this.batchesRepository
      .createQueryBuilder('batch')
      .innerJoinAndSelect('batch.medicine', 'medicine')
      .leftJoinAndSelect('batch.supplier', 'supplier')
      .where('batch.quantity > 0')
      .andWhere(`batch.expiry_date <= (CURRENT_DATE + (:days || ' days')::interval)`, {
        days,
      })
      .orderBy('batch.expiryDate', 'ASC')
      .take(limit)
      .getMany();

    const now = Date.now();
    return rows.map((batch) => {
      const daysLeft = Math.ceil(
        (new Date(batch.expiryDate).getTime() - now) / (1000 * 60 * 60 * 24),
      );
      return {
        id: batch.id,
        batchNumber: batch.batchNumber,
        medicineId: batch.medicineId,
        medicineName: batch.medicine?.name ?? 'Unknown',
        sku: batch.medicine?.sku ?? '',
        quantity: batch.quantity,
        expiryDate: batch.expiryDate,
        daysLeft,
        expired: daysLeft < 0,
        supplierName: batch.supplier?.name ?? null,
        valueAtRisk: Number((batch.quantity * batch.sellingPrice).toFixed(2)),
      };
    });
  }

  /** Aggregated inventory counters used by the dashboard and inventory header. */
  async getStockLevel() {
    const [stockRow] = await this.batchesRepository
      .createQueryBuilder('batch')
      .select('COALESCE(SUM(batch.quantity), 0)', 'totalStock')
      .addSelect(
        'COALESCE(SUM(batch.quantity * batch.unit_cost), 0)',
        'inventoryValue',
      )
      .addSelect(
        'COUNT(DISTINCT CASE WHEN batch.quantity > 0 THEN batch.medicine_id END)',
        'productCount',
      )
      .getRawMany<{
        totalStock: string;
        inventoryValue: string;
        productCount: string;
      }>();

    const [lowStockCount, outOfStockCount] = await Promise.all([
      this.medicinesRepository
        .createQueryBuilder('medicine')
        .where('medicine.isActive = true')
        .andWhere(
          `${TOTAL_STOCK_SUBQUERY} > 0 AND ${TOTAL_STOCK_SUBQUERY} <= medicine.reorder_level`,
        )
        .getCount(),
      this.medicinesRepository
        .createQueryBuilder('medicine')
        .where('medicine.isActive = true')
        .andWhere(`${TOTAL_STOCK_SUBQUERY} <= 0`)
        .getCount(),
    ]);

    const expiringSoonCount = await this.batchesRepository
      .createQueryBuilder('batch')
      .where('batch.quantity > 0')
      .andWhere(`batch.expiry_date <= (CURRENT_DATE + (:days || ' days')::interval)`, {
        days: this.configService.get('business.expiryAlertDays', { infer: true }),
      })
      .getCount();

    return {
      totalStock: toNumber(stockRow?.totalStock),
      productCount: toNumber(stockRow?.productCount),
      inventoryValue: Number(toNumber(stockRow?.inventoryValue).toFixed(2)),
      lowStockCount,
      outOfStockCount,
      expiringSoonCount,
    };
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  /** Decorates a list of medicines with aggregated stock in a single query. */
  private async decorateMany(medicines: Medicine[]): Promise<StockedMedicine[]> {
    if (medicines.length === 0) return [];

    const ids = medicines.map((medicine) => medicine.id);
    const windowDays = this.configService.get('business.expiryAlertDays', { infer: true });

    const aggregates = await this.batchesRepository
      .createQueryBuilder('batch')
      .select('batch.medicine_id', 'medicineId')
      .addSelect('COALESCE(SUM(batch.quantity), 0)', 'totalStock')
      .addSelect(
        'MIN(CASE WHEN batch.quantity > 0 THEN batch.expiry_date END)',
        'nearestExpiry',
      )
      .addSelect(
        'MAX(CASE WHEN batch.quantity > 0 THEN batch.selling_price END)',
        'sellingPrice',
      )
      .addSelect(
        'MAX(CASE WHEN batch.quantity > 0 THEN batch.unit_cost END)',
        'unitCost',
      )
      .where('batch.medicineId IN (:...ids)', { ids })
      .groupBy('batch.medicine_id')
      .getRawMany<StockAggregateRow>();

    const byMedicine = new Map<number, StockAggregateRow>();
    aggregates.forEach((row) => byMedicine.set(Number(row.medicineId), row));

    return medicines.map((medicine) =>
      mapMedicineRow(
        medicine as unknown as Record<string, unknown>,
        byMedicine.get(medicine.id),
        windowDays,
      ),
    );
  }

  private async decorate(medicine: Medicine): Promise<StockedMedicine> {
    const [decorated] = await this.decorateMany([medicine]);
    return decorated;
  }

  private reloadWithCategory(id: number): Promise<Medicine> {
    return this.medicinesRepository.findOneOrFail({
      where: { id },
      relations: { category: true },
    });
  }

  private async assertCategory(categoryId: number): Promise<void> {
    const category = await this.categoriesRepository.findOne({
      where: { id: categoryId },
    });
    if (!category) throw new NotFoundException(`Category #${categoryId} was not found`);
  }

  private async assertSupplier(supplierId: number): Promise<Supplier> {
    const supplier = await this.suppliersRepository.findOne({
      where: { id: supplierId },
    });
    if (!supplier) throw new NotFoundException(`Supplier #${supplierId} was not found`);
    return supplier;
  }

  /** Exposed for other modules that need raw entities by id. */
  async findEntitiesByIds(ids: number[]): Promise<Medicine[]> {
    if (ids.length === 0) return [];
    return this.medicinesRepository.find({ where: { id: In(ids) } });
  }
}
