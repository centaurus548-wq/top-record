import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireUser, apiErrorResponse } from '@/lib/auth'

/**
 * GET /api/audit?page=1&limit=50&user=<userId|all>&action=<text>&q=<detail text>
 * Paginated audit log (OWNER only).
 */
export async function GET(req: NextRequest) {
  try {
    await requireUser('OWNER')
    const sp = req.nextUrl.searchParams
    const page = Math.max(1, parseInt(sp.get('page') ?? '1', 10) || 1)
    const limit = Math.min(100, Math.max(10, parseInt(sp.get('limit') ?? '50', 10) || 50))
    const userId = sp.get('user')
    const action = sp.get('action')

    const where: Record<string, unknown> = {}
    if (userId && userId !== 'all') where.userId = userId
    if (action && action !== 'all') where.action = action

    const [rows, total, users, actions] = await Promise.all([
      db.auditLog.findMany({
        where,
        orderBy: { at: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.auditLog.count({ where }),
      db.user.findMany({ select: { id: true, name: true, username: true } }),
      db.auditLog.findMany({
        distinct: ['action'],
        select: { action: true },
        orderBy: { action: 'asc' },
      }),
    ])

    const userMap = new Map(users.map((u) => [u.id, u]))
    return NextResponse.json({
      rows: rows.map((r) => ({
        id: r.id,
        at: r.at,
        userId: r.userId,
        userName: userMap.get(r.userId)?.name ?? r.userId,
        action: r.action,
        entity: r.entity,
        entityId: r.entityId,
        detail: r.detail,
      })),
      total,
      page,
      pageCount: Math.max(1, Math.ceil(total / limit)),
      users,
      actions: actions.map((a) => a.action),
    })
  } catch (e) {
    const { status, body } = apiErrorResponse(e)
    return NextResponse.json(body, { status })
  }
}
