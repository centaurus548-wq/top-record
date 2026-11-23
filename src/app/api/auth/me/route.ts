import { NextResponse } from 'next/server'
import { getSessionUser, navForRole, apiErrorResponse } from '@/lib/auth'

export async function GET() {
  try {
    const user = await getSessionUser()
    if (!user) {
      return NextResponse.json({ error: 'Belum login' }, { status: 401 })
    }
    return NextResponse.json({
      user,
      nav: navForRole(user.role),
    })
  } catch (e) {
    const { status, body } = apiErrorResponse(e)
    return NextResponse.json(body, { status })
  }
}
