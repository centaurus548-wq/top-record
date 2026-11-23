import { NextResponse } from 'next/server'
import { clearSessionCookie, apiErrorResponse } from '@/lib/auth'

export async function POST() {
  try {
    const res = NextResponse.json({ ok: true })
    res.cookies.set(clearSessionCookie())
    return res
  } catch (e) {
    const { status, body } = apiErrorResponse(e)
    return NextResponse.json(body, { status })
  }
}
