import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PaginationQueryDto, paginate } from '../../common/dto/pagination-query.dto';
import { Supplier } from '../entities/supplier.entity';
import { CreateSupplierDto, UpdateSupplierDto } from './dto/supplier.dto';

@Injectable()
export class SuppliersService {
  constructor(
    @InjectRepository(Supplier)
    private readonly suppliersRepository: Repository<Supplier>,
  ) {}

  async create(dto: CreateSupplierDto): Promise<Supplier> {
    return this.suppliersRepository.save(
      this.suppliersRepository.create({
        ...dto,
        name: dto.name.trim(),
        drugsSupplied: dto.drugsSupplied ? dto.drugsSupplied.trim() : null,
        paymentTerms: dto.paymentTerms ?? 'NET 30',
        isActive: dto.isActive ?? true,
      }),
    );
  }

  async findAll(query: PaginationQueryDto) {
    const qb = this.suppliersRepository
      .createQueryBuilder('supplier')
      .loadRelationCountAndMap('supplier.orderCount', 'supplier.purchaseOrders')
      .orderBy(`supplier.${this.safeColumn(query.sortBy)}`, query.sortOrder.toUpperCase() as 'ASC' | 'DESC')
      .skip(query.skip)
      .take(query.limit);

    if (query.search) {
      qb.where(
        '(supplier.name ILIKE :term OR supplier.contactPerson ILIKE :term OR supplier.email ILIKE :term OR supplier.phone ILIKE :term OR supplier.drugsSupplied ILIKE :term)',
        { term: `%${query.search}%` },
      );
    }

    const [items, total] = await qb.getManyAndCount();
    return paginate(items, total, query);
  }

  async findOne(id: number): Promise<Supplier> {
    const supplier = await this.suppliersRepository.findOne({ where: { id } });
    if (!supplier) throw new NotFoundException(`Supplier #${id} was not found`);
    return supplier;
  }

  async update(id: number, dto: UpdateSupplierDto): Promise<Supplier> {
    const supplier = await this.findOne(id);
    Object.assign(supplier, dto);
    if (dto.name) supplier.name = dto.name.trim();
    if (dto.drugsSupplied !== undefined) supplier.drugsSupplied = dto.drugsSupplied ? dto.drugsSupplied.trim() : null;
    return this.suppliersRepository.save(supplier);
  }

  async remove(id: number): Promise<{ message: string }> {
    const supplier = await this.findOne(id);
    supplier.isActive = false;
    await this.suppliersRepository.save(supplier);
    return { message: `Supplier "${supplier.name}" has been deactivated` };
  }

  /** Whitelist of sortable columns — prevents SQL injection via `sortBy`. */
  private safeColumn(column: string): string {
    const allowed = ['name', 'createdAt', 'updatedAt', 'paymentTerms'];
    return allowed.includes(column) ? column : 'createdAt';
  }
}
