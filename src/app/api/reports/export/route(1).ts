import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireUser, apiErrorResponse } from '@/lib/auth'
import { todayISO, formatDateID, hhmmToMinutes } from '@/lib/date'
import { computeKomisi } from '@/lib/komisi'

function rp(n: number): string {
  return 'Rp' + Math.round(n || 0).toLocaleString('id-ID')
}

function esc(v: string | number | null | undefined): string {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function table(headers: string[], rows: (string | number)[][]): string {
  const th = headers.map((h) => `<th>${esc(h)}</th>`).join('')
  const trs = rows
    .map(
      (r) =>
        `<tr>${r
          .map((c, i) => `<td style="text-align:${i === 0 ? 'left' : 'right'}">${esc(c)}</td>`)
          .join('')}</tr>`
    )
    .join('')
  if (!rows.length) {
    return `<table>${thead(th)}<tbody><tr><td style="text-align:left;color:#888">Tidak ada data.</td></tr></tbody></table>`
  }
  return `<table>${thead(th)}<tbody>${trs}</tbody></table>`
}

function thead(th: string): string {
  return `<thead><tr>${th}</tr></thead>`
}

/**
 * GET /api/reports/export?from&to — laporan Word (.doc) yang ringkas.
 *
 * Struktur (Revisi 8):
 * 1. Ringkasan      — omzet, tip, pengeluaran, pendapatan bersih, gaji & potongan telat
 * 2. Absensi & Gaji — jam masuk tiap kapster, telat, potongan jam, gaji harian otomatis
 * 3. Rekap Kapster  — kepala, omzet layanan, komisi, tip
 * 4. Pengeluaran    — per kategori
 * 5. Transaksi      — daftar invoice
 * Implementasi: HTML dengan namespace MS Word, terbuka native di Word/WPS/Google Docs.
 */
export async function GET(req: NextRequest) {
  try {
    await requireUser('OWNER', 'MANAGER')
    const sp = req.nextUrl.searchParams
    const from = sp.get('from') ?? todayISO()
    const to = sp.get('to') ?? todayISO()

    const [txns, expenses, komisi, attendanceRows, settings] = await Promise.all([
      db.transaction.findMany({
        where: { date: { gte: from, lte: to }, status: 'NORMAL' },
        include: { items: true },
        orderBy: { createdAt: 'asc' },
      }),
      db.expense.findMany({
        where: { date: { gte: from, lte: to } },
        include: { category: true },
        orderBy: { date: 'asc' },
      }),
      computeKomisi(from, to),
      db.attendance.findMany({
        where: { date: { gte: from, lte: to } },
        include: { barber: true },
        orderBy: [{ date: 'asc' }, { clockInAt: 'asc' }],
      }),
      db.setting.findMany(),
    ])

    const barbers = await db.barber.findMany()
    const barberMap = new Map(barbers.map((b) => [b.id, b]))

    // ===== Pengaturan shift & gaji =====
    const settingMap = new Map(settings.map((s) => [s.key, s.value]))
    const shiftStart = settingMap.get('shiftStart') ?? '09:00'
    const shiftEnd = settingMap.get('shiftEnd') ?? '21:00'
    const hourlyRate = parseInt(settingMap.get('hourlyRate') ?? '10000', 10) || 10000
    const shiftHours = Math.max(1, (hhmmToMinutes(shiftEnd) - hhmmToMinutes(shiftStart)) / 60)
    const dailyShiftPay = Math.round(shiftHours * hourlyRate)

    // ===== Ringkasan =====
    const cashOmzet = txns.filter((t) => t.paymentMethod === 'CASH').reduce((a, t) => a + t.total, 0)
    const qrisOmzet = txns.filter((t) => t.paymentMethod === 'QRIS').reduce((a, t) => a + t.total, 0)
    const tipViaKas = txns.reduce((a, t) => a + t.tipAmount, 0)
    const expenseKas = expenses.filter((e) => e.source === 'KAS_SHOP').reduce((a, e) => a + e.amount, 0)
    const expenseOwner = expenses.filter((e) => e.source === 'OWNER_PRIVATE').reduce((a, e) => a + e.amount, 0)
    const omzet = cashOmzet + qrisOmzet

    // ===== Absensi & Gaji (otomatis) =====
    const attRows = attendanceRows.map((a) => {
      const clockIn = new Date(a.clockInAt.getTime() + 7 * 3600 * 1000)
        .toISOString()
        .slice(11, 16)
      const potonganRp = a.deductedHours * hourlyRate
      const dailyPay = dailyShiftPay - potonganRp
      return {
        date: a.date,
        name: a.barber?.name ?? '-',
        clockIn,
        lateMinutes: a.lateMinutes,
        deductedHours: a.deductedHours,
        potonganRp,
        dailyPay,
      }
    })
    const totalPotongan = attRows.reduce((a, r) => a + r.potonganRp, 0)
    const totalGajiKehadiran = attRows.reduce((a, r) => a + r.dailyPay, 0)
    const gajiBruto = attRows.length * dailyShiftPay

    // ===== Pengeluaran per kategori =====
    const expAgg = new Map<string, { name: string; amount: number; count: number }>()
    for (const e of expenses) {
      const name = e.category?.name ?? 'Lain-lain'
      const agg = expAgg.get(e.categoryId) ?? { name, amount: 0, count: 0 }
      agg.amount += e.amount
      agg.count += 1
      expAgg.set(e.categoryId, agg)
    }

    const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8" />
<title>Laporan Top-Record ${from} s/d ${to}</title>
<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom></w:WordDocument></xml><![endif]-->
<style>
body { font-family: Calibri, Arial, sans-serif; font-size: 11pt; margin: 36pt; }
h1 { font-size: 16pt; margin: 0 0 2pt 0; }
h2 { font-size: 12.5pt; margin: 16pt 0 4pt 0; }
.sub { color: #555; font-size: 10pt; margin: 0 0 4pt 0; }
table { border-collapse: collapse; width: 100%; margin: 4pt 0 8pt 0; }
th, td { border: 1px solid #b3b3b3; padding: 3pt 6pt; font-size: 10.5pt; }
th { background: #ecfdf5; text-align: right; }
th:first-child { text-align: left; }
.note { color: #666; font-size: 9.5pt; margin: 2pt 0 0 0; }
</style></head>
<body>
<h1>Laporan Top-Record</h1>
<p class="sub">Periode ${formatDateID(from)} s/d ${formatDateID(to)} &middot; Shift ${shiftStart}&ndash;${shiftEnd} &middot; Gaji Rp${hourlyRate.toLocaleString('id-ID')}/jam (${shiftHours} jam = ${rp(dailyShiftPay)}/hari)</p>

<h2>1. Ringkasan</h2>
${table(
  ['Keterangan', 'Nilai'],
  [
    ['Omzet (Tunai + QRIS)', rp(omzet)],
    ['&nbsp;&nbsp;&bull; Tunai', rp(cashOmzet)],
    ['&nbsp;&nbsp;&bull; QRIS', rp(qrisOmzet)],
    ['Jumlah transaksi', String(txns.length)],
    ['Tip via kas (untuk kapster)', rp(tipViaKas)],
    ['Pengeluaran (Kas Toko)', `- ${rp(expenseKas)}`],
    ['Pengeluaran (Dana Pribadi Owner)', rp(expenseOwner)],
    ['Pendapatan bersih (omzet &minus; pengeluaran kas toko)', rp(omzet - expenseKas)],
    ['Gaji kehadiran kapster (bruto)', rp(gajiBruto)],
    ['Potongan keterlambatan', `- ${rp(totalPotongan)}`],
    ['Gaji kehadiran bersih', rp(totalGajiKehadiran)],
    ['Komisi kapster', rp(komisi.reduce((a, k) => a + k.commission, 0))],
  ]
)}

<h2>2. Absensi &amp; Gaji (Transparan)</h2>
<p class="note">Toleransi telat 15 menit per jam. Sisanya dibulatkan ke atas: tiap jam punya toleransi baru 15 menit. Gaji harian = ${rp(dailyShiftPay)} &minus; (jam terpotong &times; Rp${hourlyRate.toLocaleString('id-ID')}).</p>
${table(
  ['Tanggal', 'Kapster', 'Jam Masuk', 'Telat', 'Potongan', 'Gaji Diterima'],
  attRows.map((r) => [
    formatDateID(r.date),
    r.name,
    r.clockIn,
    r.lateMinutes > 0 ? `${r.lateMinutes} mnt` : 'tepat waktu',
    r.deductedHours > 0 ? `${r.deductedHours} jam (${rp(r.potonganRp)})` : '-',
    rp(r.dailyPay),
  ])
)}

<h2>3. Rekap per Kapster</h2>
${table(
  ['Kapster', 'Kepala', 'Omzet Layanan', 'Komisi', 'Tip'],
  komisi.map((k) => [k.barberName, k.kepalaCount, rp(k.serviceRevenue), rp(k.commission), rp(k.tipEarned)])
)}

<h2>4. Pengeluaran per Kategori</h2>
${table(
  ['Kategori', 'Jumlah', 'Nominal'],
  [...expAgg.values()]
    .sort((a, b) => b.amount - a.amount)
    .map((v) => [v.name, `${v.count}x`, rp(v.amount)])
)}

<h2>5. Daftar Transaksi</h2>
${table(
  ['Invoice', 'Jam', 'Kapster', 'Layanan', 'Total', 'Metode'],
  txns.map((t) => {
    const kapsterNames = [
      ...new Set(
        t.items
          .filter((i) => i.barberId)
          .map((i) => barberMap.get(i.barberId!)?.name ?? '-')
      ),
    ]
    const layanan = t.items.map((i) => `${i.qty}x ${i.name}`).join(', ')
    return [
      t.invoiceNo,
      new Date(t.createdAt.getTime() + 7 * 3600 * 1000)
        .toISOString()
        .slice(11, 16),
      kapsterNames.length ? kapsterNames.join(', ') : '-',
      layanan,
      rp(t.total + t.tipAmount),
      t.paymentMethod === 'CASH' ? 'Tunai' : 'QRIS',
    ]
  })
)}

<p class="note">Dibuat otomatis oleh Top-Record. Transaksi dibatalkan tidak dihitung dalam laporan ini.</p>
</body></html>`

    const filename =
      from === to
        ? `Laporan-Top-Record-${from}.doc`
        : `Laporan-Top-Record-${from}-sd-${to}.doc`

    return new NextResponse(html, {
      status: 200,
      headers: {
        'Content-Type': 'application/msword; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  } catch (e) {
    const { status, body } = apiErrorResponse(e)
    return NextResponse.json(body, { status })
  }
}
