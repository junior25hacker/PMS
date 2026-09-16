/**
 * Database seeder.
 *
 *   npm run seed
 *
 * Creates the three demo roles, a starter catalog with batches and a handful
 * of historical sales so the dashboard has something to show. Safe to run
 * repeatedly — every write is guarded by an existence check.
 */
import 'reflect-metadata';
import * as bcrypt from 'bcrypt';
import { config as loadEnv } from 'dotenv';
import AppDataSource from './data-source';
import { PaymentMethod, SaleStatus, UserRole } from '../common/enums';
import {
  Batch,
  Category,
  Medicine,
  Sale,
  SaleItem,
  Supplier,
  User,
} from '../modules/entities';

loadEnv();

const SALT_ROUNDS = Number.parseInt(process.env.BCRYPT_SALT_ROUNDS ?? '10', 10);
const DAY = 24 * 60 * 60 * 1000;

const isoDate = (date: Date): string => date.toISOString().slice(0, 10);
const daysFromNow = (days: number): string =>
  isoDate(new Date(Date.now() + days * DAY));
const daysAgo = (days: number): Date => new Date(Date.now() - days * DAY);

async function seedUsers(): Promise<Record<string, User>> {
  const repository = AppDataSource.getRepository(User);

  const definitions = [
    {
      fullName: 'Amelia Grant',
      email: 'admin@pharmly.io',
      role: UserRole.ADMIN,
      password: 'Admin@123',
      phone: '+15550101',
    },
    {
      fullName: 'Noah Bennett',
      email: 'pharmacist@pharmly.io',
      role: UserRole.PHARMACIST,
      password: 'Pharma@123',
      phone: '+15550102',
    },
    {
      fullName: 'James Bond',
      email: 'cashier@pharmly.io',
      role: UserRole.CASHIER,
      password: 'Cashier@123',
      phone: '+15550103',
    },
  ];

  const users: Record<string, User> = {};

  for (const definition of definitions) {
    let user = await repository
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .where('LOWER(user.email) = LOWER(:email)', { email: definition.email })
      .getOne();

    if (!user) {
      user = repository.create({
        fullName: definition.fullName,
        email: definition.email,
        role: definition.role,
        phone: definition.phone,
        isActive: true,
        passwordHash: await bcrypt.hash(definition.password, SALT_ROUNDS),
      });
      user = await repository.save(user);
      console.log(`  ✓ user ${definition.email} (${definition.role})`);
    }

    users[definition.role] = user;
  }

  return users;
}

async function seedCategories(): Promise<Record<string, Category>> {
  const repository = AppDataSource.getRepository(Category);
  const definitions = [
    { name: 'Analgesics', description: 'Pain relief and antipyretic medicines' },
    { name: 'Antibiotics', description: 'Bacterial infection treatments' },
    { name: 'Antidiabetics', description: 'Blood glucose management' },
    { name: 'Cardiovascular', description: 'Blood pressure and heart medication' },
    { name: 'Antihistamines', description: 'Allergy relief' },
    { name: 'Gastrointestinal', description: 'Digestive health products' },
  ];

  const categories: Record<string, Category> = {};

  for (const definition of definitions) {
    let category = await repository.findOne({ where: { name: definition.name } });
    if (!category) {
      category = await repository.save(repository.create(definition));
      console.log(`  ✓ category ${definition.name}`);
    }
    categories[definition.name] = category;
  }

  return categories;
}

async function seedSuppliers(): Promise<Supplier[]> {
  const repository = AppDataSource.getRepository(Supplier);
  const definitions = [
    {
      name: 'MedSupply Distribution Ltd.',
      contactPerson: 'Daniel Okoye',
      email: 'orders@medsupply.example',
      phone: '+15551001',
      address: '18 Harbour Road, Warehouse District',
      taxId: 'VAT-99231',
      paymentTerms: 'NET 30',
    },
    {
      name: 'Nordic Pharma Wholesale',
      contactPerson: 'Ingrid Larsen',
      email: 'sales@nordicpharma.example',
      phone: '+15551002',
      address: '4 Fjord Street, Northgate',
      taxId: 'VAT-44120',
      paymentTerms: 'NET 45',
    },
    {
      name: 'Apex Generics Co.',
      contactPerson: 'Ravi Menon',
      email: 'hello@apexgenerics.example',
      phone: '+15551003',
      address: '77 Industrial Park, Block C',
      taxId: 'VAT-77120',
      paymentTerms: 'NET 15',
    },
  ];

  const suppliers: Supplier[] = [];

  for (const definition of definitions) {
    let supplier = await repository.findOne({ where: { name: definition.name } });
    if (!supplier) {
      supplier = await repository.save(repository.create(definition));
      console.log(`  ✓ supplier ${definition.name}`);
    }
    suppliers.push(supplier);
  }

  return suppliers;
}

interface MedicineSeed {
  name: string;
  genericName: string;
  sku: string;
  barcode: string;
  category: string;
  manufacturer: string;
  strength: string;
  dosageForm: string;
  reorderLevel: number;
  taxRate: number;
  unitCost: number;
  sellingPrice: number;
  quantity: number;
  expiryInDays: number;
}

const MEDICINES: MedicineSeed[] = [
  { name: 'Paracetamol', genericName: 'Acetaminophen', sku: 'PCM-500-TAB', barcode: '5901234123457', category: 'Analgesics', manufacturer: 'GSK', strength: '500mg', dosageForm: 'tablet', reorderLevel: 60, taxRate: 0.12, unitCost: 1.1, sellingPrice: 2.5, quantity: 480, expiryInDays: 540 },
  { name: 'Amoxicillin', genericName: 'Amoxicillin trihydrate', sku: 'AMX-500-CAP', barcode: '5901234123464', category: 'Antibiotics', manufacturer: 'Sandoz', strength: '500mg', dosageForm: 'capsule', reorderLevel: 80, taxRate: 0.12, unitCost: 2.4, sellingPrice: 4.2, quantity: 320, expiryInDays: 300 },
  { name: 'Ibuprofen', genericName: 'Ibuprofen', sku: 'IBU-400-TAB', barcode: '5901234123471', category: 'Analgesics', manufacturer: 'Pfizer', strength: '400mg', dosageForm: 'tablet', reorderLevel: 100, taxRate: 0.12, unitCost: 1.6, sellingPrice: 2.35, quantity: 68, expiryInDays: 45 },
  { name: 'Metformin', genericName: 'Metformin hydrochloride', sku: 'MET-850-TAB', barcode: '5901234123488', category: 'Antidiabetics', manufacturer: 'Merck', strength: '850mg', dosageForm: 'tablet', reorderLevel: 60, taxRate: 0.12, unitCost: 1.9, sellingPrice: 3.1, quantity: 240, expiryInDays: 620 },
  { name: 'Insulin Glargine', genericName: 'Insulin glargine', sku: 'INS-100-INJ', barcode: '5901234123495', category: 'Antidiabetics', manufacturer: 'Sanofi', strength: '100IU/ml', dosageForm: 'injection', reorderLevel: 20, taxRate: 0.05, unitCost: 18.5, sellingPrice: 28.4, quantity: 42, expiryInDays: 75 },
  { name: 'Loratadine', genericName: 'Loratadine', sku: 'LOR-10-TAB', barcode: '5901234123501', category: 'Antihistamines', manufacturer: 'Bayer', strength: '10mg', dosageForm: 'tablet', reorderLevel: 50, taxRate: 0.12, unitCost: 0.9, sellingPrice: 1.75, quantity: 310, expiryInDays: 400 },
  { name: 'Atorvastatin', genericName: 'Atorvastatin calcium', sku: 'ATV-20-TAB', barcode: '5901234123518', category: 'Cardiovascular', manufacturer: 'Viatris', strength: '20mg', dosageForm: 'tablet', reorderLevel: 50, taxRate: 0.12, unitCost: 2.2, sellingPrice: 3.9, quantity: 155, expiryInDays: 200 },
  { name: 'Omeprazole', genericName: 'Omeprazole', sku: 'OMP-20-CAP', barcode: '5901234123525', category: 'Gastrointestinal', manufacturer: 'AstraZeneca', strength: '20mg', dosageForm: 'capsule', reorderLevel: 60, taxRate: 0.12, unitCost: 1.4, sellingPrice: 2.9, quantity: 12, expiryInDays: 520 },
  { name: 'Ciprofloxacin', genericName: 'Ciprofloxacin', sku: 'CIP-500-TAB', barcode: '5901234123532', category: 'Antibiotics', manufacturer: 'Bayer', strength: '500mg', dosageForm: 'tablet', reorderLevel: 40, taxRate: 0.12, unitCost: 2.8, sellingPrice: 4.95, quantity: 96, expiryInDays: 30 },
  { name: 'Amlodipine', genericName: 'Amlodipine besylate', sku: 'AML-5-TAB', barcode: '5901234123549', category: 'Cardiovascular', manufacturer: 'Pfizer', strength: '5mg', dosageForm: 'tablet', reorderLevel: 50, taxRate: 0.12, unitCost: 1.3, sellingPrice: 2.4, quantity: 205, expiryInDays: 350 },
  { name: 'Salbutamol Inhaler', genericName: 'Salbutamol sulfate', sku: 'SAL-100-INH', barcode: '5901234123556', category: 'Gastrointestinal', manufacturer: 'GSK', strength: '100mcg', dosageForm: 'inhaler', reorderLevel: 15, taxRate: 0.12, unitCost: 6.5, sellingPrice: 11.2, quantity: 28, expiryInDays: 260 },
  { name: 'Cetirizine', genericName: 'Cetirizine dihydrochloride', sku: 'CET-10-TAB', barcode: '5901234123563', category: 'Antihistamines', manufacturer: 'Johnson & Johnson', strength: '10mg', dosageForm: 'tablet', reorderLevel: 50, taxRate: 0.12, unitCost: 0.75, sellingPrice: 1.6, quantity: 0, expiryInDays: 300 },
];

async function seedMedicines(
  categories: Record<string, Category>,
  suppliers: Supplier[],
): Promise<Medicine[]> {
  const medicineRepository = AppDataSource.getRepository(Medicine);
  const batchRepository = AppDataSource.getRepository(Batch);

  const created: Medicine[] = [];

  for (const [index, seed] of MEDICINES.entries()) {
    let medicine = await medicineRepository.findOne({ where: { sku: seed.sku } });

    if (!medicine) {
      medicine = await medicineRepository.save(
        medicineRepository.create({
          name: seed.name,
          genericName: seed.genericName,
          sku: seed.sku,
          barcode: seed.barcode,
          unit: seed.dosageForm === 'injection' ? 'vial' : 'pack',
          dosageForm: seed.dosageForm,
          manufacturer: seed.manufacturer,
          strength: seed.strength,
          categoryId: categories[seed.category]?.id ?? null,
          reorderLevel: seed.reorderLevel,
          taxRate: seed.taxRate,
          isActive: true,
        }),
      );
      console.log(`  ✓ medicine ${seed.name}`);
    }

    if (seed.quantity > 0) {
      const existingBatch = await batchRepository.findOne({
        where: { medicineId: medicine.id, batchNumber: `SEED-${seed.sku}-A` },
      });

      if (!existingBatch) {
        await batchRepository.save(
          batchRepository.create({
            medicineId: medicine.id,
            supplierId: suppliers[index % suppliers.length].id,
            batchNumber: `SEED-${seed.sku}-A`,
            manufacturingDate: daysFromNow(-330),
            expiryDate: daysFromNow(seed.expiryInDays),
            quantity: seed.quantity,
            initialQuantity: seed.quantity,
            unitCost: seed.unitCost,
            sellingPrice: seed.sellingPrice,
            storageLocation: `Shelf ${String.fromCharCode(65 + (index % 6))}-${(index % 4) + 1}`,
          }),
        );
      }
    }

    created.push(medicine);
  }

  return created;
}

async function seedSales(
  medicines: Medicine[],
  users: Record<string, User>,
): Promise<void> {
  const saleRepository = AppDataSource.getRepository(Sale);
  const batchRepository = AppDataSource.getRepository(Batch);

  const existing = await saleRepository.count();
  if (existing > 0) {
    console.log('  · sales already present, skipping demo transactions');
    return;
  }

  const customers = [
    'John Smith',
    'Emily Davis',
    'Michael Johnson',
    'Sarah Lee',
    'David Brown',
    'Lisa Williams',
    'Paul Martinez',
    'Anna Taylor',
    'Chris Moore',
    'Karen Wilson',
  ];
  const methods = [PaymentMethod.CASH, PaymentMethod.CARD, PaymentMethod.MOBILE];

  // 24 receipts spread across the last 7 days.
  for (let index = 0; index < 24; index += 1) {
    const daysBack = index % 7;
    const createdAt = new Date(daysAgo(daysBack).getTime() + (index % 9) * 3600 * 1000);

    const lineCount = 1 + (index % 3);
    const saleItems: SaleItem[] = [];
    let subtotal = 0;
    let taxAmount = 0;

    for (let line = 0; line < lineCount; line += 1) {
      const medicine = medicines[(index * 3 + line) % medicines.length];
      const batch = await batchRepository.findOne({
        where: { medicineId: medicine.id },
        order: { expiryDate: 'ASC' },
      });
      if (!batch) continue;

      const quantity = 1 + ((index + line) % 4);
      const unitPrice = batch.sellingPrice;
      const lineSubtotal = quantity * unitPrice;
      const lineTax = lineSubtotal * medicine.taxRate;

      subtotal += lineSubtotal;
      taxAmount += lineTax;

      saleItems.push(
        saleRepository.manager.create(SaleItem, {
          medicineId: medicine.id,
          batchId: batch.id,
          medicineName: medicine.name,
          batchNumber: batch.batchNumber,
          quantity,
          unitPrice,
          taxRate: medicine.taxRate,
          lineTotal: Math.round(lineSubtotal * (1 + medicine.taxRate) * 100) / 100,
        }),
      );
    }

    if (saleItems.length === 0) continue;

    const total = Math.round((subtotal + taxAmount) * 100) / 100;
    const invoiceNumber = `INV-${isoDate(createdAt).replace(/-/g, '')}-${(index + 1)
      .toString()
      .padStart(4, '0')}`;

    const sale = saleRepository.create({
      invoiceNumber,
      cashierId: users[UserRole.CASHIER]?.id ?? null,
      customerName: customers[index % customers.length],
      subtotal: Math.round(subtotal * 100) / 100,
      taxAmount: Math.round(taxAmount * 100) / 100,
      discountAmount: 0,
      totalAmount: total,
      paymentMethod: methods[index % methods.length],
      amountPaid: total,
      changeDue: 0,
      status: index % 11 === 10 ? SaleStatus.REFUNDED : SaleStatus.COMPLETED,
      items: saleItems,
    });

    await saleRepository.save(sale);
  }

  console.log(`  ✓ ${24} demo sales across the last 7 days`);
}

async function run(): Promise<void> {
  console.log('\n🌱  Seeding Pharmly database...\n');

  await AppDataSource.initialize();

  // The seeder is usually run against a fresh database — create any missing
  // tables before inserting demo data.
  await AppDataSource.synchronize();
  console.log('  ✓ schema synchronized\n');

  console.log('Users');
  const users = await seedUsers();

  console.log('\nCategories');
  const categories = await seedCategories();

  console.log('\nSuppliers');
  const suppliers = await seedSuppliers();

  console.log('\nCatalog + batches');
  const medicines = await seedMedicines(categories, suppliers);

  console.log('\nDemo transactions');
  await seedSales(medicines, users);

  await AppDataSource.destroy();

  console.log('\n✅  Seed complete.\n');
  console.log('   admin@pharmly.io       / Admin@123     (full access)');
  console.log('   pharmacist@pharmly.io  / Pharma@123    (inventory)');
  console.log('   cashier@pharmly.io     / Cashier@123   (point of sale)\n');
}

run().catch((error) => {
  console.error('\n❌  Seeding failed:', error);
  process.exit(1);
});
