import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { PurchaseOrderStatus, UserRole } from '../../common/enums';
import { Batch } from '../entities/batch.entity';
import { Medicine } from '../entities/medicine.entity';
import { PurchaseOrderItem } from '../entities/purchase-order-item.entity';
import { PurchaseOrder } from '../entities/purchase-order.entity';
import { Supplier } from '../entities/supplier.entity';
import { PurchasesService } from './purchases.service';

describe('PurchasesService', () => {
  let service: PurchasesService;
  let poRepo: any;
  let itemRepo: any;
  let supplierRepo: any;
  let medicineRepo: any;
  let batchRepo: any;
  let dataSource: any;

  const mockUser = {
    id: 1,
    email: 'pharmacist@pharmly.io',
    role: UserRole.PHARMACIST,
    fullName: 'Test Pharmacist',
  };

  const mockSupplier = {
    id: 1,
    name: 'PharmaSupply Co',
    drugsSupplied: 'Amoxicillin, Paracetamol',
    isActive: true,
  };

  const mockMedicine = {
    id: 10,
    name: 'Amoxicillin 500mg',
    sku: 'AMX-500',
    reorderLevel: 50,
    isActive: true,
  };

  beforeEach(async () => {
    poRepo = {
      create: jest.fn((entity) => ({ ...entity })),
      save: jest.fn((entity) => Promise.resolve({ id: 100, ...entity })),
      findOne: jest.fn(),
      createQueryBuilder: jest.fn(),
      remove: jest.fn(),
    };

    itemRepo = {
      create: jest.fn((entity) => ({ ...entity })),
      save: jest.fn((entity) => Promise.resolve({ id: 200, ...entity })),
      delete: jest.fn(),
      find: jest.fn(),
    };

    supplierRepo = {
      findOne: jest.fn(),
      find: jest.fn(),
    };

    medicineRepo = {
      findOne: jest.fn(),
      find: jest.fn(),
      createQueryBuilder: jest.fn(),
    };

    batchRepo = {
      create: jest.fn((entity) => ({ ...entity })),
      save: jest.fn((entity) => Promise.resolve({ id: 300, ...entity })),
      find: jest.fn(),
      createQueryBuilder: jest.fn(),
    };

    dataSource = {
      transaction: jest.fn(async (cb) => {
        const manager = {
          create: jest.fn((entityClass, data) => ({ ...data })),
          save: jest.fn(async (entityClass, data) => ({
            id: 100,
            ...(data || entityClass),
          })),
          findOne: jest.fn(),
          find: jest.fn(),
          query: jest.fn().mockResolvedValue([{ count: '0' }]),
        };
        return cb(manager);
      }),
      getRepository: jest.fn((entityClass) => {
        if (entityClass === Batch) return batchRepo;
        if (entityClass === Supplier) return supplierRepo;
        if (entityClass === Medicine) return medicineRepo;
        if (entityClass === PurchaseOrder) return poRepo;
        return itemRepo;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PurchasesService,
        { provide: getRepositoryToken(PurchaseOrder), useValue: poRepo },
        { provide: getRepositoryToken(PurchaseOrderItem), useValue: itemRepo },
        { provide: getRepositoryToken(Supplier), useValue: supplierRepo },
        { provide: getRepositoryToken(Medicine), useValue: medicineRepo },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();

    service = module.get<PurchasesService>(PurchasesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('creates a purchase order linked to a supplier and one or more drugs with DRAFT status', async () => {
      supplierRepo.findOne.mockResolvedValue(mockSupplier);
      medicineRepo.find.mockResolvedValue([mockMedicine]);

      const mockPo = {
        id: 100,
        poNumber: 'PO-20260923-0001',
        supplierId: 1,
        status: PurchaseOrderStatus.DRAFT,
        orderDate: '2026-09-23',
        totalAmount: 150,
        items: [
          {
            id: 200,
            medicineId: 10,
            quantity: 50,
            unitCost: 3.0,
            lineTotal: 150,
          },
        ],
      };
      poRepo.findOne.mockResolvedValue(mockPo);

      const dto = {
        supplierId: 1,
        orderDate: '2026-09-23',
        items: [
          {
            medicineId: 10,
            quantity: 50,
            unitCost: 3.0,
          },
        ],
      };

      const result = await service.create(dto, mockUser);
      expect(supplierRepo.findOne).toHaveBeenCalledWith({ where: { id: 1 } });
      expect(medicineRepo.find).toHaveBeenCalled();
      expect(result.status).toBe(PurchaseOrderStatus.DRAFT);
      expect(result.supplierId).toBe(1);
      expect(result.items).toHaveLength(1);
    });

    it('fails if supplier does not exist', async () => {
      supplierRepo.findOne.mockResolvedValue(null);
      await expect(
        service.create(
          {
            supplierId: 999,
            orderDate: '2026-09-23',
            items: [{ medicineId: 10, quantity: 10, unitCost: 2 }],
          },
          mockUser,
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateStatus', () => {
    it('allows moving a draft purchase order to SENT status', async () => {
      const mockPo = {
        id: 100,
        status: PurchaseOrderStatus.DRAFT,
      };
      poRepo.findOne.mockResolvedValue(mockPo);
      poRepo.save.mockResolvedValue({ ...mockPo, status: PurchaseOrderStatus.SENT });

      const result = await service.updateStatus(100, PurchaseOrderStatus.SENT);
      expect(poRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: PurchaseOrderStatus.SENT }),
      );
    });

    it('rejects moving directly to RECEIVED via updateStatus', async () => {
      poRepo.findOne.mockResolvedValue({
        id: 100,
        status: PurchaseOrderStatus.SENT,
      });

      await expect(
        service.updateStatus(100, PurchaseOrderStatus.RECEIVED),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects reopening a RECEIVED purchase order', async () => {
      poRepo.findOne.mockResolvedValue({
        id: 100,
        status: PurchaseOrderStatus.RECEIVED,
      });

      await expect(
        service.updateStatus(100, PurchaseOrderStatus.SENT),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('receive', () => {
    it('rejects receiving goods if purchase order is in DRAFT status', async () => {
      dataSource.transaction = jest.fn(async (cb) => {
        const manager = {
          findOne: jest.fn().mockResolvedValue({
            id: 100,
            poNumber: 'PO-20260923-0001',
            status: PurchaseOrderStatus.DRAFT,
          }),
          find: jest.fn().mockResolvedValue([]),
        };
        return cb(manager);
      });

      await expect(
        service.receive(
          100,
          {
            items: [
              {
                itemId: 200,
                receivedQuantity: 50,
                expiryDate: '2028-01-01',
              },
            ],
          },
          mockUser,
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('creates batch and marks PO as RECEIVED when goods are received on a SENT order', async () => {
      const poItem = {
        id: 200,
        purchaseOrderId: 100,
        medicineId: 10,
        quantity: 50,
        receivedQuantity: 0,
        unitCost: 3.0,
      };

      const po = {
        id: 100,
        poNumber: 'PO-20260923-0001',
        supplierId: 1,
        status: PurchaseOrderStatus.SENT,
        items: [poItem],
      };

      const mockBatch = {
        id: 300,
        medicineId: 10,
        supplierId: 1,
        quantity: 50,
      };

      let savedPoStatus = po.status;
      const itemCopy = { ...poItem };

      dataSource.transaction = jest.fn(async (cb) => {
        const manager = {
          findOne: jest.fn().mockResolvedValue({ ...po }),
          find: jest.fn().mockImplementation((entityClass) => {
            if (entityClass === PurchaseOrderItem) {
              return Promise.resolve([itemCopy]);
            }
            return Promise.resolve([]);
          }),
          create: jest.fn((entityClass, data) => ({ ...data })),
          save: jest.fn(async (entityClassOrData, data) => {
            const entity = data || entityClassOrData;
            if (entity.poNumber) {
              savedPoStatus = entity.status;
            }
            return { id: 300, ...entity };
          }),
        };
        return cb(manager);
      });

      poRepo.findOne.mockImplementation(() =>
        Promise.resolve({ ...po, status: savedPoStatus }),
      );

      const result = await service.receive(
        100,
        {
          items: [
            {
              itemId: 200,
              receivedQuantity: 50,
              batchNumber: 'B-001',
              expiryDate: '2028-01-01',
            },
          ],
        },
        mockUser,
      );

      expect(savedPoStatus).toBe(PurchaseOrderStatus.RECEIVED);
    });
  });

  describe('getLowStockSuggestions', () => {
    it('returns low stock items matched with recommended suppliers based on drugsSupplied', async () => {
      const mockQb: any = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([mockMedicine]),
      };
      medicineRepo.createQueryBuilder.mockReturnValue(mockQb);

      supplierRepo.find.mockResolvedValue([mockSupplier]);
      batchRepo.find.mockResolvedValue([]);

      const batchQb: any = {
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({ totalStock: '5' }),
      };
      batchRepo.createQueryBuilder.mockReturnValue(batchQb);

      const suggestions = await service.getLowStockSuggestions();
      expect(suggestions).toHaveLength(1);
      expect(suggestions[0].medicineId).toBe(10);
      expect(suggestions[0].totalStock).toBe(5);
      expect(suggestions[0].reorderLevel).toBe(50);
      expect(suggestions[0].suggestedQuantity).toBe(95); // 50 * 2 - 5
      expect(suggestions[0].recommendedSuppliers).toHaveLength(1);
      expect(suggestions[0].recommendedSuppliers[0].id).toBe(1);
      expect(suggestions[0].recommendedSuppliers[0].matchReason).toContain('Catalog match');
    });
  });
});
