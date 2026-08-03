import {
  type WorkerDatabaseContext,
  expireSupportAccessGrant,
  withWorkerTenantTransaction,
} from '@openschool/db'
import { sql } from 'drizzle-orm'

interface DueSupportGrant extends Record<string, unknown> {
  supportGrantId: string
}

/** Closes elapsed grants and creates review, audit, and tenant-notification evidence atomically. */
export async function processSupportAccessExpiry(
  context: WorkerDatabaseContext,
  limit = 100
): Promise<number> {
  if (context.jobType !== 'support_access_expiry') {
    throw new Error('Support Access expiry requires the matching worker job type')
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new Error('Support Access expiry limit must be between 1 and 100')
  }
  return withWorkerTenantTransaction(context, async (transaction) => {
    const due = await transaction.execute<DueSupportGrant>(sql`
      select id as "supportGrantId"
      from support_access_grants
      where status in ('approved', 'active') and valid_until <= now()
      order by valid_until, id
      for update skip locked
      limit ${limit}
    `)
    for (const grant of due) {
      await expireSupportAccessGrant(transaction, grant.supportGrantId)
    }
    return due.length
  })
}
