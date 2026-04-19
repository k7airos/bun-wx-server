import { randomId } from '../../lib/utils'
import { config } from '../../config'
import { countAuditLogs, countAuditLogsBefore, deleteAuditLogsBefore, insertAuditLog } from './repository'

export function recordAuditLog(input: {
  requestId?: string | null
  action: string
  actorUserId?: string | null
  actorRole?: string | null
  status?: 'success' | 'failure'
  targetType?: string | null
  targetId?: string | null
  metadata?: unknown
}) {
  insertAuditLog({
    id: randomId(16),
    requestId: input.requestId || null,
    action: input.action,
    actorUserId: input.actorUserId || null,
    actorRole: input.actorRole || null,
    status: input.status || 'success',
    targetType: input.targetType || null,
    targetId: input.targetId || null,
    metadataJson: input.metadata === undefined ? null : JSON.stringify(input.metadata),
  })
}

function calculateAuditCutoff(days: number) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
}

export function cleanupAuditLogs(retentionDays = config.auditRetentionDays) {
  const cutoffIso = calculateAuditCutoff(retentionDays)
  const totalBeforeCleanup = countAuditLogs()
  const matchedBeforeCleanup = countAuditLogsBefore(cutoffIso)
  const deletedCount = deleteAuditLogsBefore(cutoffIso)
  const totalAfterCleanup = countAuditLogs()

  return {
    retentionDays,
    cutoffIso,
    deletedCount,
    matchedBeforeCleanup,
    totalBeforeCleanup,
    totalAfterCleanup,
  }
}
