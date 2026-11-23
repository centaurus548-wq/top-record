// Setup database Turso dalam SATU perintah — buat semua tabel + isi data awal.
//
// Pakai (PowerShell Windows):
//   $env:TURSO_DATABASE_URL="libsql://..."; $env:TURSO_AUTH_TOKEN="..."; bun run db:turso-setup
//
// Pakai (Mac/Linux):
//   TURSO_DATABASE_URL=libsql://... TURSO_AUTH_TOKEN=... bun run db:turso-setup
//
// Tidak perlu Turso CLI — cukup bun + URL/token dari dashboard.turso.tech.
import { createClient } from '@libsql/client'
import { readFileSync, existsSync } from 'fs'
import { execSync, spawnSync } from 'child_process'
import path from 'path'
import { fileURLToPath } from 'url'

const projectRoot = fileURLToPath(new URL('..', import.meta.url))
const nodeModules = path.join(projectRoot, 'node_modules')

// Fase 1: bila dependencies belum terpasang, install + generate Prisma client,
// lalu RESTART script ini dalam proses baru (resolusi modul bun terkunci saat
// proses start, jadi harus proses segar untuk melihat node_modules lokal).
if (!existsSync(nodeModules) && !process.env.TURSO_SETUP_REEXEC) {
  console.log('0/2  Install dependencies + generate Prisma client (sekali saja, 1-2 menit) ...')
  execSync('bun install', { stdio: 'inherit', cwd: projectRoot })
  execSync('bunx prisma generate', { stdio: 'inherit', cwd: projectRoot })
  console.log('     Restart setup dalam proses baru ...')
  const r = spawnSync(process.execPath, process.argv.slice(1), {
    stdio: 'inherit',
    cwd: projectRoot,
    env: { ...process.env, TURSO_SETUP_REEXEC: '1' },
  })
  process.exit(r.status ?? 0)
}

// Lokasi db/schema.sql relatif terhadap file ini (aman di Windows, Mac, Linux)
const schemaPath = fileURLToPath(new URL('../db/schema.sql', import.meta.url))

const url = process.env.TURSO_DATABASE_URL
if (!url) {
  console.error('ERROR: TURSO_DATABASE_URL belum di-set.')
  console.error('Contoh (PowerShell): $env:TURSO_DATABASE_URL="libsql://xxx.turso.io"')
  process.exit(1)
}

const client = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN })

// 1. Buat semua tabel dari db/schema.sql
// Dibuat idempotent (bisa dijalankan ulang): CREATE TABLE/INDEX diberi IF NOT EXISTS
// supaya tidak bentrok bila tabel sudah pernah dibuat oleh run sebelumnya.
const raw = readFileSync(schemaPath, 'utf8')
const schema = raw
  .replaceAll('CREATE TABLE ', 'CREATE TABLE IF NOT EXISTS ')
  .replaceAll('CREATE UNIQUE INDEX ', 'CREATE UNIQUE INDEX IF NOT EXISTS ')
  .replaceAll('CREATE INDEX ', 'CREATE INDEX IF NOT EXISTS ')
console.log('1/2  Membuat tabel dari db/schema.sql ...')
await client.executeMultiple(schema)
console.log('     Tabel selesai dibuat.')

// 2. Isi data awal (akun owner, kapster, layanan, produk, komisi, settings)
console.log('2/2  Mengisi data awal (seed) ...')
const seed = await import('../prisma/seed')
await seed.seedPromise

console.log('')
console.log('SELESAI! Database siap dipakai.')
console.log('Akun awal: owner / PIN 111111 (segera ganti setelah login pertama).')
process.exit(0)
