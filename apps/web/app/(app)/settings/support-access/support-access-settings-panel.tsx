'use client'

import { trpc } from '@/lib/trpc/client'
import { AlertTriangle, CheckCircle2, Clock3, LoaderCircle, ShieldCheck } from 'lucide-react'
import { type FormEvent, useState } from 'react'

const inputClass =
  'mt-1 block min-h-10 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-950 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:bg-gray-100'
const labelClass = 'block text-sm font-medium text-gray-800'

function formatInstant(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? 'Time unavailable'
    : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

function errorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === 'object' && 'message' in error) {
    const message = String((error as { message: unknown }).message)
    if (message.includes('REAUTHENTICATION_REQUIRED')) {
      return 'Verify your password and authenticator again, then retry within 15 minutes.'
    }
    if (message.includes('SUPPORT_ACCOUNT_UNAVAILABLE')) {
      return 'Use an active support account ID with a current support-agent assignment.'
    }
  }
  return fallback
}

export function SupportAccessSettingsPanel() {
  const utils = trpc.useUtils()
  const grants = trpc.supportAccess.grants.useQuery(undefined, { retry: false })
  const notifications = trpc.supportAccess.notifications.useQuery(undefined, { retry: false })
  const approve = trpc.supportAccess.approve.useMutation()
  const revoke = trpc.supportAccess.revoke.useMutation()
  const review = trpc.supportAccess.review.useMutation()
  const [scopeType, setScopeType] = useState<'tenant' | 'organization_subtree' | 'school'>('school')
  const [capabilities, setCapabilities] = useState<
    ('support.schools.read' | 'support.students.read')[]
  >(['support.schools.read'])
  const [statusMessage, setStatusMessage] = useState('')
  const [error, setError] = useState('')

  const refresh = async () => {
    await Promise.all([
      utils.supportAccess.grants.invalidate(),
      utils.supportAccess.notifications.invalidate(),
    ])
  }

  const submitApproval = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const formElement = event.currentTarget
    setError('')
    setStatusMessage('')
    const form = new FormData(formElement)
    if (capabilities.length === 0) {
      setError('Select at least one diagnostic permission.')
      return
    }
    const durationMinutes = Number(form.get('durationMinutes'))
    try {
      await approve.mutateAsync({
        supportAccountId: String(form.get('supportAccountId')),
        scopeType,
        ...(scopeType === 'organization_subtree'
          ? { educationOrganizationId: String(form.get('scopeId')) }
          : {}),
        ...(scopeType === 'school' ? { schoolId: String(form.get('scopeId')) } : {}),
        allowedCapabilities: capabilities,
        purpose: String(form.get('purpose')) as 'customer_support' | 'incident_response',
        ticketReference: String(form.get('ticketReference')),
        authorizationReason: String(form.get('authorizationReason')),
        validUntil: new Date(Date.now() + durationMinutes * 60_000).toISOString(),
      })
      formElement.reset()
      setScopeType('school')
      setCapabilities(['support.schools.read'])
      setStatusMessage('Support access approved. Tenant security administrators were notified.')
      await refresh()
    } catch (cause) {
      setError(
        errorMessage(cause, 'Unable to approve support access. Check the details and retry.')
      )
    }
  }

  const submitRevocation = async (event: FormEvent<HTMLFormElement>, supportGrantId: string) => {
    event.preventDefault()
    setError('')
    const form = new FormData(event.currentTarget)
    try {
      await revoke.mutateAsync({
        supportGrantId,
        reason: String(form.get('reason')),
      })
      setStatusMessage('Support access revoked. New operations are blocked immediately.')
      await refresh()
    } catch (cause) {
      setError(errorMessage(cause, 'Unable to revoke support access. Retry the operation.'))
    }
  }

  const submitReview = async (event: FormEvent<HTMLFormElement>, supportGrantId: string) => {
    event.preventDefault()
    setError('')
    const form = new FormData(event.currentTarget)
    try {
      await review.mutateAsync({
        supportGrantId,
        outcome: String(form.get('outcome')) as
          | 'confirmed'
          | 'no_impact'
          | 'control_gap'
          | 'incident',
        notes: String(form.get('notes')),
      })
      setStatusMessage('Closure review recorded in the audit ledger.')
      await refresh()
    } catch (cause) {
      setError(errorMessage(cause, 'Unable to record the closure review. Retry the operation.'))
    }
  }

  const toggleCapability = (capability: 'support.schools.read' | 'support.students.read') => {
    setCapabilities((current) =>
      current.includes(capability)
        ? current.filter((value) => value !== capability)
        : [...current, capability]
    )
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-950">Support access</h1>
        <p className="mt-1 max-w-3xl text-sm leading-6 text-gray-600">
          Approve only the diagnostic access needed for a support ticket. Every use is time-bound,
          visible here, and recorded in the audit ledger.
        </p>
      </div>

      <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
        <div className="flex gap-3">
          <AlertTriangle className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
          <div>
            <p className="font-semibold">Recent MFA verification is required</p>
            <p className="mt-1 leading-5">
              Verify your password and authenticator in Security settings before approving,
              revoking, or reviewing access.
            </p>
          </div>
        </div>
      </div>

      {(statusMessage || error) && (
        <div
          role={error ? 'alert' : 'status'}
          className={`rounded-lg border p-3 text-sm ${
            error
              ? 'border-red-300 bg-red-50 text-red-900'
              : 'border-emerald-300 bg-emerald-50 text-emerald-900'
          }`}
        >
          {error || statusMessage}
        </div>
      )}

      <section
        aria-labelledby="approve-support-heading"
        className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm"
      >
        <div className="flex items-center gap-3">
          <ShieldCheck className="size-5 text-gray-700" aria-hidden="true" />
          <h2 id="approve-support-heading" className="text-lg font-semibold text-gray-950">
            Approve support access
          </h2>
        </div>
        <form className="mt-6 grid gap-5 sm:grid-cols-2" onSubmit={submitApproval}>
          <label className={labelClass}>
            Support account ID
            <input
              className={inputClass}
              name="supportAccountId"
              type="text"
              required
              pattern="[0-9a-fA-F-]{36}"
              autoComplete="off"
            />
          </label>
          <label className={labelClass}>
            Ticket reference
            <input
              className={inputClass}
              name="ticketReference"
              type="text"
              required
              minLength={3}
              maxLength={128}
              placeholder="SUP-1042"
            />
          </label>
          <label className={labelClass}>
            Scope
            <select
              className={inputClass}
              value={scopeType}
              onChange={(event) => setScopeType(event.target.value as typeof scopeType)}
            >
              <option value="school">One school</option>
              <option value="organization_subtree">One organization and its schools</option>
              <option value="tenant">Entire tenant</option>
            </select>
          </label>
          {scopeType !== 'tenant' && (
            <label className={labelClass}>
              {scopeType === 'school' ? 'School ID' : 'Organization ID'}
              <input
                className={inputClass}
                name="scopeId"
                type="text"
                required
                pattern="[0-9a-fA-F-]{36}"
                autoComplete="off"
              />
            </label>
          )}
          <label className={labelClass}>
            Purpose
            <select className={inputClass} name="purpose" defaultValue="customer_support">
              <option value="customer_support">Customer support</option>
              <option value="incident_response">Incident response</option>
            </select>
          </label>
          <label className={labelClass}>
            Access duration
            <select className={inputClass} name="durationMinutes" defaultValue="60">
              <option value="30">30 minutes</option>
              <option value="60">1 hour</option>
              <option value="240">4 hours</option>
              <option value="480">8 hours</option>
            </select>
          </label>
          <fieldset className="sm:col-span-2">
            <legend className="text-sm font-medium text-gray-800">Diagnostic permissions</legend>
            <div className="mt-2 flex flex-wrap gap-4">
              {(
                [
                  ['support.schools.read', 'View schools'],
                  ['support.students.read', 'View student records'],
                ] as const
              ).map(([value, label]) => (
                <label
                  key={value}
                  className="flex min-h-10 items-center gap-2 text-sm text-gray-800"
                >
                  <input
                    type="checkbox"
                    checked={capabilities.includes(value)}
                    onChange={() => toggleCapability(value)}
                    className="size-4"
                  />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>
          <label className={`${labelClass} sm:col-span-2`}>
            Reason for access
            <textarea
              className={inputClass}
              name="authorizationReason"
              required
              minLength={3}
              maxLength={512}
              rows={3}
            />
          </label>
          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={approve.isPending}
              className="inline-flex min-h-10 items-center rounded-lg bg-gray-950 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {approve.isPending && (
                <LoaderCircle className="mr-2 size-4 animate-spin" aria-hidden="true" />
              )}
              Approve support access
            </button>
          </div>
        </form>
      </section>

      <section aria-labelledby="grant-history-heading" className="space-y-4">
        <div>
          <h2 id="grant-history-heading" className="text-lg font-semibold text-gray-950">
            Access history
          </h2>
          <p className="mt-1 text-sm text-gray-600">
            Active and completed grants within your administrative scope.
          </p>
        </div>
        {grants.isLoading ? (
          <output className="flex items-center gap-2 text-sm text-gray-600">
            <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
            Loading access history
          </output>
        ) : grants.error ? (
          <p
            className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900"
            role="alert"
          >
            Unable to load access history. Verify MFA and refresh the page.
          </p>
        ) : !grants.data?.length ? (
          <div className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center">
            <p className="font-medium text-gray-900">No support access has been approved</p>
            <p className="mt-1 text-sm text-gray-600">
              New approvals and emergency access will appear here.
            </p>
          </div>
        ) : (
          <ul className="space-y-4">
            {grants.data.map((grant) => (
              <li
                key={grant.supportGrantId}
                className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-gray-950">
                        {grant.supportAccountEmail}
                      </span>
                      <span className="rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-700">
                        {grant.status.replaceAll('_', ' ')}
                      </span>
                      {grant.kind === 'break_glass' && (
                        <span className="rounded-full bg-red-100 px-2 py-1 text-xs font-semibold text-red-800">
                          Emergency access
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-gray-600">
                      Ticket {grant.ticketReference} · Expires {formatInstant(grant.validUntil)}
                    </p>
                    <p className="mt-2 text-sm text-gray-800">{grant.authorizationReason}</p>
                  </div>
                  <code className="text-xs text-gray-500">{grant.supportGrantId}</code>
                </div>
                {(grant.status === 'approved' || grant.status === 'active') && (
                  <form
                    className="mt-4 flex flex-col gap-2 border-t border-gray-100 pt-4 sm:flex-row"
                    onSubmit={(event) => submitRevocation(event, grant.supportGrantId)}
                  >
                    <label className="flex-1 text-sm font-medium text-gray-800">
                      Revocation reason
                      <input
                        className={inputClass}
                        name="reason"
                        required
                        minLength={3}
                        maxLength={512}
                      />
                    </label>
                    <button
                      type="submit"
                      disabled={revoke.isPending}
                      className="min-h-10 self-end rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-800 hover:bg-red-50 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-60"
                    >
                      Revoke support access
                    </button>
                  </form>
                )}
                {grant.reviewStatus === 'pending' && (
                  <form
                    className="mt-4 grid gap-3 border-t border-gray-100 pt-4 sm:grid-cols-[12rem_1fr_auto]"
                    onSubmit={(event) => submitReview(event, grant.supportGrantId)}
                  >
                    <label className={labelClass}>
                      Review outcome
                      <select className={inputClass} name="outcome" defaultValue="confirmed">
                        <option value="confirmed">Access confirmed</option>
                        <option value="no_impact">No impact</option>
                        <option value="control_gap">Control gap</option>
                        <option value="incident">Security incident</option>
                      </select>
                    </label>
                    <label className={labelClass}>
                      Review notes
                      <input
                        className={inputClass}
                        name="notes"
                        required
                        minLength={3}
                        maxLength={2048}
                      />
                    </label>
                    <button
                      type="submit"
                      disabled={review.isPending}
                      className="min-h-10 self-end rounded-lg bg-gray-950 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-60"
                    >
                      Record closure review
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section
        aria-labelledby="notification-heading"
        className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
      >
        <div className="flex items-center gap-2">
          <Clock3 className="size-5 text-gray-600" aria-hidden="true" />
          <h2 id="notification-heading" className="text-lg font-semibold text-gray-950">
            Security notifications
          </h2>
        </div>
        {!notifications.data?.length ? (
          <p className="mt-3 text-sm text-gray-600">No support access notifications yet.</p>
        ) : (
          <ul className="mt-4 divide-y divide-gray-100">
            {notifications.data.slice(0, 10).map((notification) => (
              <li
                key={notification.id}
                className="flex items-center justify-between gap-3 py-3 text-sm"
              >
                <span className="flex items-center gap-2 text-gray-900">
                  <CheckCircle2 className="size-4 text-emerald-600" aria-hidden="true" />
                  Support access {notification.event.replaceAll('_', ' ')}
                </span>
                <time className="text-gray-500" dateTime={String(notification.occurredAt)}>
                  {formatInstant(String(notification.occurredAt))}
                </time>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
