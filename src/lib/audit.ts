import { db } from '@/lib/db'

/**
 * Central audit helper (Phase 2). All mutations of importance should call
 * logAudit so the Audit Log tab in Pengaturan gives full traceability.
 * Failures are logged but never break the main flow.
 */
export async function logAudit(opts: {
  userId: string
  action: string
  entity: string
  entityId?: string | null
  detail?: string | null
}): Promise<void> {
  try {
    await db.auditLog.create({
      data: {
        userId: opts.userId,
        action: opts.action,
        entity: opts.entity,
        entityId: opts.entityId ?? null,
        detail: opts.detail ?? null,
      },
    })
  } catch (e) {
    console.error('[audit] failed to write audit log:', e)
  }
}
