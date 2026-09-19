import { ConflictException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Patient } from '../entities/patient.entity';
import { PatientsService } from './patients.service';

describe('PatientsService', () => {
  let service: PatientsService;
  let repo: any;

  beforeEach(async () => {
    repo = {
      create: jest.fn((dto) => ({ ...dto })),
      save: jest.fn((entity) => Promise.resolve({ id: 1, ...entity })),
      findOne: jest.fn(),
      createQueryBuilder: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PatientsService,
        { provide: getRepositoryToken(Patient), useValue: repo },
      ],
    }).compile();

    service = module.get<PatientsService>(PatientsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should create a patient with known allergies', async () => {
    const mockQb: any = {
      where: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(null), // no duplicate
    };
    repo.createQueryBuilder.mockReturnValue(mockQb);

    const dto = {
      name: 'Eleanor Vance',
      dateOfBirth: '1992-07-15',
      phone: '+15552345',
      knownAllergies: 'Penicillin, Sulfa drugs',
    };

    const patient = await service.create(dto);
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Eleanor Vance',
        dateOfBirth: '1992-07-15',
        knownAllergies: 'Penicillin, Sulfa drugs',
      }),
    );
    expect(patient.knownAllergies).toBe('Penicillin, Sulfa drugs');
  });

  it('should prevent duplicate patients with matching name and date of birth', async () => {
    const mockQb: any = {
      where: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue({ id: 5, name: 'Eleanor Vance', dateOfBirth: '1992-07-15' }),
    };
    repo.createQueryBuilder.mockReturnValue(mockQb);

    await expect(
      service.create({
        name: 'Eleanor Vance',
        dateOfBirth: '1992-07-15',
      }),
    ).rejects.toThrow(ConflictException);
  });
});
