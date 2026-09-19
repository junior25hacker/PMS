import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { paginate, PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { Patient } from '../entities/patient.entity';
import { CreatePatientDto, UpdatePatientDto } from './dto/patient.dto';

@Injectable()
export class PatientsService {
  constructor(
    @InjectRepository(Patient)
    private readonly patientsRepository: Repository<Patient>,
  ) {}

  async create(dto: CreatePatientDto): Promise<Patient> {
    const trimmedName = dto.name.trim();

    // Duplicate detection based on name + dateOfBirth
    const existing = await this.patientsRepository
      .createQueryBuilder('p')
      .where('LOWER(p.name) = LOWER(:name) AND p.dateOfBirth = :dob', {
        name: trimmedName,
        dob: dto.dateOfBirth,
      })
      .getOne();

    if (existing) {
      throw new ConflictException(
        `A patient with name "${trimmedName}" and date of birth "${dto.dateOfBirth}" already exists (Record #${existing.id}).`,
      );
    }

    const patient = this.patientsRepository.create({
      ...dto,
      name: trimmedName,
      knownAllergies: dto.knownAllergies ? dto.knownAllergies.trim() : null,
      isActive: dto.isActive ?? true,
    });

    return this.patientsRepository.save(patient);
  }

  async findAll(query: PaginationQueryDto) {
    const qb = this.patientsRepository
      .createQueryBuilder('patient')
      .loadRelationCountAndMap('patient.prescriptionCount', 'patient.prescriptions')
      .orderBy(`patient.${this.safeColumn(query.sortBy)}`, query.sortOrder.toUpperCase() as 'ASC' | 'DESC')
      .skip(query.skip)
      .take(query.limit);

    if (query.search) {
      qb.where(
        '(patient.name ILIKE :term OR patient.phone ILIKE :term OR patient.email ILIKE :term OR patient.knownAllergies ILIKE :term)',
        { term: `%${query.search}%` },
      );
    }

    const [items, total] = await qb.getManyAndCount();
    return paginate(items, total, query);
  }

  async findOne(id: number): Promise<Patient> {
    const patient = await this.patientsRepository.findOne({
      where: { id },
      relations: ['prescriptions', 'prescriptions.items'],
    });
    if (!patient) throw new NotFoundException(`Patient #${id} was not found`);
    return patient;
  }

  async update(id: number, dto: UpdatePatientDto): Promise<Patient> {
    const patient = await this.findOne(id);

    if (dto.name || dto.dateOfBirth) {
      const checkName = (dto.name ?? patient.name).trim();
      const checkDob = dto.dateOfBirth ?? patient.dateOfBirth;
      const duplicate = await this.patientsRepository
        .createQueryBuilder('p')
        .where('LOWER(p.name) = LOWER(:name) AND p.dateOfBirth = :dob AND p.id != :id', {
          name: checkName,
          dob: checkDob,
          id,
        })
        .getOne();

      if (duplicate) {
        throw new ConflictException(
          `Another patient with name "${checkName}" and date of birth "${checkDob}" already exists (Record #${duplicate.id}).`,
        );
      }
    }

    Object.assign(patient, dto);
    if (dto.name) patient.name = dto.name.trim();
    if (dto.knownAllergies !== undefined) {
      patient.knownAllergies = dto.knownAllergies ? dto.knownAllergies.trim() : null;
    }

    return this.patientsRepository.save(patient);
  }

  async remove(id: number): Promise<{ message: string }> {
    const patient = await this.findOne(id);
    patient.isActive = false;
    await this.patientsRepository.save(patient);
    return { message: `Patient "${patient.name}" has been deactivated` };
  }

  private safeColumn(column: string): string {
    const allowed = ['name', 'dateOfBirth', 'createdAt', 'updatedAt'];
    return allowed.includes(column) ? column : 'createdAt';
  }
}
