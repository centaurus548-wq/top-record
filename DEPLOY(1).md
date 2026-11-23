# Panduan Deploy Gratis — Top-Record (uji coba 1–2 bulan)

Aplikasi ini dioptimalkan untuk gratis: satu instance, database libSQL/SQLite,
login PIN. Opsi utama: **Netlify + Turso** (pilihan, benar-benar gratis tanpa
kartu kredit). Alternatif: Vercel atau Railway.

> Penting: di Netlify/Vercel, file SQLite lokal **hilang setiap redeploy**
> (serverless, disk ephemeral). Karena itu deploy online **wajib** pakai Turso
> sebagai database. Kode sudah siap: begitu `TURSO_DATABASE_URL` di-set, semua
> query otomatis lewat Turso tanpa perubahan apa pun.

---

## Opsi A — Netlify + Turso (pilihan utama)

Turso = database libSQL di cloud, free tier-nya cukup untuk 1 barbershop
(100 database, 5 GB, 500 juta row reads + 10 juta row writes per bulan).
Netlify free tier untuk hosting Next.js + API routes.

### 1. Siapkan Turso

**Cara A — lewat website (paling gampang, tanpa install CLI, cocok untuk Windows):**

1. Buka [dashboard.turso.tech](https://dashboard.turso.tech) → **Sign up with GitHub**.
2. Klik **Create database** → nama: `toprecord` → location: `sin` (Singapore, paling dekat Indonesia) → Create.
3. Buka database-nya → salin **URL** (bentuknya `libsql://toprecord-xxx.turso.io`).
4. Di halaman yang sama, buat **database token** → salin tokennya.

**Cara B — lewat CLI (Mac/Linux; Windows butuh WSL, lebih ribet):**

```bash
curl -sSfL https://get.tur.so/install.sh | bash
turso auth signup          # daftar (bisa pakai GitHub)
turso db create toprecord  # buat database
turso db show toprecord --url    # -> catat TURSO_DATABASE_URL
turso db tokens create toprecord # -> catat TURSO_AUTH_TOKEN
```

### 2. Buat tabel + data awal di Turso (SATU perintah)

> Kebutuhan: [bun](https://bun.sh) terpasang (`powershell -c "irm bun.sh/install.ps1 | iex"` di Windows,
> lalu buka ulang terminal), dan file proyek sudah diekstrak.

**PowerShell (Windows):**

```powershell
cd C:\top-record
$env:TURSO_DATABASE_URL="libsql://toprecord-xxx.turso.io"
$env:TURSO_AUTH_TOKEN="token-dari-turso"
bun run db:turso-setup
```

**Mac/Linux:**

```bash
cd ~/top-record
TURSO_DATABASE_URL=libsql://... TURSO_AUTH_TOKEN=... bun run db:turso-setup
```

> Script `db:turso-setup` membuat semua tabel dari `db/schema.sql` DAN mengisi
> data awal (akun owner, kapster, layanan, produk, aturan komisi, settings)
> dalam satu jalan. Tidak perlu `turso db shell` maupun seed terpisah.

### 3. Push ke GitHub

```bash
git init && git add -A && git commit -m "Top-Record"
git remote add origin https://github.com/<username>/top-record.git
git push -u origin main
```

`.env` sudah di-ignore — token Turso & SESSION_SECRET tidak akan ikut ter-push.

### 4. Deploy ke Netlify

1. Buka [app.netlify.com](https://app.netlify.com) → **Add new site** →
   **Import an existing project** → pilih repo GitHub.
2. Netlify otomatis mendeteksi Next.js dan membaca `netlify.toml`
   (build command + plugin Next.js sudah dikonfigurasi).
3. Sebelum deploy pertama, buka **Site configuration → Environment variables**,
   tambahkan:

| Nama                 | Nilai                                |
| -------------------- | ------------------------------------ |
| `TURSO_DATABASE_URL` | `libsql://toprecord-xxx.turso.io`    |
| `TURSO_AUTH_TOKEN`   | token dari `turso db tokens create`  |
| `SESSION_SECRET`     | `openssl rand -hex 32` (wajib!)      |
| `DATABASE_URL`       | `file:./db/custom.db` (placeholder)  |

4. **Deploy site**. Setelah jadi, Netlify memberi URL seperti
   `https://top-record.netlify.app` — langsung bisa dipakai kasir via browser.

### 5. Selesai — ceklis setelah live

- [ ] Login `owner` / PIN `111111` berhasil.
- [ ] Buat 1 transaksi uji → muncul di Riwayat.
- [ ] Unduh Laporan Word → terbuka di Word/WPS.
- [ ] **Segera ganti PIN owner** (Pengaturan → Pengguna).

> Catatan skema: `prisma db push` tidak bisa menyentuh Turso langsung — karena
> itu langkah 2 memakai `db:turso-setup` (schema.sql + seed). Untuk perubahan skema di masa
> depan, generate ulang: `bunx prisma migrate diff --from-empty
> --to-schema-datamodel prisma/schema.prisma --script > db/schema.sql`.

---

## Opsi B — Vercel + Turso (alternatif, juga gratis)

Sama seperti Opsi A langkah 1–2, lalu:

```bash
bunx vercel login
bunx vercel            # deploy pertama (link project)
```

Set env variables yang sama di dashboard Vercel → Settings → Environment
Variables, lalu redeploy (`bunx vercel --prod`).

---

## Opsi C — Railway (paling mudah, SQLite tetap file lokal)

Railway memberi kredit percobaan $5 sekali (tanpa kartu) — cukup ~1–2 bulan
untuk satu aplikasi kecil. SQLite file disimpan di volume persistent, jadi
tidak perlu Turso.

1. Push repo ke GitHub.
2. railway.app → New Project → Deploy from GitHub repo.
3. Add **Volume** dan mount ke `/app/db` (agar file `custom.db` tidak hilang saat restart).
4. Variables: `SESSION_SECRET` (wajib), `DATABASE_URL=file:/app/db/custom.db`.
5. Start command: `bun run db:push && bun run db:seed && bun run start`.

Kekurangan: setelah kredit $5 habis, harus upgrade (mulai ~$5/bulan).

---

## Checklist Security (sudah diterapkan di kode)

- [x] PIN di-hash **scrypt + salt** (bukan sha256 murni) — tahan brute force.
- [x] **Rate limit login**: 5 percobaan gagal / 10 menit per username+IP.
- [x] Cookie sesi: `httpOnly`, `SameSite=Lax`, `secure` otomatis di production (HTTPS).
- [x] `SESSION_SECRET` via env — cookie tidak bisa dipalsukan tanpa kunci.
- [x] Security headers: `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`.
- [x] Semua API mengecek sesi; void/batal selalu berupa status + alasan wajib, tidak pernah hard-delete (audit trail di menu Arsip).
- [x] Satu level akses: siapa pun yang login punya akses penuh — pembatasan berada di kepemilikan akun, bukan di role.

Yang tetap perlu Anda lakukan:

1. **Ganti PIN default 111111** setelah login pertama (menu Pengaturan → Pengguna → Edit → Reset PIN).
2. Buat akun per orang yang login (nama masing-masing) supaya audit log akurat.
3. **Backup database**: dengan Turso, `turso db export toprecord > backup.sql` seminggu sekali.
4. Jangan bagikan `SESSION_SECRET` / token Turso ke siapa pun (jangan commit `.env`).
