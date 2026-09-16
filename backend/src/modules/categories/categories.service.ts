import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Category } from '../entities/category.entity';
import { CreateCategoryDto, UpdateCategoryDto } from './dto/category.dto';

@Injectable()
export class CategoriesService {
  constructor(
    @InjectRepository(Category)
    private readonly categoriesRepository: Repository<Category>,
  ) {}

  async create(dto: CreateCategoryDto): Promise<Category> {
    const existing = await this.categoriesRepository.findOne({
      where: { name: dto.name },
    });
    if (existing) throw new ConflictException('This category already exists');

    return this.categoriesRepository.save(
      this.categoriesRepository.create({
        name: dto.name.trim(),
        description: dto.description ?? null,
        isActive: dto.isActive ?? true,
      }),
    );
  }

  async findAll(): Promise<Array<Category & { medicineCount: number }>> {
    const rows = await this.categoriesRepository
      .createQueryBuilder('category')
      .loadRelationCountAndMap('category.medicineCount', 'category.medicines')
      .orderBy('category.name', 'ASC')
      .getMany();

    return rows as Array<Category & { medicineCount: number }>;
  }

  async findOne(id: number): Promise<Category> {
    const category = await this.categoriesRepository.findOne({ where: { id } });
    if (!category) throw new NotFoundException(`Category #${id} was not found`);
    return category;
  }

  async update(id: number, dto: UpdateCategoryDto): Promise<Category> {
    const category = await this.findOne(id);

    if (dto.name && dto.name !== category.name) {
      const clash = await this.categoriesRepository.findOne({
        where: { name: dto.name },
      });
      if (clash) throw new ConflictException('This category already exists');
      category.name = dto.name.trim();
    }

    if (dto.description !== undefined) category.description = dto.description;
    if (dto.isActive !== undefined) category.isActive = dto.isActive;

    return this.categoriesRepository.save(category);
  }

  async remove(id: number): Promise<{ message: string }> {
    const category = await this.findOne(id);
    await this.categoriesRepository.remove(category);
    return { message: `Category "${category.name}" was deleted` };
  }
}
