import { db } from '../../db'

const insertAuditLogStmt = db.prepare(`
  INSERT INTO audit_logs (
    id,
    request_id,
    action,
    actor_user_id,
    actor_role,
    status,
    target_type,
    target_id,
    metadata_json
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`)

const deleteAuditLogsBeforeStmt = db.prepare(`
  DELETE FROM audit_logs
  WHERE created_at < ?
`)

const countAuditLogsStmt = db.prepare<{ count: number }, []>(`
  SELECT COUNT(*) AS count
  FROM audit_logs
`)

const countAuditLogsBeforeStmt = db.prepare<{ count: number }, [string]>(`
  SELECT COUNT(*) AS count
  FROM audit_logs
  WHERE created_at < ?
`)

export function insertAuditLog(input: {
  id: string
  requestId?: string | null
  action: string
  actorUserId?: string | null
  actorRole?: string | null
  status: 'success' | 'failure'
  targetType?: string | null
  targetId?: string | null
  metadataJson?: string | null
}) {
  insertAuditLogStmt.run(
    input.id,
    input.requestId || null,
    input.action,
    input.actorUserId || null,
    input.actorRole || null,
    input.status,
    input.targetType || null,
    input.targetId || null,
    input.metadataJson || null,
  )
}

export function countAuditLogs() {
  return countAuditLogsStmt.get()?.count || 0
}

export function countAuditLogsBefore(cutoffIso: string) {
  return countAuditLogsBeforeStmt.get(cutoffIso)?.count || 0
}

export function deleteAuditLogsBefore(cutoffIso: string) {
  const result = deleteAuditLogsBeforeStmt.run(cutoffIso)
  return Number(result.changes || 0)
}
