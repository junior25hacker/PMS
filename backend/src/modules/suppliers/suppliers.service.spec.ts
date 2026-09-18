import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { SuppliersService } from './suppliers.service';
import { Supplier } from '../entities/supplier.entity';

describe('SuppliersService', () => {
  let service: SuppliersService;
  let repo: any;

  const mockSupplier: Partial<Supplier> = {
    id: 1,
    name: 'MedSupply Distribution Ltd.',
    contactPerson: 'Daniel Okoye',
    email: 'orders@medsupply.example',
    phone: '+15551001',
    address: '18 Harbour Road',
    taxId: 'VAT-99231',
    paymentTerms: 'NET 30',
    drugsSupplied: 'Amoxicillin, Paracetamol, Ibuprofen',
    isActive: true,
  };

  beforeEach(async () => {
    repo = {
      create: jest.fn((dto) => ({ ...dto })),
      save: jest.fn((entity) => Promise.resolve({ id: 1, ...entity })),
      findOne: jest.fn(),
      createQueryBuilder: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SuppliersService,
        { provide: getRepositoryToken(Supplier), useValue: repo },
      ],
    }).compile();

    service = module.get<SuppliersService>(SuppliersService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should create a supplier with drugsSupplied', async () => {
    const dto = {
      name: 'MedSupply Distribution Ltd.',
      contactPerson: 'Daniel Okoye',
      drugsSupplied: 'Amoxicillin, Paracetamol, Ibuprofen',
    };

    const result = await service.create(dto);
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'MedSupply Distribution Ltd.',
        drugsSupplied: 'Amoxicillin, Paracetamol, Ibuprofen',
      }),
    );
    expect(result.drugsSupplied).toEqual('Amoxicillin, Paracetamol, Ibuprofen');
  });

  it('should update drugsSupplied on existing supplier', async () => {
    repo.findOne.mockResolvedValue({ ...mockSupplier });

    const updated = await service.update(1, {
      drugsSupplied: 'Ciprofloxacin, Azithromycin',
    });

    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        drugsSupplied: 'Ciprofloxacin, Azithromycin',
      }),
    );
  });

  it('should query with drugsSupplied included in search', async () => {
    const mockQb: any = {
      loadRelationCountAndMap: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[mockSupplier], 1]),
    };
    repo.createQueryBuilder.mockReturnValue(mockQb);

    const res = await service.findAll({
      page: 1,
      limit: 10,
      skip: 0,
      sortBy: 'name',
      sortOrder: 'asc',
      search: 'Amoxicillin',
    });

    expect(mockQb.where).toHaveBeenCalledWith(
      expect.stringContaining('supplier.drugsSupplied ILIKE :term'),
      { term: '%Amoxicillin%' },
    );
    expect(res.items).toHaveLength(1);
    expect(res.items[0].drugsSupplied).toContain('Amoxicillin');
  });
});
