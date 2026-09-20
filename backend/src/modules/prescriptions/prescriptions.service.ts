import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { paginate } from '../../common/dto/pagination-query.dto';
import { Medicine } from '../entities/medicine.entity';
import { Patient } from '../entities/patient.entity';
import { PrescriptionItem } from '../entities/prescription-item.entity';
import { Prescription } from '../entities/prescription.entity';
import {
  checkPrescriptionAllergies,
  CheckAllergyInputItem,
} from './allergy-checker.util';
import {
  CheckPrescriptionAllergiesDto,
  CreatePrescriptionDto,
  PrescriptionQueryDto,
  UpdatePrescriptionStatusDto,
} from './dto/prescription.dto';

@Injectable()
export class PrescriptionsService {
  constructor(
    @InjectRepository(Prescription)
    private readonly prescriptionsRepository: Repository<Prescription>,
    @InjectRepository(PrescriptionItem)
    private readonly itemsRepository: Repository<PrescriptionItem>,
    @InjectRepository(Patient)
    private readonly patientsRepository: Repository<Patient>,
    @InjectRepository(Medicine)
    private readonly medicinesRepository: Repository<Medicine>,
  ) {}

  /**
   * Pre-flight cross-check for allergy conflicts before submitting.
   */
  async checkAllergies(dto: CheckPrescriptionAllergiesDto) {
    const patient = await this.patientsRepository.findOne({
      where: { id: dto.patientId },
    });
    if (!patient) {
      throw new BadRequestException(
        `Prescription must be linked to a valid patient record (Patient #${dto.patientId} not found)`,
      );
    }

    const inputItems: CheckAllergyInputItem[] = [];
    for (const item of dto.items) {
      let medicineName: string | undefined;
      let genericName: string | undefined;

      if (item.medicineId) {
        const med = await this.medicinesRepository.findOne({
          where: { id: item.medicineId },
        });
        if (med) {
          medicineName = med.name;
          genericName = med.genericName ?? undefined;
        }
      }

      inputItems.push({
        drugName: item.drugName,
        medicineName,
        genericName,
      });
    }

    const conflicts = checkPrescriptionAllergies(
      patient.knownAllergies,
      inputItems,
    );

    return {
      patient: {
        id: patient.id,
        name: patient.name,
        knownAllergies: patient.knownAllergies,
      },
      hasConflict: conflicts.length > 0,
      conflicts,
    };
  }

  /**
   * Records a new prescription with patient link validation,
   * allergy cross-checking, and mandatory acknowledgment logging.
   */
  async create(dto: CreatePrescriptionDto, user?: any): Promise<Prescription> {
    // 1. Mandatory Patient Link Validation
    if (!dto.patientId) {
      throw new BadRequestException('Prescription must be linked to an existing patient record.');
    }

    const patient = await this.patientsRepository.findOne({
      where: { id: dto.patientId },
    });

    if (!patient) {
      throw new BadRequestException(
        `Cannot save prescription: No patient found with ID #${dto.patientId}. A valid patient link is required.`,
      );
    }

    if (!patient.isActive) {
      throw new BadRequestException(
        `Cannot save prescription: Patient "${patient.name}" (#${patient.id}) is inactive.`,
      );
    }

    // 2. Validate Items
    if (!dto.items || dto.items.length === 0) {
      throw new BadRequestException('Prescription must contain at least one prescribed drug.');
    }

    // 3. Resolve medicines and run allergy cross-check
    const inputItems: CheckAllergyInputItem[] = [];
    for (const item of dto.items) {
      let medicineName: string | undefined;
      let genericName: string | undefined;

      if (item.medicineId) {
        const med = await this.medicinesRepository.findOne({
          where: { id: item.medicineId },
        });
        if (med) {
          medicineName = med.name;
          genericName = med.genericName ?? undefined;
        }
      }

      inputItems.push({
        drugName: item.drugName,
        medicineName,
        genericName,
      });
    }

    const conflicts = checkPrescriptionAllergies(
      patient.knownAllergies,
      inputItems,
    );
    const hasAllergyConflict = conflicts.length > 0;

    let allergyWarningTriggered = false;
    let allergyOverrideAcknowledged = false;
    let allergyOverrideReason: string | null = null;
    let allergyOverrideBy: string | null = null;
    let allergyOverrideAt: Date | null = null;
    let allergyConflictDetails: string | null = null;

    if (hasAllergyConflict) {
      allergyWarningTriggered = true;
      allergyConflictDetails = conflicts.map((c) => `${c.drugName}: ${c.reason}`).join(' | ');

      // Pharmacist must explicitly acknowledge warning to proceed
      if (!dto.acknowledgeAllergyWarning) {
        throw new ConflictException({
          statusCode: 409,
          error: 'Allergy Warning',
          message: `Prescription contains medication(s) conflicting with patient known allergies (${patient.knownAllergies || 'listed'}). Pharmacist acknowledgment is required to proceed.`,
          patient: {
            id: patient.id,
            name: patient.name,
            knownAllergies: patient.knownAllergies,
          },
          conflicts,
        });
      }

      if (!dto.allergyOverrideReason || dto.allergyOverrideReason.trim().length === 0) {
        throw new BadRequestException(
          'Clinical justification is required when acknowledging and overriding an allergy warning.',
        );
      }

      // Log the acknowledgment
      allergyOverrideAcknowledged = true;
      allergyOverrideReason = dto.allergyOverrideReason.trim();
      allergyOverrideBy = user?.fullName || user?.email || 'Authorized Pharmacist';
      allergyOverrideAt = new Date();
    }

    // 4. Generate unique prescription number
    const prescriptionNumber = await this.generatePrescriptionNumber();

    // 5. Create prescription entity and items
    const prescription = this.prescriptionsRepository.create({
      prescriptionNumber,
      patientId: patient.id,
      patient,
      doctorName: dto.doctorName.trim(),
      doctorLicense: dto.doctorLicense ? dto.doctorLicense.trim() : null,
      clinicHospital: dto.clinicHospital ? dto.clinicHospital.trim() : null,
      diagnosis: dto.diagnosis ? dto.diagnosis.trim() : null,
      issueDate: dto.issueDate,
      expiryDate: dto.expiryDate || null,
      notes: dto.notes ? dto.notes.trim() : null,
      allergyWarningTriggered,
      allergyConflictDetails,
      allergyOverrideAcknowledged,
      allergyOverrideReason,
      allergyOverrideBy,
      allergyOverrideAt,
      createdById: user?.id ?? null,
    });

    const savedPrescription = await this.prescriptionsRepository.save(prescription);

    // Save prescription items with individual conflict flags
    const itemEntities = dto.items.map((it, idx) => {
      const itemConflict = conflicts.find((c) => c.itemIndex === idx || c.drugName.toLowerCase() === it.drugName.toLowerCase());
      return this.itemsRepository.create({
        prescriptionId: savedPrescription.id,
        medicineId: it.medicineId ?? null,
        drugName: it.drugName.trim(),
        dosage: it.dosage.trim(),
        frequency: it.frequency ? it.frequency.trim() : 'Once daily',
        duration: it.duration.trim(),
        quantityPrescribed: it.quantityPrescribed,
        instructions: it.instructions ? it.instructions.trim() : null,
        hasAllergyConflict: !!itemConflict,
        allergyConflictDetails: itemConflict ? itemConflict.reason : null,
      });
    });

    savedPrescription.items = await this.itemsRepository.save(itemEntities);

    return savedPrescription;
  }

  async findAll(query: PrescriptionQueryDto) {
    const qb = this.prescriptionsRepository
      .createQueryBuilder('rx')
      .leftJoinAndSelect('rx.patient', 'patient')
      .leftJoinAndSelect('rx.items', 'items')
      .leftJoinAndSelect('rx.createdBy', 'createdBy')
      .orderBy(`rx.${this.safeColumn(query.sortBy)}`, query.sortOrder.toUpperCase() as 'ASC' | 'DESC')
      .skip(query.skip)
      .take(query.limit);

    if (query.status) {
      qb.andWhere('rx.status = :status', { status: query.status });
    }

    if (query.patientId) {
      qb.andWhere('rx.patientId = :patientId', { patientId: query.patientId });
    }

    if (query.allergyWarningOnly) {
      qb.andWhere('rx.allergyWarningTriggered = :warn', { warn: true });
    }

    if (query.startDate) {
      qb.andWhere('rx.issueDate >= :startDate', { startDate: query.startDate });
    }

    if (query.endDate) {
      qb.andWhere('rx.issueDate <= :endDate', { endDate: query.endDate });
    }

    if (query.drugName) {
      qb.andWhere('items.drugName ILIKE :drugName', { drugName: `%${query.drugName}%` });
    }

    if (query.search) {
      qb.andWhere(
        '(rx.prescriptionNumber ILIKE :term OR rx.doctorName ILIKE :term OR patient.name ILIKE :term OR rx.diagnosis ILIKE :term)',
        { term: `%${query.search}%` },
      );
    }

    const [items, total] = await qb.getManyAndCount();
    return paginate(items, total, query);
  }

  async findOne(id: number): Promise<Prescription> {
    const rx = await this.prescriptionsRepository.findOne({
      where: { id },
      relations: ['patient', 'items', 'items.medicine', 'createdBy'],
    });

    if (!rx) {
      throw new NotFoundException(`Prescription #${id} was not found`);
    }

    return rx;
  }

  async updateStatus(id: number, dto: UpdatePrescriptionStatusDto): Promise<Prescription> {
    const rx = await this.findOne(id);
    rx.status = dto.status;
    if (dto.notes) {
      rx.notes = rx.notes ? `${rx.notes}\n${dto.notes}` : dto.notes;
    }
    return this.prescriptionsRepository.save(rx);
  }

  private async generatePrescriptionNumber(): Promise<string> {
    const now = new Date();
    const prefix = `RX-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
    const count = await this.prescriptionsRepository.count();
    const suffix = String(count + 1).padStart(4, '0');
    let candidate = `${prefix}-${suffix}`;

    const exists = await this.prescriptionsRepository.findOne({
      where: { prescriptionNumber: candidate },
    });
    if (exists) {
      candidate = `${prefix}-${Date.now().toString().slice(-4)}`;
    }
    return candidate;
  }

  private safeColumn(column: string): string {
    const allowed = ['id', 'issueDate', 'prescriptionNumber', 'createdAt', 'updatedAt'];
    return allowed.includes(column) ? column : 'createdAt';
  }
}
