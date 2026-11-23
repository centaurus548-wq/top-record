import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { hashPin, requireUser, apiErrorResponse } from '@/lib/auth'
import { logAudit } from '@/lib/audit'

const VALID_ROLES = ['OWNER', 'MANAGER', 'KASIR', 'KAPSTER']

/** GET /api/users — list all users with barber link (OWNER only). */
export async function GET() {
  try {
    await requireUser('OWNER')
    const users = await db.user.findMany({
      include: { barber: true },
      orderBy: [{ role: 'asc' }, { name: 'asc' }],
    })
    const barbers = await db.barber.findMany({ where: { active: true }, orderBy: { name: 'asc' } })
    return NextResponse.json({
      users: users.map((u) => ({
        id: u.id,
        name: u.name,
        username: u.username,
        role: u.role,
        active: u.active,
        barberId: u.barberId,
        barberName: u.barber?.name ?? null,
        createdAt: u.createdAt,
      })),
      barbers,
    })
  } catch (e) {
    const { status, body } = apiErrorResponse(e)
    return NextResponse.json(body, { status })
  }
}

/** POST /api/users — create user. Body: { name, username, pin, role, barberId?, active? } */
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser('OWNER')
    const body = await req.json().catch(() => null)
    const name = typeof body?.name === 'string' ? body.name.trim() : ''
    const username = typeof body?.username === 'string' ? body.username.trim().toLowerCase() : ''
    const pin = typeof body?.pin === 'string' ? body.pin.trim() : ''
    const role = body?.role
    const barberId = typeof body?.barberId === 'string' && body.barberId ? body.barberId : null

    if (!name || !username || !pin || !VALID_ROLES.includes(role)) {
      return NextResponse.json({ error: 'Nama, username, PIN, dan peran wajib diisi' }, { status: 400 })
    }
    if (!/^\d{4,6}$/.test(pin)) {
      return NextResponse.json({ error: 'PIN harus 4-6 digit angka' }, { status: 400 })
    }
    if (role === 'KAPSTER' && !barberId) {
      return NextResponse.json({ error: 'Akun kapster harus terhubung ke data kapster' }, { status: 400 })
    }
    if (barberId) {
      const barber = await db.barber.findUnique({ where: { id: barberId } })
      if (!barber) {
        return NextResponse.json({ error: 'Kapster tidak ditemukan' }, { status: 404 })
      }
    }
    const exists = await db.user.findUnique({ where: { username } })
    if (exists) {
      return NextResponse.json({ error: 'Username sudah dipakai' }, { status: 400 })
    }

    const created = await db.user.create({
      data: {
        name,
        username,
        pin: hashPin(pin),
        role,
        barberId: role === 'KAPSTER' ? barberId : barberId,
        active: true,
      },
    })
    await logAudit({
      userId: user.id,
      action: 'CREATE_USER',
      entity: 'User',
      entityId: created.id,
      detail: `${name} (${username}, ${role}) dibuat oleh ${user.name}`,
    })
    return NextResponse.json({ user: { ...created, pin: undefined } }, { status: 201 })
  } catch (e) {
    const { status, body } = apiErrorResponse(e)
    return NextResponse.json(body, { status })
  }
}

/** PUT /api/users — update user. Body: { id, name?, role?, pin?, active?, barberId? } */
export async function PUT(req: NextRequest) {
  try {
    const user = await requireUser('OWNER')
    const body = await req.json().catch(() => null)
    const id = typeof body?.id === 'string' ? body.id : ''
    if (!id) {
      return NextResponse.json({ error: 'ID pengguna wajib diisi' }, { status: 400 })
    }
    const target = await db.user.findUnique({ where: { id } })
    if (!target) {
      return NextResponse.json({ error: 'Pengguna tidak ditemukan' }, { status: 404 })
    }

    // Never allow locking yourself out of the system
    if (id === user.id && body?.active === false) {
      return NextResponse.json({ error: 'Tidak bisa menonaktifkan akun sendiri' }, { status: 400 })
    }
    // Never demote the last active OWNER
    if (target.role === 'OWNER' && body?.role && body.role !== 'OWNER') {
      const activeOwners = await db.user.count({ where: { role: 'OWNER', active: true } })
      if (activeOwners <= 1) {
        return NextResponse.json({ error: 'Harus ada minimal satu Owner aktif' }, { status: 400 })
      }
    }

    const data: Record<string, unknown> = {}
    if (typeof body.name === 'string' && body.name.trim()) data.name = body.name.trim()
    if (body.role && VALID_ROLES.includes(body.role)) {
      data.role = body.role
      if (body.role !== 'KAPSTER' && !body.barberId) data.barberId = target.barberId
    }
    if (body.pin !== undefined && body.pin !== '') {
      const pin = String(body.pin).trim()
      if (!/^\d{4,6}$/.test(pin)) {
        return NextResponse.json({ error: 'PIN harus 4-6 digit angka' }, { status: 400 })
      }
      data.pin = hashPin(pin)
    }
    if (body.active !== undefined) data.active = !!body.active
    if (body.barberId !== undefined) {
      data.barberId = body.barberId === '' || body.barberId === null ? null : String(body.barberId)
    }

    const updated = await db.user.update({ where: { id }, data })
    await logAudit({
      userId: user.id,
      action: 'UPDATE_USER',
      entity: 'User',
      entityId: id,
      detail: `${target.username} diubah (${Object.keys(data).join(', ')}${data.pin ? ', PIN direset' : ''}) oleh ${user.name}`,
    })
    return NextResponse.json({ user: { ...updated, pin: undefined } })
  } catch (e) {
    const { status, body } = apiErrorResponse(e)
    return NextResponse.json(body, { status })
  }
}
