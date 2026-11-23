import { PrismaClient } from '@prisma/client'
import { PrismaLibSQL } from '@prisma/adapter-libsql'
import { randomBytes, scryptSync } from 'crypto'

// Bila TURSO_DATABASE_URL diset, seed menulis langsung ke Turso (deploy);
// tanpa env itu, seed memakai SQLite lokal (file:...).
const db = new PrismaClient(
  (process.env.TURSO_DATABASE_URL
    ? {
        adapter: new PrismaLibSQL({
          url: process.env.TURSO_DATABASE_URL,
          authToken: process.env.TURSO_AUTH_TOKEN,
        }),
      }
    : {}) as ConstructorParameters<typeof PrismaClient>[0]
)

// Sama dengan src/lib/auth.ts (disalin agar seed berdiri sendiri)
function hashPin(pin: string): string {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(pin, salt, 64).toString('hex')
  return `scrypt:${salt}:${hash}`
}

async function main() {
  console.log('Seeding Kasir Barbershop...')

  // ===== Settings =====
  const settings: Record<string, string> = {
    shopName: 'Top-Record',
    shiftStart: '09:00',
    shiftEnd: '21:00',
    hourlyRate: '10000',
    lateToleranceMin: '15',
    defaultOpeningCash: '200000',
    timezone: 'Asia/Bangkok',
  }
  for (const [key, value] of Object.entries(settings)) {
    await db.setting.upsert({
      where: { key },
      update: {},
      create: { key, value },
    })
  }

  // ===== Kapster Tiers =====
  const junior = await db.kapsterTier.upsert({
    where: { id: 'tier-junior' },
    update: {},
    create: { id: 'tier-junior', name: 'Junior', sortOrder: 1 },
  })
  const senior = await db.kapsterTier.upsert({
    where: { id: 'tier-senior' },
    update: {},
    create: { id: 'tier-senior', name: 'Senior', sortOrder: 2 },
  })

  // ===== Barbers =====
  const barberData = [
    { id: 'barber-andi', name: 'Barber Andi', nickname: 'ANDI', tierId: senior.id },
    { id: 'barber-bagas', name: 'Barber Bagas', nickname: 'BAGAS', tierId: senior.id },
    { id: 'barber-citra', name: 'Barber Citra', nickname: 'CITRA', tierId: junior.id },
    { id: 'barber-dedi', name: 'Barber Dedi', nickname: 'DEDI', tierId: junior.id },
  ]
  for (const b of barberData) {
    await db.barber.upsert({
      where: { id: b.id },
      update: {},
      create: {
        id: b.id,
        name: b.name,
        nickname: b.nickname,
        tierId: b.tierId,
        active: true,
      },
    })
  }

  // ===== Users =====
  // Revisi 8: satu level akses — hanya akun pemilik toko; semua pengguna
  // login mendapat akses penuh. Akun demo lama (manager/kasir/kapster) dihapus.
  const userData = [
    { id: 'user-owner', name: 'Owner', username: 'owner', pin: '111111', role: 'OWNER' as const, barberId: null },
  ]
  const legacyUsernames = ['manager', 'kasir', 'andi', 'bagas', 'citra', 'dedi']
  for (const username of legacyUsernames) {
    await db.user.deleteMany({ where: { username } })
  }
  for (const u of userData) {
    await db.user.upsert({
      where: { id: u.id },
      update: { pin: hashPin(u.pin), active: true }, // rehash scrypt setiap seed
      create: {
        id: u.id,
        name: u.name,
        username: u.username,
        pin: hashPin(u.pin),
        role: u.role,
        barberId: u.barberId,
        active: true,
      },
    })
  }

  // ===== Service Items (owner price list) =====
  const services = [
    { id: 'svc-haircut', name: 'Hair Cutting', price: 40000, durationMin: 45, sortOrder: 1 },
    { id: 'svc-haircut-anak', name: 'Hair Cutting Anak', price: 35000, durationMin: 45, sortOrder: 2 },
    { id: 'svc-grooming', name: 'Gentlemen Grooming', price: 50000, durationMin: 60, sortOrder: 3 },
    { id: 'svc-grooming-spa', name: 'Grooming & Hair Spa', price: 70000, durationMin: 120, sortOrder: 4 },
    { id: 'svc-wash-spa', name: 'Wash & Hair Spa', price: 30000, durationMin: 90, sortOrder: 5 },
    { id: 'svc-kids', name: 'Kids Hair Cut', price: 35000, durationMin: 45, sortOrder: 6 },
    { id: 'svc-hair-tattoo', name: 'Hair Design / Hair Tattoo', price: 65000, durationMin: 60, sortOrder: 7 },
    { id: 'svc-shaving', name: 'Shaving', price: 20000, durationMin: 30, sortOrder: 8 },
    { id: 'svc-black-colour', name: 'Black Hair Colour', price: 90000, durationMin: 90, sortOrder: 9 },
    { id: 'svc-smoothing', name: 'Smoothing', price: 270000, durationMin: 120, sortOrder: 10 },
    { id: 'svc-hair-prem', name: 'Hair Prem', price: 270000, durationMin: 120, sortOrder: 11 },
    { id: 'svc-fashion-colour', name: 'Fashion Hair Colour', price: 270000, durationMin: 120, sortOrder: 12 },
  ]
  for (const s of services) {
    await db.serviceItem.upsert({
      where: { id: s.id },
      update: {},
      create: { ...s, active: true },
    })
  }

  // ===== Product Categories =====
  const cats = [
    { id: 'cat-makanan', name: 'Makanan Ringan', isBarberService: false, sortOrder: 1 },
    { id: 'cat-minuman', name: 'Minuman', isBarberService: false, sortOrder: 2 },
    { id: 'cat-hairproduct', name: 'Hair Product', isBarberService: false, sortOrder: 3 },
    { id: 'cat-layanan-barber', name: 'Layanan Barber', isBarberService: true, sortOrder: 4 },
  ]
  for (const c of cats) {
    await db.productCategory.upsert({
      where: { id: c.id },
      update: {},
      create: { ...c, commissionRatePct: 0, commissionEnabled: false },
    })
  }

  // ===== Products =====
  const products = [
    { id: 'prod-kopi', name: 'Kopi Sachet', categoryId: 'cat-makanan', price: 5000, stock: 20, minStock: 5 },
    { id: 'prod-air', name: 'Air Mineral', categoryId: 'cat-minuman', price: 3000, stock: 15, minStock: 5 },
    { id: 'prod-pomade', name: 'Pomade', categoryId: 'cat-hairproduct', price: 80000, stock: 10, minStock: 3, costPrice: 55000 },
    { id: 'prod-tonic', name: 'Hair Tonic', categoryId: 'cat-hairproduct', price: 60000, stock: 12, minStock: 3, costPrice: 40000 },
  ]
  for (const p of products) {
    await db.product.upsert({
      where: { id: p.id },
      update: {},
      create: { ...p, active: true },
    })
  }

  // ===== Commission Rules =====
  await db.commissionRule.upsert({
    where: { id: 'rule-default' },
    update: {},
    create: {
      id: 'rule-default',
      name: 'Aturan Default Kapster',
      scopeType: 'DEFAULT',
      thresholdHeads: 5,
      ratePct: 10,
      active: true,
    },
  })
  await db.commissionRule.upsert({
    where: { id: 'rule-default-product' },
    update: {},
    create: {
      id: 'rule-default-product',
      name: 'Default Produk (0%)',
      scopeType: 'PRODUCT_CATEGORY',
      productCategoryId: null,
      thresholdHeads: 0,
      ratePct: 0,
      active: true,
    },
  })

  // ===== Expense Categories =====
  const expCats = [
    { id: 'exp-restock', name: 'Restock', ownerOnly: true, sortOrder: 1 },
    { id: 'exp-konsumsi', name: 'Konsumsi', ownerOnly: false, sortOrder: 2 },
    { id: 'exp-operasional', name: 'Operasional', ownerOnly: false, sortOrder: 3 },
    { id: 'exp-gaji', name: 'Gaji Harian', ownerOnly: true, sortOrder: 4 },
    { id: 'exp-lain', name: 'Lain-lain', ownerOnly: false, sortOrder: 5 },
  ]
  for (const c of expCats) {
    await db.expenseCategory.upsert({
      where: { id: c.id },
      update: {},
      create: c,
    })
  }

  // ===== Migration (Phase 3): recompute deductedHours with progressive rule =====
  // Old rows used flat 1-hour deduction for late > tolerance. Recompute from
  // lateMinutes so payroll stays consistent.
  const toleranceSetting = await db.setting.findUnique({ where: { key: 'lateToleranceMin' } })
  const tolerance = toleranceSetting ? parseInt(toleranceSetting.value, 10) : 15
  const attendanceRows = await db.attendance.findMany()
  for (const row of attendanceRows) {
    const expected = progressiveDeductedHours(row.lateMinutes, tolerance)
    if (row.deductedHours !== expected) {
      await db.attendance.update({
        where: { id: row.id },
        data: { deductedHours: expected },
      })
    }
  }
  if (attendanceRows.length > 0) {
    console.log(`Attendance migration: checked ${attendanceRows.length} rows (progressive deduction).`)
  }

  console.log('Seed completed.')
}

// Progressive late penalty mirrors src/lib/date.ts (kept local so seed runs standalone).
function progressiveDeductedHours(lateMinutes: number, toleranceMin: number = 15): number {
  if (lateMinutes <= toleranceMin) return 0
  return Math.ceil((lateMinutes - toleranceMin) / 60)
}

// Dijalankan langsung saat `bun prisma/seed.ts`, dan diekspos sebagai promise
// agar setup-turso.ts bisa menunggu seed benar-benar selesai.
export const seedPromise = main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
