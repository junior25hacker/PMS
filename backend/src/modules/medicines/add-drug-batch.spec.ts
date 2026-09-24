import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { ConflictException } from '@nestjs/common';
import { MedicinesService } from './medicines.service';
import { Medicine } from '../entities/medicine.entity';
import { Batch } from '../entities/batch.entity';
import { Category } from '../entities/category.entity';
import { Supplier } from '../entities/supplier.entity';
import { MedicineType } from '../../common/enums';

describe('MedicinesService - Add New Drug with Initial Batch & Expiry', () => {
  let service: MedicinesService;
  let medicineRepo: any;
  let batchRepo: any;
  let categoryRepo: any;
  let supplierRepo: any;

  beforeEach(async () => {
    medicineRepo = {
      create: jest.fn((dto) => ({ ...dto })),
      save: jest.fn((entity) => Promise.resolve({ id: 42, ...entity })),
      findOne: jest.fn(),
      createQueryBuilder: jest.fn(),
    };

    batchRepo = {
      create: jest.fn((dto) => ({ ...dto })),
      save: jest.fn((entity) => Promise.resolve({ id: 101, ...entity })),
      findOne: jest.fn(),
      createQueryBuilder: jest.fn(),
    };

    categoryRepo = {
      findOne: jest.fn(),
    };

    supplierRepo = {
      findOne: jest.fn(),
    };

    const configService = {
      get: jest.fn((key: string) => {
        if (key === 'business.defaultTaxRate') return 0.12;
        if (key === 'business.expiryAlertDays') return 90;
        return null;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MedicinesService,
        { provide: getRepositoryToken(Medicine), useValue: medicineRepo },
        { provide: getRepositoryToken(Batch), useValue: batchRepo },
        { provide: getRepositoryToken(Category), useValue: categoryRepo },
        { provide: getRepositoryToken(Supplier), useValue: supplierRepo },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    service = module.get<MedicinesService>(MedicinesService);
  });

  it('creates new drug with initial batch and expiry details', async () => {
    medicineRepo.findOne.mockResolvedValue(null);
    batchRepo.findOne.mockResolvedValue(null); // No duplicate batch
    supplierRepo.findOne.mockResolvedValue({ id: 3, name: 'PharmaSupply Co' });

    const dto = {
      name: 'Ceftriaxone',
      sku: 'CEF-1G-INJ',
      type: MedicineType.PRESCRIPTION,
      dosageForm: 'injection',
      reorderLevel: 25,
      // Batch details
      batchNumber: 'BATCH-CEF-2026',
      quantity: 150,
      expiryDate: '2027-12-31',
      manufacturingDate: '2026-01-15',
      supplierId: 3,
      unitCost: 4.5,
      sellingPrice: 8.0,
    };

    jest.spyOn<any, any>(service, 'reloadWithCategory').mockResolvedValue({
      id: 42,
      name: dto.name,
      sku: dto.sku,
    });
    jest.spyOn<any, any>(service, 'decorate').mockResolvedValue({
      id: 42,
      name: dto.name,
      sku: dto.sku,
      totalStock: 150,
      nearestExpiry: '2027-12-31',
      sellingPrice: 8.0,
      stockStatus: 'in_stock',
    });

    const result = await service.create(dto as any);

    // Verify medicine created
    expect(medicineRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Ceftriaxone',
        sku: 'CEF-1G-INJ',
      }),
    );

    // Verify initial batch created with all captured fields
    expect(batchRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        medicineId: 42,
        batchNumber: 'BATCH-CEF-2026',
        quantity: 150,
        initialQuantity: 150,
        expiryDate: '2027-12-31',
        supplierId: 3,
        unitCost: 4.5,
        sellingPrice: 8.0,
      }),
    );
    expect(batchRepo.save).toHaveBeenCalled();

    // Verify stock appears immediately
    expect(result.totalStock).toBe(150);
    expect(result.nearestExpiry).toBe('2027-12-31');
    expect(result.stockStatus).toBe('in_stock');
  });

  it('flags duplicate batch number and rejects creation with ConflictException', async () => {
    medicineRepo.findOne.mockResolvedValue(null);
    // Simulate existing batch with same batch number
    batchRepo.findOne.mockResolvedValue({
      id: 99,
      batchNumber: 'DUPLICATE-BATCH-001',
    });

    const dto = {
      name: 'Amoxicillin',
      sku: 'AMX-250',
      batchNumber: 'DUPLICATE-BATCH-001',
      quantity: 50,
      expiryDate: '2027-05-01',
    };

    await expect(service.create(dto as any)).rejects.toThrow(ConflictException);
    await expect(service.create(dto as any)).rejects.toThrow(
      /Duplicate batch number/,
    );

    // Ensure medicine was NOT persisted
    expect(medicineRepo.save).not.toHaveBeenCalled();
  });
});
