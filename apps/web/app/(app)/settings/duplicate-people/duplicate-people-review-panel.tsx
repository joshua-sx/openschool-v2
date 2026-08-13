'use client'

import { trpc } from '@/lib/trpc/client'
import { AlertCircle, CheckCircle2, GitPullRequestArrow, Loader2, SearchX } from 'lucide-react'
import { useState } from 'react'

type ReviewAction = 'mark_distinct' | 'request_merge_approval'

const SIGNAL_LABELS = {
  same_normalized_email: 'Same normalized email',
  same_normalized_name: 'Same normalized name',
  same_date_of_birth: 'Same date of birth',
  same_normalized_phone: 'Same normalized phone',
} as const

const INPUT_CLASS =
  'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900/20 disabled:bg-gray-50'

function formatDate(value: string | Date | null) {
  if (!value) return 'Not recorded'
  return new Date(value).toLocaleDateString()
}

function statusLabel(status: string) {
  switch (status) {
    case 'merge_approval_requested':
      return 'Merge approval requested'
    case 'distinct':
      return 'Confirmed distinct'
    case 'superseded':
      return 'Evidence superseded'
    default:
      return 'Needs review'
  }
}

export function DuplicatePeopleReviewPanel() {
  const [schoolId, setSchoolId] = useState('')
  const [showResolved, setShowResolved] = useState(false)
  const [decision, setDecision] = useState<{
    caseId: string
    action: ReviewAction
    reason: string
  } | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const utils = trpc.useUtils()
  const schools = trpc.schools.list.useQuery()
  const effectiveSchoolId = schoolId || schools.data?.[0]?.id || ''
  const queue = trpc.duplicatePeople.queue.useQuery(
    {
      schoolId: effectiveSchoolId,
      statuses: showResolved
        ? ['open', 'merge_approval_requested', 'distinct', 'superseded']
        : ['open', 'merge_approval_requested'],
    },
    { enabled: Boolean(effectiveSchoolId) }
  )
  const review = trpc.duplicatePeople.review.useMutation({
    onSuccess: async (result) => {
      await utils.duplicatePeople.queue.invalidate()
      setDecision(null)
      setNotice(
        result.status === 'distinct'
          ? 'The People were recorded as distinct for the current evidence.'
          : 'A merge approval was requested. No records were merged.'
      )
    },
  })

  const submitDecision = (caseId: string, version: number) => {
    if (!decision || decision.caseId !== caseId || decision.reason.trim().length < 3) return
    setNotice(null)
    review.mutate({
      caseId,
      expectedVersion: version,
      action: decision.action,
      reason: decision.reason,
    })
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">
          Person directory
        </p>
        <h1 className="mt-2 text-2xl font-bold text-gray-950">Possible duplicate People</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-600">
          These are explainable suggestions, not identity decisions. Similar names, email addresses,
          or birth dates can belong to different people. OpenSchool never merges People
          automatically.
        </p>
      </div>

      <div className="grid gap-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <label className="block text-sm font-medium text-gray-800">
          School
          <select
            className={`${INPUT_CLASS} mt-1`}
            value={effectiveSchoolId}
            onChange={(event) => setSchoolId(event.target.value)}
            disabled={schools.isLoading}
          >
            {(schools.data ?? []).map((school) => (
              <option key={school.id} value={school.id}>
                {school.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-h-10 items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-gray-300"
            checked={showResolved}
            onChange={(event) => setShowResolved(event.target.checked)}
          />
          Show resolved history
        </label>
      </div>

      {notice && (
        <output className="flex gap-2 rounded-lg border border-green-200 bg-green-50 p-3">
          <CheckCircle2 aria-hidden="true" className="mt-0.5 h-4 w-4 text-green-700" />
          <p className="text-sm text-green-900">{notice}</p>
        </output>
      )}
      {(queue.error || review.error || schools.error) && (
        <div role="alert" className="flex gap-2 rounded-lg border border-red-200 bg-red-50 p-3">
          <AlertCircle aria-hidden="true" className="mt-0.5 h-4 w-4 text-red-700" />
          <p className="text-sm text-red-900">
            The duplicate review queue could not be updated.{' '}
            {(review.error ?? queue.error ?? schools.error)?.message}
          </p>
        </div>
      )}

      {queue.isLoading || schools.isLoading ? (
        <div className="flex min-h-48 items-center justify-center text-gray-500">
          <Loader2 aria-hidden="true" className="mr-2 h-5 w-5 animate-spin" />
          Loading review queue…
        </div>
      ) : queue.data?.length ? (
        <div className="space-y-4">
          {queue.data.map((duplicateCase) => {
            const activeDecision = decision?.caseId === duplicateCase.caseId ? decision : null
            const emailMatched = duplicateCase.signals.includes('same_normalized_email')
            const dateMatched = duplicateCase.signals.includes('same_date_of_birth')
            const nameMatched = duplicateCase.signals.includes('same_normalized_name')
            return (
              <article
                key={duplicateCase.caseId}
                className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-gray-200 bg-gray-50 px-5 py-4">
                  <div>
                    <p className="text-sm font-semibold text-gray-950">
                      {statusLabel(duplicateCase.status)}
                    </p>
                    <p className="mt-1 text-xs text-gray-500">
                      Evidence score {duplicateCase.score}/100 · Version {duplicateCase.version} ·{' '}
                      {new Date(duplicateCase.updatedAt).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2" aria-label="Matched signals">
                    {duplicateCase.signals.map((signal) => (
                      <span
                        key={signal}
                        className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-900"
                      >
                        {SIGNAL_LABELS[signal]}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="grid gap-px bg-gray-200 sm:grid-cols-2">
                  {[
                    {
                      id: duplicateCase.firstPersonId,
                      name: duplicateCase.firstDisplayName,
                      dob: duplicateCase.firstDateOfBirth,
                      email: duplicateCase.firstEmail,
                    },
                    {
                      id: duplicateCase.secondPersonId,
                      name: duplicateCase.secondDisplayName,
                      dob: duplicateCase.secondDateOfBirth,
                      email: duplicateCase.secondEmail,
                    },
                  ].map((person, index) => (
                    <section
                      key={person.id}
                      className="bg-white p-5"
                      aria-label={`Person ${index + 1}`}
                    >
                      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                        Person {index + 1}
                      </p>
                      <p className="mt-2 text-base font-semibold text-gray-950">{person.name}</p>
                      <dl className="mt-4 space-y-3 text-sm">
                        <div>
                          <dt className="text-gray-500">Name signal</dt>
                          <dd className="text-gray-900">
                            {nameMatched ? 'Matched after normalization' : 'Not matched'}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-gray-500">Date of birth</dt>
                          <dd className="text-gray-900">
                            {dateMatched ? formatDate(person.dob) : 'Not a matched field'}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-gray-500">Email</dt>
                          <dd className="break-all text-gray-900">
                            {emailMatched ? person.email || 'Not recorded' : 'Not a matched field'}
                          </dd>
                        </div>
                      </dl>
                    </section>
                  ))}
                </div>

                <details className="border-t border-gray-200 px-5 py-4">
                  <summary className="cursor-pointer text-sm font-medium text-gray-800 focus-visible:outline-2 focus-visible:outline-offset-2">
                    Decision history ({duplicateCase.events.length})
                  </summary>
                  <ol className="mt-3 space-y-2 text-sm text-gray-600">
                    {duplicateCase.events.map((event) => (
                      <li key={event.id}>
                        <span className="font-medium text-gray-800">Version {event.version}</span> —{' '}
                        {event.eventType.replaceAll('_', ' ')} · {event.reason}
                      </li>
                    ))}
                  </ol>
                </details>

                {duplicateCase.status !== 'distinct' && duplicateCase.status !== 'superseded' && (
                  <div className="border-t border-gray-200 p-5">
                    {!activeDecision ? (
                      <div className="flex flex-wrap gap-3">
                        <button
                          type="button"
                          className="inline-flex min-h-10 items-center rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-offset-2"
                          onClick={() =>
                            setDecision({
                              caseId: duplicateCase.caseId,
                              action: 'mark_distinct',
                              reason: '',
                            })
                          }
                        >
                          <CheckCircle2 aria-hidden="true" className="mr-2 h-4 w-4" />
                          Confirm they are distinct
                        </button>
                        {duplicateCase.status !== 'merge_approval_requested' && (
                          <button
                            type="button"
                            className="inline-flex min-h-10 items-center rounded-lg bg-gray-950 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 focus-visible:outline-2 focus-visible:outline-offset-2"
                            onClick={() =>
                              setDecision({
                                caseId: duplicateCase.caseId,
                                action: 'request_merge_approval',
                                reason: '',
                              })
                            }
                          >
                            <GitPullRequestArrow aria-hidden="true" className="mr-2 h-4 w-4" />
                            Request merge approval
                          </button>
                        )}
                      </div>
                    ) : (
                      <form
                        onSubmit={(event) => {
                          event.preventDefault()
                          submitDecision(duplicateCase.caseId, duplicateCase.version)
                        }}
                        className="space-y-3"
                      >
                        <label className="block text-sm font-medium text-gray-800">
                          Decision reason
                          <textarea
                            className={`${INPUT_CLASS} mt-1 min-h-24 resize-y`}
                            value={activeDecision.reason}
                            maxLength={512}
                            onChange={(event) =>
                              setDecision({ ...activeDecision, reason: event.target.value })
                            }
                            aria-describedby={`decision-help-${duplicateCase.caseId}`}
                          />
                        </label>
                        <p
                          id={`decision-help-${duplicateCase.caseId}`}
                          className="text-xs text-gray-500"
                        >
                          {activeDecision.action === 'mark_distinct'
                            ? 'This suppresses the same evidence. Materially changed evidence can reopen the case.'
                            : 'This records an approval request only. It does not merge or alter either Person.'}
                        </p>
                        <div className="flex gap-3">
                          <button
                            type="submit"
                            disabled={activeDecision.reason.trim().length < 3 || review.isPending}
                            className="min-h-10 rounded-lg bg-gray-950 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2"
                          >
                            {review.isPending ? 'Recording…' : 'Record decision'}
                          </button>
                          <button
                            type="button"
                            className="min-h-10 rounded-lg px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 focus-visible:outline-2 focus-visible:outline-offset-2"
                            onClick={() => setDecision(null)}
                          >
                            Cancel
                          </button>
                        </div>
                      </form>
                    )}
                  </div>
                )}
              </article>
            )
          })}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white px-6 py-12 text-center">
          <SearchX aria-hidden="true" className="mx-auto h-8 w-8 text-gray-400" />
          <h2 className="mt-3 text-base font-semibold text-gray-900">No cases in this view</h2>
          <p className="mt-1 text-sm text-gray-500">
            Candidate checks run during learner admission, learner updates, and contact creation.
          </p>
        </div>
      )}
    </div>
  )
}
