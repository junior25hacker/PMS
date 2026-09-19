import { BadRequestException, ConflictException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Medicine } from '../entities/medicine.entity';
import { Patient } from '../entities/patient.entity';
import { PrescriptionItem } from '../entities/prescription-item.entity';
import { Prescription } from '../entities/prescription.entity';
import { PrescriptionsService } from './prescriptions.service';

describe('PrescriptionsService', () => {
  let service: PrescriptionsService;
  let prescriptionRepo: any;
  let itemRepo: any;
  let patientRepo: any;
  let medicineRepo: any;

  const mockPatient: Partial<Patient> = {
    id: 1,
    name: 'Emily Watson',
    dateOfBirth: '1988-03-22',
    knownAllergies: 'Penicillin, Aspirin',
    isActive: true,
  };

  const mockUser = {
    id: 2,
    fullName: 'Noah Bennett',
    email: 'pharmacist@pharmly.io',
  };

  beforeEach(async () => {
    prescriptionRepo = {
      create: jest.fn((data) => ({ ...data })),
      save: jest.fn((entity) => Promise.resolve({ id: 10, ...entity })),
      findOne: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
      createQueryBuilder: jest.fn(),
    };

    itemRepo = {
      create: jest.fn((data) => ({ ...data })),
      save: jest.fn((items) => Promise.resolve(items.map((it: any, i: number) => ({ id: i + 1, ...it })))),
    };

    patientRepo = {
      findOne: jest.fn(),
    };

    medicineRepo = {
      findOne: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PrescriptionsService,
        { provide: getRepositoryToken(Prescription), useValue: prescriptionRepo },
        { provide: getRepositoryToken(PrescriptionItem), useValue: itemRepo },
        { provide: getRepositoryToken(Patient), useValue: patientRepo },
        { provide: getRepositoryToken(Medicine), useValue: medicineRepo },
      ],
    }).compile();

    service = module.get<PrescriptionsService>(PrescriptionsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should throw BadRequestException if patient is missing or invalid', async () => {
    patientRepo.findOne.mockResolvedValue(null);

    await expect(
      service.create({
        patientId: 999,
        doctorName: 'Dr. House',
        issueDate: '2026-09-19',
        items: [
          { drugName: 'Amoxicillin 500mg', dosage: '500mg', duration: '7 days', quantityPrescribed: 21 },
        ],
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('should throw ConflictException if drug conflicts with patient allergy and is not acknowledged', async () => {
    patientRepo.findOne.mockResolvedValue({ ...mockPatient });

    await expect(
      service.create({
        patientId: 1,
        doctorName: 'Dr. Sarah Jenkins',
        issueDate: '2026-09-19',
        items: [
          { drugName: 'Amoxicillin 500mg', dosage: '500mg', duration: '7 days', quantityPrescribed: 21 },
        ],
        acknowledgeAllergyWarning: false,
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('should record prescription and log acknowledgment when warning is overridden with clinical reason', async () => {
    patientRepo.findOne.mockResolvedValue({ ...mockPatient });

    const result = await service.create(
      {
        patientId: 1,
        doctorName: 'Dr. Sarah Jenkins',
        issueDate: '2026-09-19',
        items: [
          { drugName: 'Amoxicillin 500mg', dosage: '500mg', duration: '7 days', quantityPrescribed: 21 },
        ],
        acknowledgeAllergyWarning: true,
        allergyOverrideReason: 'Skin patch test performed and non-reactive; patient closely monitored.',
      },
      mockUser,
    );

    expect(prescriptionRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        allergyWarningTriggered: true,
        allergyOverrideAcknowledged: true,
        allergyOverrideReason: 'Skin patch test performed and non-reactive; patient closely monitored.',
        allergyOverrideBy: 'Noah Bennett',
      }),
    );
    expect(result.allergyOverrideAcknowledged).toBe(true);
    expect(result.items[0].hasAllergyConflict).toBe(true);
  });

  it('should save clean prescription directly when no allergy conflicts exist', async () => {
    patientRepo.findOne.mockResolvedValue({ ...mockPatient });

    const result = await service.create(
      {
        patientId: 1,
        doctorName: 'Dr. Sarah Jenkins',
        issueDate: '2026-09-19',
        items: [
          { drugName: 'Cetirizine 10mg', dosage: '10mg', duration: '10 days', quantityPrescribed: 10 },
        ],
      },
      mockUser,
    );

    expect(prescriptionRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        allergyWarningTriggered: false,
        allergyOverrideAcknowledged: false,
      }),
    );
    expect(result.items[0].hasAllergyConflict).toBe(false);
  });
});
