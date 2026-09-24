import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { Repository } from 'typeorm';
import type { AppConfig } from '../../config/configuration';
import { UserRole } from '../../common/enums';
import { ilikeOp } from '../../common/db.util';
import { User } from '../entities/user.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    private readonly configService: ConfigService<AppConfig, true>,
  ) {}

  async create(dto: CreateUserDto): Promise<User> {
    const existing = await this.usersRepository.findOne({
      where: { email: dto.email.toLowerCase() },
    });
    if (existing) {
      throw new ConflictException('A user with this email already exists');
    }

    const user = this.usersRepository.create({
      fullName: dto.fullName.trim(),
      email: dto.email.toLowerCase().trim(),
      role: dto.role,
      phone: dto.phone ?? null,
      isActive: dto.isActive ?? true,
      passwordHash: await this.hash(dto.password),
    });

    return this.usersRepository.save(user);
  }

  async findAll(search?: string): Promise<User[]> {
    const query = this.usersRepository
      .createQueryBuilder('user')
      .orderBy('user.fullName', 'ASC');

    if (search) {
      const op = ilikeOp(this.usersRepository);
      query.where(
        `(user.fullName ${op} :term OR user.email ${op} :term)`,
        { term: `%${search}%` },
      );
    }

    return query.getMany();
  }

  async findOne(id: number): Promise<User> {
    const user = await this.usersRepository.findOne({ where: { id } });
    if (!user) throw new NotFoundException(`User #${id} was not found`);
    return user;
  }

  /** Used by the auth flow — includes the otherwise-hidden password hash. */
  async findByEmailWithPassword(email: string): Promise<User | null> {
    return this.usersRepository
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .where('LOWER(user.email) = LOWER(:email)', { email })
      .getOne();
  }

  async update(id: number, dto: UpdateUserDto): Promise<User> {
    const user = await this.findOne(id);

    if (dto.email && dto.email.toLowerCase() !== user.email) {
      const clash = await this.usersRepository.findOne({
        where: { email: dto.email.toLowerCase() },
      });
      if (clash) throw new ConflictException('A user with this email already exists');
      user.email = dto.email.toLowerCase().trim();
    }

    // Guard: never let the last administrator lose admin rights or be disabled.
    const isLosingAdmin =
      user.role === UserRole.ADMIN &&
      ((dto.role !== undefined && dto.role !== UserRole.ADMIN) ||
        dto.isActive === false);
    if (isLosingAdmin && (await this.countActiveAdmins()) <= 1) {
      throw new BadRequestException('At least one administrator must remain active');
    }

    if (dto.fullName !== undefined) user.fullName = dto.fullName.trim();
    if (dto.role !== undefined) user.role = dto.role;
    if (dto.phone !== undefined) user.phone = dto.phone;
    if (dto.isActive !== undefined) user.isActive = dto.isActive;
    if (dto.password) user.passwordHash = await this.hash(dto.password);

    return this.usersRepository.save(user);
  }

  async updatePassword(id: number, plainPassword: string): Promise<void> {
    const user = await this.findOne(id);
    user.passwordHash = await this.hash(plainPassword);
    await this.usersRepository.save(user);
  }

  async touchLastLogin(id: number): Promise<void> {
    await this.usersRepository.update(id, { lastLoginAt: new Date() });
  }

  async remove(id: number, actingUserId: number): Promise<{ message: string }> {
    if (id === actingUserId) {
      throw new BadRequestException('You cannot deactivate your own account');
    }

    const user = await this.findOne(id);

    if (user.role === UserRole.ADMIN && (await this.countActiveAdmins()) <= 1) {
      throw new BadRequestException('At least one administrator must remain active');
    }

    // Soft delete: keeps sales/inventory history intact.
    user.isActive = false;
    await this.usersRepository.save(user);
    return { message: `${user.fullName} has been deactivated` };
  }

  private async countActiveAdmins(): Promise<number> {
    return this.usersRepository.count({
      where: { role: UserRole.ADMIN, isActive: true },
    });
  }

  private hash(password: string): Promise<string> {
    return bcrypt.hash(
      password,
      this.configService.get('bcryptSaltRounds', { infer: true }),
    );
  }
}
