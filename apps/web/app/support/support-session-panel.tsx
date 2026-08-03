'use client'

import { trpc } from '@/lib/trpc/client'
import { AlertTriangle, BookOpen, LoaderCircle, LockKeyhole, ShieldAlert, X } from 'lucide-react'
import { type FormEvent, useState } from 'react'

const inputClass =
  'mt-1 block min-h-10 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-950 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:bg-gray-100'

interface Binding {
  tenantId: string
  supportGrantId: string
}

function formatInstant(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? 'Time unavailable'
    : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

function supportMessage(error: unknown): string {
  const message =
    error && typeof error === 'object' && 'message' in error ? String(error.message) : ''
  if (message.includes('REAUTHENTICATION_REQUIRED')) {
    return 'Verify your password and authenticator again, then retry within 15 minutes.'
  }
  if (message.includes('SUPPORT_ACCESS_DENIED')) {
    return 'This grant is unavailable, expired, revoked, or does not permit this operation.'
  }
  return 'Unable to use this support grant. Check the identifiers and retry.'
}

export function SupportSessionPanel() {
  const [binding, setBinding] = useState<Binding | null>(null)
  const [selectedSchoolId, setSelectedSchoolId] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const schools = trpc.supportAccess.schools.useQuery(
    {
      tenantId: binding?.tenantId ?? '00000000-0000-4000-8000-000000000000',
      supportGrantId: binding?.supportGrantId ?? '00000000-0000-4000-8000-000000000000',
    },
    { enabled: Boolean(binding), retry: false }
  )
  const effectiveSchoolId = selectedSchoolId || schools.data?.schools[0]?.id || ''
  const students = trpc.supportAccess.students.useQuery(
    {
      tenantId: binding?.tenantId ?? '00000000-0000-4000-8000-000000000000',
      supportGrantId: binding?.supportGrantId ?? '00000000-0000-4000-8000-000000000000',
      schoolId: effectiveSchoolId || '00000000-0000-4000-8000-000000000000',
    },
    { enabled: Boolean(binding && effectiveSchoolId), retry: false }
  )
  const close = trpc.supportAccess.close.useMutation()
  const breakGlass = trpc.supportAccess.openBreakGlass.useMutation()
  const requestContext = schools.data?.requestContext ?? students.data?.requestContext

  const startSession = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setError('')
    setMessage('')
    setSelectedSchoolId('')
    setBinding({
      tenantId: String(form.get('tenantId')),
      supportGrantId: String(form.get('supportGrantId')),
    })
  }

  const closeSession = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!binding) return
    const form = new FormData(event.currentTarget)
    setError('')
    try {
      await close.mutateAsync({ ...binding, reason: String(form.get('reason')) })
      setBinding(null)
      setSelectedSchoolId('')
      setMessage('Support access closed. Tenant security administrators were notified.')
    } catch (cause) {
      setError(supportMessage(cause))
    }
  }

  const openEmergencyAccess = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const formElement = event.currentTarget
    const form = new FormData(formElement)
    setError('')
    setMessage('')
    try {
      const result = await breakGlass.mutateAsync({
        tenantId: String(form.get('tenantId')),
        scopeType: 'school',
        schoolId: String(form.get('schoolId')),
        allowedCapabilities: ['support.schools.read', 'support.students.read'],
        ticketReference: String(form.get('ticketReference')),
        emergencyRuleReference: String(form.get('emergencyRuleReference')),
        authorizationReason: String(form.get('authorizationReason')),
        validUntil: new Date(Date.now() + 30 * 60_000).toISOString(),
      })
      setBinding({ tenantId: result.tenantId as string, supportGrantId: result.supportGrantId })
      setSelectedSchoolId(String(form.get('schoolId')))
      formElement.reset()
      setMessage('Emergency access opened for 30 minutes. Tenant administrators were notified.')
    } catch (cause) {
      setError(supportMessage(cause))
    }
  }

  return (
    <div className="min-h-screen bg-gray-100 text-gray-950">
      {requestContext && (
        <output
          className={`sticky top-0 z-20 border-b px-4 py-3 ${
            requestContext.supportKind === 'break_glass'
              ? 'border-red-400 bg-red-700 text-white'
              : 'border-amber-400 bg-amber-100 text-amber-950'
          }`}
        >
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <ShieldAlert className="size-5 shrink-0" aria-hidden="true" />
              <div>
                <p className="font-semibold">
                  {requestContext.supportKind === 'break_glass'
                    ? 'Emergency access is active'
                    : 'Tenant-approved support access is active'}
                </p>
                <p className="text-sm">
                  Purpose: {requestContext.purpose.replaceAll('_', ' ')} · Expires{' '}
                  {formatInstant(requestContext.expiresAt)} · Every operation is visible to the
                  tenant
                </p>
              </div>
            </div>
            <code className="rounded bg-black/10 px-2 py-1 text-xs">
              {requestContext.supportGrantId}
            </code>
          </div>
        </output>
      )}

      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4">
          <span className="flex size-9 items-center justify-center rounded-lg bg-gray-950 text-white">
            <BookOpen className="size-5" aria-hidden="true" />
          </span>
          <div>
            <p className="font-semibold">OpenSchool support workspace</p>
            <p className="text-xs text-gray-500">Authorized diagnostics only</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 px-4 py-8">
        {(message || error || schools.error || students.error) && (
          <div
            role={error || schools.error || students.error ? 'alert' : 'status'}
            className={`rounded-lg border p-3 text-sm ${
              error || schools.error || students.error
                ? 'border-red-300 bg-red-50 text-red-900'
                : 'border-emerald-300 bg-emerald-50 text-emerald-900'
            }`}
          >
            {error ||
              (schools.error ? supportMessage(schools.error) : '') ||
              (students.error ? supportMessage(students.error) : '') ||
              message}
          </div>
        )}

        {!binding ? (
          <div className="grid gap-6 lg:grid-cols-2">
            <section
              className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm"
              aria-labelledby="approved-grant-heading"
            >
              <LockKeyhole className="size-6 text-gray-700" aria-hidden="true" />
              <h1 id="approved-grant-heading" className="mt-4 text-xl font-bold">
                Use an approved support grant
              </h1>
              <p className="mt-2 text-sm leading-6 text-gray-600">
                Enter the identifiers from the support ticket. The grant will bind to this session
                when the first diagnostic operation begins.
              </p>
              <form className="mt-6 space-y-4" onSubmit={startSession}>
                <label className="block text-sm font-medium">
                  Tenant ID
                  <input
                    className={inputClass}
                    name="tenantId"
                    required
                    pattern="[0-9a-fA-F-]{36}"
                    autoComplete="off"
                  />
                </label>
                <label className="block text-sm font-medium">
                  Support grant ID
                  <input
                    className={inputClass}
                    name="supportGrantId"
                    required
                    pattern="[0-9a-fA-F-]{36}"
                    autoComplete="off"
                  />
                </label>
                <button
                  type="submit"
                  className="min-h-10 rounded-lg bg-gray-950 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 focus-visible:outline-2 focus-visible:outline-offset-2"
                >
                  Start diagnostic session
                </button>
              </form>
            </section>

            <section
              className="rounded-xl border border-red-300 bg-white p-6 shadow-sm"
              aria-labelledby="emergency-access-heading"
            >
              <AlertTriangle className="size-6 text-red-700" aria-hidden="true" />
              <h2 id="emergency-access-heading" className="mt-4 text-xl font-bold">
                Open emergency access
              </h2>
              <p className="mt-2 text-sm leading-6 text-gray-600">
                Only a separately assigned break-glass operator can continue. Access lasts 30
                minutes and requires incident review.
              </p>
              <form className="mt-6 grid gap-4 sm:grid-cols-2" onSubmit={openEmergencyAccess}>
                <label className="block text-sm font-medium">
                  Tenant ID
                  <input
                    className={inputClass}
                    name="tenantId"
                    required
                    pattern="[0-9a-fA-F-]{36}"
                  />
                </label>
                <label className="block text-sm font-medium">
                  School ID
                  <input
                    className={inputClass}
                    name="schoolId"
                    required
                    pattern="[0-9a-fA-F-]{36}"
                  />
                </label>
                <label className="block text-sm font-medium">
                  Incident ticket
                  <input
                    className={inputClass}
                    name="ticketReference"
                    required
                    minLength={3}
                    maxLength={128}
                    placeholder="INC-204"
                  />
                </label>
                <label className="block text-sm font-medium">
                  Emergency rule reference
                  <input
                    className={inputClass}
                    name="emergencyRuleReference"
                    required
                    minLength={3}
                    maxLength={128}
                  />
                </label>
                <label className="block text-sm font-medium sm:col-span-2">
                  Reason for emergency access
                  <textarea
                    className={inputClass}
                    name="authorizationReason"
                    required
                    minLength={3}
                    maxLength={512}
                    rows={3}
                  />
                </label>
                <button
                  type="submit"
                  disabled={breakGlass.isPending}
                  className="min-h-10 rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-60 sm:col-span-2 sm:justify-self-start"
                >
                  {breakGlass.isPending && (
                    <LoaderCircle className="mr-2 inline size-4 animate-spin" aria-hidden="true" />
                  )}
                  Open emergency access
                </button>
              </form>
            </section>
          </div>
        ) : (
          <>
            <section
              className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm"
              aria-labelledby="diagnostic-scope-heading"
            >
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <h1 id="diagnostic-scope-heading" className="text-xl font-bold">
                    Diagnostic scope
                  </h1>
                  <p className="mt-1 text-sm text-gray-600">
                    Only schools and student records within the approved scope are available.
                  </p>
                </div>
                <label className="block min-w-64 text-sm font-medium">
                  School
                  <select
                    className={inputClass}
                    value={effectiveSchoolId}
                    onChange={(event) => setSelectedSchoolId(event.target.value)}
                    disabled={schools.isLoading || !schools.data?.schools.length}
                  >
                    {schools.isLoading ? (
                      <option>Loading schools</option>
                    ) : !schools.data?.schools.length ? (
                      <option>No schools in scope</option>
                    ) : (
                      schools.data.schools.map((school) => (
                        <option key={school.id} value={school.id}>
                          {school.name}
                        </option>
                      ))
                    )}
                  </select>
                </label>
              </div>
            </section>

            <section
              className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm"
              aria-labelledby="student-diagnostics-heading"
            >
              <div className="border-b border-gray-200 px-6 py-4">
                <h2 id="student-diagnostics-heading" className="font-semibold">
                  Student diagnostics
                </h2>
                <p className="mt-1 text-sm text-gray-600">
                  Read-only records for troubleshooting. Changes are not available in support mode.
                </p>
              </div>
              {students.isLoading ? (
                <output className="flex items-center gap-2 p-6 text-sm text-gray-600">
                  <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
                  Loading student records
                </output>
              ) : !students.data?.students.length ? (
                <div className="p-8 text-center">
                  <p className="font-medium">No student records in this school</p>
                  <p className="mt-1 text-sm text-gray-600">
                    Choose another school within the approved scope.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th
                          scope="col"
                          className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600"
                        >
                          Name
                        </th>
                        <th
                          scope="col"
                          className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600"
                        >
                          Student number
                        </th>
                        <th
                          scope="col"
                          className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600"
                        >
                          Status
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {students.data.students.map((student) => (
                        <tr key={student.id}>
                          <td className="px-6 py-4 text-sm font-medium">
                            {student.firstName} {student.lastName}
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-600">
                            {student.studentNumber || 'Not assigned'}
                          </td>
                          <td className="px-6 py-4 text-sm capitalize text-gray-600">
                            {student.status}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section
              className="rounded-xl border border-gray-300 bg-white p-6"
              aria-labelledby="close-session-heading"
            >
              <div className="flex items-center gap-2">
                <X className="size-5 text-gray-600" aria-hidden="true" />
                <h2 id="close-session-heading" className="font-semibold">
                  Close support access
                </h2>
              </div>
              <form className="mt-4 flex flex-col gap-3 sm:flex-row" onSubmit={closeSession}>
                <label className="flex-1 text-sm font-medium">
                  Closure reason
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
                  disabled={close.isPending}
                  className="min-h-10 self-end rounded-lg border border-gray-400 px-4 py-2 text-sm font-semibold hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-60"
                >
                  Close support access
                </button>
              </form>
            </section>
          </>
        )}
      </main>
    </div>
  )
}
