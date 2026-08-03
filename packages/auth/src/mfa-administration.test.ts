import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { supabaseMfaAdministrationAdapter } from './mfa-administration'

describe('Supabase MFA administration adapter', () => {
  it('deletes every current factor and is naturally retryable', async () => {
    const deleted: string[] = []
    const adapter = supabaseMfaAdministrationAdapter({
      auth: {
        admin: {
          mfa: {
            async listFactors() {
              return { data: { factors: [{ id: 'factor-1' }, { id: 'factor-2' }] }, error: null }
            },
            async deleteFactor({ id }) {
              deleted.push(id)
              return { error: null }
            },
          },
        },
      },
    })

    assert.equal(await adapter.resetFactors('provider-user'), 2)
    assert.deepEqual(deleted, ['factor-1', 'factor-2'])
  })

  it('fails without reporting completion when listing or deletion fails', async () => {
    const listFailure = supabaseMfaAdministrationAdapter({
      auth: {
        admin: {
          mfa: {
            async listFactors() {
              return { data: null, error: new Error('unavailable') }
            },
            async deleteFactor() {
              return { error: null }
            },
          },
        },
      },
    })
    await assert.rejects(listFailure.resetFactors('provider-user'), /MFA_FACTOR_LIST_FAILED/)

    const deleteFailure = supabaseMfaAdministrationAdapter({
      auth: {
        admin: {
          mfa: {
            async listFactors() {
              return { data: { factors: [{ id: 'factor-1' }] }, error: null }
            },
            async deleteFactor() {
              return { error: new Error('unavailable') }
            },
          },
        },
      },
    })
    await assert.rejects(deleteFailure.resetFactors('provider-user'), /MFA_FACTOR_DELETE_FAILED/)
  })
})
