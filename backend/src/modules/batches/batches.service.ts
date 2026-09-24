import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { paginate } from '../../common/dto/pagination-query.dto';
import { Batch } from '../entities/batch.entity';
import { Medicine } from '../entities/medicine.entity';
import { Supplier } from '../entities/supplier.entity';
import {
  AdjustStockDto,
  BatchQueryDto,
  CreateBatchDto,
  UpdateBatchDto,
} from './dto/batch.dto';

@Injectable()
export class BatchesService {
  constructor(
    @InjectRepository(Batch)
    private readonly batchesRepository: Repository<Batch>,
    @InjectRepository(Medicine)
    private readonly medicinesRepository: Repository<Medicine>,
    @InjectRepository(Supplier)
    private readonly suppliersRepository: Repository<Supplier>,
    private readonly dataSource: DataSource,
  ) {}

  async checkDuplicate(batchNumber: string): Promise<{ exists: boolean; batch?: { id: number; batchNumber: string; medicineName: string } }> {
    if (!batchNumber || !batchNumber.trim()) {
      return { exists: false };
    }
    const clean = batchNumber.trim();
    const batch = await this.batchesRepository.findOne({
      where: { batchNumber: clean },
      relations: { medicine: true },
    });
    if (!batch) {
      return { exists: false };
    }
    return {
      exists: true,
      batch: {
        id: batch.id,
        batchNumber: batch.batchNumber,
        medicineName: batch.medicine?.name ?? 'Unknown Medicine',
      },
    };
  }

  async create(dto: CreateBatchDto): Promise<Batch> {
    await this.assertMedicine(dto.medicineId);
    this.assertDateOrder(dto.manufacturingDate, dto.expiryDate);

    if (dto.supplierId) await this.assertSupplier(dto.supplierId);

    const clash = await this.batchesRepository.findOne({
      where: { batchNumber: dto.batchNumber.trim() },
    });
    if (clash) {
      throw new ConflictException(
        `Duplicate batch number: A batch with number "${dto.batchNumber.trim()}" already exists in the system`,
      );
    }

    const batch = this.batchesRepository.create({
      ...dto,
      batchNumber: dto.batchNumber.trim(),
      initialQuantity: dto.quantity,
    });

    const saved = await this.batchesRepository.save(batch);
    return this.findOne(saved.id);
  }

  async findAll(query: BatchQueryDto) {
    const qb = this.batchesRepository
      .createQueryBuilder('batch')
      .leftJoinAndSelect('batch.medicine', 'medicine')
      .leftJoinAndSelect('batch.supplier', 'supplier');

    if (query.medicineId) {
      qb.andWhere('batch.medicineId = :medicineId', { medicineId: query.medicineId });
    }

    if (query.inStockOnly) {
      qb.andWhere('batch.quantity > 0');
    }

    if (query.expiringInDays !== undefined) {
      qb.andWhere(
        `batch.expiry_date <= (CURRENT_DATE + (:days || ' days')::interval)`,
        { days: query.expiringInDays },
      );
    }

    if (query.search) {
      qb.andWhere(
        '(batch.batchNumber ILIKE :term OR medicine.name ILIKE :term OR medicine.sku ILIKE :term)',
        { term: `%${query.search}%` },
      );
    }

    qb.orderBy('batch.expiryDate', 'ASC').skip(query.skip).take(query.limit);

    const [items, total] = await qb.getManyAndCount();
    return paginate(items, total, query);
  }

  async findOne(id: number): Promise<Batch> {
    const batch = await this.batchesRepository.findOne({
      where: { id },
      relations: { medicine: true, supplier: true },
    });
    if (!batch) throw new NotFoundException(`Batch #${id} was not found`);
    return batch as Batch;
  }

  /**
   * Batches for a medicine ordered by First-Expiry-First-Out — the exact order
   * the POS will consume them in.
   */
  async findFefoQueue(medicineId: number, includeEmpty = false): Promise<Batch[]> {
    await this.assertMedicine(medicineId);

    const qb = this.batchesRepository
      .createQueryBuilder('batch')
      .leftJoinAndSelect('batch.supplier', 'supplier')
      .where('batch.medicineId = :medicineId', { medicineId })
      .orderBy('batch.expiryDate', 'ASC')
      .addOrderBy('batch.id', 'ASC');

    if (!includeEmpty) qb.andWhere('batch.quantity > 0');

    return qb.getMany();
  }

  async update(id: number, dto: UpdateBatchDto): Promise<Batch> {
    const batch = await this.findOne(id);

    if (dto.manufacturingDate || dto.expiryDate) {
      this.assertDateOrder(
        dto.manufacturingDate ?? batch.manufacturingDate,
        dto.expiryDate ?? batch.expiryDate,
      );
    }

    if (dto.supplierId) await this.assertSupplier(dto.supplierId);

    Object.assign(batch, dto);
    await this.batchesRepository.save(batch);
    return this.findOne(id);
  }

  /**
   * Manual stock movement (shrinkage, breakage, stock count correction).
   * Never lets a batch go negative.
   */
  async adjustStock(id: number, dto: AdjustStockDto): Promise<Batch> {
    if (dto.delta === 0) {
      throw new BadRequestException('The adjustment delta cannot be zero');
    }

    return this.dataSource.transaction(async (manager) => {
      const batch = await manager.findOne(Batch, {
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!batch) throw new NotFoundException(`Batch #${id} was not found`);

      const next = batch.quantity + dto.delta;
      if (next < 0) {
        throw new BadRequestException(
          `Cannot remove ${Math.abs(dto.delta)} units — only ${batch.quantity} remain in batch ${batch.batchNumber}`,
        );
      }

      batch.quantity = next;
      await manager.save(batch);
      const refreshed = await manager.findOne(Batch, {
        where: { id },
        relations: { medicine: true, supplier: true },
      });
      if (!refreshed) throw new NotFoundException(`Batch #${id} was not found`);
      return refreshed;
    });
  }

  /** Write-off: removes all remaining stock (expired / recalled goods). */
  async writeOff(id: number, reason?: string): Promise<{ message: string }> {
    const batch = await this.findOne(id);
    if (batch.quantity === 0) {
      throw new BadRequestException('This batch already has no stock to write off');
    }

    const removed = batch.quantity;
    batch.quantity = 0;
    await this.batchesRepository.save(batch);

    return {
      message: `${removed} unit(s) of ${batch.medicine?.name ?? 'batch'} written off${
        reason ? ` — ${reason}` : ''
      }`,
    };
  }

  async remove(id: number): Promise<{ message: string }> {
    const batch = await this.findOne(id);
    if (batch.quantity > 0) {
      throw new ConflictException(
        'This batch still holds stock. Write it off or adjust it to zero first.',
      );
    }
    await this.batchesRepository.remove(batch);
    return { message: `Batch ${batch.batchNumber} deleted` };
  }

  // -------------------------------------------------------------------------

  private assertDateOrder(manufacturingDate: string, expiryDate: string): void {
    if (new Date(expiryDate).getTime() <= new Date(manufacturingDate).getTime()) {
      throw new BadRequestException(
        'The expiry date must be after the manufacturing date',
      );
    }
  }

  private async assertMedicine(medicineId: number): Promise<void> {
    const exists = await this.medicinesRepository.exists({ where: { id: medicineId } });
    if (!exists) throw new NotFoundException(`Medicine #${medicineId} was not found`);
  }

  private async assertSupplier(supplierId: number): Promise<void> {
    const exists = await this.suppliersRepository.exists({ where: { id: supplierId } });
    if (!exists) throw new NotFoundException(`Supplier #${supplierId} was not found`);
  }
}
