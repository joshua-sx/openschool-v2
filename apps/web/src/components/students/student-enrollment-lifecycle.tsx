'use client'

import { trpc } from '@/lib/trpc/client'
import { AlertCircle, ArrowRight, Clock3, LoaderCircle, School, ShieldCheck } from 'lucide-react'
import Link from 'next/link'
import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react'

const INPUT_CLASS =
  'mt-1 block min-h-10 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-950 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:bg-gray-100'
const BUTTON_CLASS =
  'inline-flex min-h-10 items-center justify-center rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-60'
const PRIMARY_BUTTON_CLASS =
  'inline-flex min-h-10 items-center justify-center rounded-lg bg-gray-950 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-60'

type TransitionType =
  | 'withdraw'
  | 'transfer'
  | 'graduate'
  | 'reenroll'
  | 'add_secondary'
  | 'end_secondary'

const TRANSITION_LABELS: Readonly<Record<TransitionType, string>> = {
  withdraw: 'Withdraw learner',
  transfer: 'Transfer to another School',
  graduate: 'Graduate learner',
  reenroll: 'Re-enroll learner',
  add_secondary: 'Add secondary enrollment',
  end_secondary: 'End secondary enrollment',
}

function localDateTime(date: Date): string {
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

function formatDateTime(value: Date | string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

function mutationErrorMessage(error: unknown): string {
  const message =
    error && typeof error === 'object' && 'message' in error
      ? String((error as { message: unknown }).message)
      : ''
  if (message.includes('MFA_REQUIRED')) {
    return 'Verify with MFA in Security settings, then return here and retry.'
  }
  if (message.includes('ENROLLMENT_CONTEXT_STALE')) {
    return 'The enrollment changed after this page loaded. The timeline has been refreshed.'
  }
  if (message.includes('ENROLLMENT_TRANSITION_STALE')) {
    return 'The enrollment changed after this page loaded. The timeline has been refreshed.'
  }
  if (message.includes('ENROLLMENT_TRANSITION_CONFLICT')) {
    return 'This transition conflicts with an enrollment or another scheduled transition.'
  }
  if (message.includes('ENROLLMENT_TRANSITION_UNAVAILABLE')) {
    return 'The enrollment is unavailable or outside your authorized School scope.'
  }
  if (message.includes('ENROLLMENT_TRANSITION_INVALID')) {
    return 'This transition is not valid for the selected enrollment and date.'
  }
  return 'The enrollment transition could not be completed. Refresh and retry.'
}

export function StudentEnrollmentLifecycle({
  personId,
  studentLookupId,
}: {
  personId: string
  studentLookupId: string
}) {
  const utils = trpc.useUtils()
  const history = trpc.studentEnrollments.history.useQuery({ personId }, { retry: false })
  const manageAccess = trpc.studentEnrollments.canManage.useQuery(undefined, { retry: false })
  const schools = trpc.schools.list.useQuery(undefined, {
    enabled: manageAccess.data === true,
    retry: false,
  })
  const schedule = trpc.studentEnrollments.schedule.useMutation()
  const applyScheduled = trpc.studentEnrollments.applyScheduled.useMutation()
  const cancel = trpc.studentEnrollments.cancel.useMutation()
  const [transitionType, setTransitionType] = useState<TransitionType>('transfer')
  const [sourceEnrollmentId, setSourceEnrollmentId] = useState('')
  const [destinationSchoolId, setDestinationSchoolId] = useState('')
  const [effectiveAt, setEffectiveAt] = useState(() => localDateTime(new Date()))
  const [reason, setReason] = useState('')
  const [evidenceReference, setEvidenceReference] = useState('')
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const [cancelTargetId, setCancelTargetId] = useState<string | null>(null)
  const [cancellationReason, setCancellationReason] = useState('')
  const [currentTime, setCurrentTime] = useState(() => Date.now())
  const feedbackRef = useRef<HTMLDivElement>(null)

  const currentPeriods = useMemo(
    () => history.data?.periods.filter((period) => period.isCurrent) ?? [],
    [history.data]
  )
  const primaryPeriod = currentPeriods.find((period) => period.enrollmentType === 'primary')
  const effectiveTransitionType: TransitionType = primaryPeriod
    ? transitionType === 'reenroll'
      ? 'transfer'
      : transitionType
    : 'reenroll'
  const sourceRequired = ['withdraw', 'transfer', 'graduate', 'end_secondary'].includes(
    effectiveTransitionType
  )
  const destinationRequired = ['transfer', 'reenroll', 'add_secondary'].includes(
    effectiveTransitionType
  )
  const eligibleSourcePeriods = currentPeriods.filter((period) =>
    effectiveTransitionType === 'end_secondary'
      ? period.enrollmentType === 'secondary'
      : period.enrollmentType === 'primary'
  )
  const selectedSourceEnrollmentId = eligibleSourcePeriods.some(
    (period) => period.id === sourceEnrollmentId
  )
    ? sourceEnrollmentId
    : (eligibleSourcePeriods[0]?.id ?? '')
  const selectedSourcePeriod = eligibleSourcePeriods.find(
    (period) => period.id === selectedSourceEnrollmentId
  )
  const eligibleDestinationSchools =
    schools.data?.filter(
      (school) =>
        effectiveTransitionType !== 'transfer' || school.id !== selectedSourcePeriod?.schoolId
    ) ?? []
  const selectedDestinationSchoolId = eligibleDestinationSchools.some(
    (school) => school.id === destinationSchoolId
  )
    ? destinationSchoolId
    : ''

  useEffect(() => {
    const interval = window.setInterval(() => setCurrentTime(Date.now()), 30_000)
    return () => window.clearInterval(interval)
  }, [])

  useEffect(() => {
    if (error || status) feedbackRef.current?.focus()
  }, [error, status])

  const refresh = async () => {
    await Promise.all([
      utils.studentEnrollments.history.invalidate({ personId }),
      utils.students.getById.invalidate({ studentId: studentLookupId }),
    ])
  }

  const submitTransition = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    setStatus('')
    const parsedEffectiveAt = new Date(effectiveAt)
    const applyImmediately = parsedEffectiveAt.getTime() <= Date.now()
    const source = history.data?.periods.find((period) => period.id === selectedSourceEnrollmentId)
    try {
      await schedule.mutateAsync({
        personId,
        transitionType: effectiveTransitionType,
        effectiveAt: parsedEffectiveAt.toISOString(),
        reason,
        evidenceReference: evidenceReference || null,
        fromEnrollmentId: sourceRequired ? selectedSourceEnrollmentId : null,
        destinationSchoolId: destinationRequired ? selectedDestinationSchoolId : null,
        expectedEnrollmentVersion: sourceRequired ? source?.version : null,
        applyImmediately,
      })
      setReason('')
      setEvidenceReference('')
      setStatus(
        applyImmediately
          ? 'Transition applied. The immutable enrollment timeline and authorization context were updated.'
          : 'Transition scheduled. Apply it when the effective time is reached, or cancel it before then.'
      )
      await refresh()
    } catch (cause) {
      setError(mutationErrorMessage(cause))
      await refresh()
    }
  }

  const resolveTransition = async (
    action: 'apply' | 'cancel',
    transitionId: string,
    cancellationReasonInput?: string
  ) => {
    setError('')
    setStatus('')
    try {
      if (action === 'apply') {
        await applyScheduled.mutateAsync({ transitionId })
        setStatus('Scheduled transition applied and recorded in the immutable timeline.')
      } else {
        await cancel.mutateAsync({
          transitionId,
          reason: cancellationReasonInput ?? '',
        })
        setCancelTargetId(null)
        setCancellationReason('')
        setStatus('Scheduled transition cancelled. The cancellation remains in the timeline.')
      }
      await refresh()
    } catch (cause) {
      setError(mutationErrorMessage(cause))
      await refresh()
    }
  }

  if (history.isLoading) {
    return (
      <section className="mt-8 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
          Loading enrollment history…
        </div>
      </section>
    )
  }

  if (history.error) {
    if (history.error.data?.code === 'FORBIDDEN') return null
    return (
      <div
        role="alert"
        className="mt-8 rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-900"
      >
        Enrollment history could not be loaded. Refresh the page and retry.
      </div>
    )
  }

  const busy = schedule.isPending || applyScheduled.isPending || cancel.isPending
  const mfaRequired = manageAccess.error?.message.includes('MFA_REQUIRED')

  return (
    <section aria-labelledby="enrollment-lifecycle-heading" className="mt-8 space-y-6">
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-200 bg-gray-50 px-6 py-4">
          <div className="flex items-center gap-2">
            <School className="size-5 text-gray-700" aria-hidden="true" />
            <h2 id="enrollment-lifecycle-heading" className="font-semibold text-gray-950">
              School enrollment timeline
            </h2>
          </div>
          <p className="mt-1 text-sm text-gray-600">
            Effective-dated periods are preserved; transitions add history instead of replacing it.
          </p>
        </div>

        <ol className="divide-y divide-gray-200">
          {history.data?.periods.length ? (
            history.data.periods.map((period) => (
              <li key={period.id} className="px-6 py-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium text-gray-950">{period.schoolName}</p>
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium capitalize text-gray-700">
                        {period.enrollmentType}
                      </span>
                      {period.isCurrent && (
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-900">
                          Current
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-gray-600">{period.admissionReason}</p>
                    {period.endReason && (
                      <p className="mt-1 text-sm text-gray-600">
                        Ended: {period.endReason.replace('_', ' ')}
                        {period.endEvidenceReference ? ` · ${period.endEvidenceReference}` : ''}
                      </p>
                    )}
                  </div>
                  <p className="shrink-0 text-sm text-gray-600">
                    {formatDateTime(period.validFrom)}
                    <ArrowRight className="mx-1 inline size-3" aria-hidden="true" />
                    {period.validUntil ? formatDateTime(period.validUntil) : 'Present'}
                  </p>
                </div>
              </li>
            ))
          ) : (
            <li className="px-6 py-8 text-sm text-gray-600">No authorized enrollment periods.</li>
          )}
        </ol>
      </div>

      {history.data?.transitions.length ? (
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h3 className="font-semibold text-gray-950">Transition history</h3>
          <ul className="mt-4 space-y-3">
            {history.data.transitions.map((transition) => {
              const due = new Date(transition.effectiveAt).getTime() <= currentTime
              return (
                <li key={transition.transitionId} className="rounded-lg border border-gray-200 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium text-gray-950">
                          {TRANSITION_LABELS[transition.transitionType]}
                        </p>
                        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium capitalize text-gray-700">
                          {transition.status}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-gray-600">{transition.reason}</p>
                      <p className="mt-1 text-xs text-gray-500">
                        Effective {formatDateTime(transition.effectiveAt)}
                      </p>
                    </div>
                    {transition.status === 'scheduled' && manageAccess.data === true && (
                      <div className="shrink-0">
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            className={BUTTON_CLASS}
                            disabled={busy || !due}
                            title={due ? undefined : 'Available at the effective time'}
                            onClick={() => resolveTransition('apply', transition.transitionId)}
                          >
                            Apply
                          </button>
                          <button
                            type="button"
                            className={BUTTON_CLASS}
                            disabled={busy}
                            aria-expanded={cancelTargetId === transition.transitionId}
                            onClick={() => {
                              setCancelTargetId(transition.transitionId)
                              setCancellationReason('')
                            }}
                          >
                            Cancel
                          </button>
                        </div>
                        {cancelTargetId === transition.transitionId && (
                          <form
                            className="mt-3 max-w-sm rounded-lg bg-gray-50 p-3"
                            onSubmit={(event) => {
                              event.preventDefault()
                              void resolveTransition(
                                'cancel',
                                transition.transitionId,
                                cancellationReason
                              )
                            }}
                          >
                            <label className="text-sm font-medium text-gray-800">
                              Cancellation reason
                              <input
                                className={INPUT_CLASS}
                                value={cancellationReason}
                                onChange={(event) => setCancellationReason(event.target.value)}
                                minLength={3}
                                maxLength={512}
                                required
                              />
                            </label>
                            <div className="mt-3 flex flex-wrap justify-end gap-2">
                              <button
                                type="button"
                                className={BUTTON_CLASS}
                                disabled={busy}
                                onClick={() => {
                                  setCancelTargetId(null)
                                  setCancellationReason('')
                                }}
                              >
                                Keep scheduled
                              </button>
                              <button
                                type="submit"
                                className={PRIMARY_BUTTON_CLASS}
                                disabled={busy}
                              >
                                Confirm cancellation
                              </button>
                            </div>
                          </form>
                        )}
                      </div>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      ) : null}

      {(error || status) && (
        <div
          ref={feedbackRef}
          tabIndex={-1}
          role={error ? 'alert' : 'status'}
          className={`rounded-lg border p-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 ${
            error
              ? 'border-red-300 bg-red-50 text-red-900'
              : 'border-emerald-300 bg-emerald-50 text-emerald-900'
          }`}
        >
          {error || status}
          {error.includes('MFA') && (
            <Link href="/settings/security" className="ml-1 underline">
              Open Security settings
            </Link>
          )}
        </div>
      )}

      {mfaRequired ? (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
          <div className="flex gap-3">
            <ShieldCheck className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
            <p>
              Enrollment changes require MFA.{' '}
              <Link href="/settings/security" className="font-medium underline">
                Verify in Security settings
              </Link>{' '}
              before scheduling or applying a transition.
            </p>
          </div>
        </div>
      ) : manageAccess.data === true ? (
        <form
          onSubmit={submitTransition}
          aria-busy={schedule.isPending}
          className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm"
        >
          <div className="flex items-center gap-2">
            <Clock3 className="size-5 text-gray-700" aria-hidden="true" />
            <h3 className="font-semibold text-gray-950">Plan an enrollment transition</h3>
          </div>
          <p className="mt-1 text-sm text-gray-600">
            A current date applies now. A future date creates a reviewable scheduled transition.
          </p>

          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            <label className="text-sm font-medium text-gray-800">
              Transition
              <select
                className={INPUT_CLASS}
                value={effectiveTransitionType}
                onChange={(event) => {
                  setTransitionType(event.target.value as TransitionType)
                  setSourceEnrollmentId('')
                  setDestinationSchoolId('')
                }}
              >
                {primaryPeriod ? (
                  <>
                    <option value="transfer">Transfer to another School</option>
                    <option value="withdraw">Withdraw learner</option>
                    <option value="graduate">Graduate learner</option>
                    <option value="add_secondary">Add secondary enrollment</option>
                    {currentPeriods.some((period) => period.enrollmentType === 'secondary') && (
                      <option value="end_secondary">End secondary enrollment</option>
                    )}
                  </>
                ) : (
                  <option value="reenroll">Re-enroll learner</option>
                )}
              </select>
            </label>

            {sourceRequired && (
              <label className="text-sm font-medium text-gray-800">
                Enrollment to transition
                <select
                  className={INPUT_CLASS}
                  value={selectedSourceEnrollmentId}
                  onChange={(event) => setSourceEnrollmentId(event.target.value)}
                  required
                >
                  <option value="">Select an enrollment</option>
                  {eligibleSourcePeriods.map((period) => (
                    <option key={period.id} value={period.id}>
                      {period.schoolName} ({period.enrollmentType})
                    </option>
                  ))}
                </select>
              </label>
            )}

            {destinationRequired && (
              <label className="text-sm font-medium text-gray-800">
                Destination School
                <select
                  className={INPUT_CLASS}
                  value={selectedDestinationSchoolId}
                  onChange={(event) => setDestinationSchoolId(event.target.value)}
                  required
                >
                  <option value="">Select a School</option>
                  {eligibleDestinationSchools.map((school) => (
                    <option key={school.id} value={school.id}>
                      {school.name}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <label className="text-sm font-medium text-gray-800">
              Effective date and time
              <input
                className={INPUT_CLASS}
                type="datetime-local"
                value={effectiveAt}
                onChange={(event) => {
                  setEffectiveAt(event.target.value)
                  setCurrentTime(Date.now())
                }}
                required
              />
            </label>

            <label className="text-sm font-medium text-gray-800 sm:col-span-2">
              Reason
              <textarea
                className={INPUT_CLASS}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                minLength={3}
                maxLength={512}
                rows={3}
                required
                placeholder="State the administrative reason for this transition"
              />
            </label>

            <label className="text-sm font-medium text-gray-800 sm:col-span-2">
              Evidence reference <span className="font-normal text-gray-500">(optional)</span>
              <input
                className={INPUT_CLASS}
                value={evidenceReference}
                onChange={(event) => setEvidenceReference(event.target.value)}
                minLength={3}
                maxLength={512}
                placeholder="Document, approval, or case reference — do not paste sensitive notes"
              />
            </label>
          </div>

          <div className="mt-5 flex justify-end">
            <button
              type="submit"
              className={PRIMARY_BUTTON_CLASS}
              disabled={busy || schools.isLoading}
            >
              {schedule.isPending && (
                <LoaderCircle className="mr-2 size-4 animate-spin" aria-hidden="true" />
              )}
              {new Date(effectiveAt).getTime() <= currentTime
                ? 'Apply transition'
                : 'Schedule transition'}
            </button>
          </div>
        </form>
      ) : manageAccess.error && manageAccess.error.data?.code !== 'FORBIDDEN' ? (
        <div
          role="alert"
          className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-900"
        >
          <AlertCircle className="mr-2 inline size-4" aria-hidden="true" />
          Enrollment management access could not be verified.
        </div>
      ) : null}
    </section>
  )
}
