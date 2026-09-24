import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { MedicinesService } from './medicines.service';
import { Medicine } from '../entities/medicine.entity';
import { Batch } from '../entities/batch.entity';
import { Category } from '../entities/category.entity';
import { Supplier } from '../entities/supplier.entity';
import { classifyStock } from './stock.util';
import { MedicineType } from '../../common/enums';

describe('MedicinesService - Reorder Threshold & Low Stock Alerts', () => {
  let service: MedicinesService;
  let medicineRepo: any;
  let batchRepo: any;
  let categoryRepo: any;
  let configService: any;

  beforeEach(async () => {
    medicineRepo = {
      create: jest.fn((dto) => ({ ...dto })),
      save: jest.fn((entity) => Promise.resolve({ id: 1, ...entity })),
      findOne: jest.fn(),
      createQueryBuilder: jest.fn(),
      find: jest.fn(),
    };

    batchRepo = {
      createQueryBuilder: jest.fn(),
      find: jest.fn(),
    };

    categoryRepo = {
      findOne: jest.fn(),
    };

    const supplierRepo = {
      findOne: jest.fn(),
    };

    configService = {
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

  describe('Stock Classification & Automatic Flag Clearing', () => {
    it('flags drug as low_stock when totalStock is at or below the reorder threshold', () => {
      const reorderThreshold = 50;
      expect(classifyStock(50, reorderThreshold)).toBe('low_stock');
      expect(classifyStock(25, reorderThreshold)).toBe('low_stock');
      expect(classifyStock(1, reorderThreshold)).toBe('low_stock');
    });

    it('flags drug as out_of_stock when totalStock is 0', () => {
      const reorderThreshold = 50;
      expect(classifyStock(0, reorderThreshold)).toBe('out_of_stock');
      expect(classifyStock(-5, reorderThreshold)).toBe('out_of_stock');
    });

    it('automatically clears low-stock flag and returns in_stock when restocked above threshold', () => {
      const reorderThreshold = 50;
      // When restocked to 51 or more, flag automatically clears
      expect(classifyStock(51, reorderThreshold)).toBe('in_stock');
      expect(classifyStock(100, reorderThreshold)).toBe('in_stock');
    });
  });

  describe('Reorder Threshold Configuration', () => {
    it('allows configuring a custom reorder threshold when creating a medicine', async () => {
      medicineRepo.findOne.mockResolvedValue(null);
      const dto = {
        name: 'Amoxicillin',
        sku: 'AMX-500',
        type: MedicineType.PRESCRIPTION,
        reorderLevel: 75,
      };

      // Mock reloadWithCategory and decorate behavior
      jest.spyOn<any, any>(service, 'reloadWithCategory').mockResolvedValue({
        id: 1,
        ...dto,
        taxRate: 0.12,
        isActive: true,
      });
      jest.spyOn<any, any>(service, 'decorate').mockResolvedValue({
        id: 1,
        ...dto,
        totalStock: 0,
        stockStatus: 'out_of_stock',
      });

      await service.create(dto as any);

      expect(medicineRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          reorderLevel: 75,
        }),
      );
    });

    it('allows updating / reconfiguring the reorder threshold on an existing medicine', async () => {
      const existing = {
        id: 1,
        name: 'Amoxicillin',
        sku: 'AMX-500',
        reorderLevel: 20,
      };
      medicineRepo.findOne.mockResolvedValue(existing);

      jest.spyOn<any, any>(service, 'reloadWithCategory').mockResolvedValue({
        ...existing,
        reorderLevel: 100,
      });
      jest.spyOn<any, any>(service, 'decorate').mockResolvedValue({
        ...existing,
        reorderLevel: 100,
        totalStock: 50,
        stockStatus: 'low_stock',
      });

      await service.update(1, { reorderLevel: 100 });

      expect(medicineRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 1,
          reorderLevel: 100,
        }),
      );
    });
  });

  describe('Low Stock Query & Alerts', () => {
    it('queries medicines whose stock falls at or below reorder_level', async () => {
      const mockQb: any = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([
          { id: 1, name: 'Drug A', reorderLevel: 30 },
          { id: 2, name: 'Drug B', reorderLevel: 50 },
        ]),
      };
      medicineRepo.createQueryBuilder.mockReturnValue(mockQb);

      jest.spyOn<any, any>(service, 'decorateMany').mockResolvedValue([
        { id: 1, name: 'Drug A', totalStock: 5, reorderLevel: 30, stockStatus: 'low_stock' },
        { id: 2, name: 'Drug B', totalStock: 0, reorderLevel: 50, stockStatus: 'out_of_stock' },
      ]);

      const results = await service.findLowStock(20);

      expect(mockQb.where).toHaveBeenCalledWith('medicine.isActive = :active', { active: true });
      expect(mockQb.andWhere).toHaveBeenCalledWith(
        expect.stringContaining('<= medicine.reorder_level'),
      );
      expect(results.length).toBe(2);
      expect(results[0].totalStock).toBe(0); // sorted ascending
    });
  });
});
