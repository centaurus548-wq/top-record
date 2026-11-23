import { PrismaClient } from '@prisma/client'
import { PrismaLibSQL } from '@prisma/adapter-libsql'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// Dev hot-reload safe: if the cached client was generated before the latest
// schema push (missing newer models), create a fresh client instead.
const REQUIRED_MODELS = ['payrollPeriod', 'payrollLine'] as const

function hasRequiredModels(client: PrismaClient): boolean {
  return REQUIRED_MODELS.every((m) => Boolean((client as unknown as Record<string, unknown>)[m]))
}

/**
 * Koneksi database:
 * - Default (lokal): SQLite file via DATABASE_URL (file:...)
 * - Deploy gratis (Vercel + Turso): set TURSO_DATABASE_URL + TURSO_AUTH_TOKEN
 *   dan Prisma otomatis memakai driver adapter libSQL. Tidak ada perubahan query.
 */
function createDb(): PrismaClient {
  const tursoUrl = process.env.TURSO_DATABASE_URL
  if (tursoUrl) {
    const adapter = new PrismaLibSQL({
      url: tursoUrl,
      authToken: process.env.TURSO_AUTH_TOKEN,
    })
    return new PrismaClient({ adapter })
  }
  return new PrismaClient()
}

export const db: PrismaClient =
  globalForPrisma.prisma && hasRequiredModels(globalForPrisma.prisma)
    ? globalForPrisma.prisma
    : createDb()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
