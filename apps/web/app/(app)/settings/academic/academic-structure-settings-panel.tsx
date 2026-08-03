'use client'

import { trpc } from '@/lib/trpc/client'
import {
  AlertTriangle,
  CalendarRange,
  CheckCircle2,
  LoaderCircle,
  Plus,
  Trash2,
} from 'lucide-react'
import Link from 'next/link'
import { type FormEvent, useEffect, useRef, useState } from 'react'

const INPUT_CLASS =
  'mt-1 block min-h-10 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-950 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:bg-gray-100'
const LABEL_CLASS = 'block text-sm font-medium text-gray-800'
const SECONDARY_BUTTON =
  'inline-flex min-h-10 items-center justify-center rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-60'
const PRIMARY_BUTTON =
  'inline-flex min-h-10 items-center justify-center rounded-lg bg-gray-950 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-60'

interface TermDraft {
  key: string
  code: string
  name: string
  startDate: string
  endDate: string
}

interface LevelDraft {
  key: string
  code: string
  name: string
  educationStage: string
}

function draftKey(): string {
  return crypto.randomUUID()
}

function emptyTerm(position = 1): TermDraft {
  return {
    key: draftKey(),
    code: `T${position}`,
    name: `Term ${position}`,
    startDate: '',
    endDate: '',
  }
}

function emptyLevel(position = 1): LevelDraft {
  return { key: draftKey(), code: `L${position}`, name: '', educationStage: '' }
}

function formatDate(value: string): string {
  const date = new Date(`${value}T00:00:00.000Z`)
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeZone: 'UTC' }).format(date)
}

function errorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === 'object' && 'message' in error) {
    const message = String((error as { message: unknown }).message)
    if (message.includes('MFA_REQUIRED')) {
      return 'Verify with MFA in Security settings, then return here and retry.'
    }
    if (message.includes('overlap')) return message
    if (message.includes('lifecycle state')) return message
    if (message.includes('invalid')) return message
  }
  return fallback
}

export function AcademicStructureSettingsPanel() {
  const utils = trpc.useUtils()
  const schools = trpc.schools.list.useQuery(undefined, { retry: false })
  const [schoolId, setSchoolId] = useState('')
  const effectiveSchoolId = schoolId || schools.data?.[0]?.id || ''
  const years = trpc.academicStructure.list.useQuery(
    { schoolId: effectiveSchoolId },
    { enabled: Boolean(effectiveSchoolId), retry: false }
  )
  const create = trpc.academicStructure.create.useMutation()
  const approveReview = trpc.academicStructure.approveReview.useMutation()
  const publish = trpc.academicStructure.publish.useMutation()
  const close = trpc.academicStructure.close.useMutation()
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [timeZone, setTimeZone] = useState(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  )
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [terms, setTerms] = useState<TermDraft[]>(() => [emptyTerm()])
  const [levels, setLevels] = useState<LevelDraft[]>(() => [emptyLevel()])
  const [statusMessage, setStatusMessage] = useState('')
  const [error, setError] = useState('')
  const feedbackRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (statusMessage || error) feedbackRef.current?.focus()
  }, [statusMessage, error])

  const refresh = async () => {
    if (effectiveSchoolId) {
      await utils.academicStructure.list.invalidate({ schoolId: effectiveSchoolId })
    }
  }

  const resetDraft = () => {
    setCode('')
    setName('')
    setStartDate('')
    setEndDate('')
    setTerms([emptyTerm()])
    setLevels([emptyLevel()])
  }

  const submitDraft = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    setStatusMessage('')
    if (!effectiveSchoolId) {
      setError('Select a School before creating an Academic Year.')
      return
    }
    try {
      await create.mutateAsync({
        schoolId: effectiveSchoolId,
        code,
        name,
        timeZone,
        startDate,
        endDate,
        terms: terms.map(
          ({ code: termCode, name: termName, startDate: starts, endDate: ends }) => ({
            code: termCode,
            name: termName,
            startDate: starts,
            endDate: ends,
          })
        ),
        levels: levels.map(({ code: levelCode, name: levelName, educationStage }) => ({
          code: levelCode,
          name: levelName,
          educationStage: educationStage || null,
        })),
      })
      resetDraft()
      setStatusMessage('Draft created. Review every date and Learner Level before publishing.')
      await refresh()
    } catch (cause) {
      setError(
        errorMessage(cause, 'Unable to create the Academic Year. Review the form and retry.')
      )
    }
  }

  const runLifecycleAction = async (action: 'review' | 'publish', academicYearId: string) => {
    setError('')
    setStatusMessage('')
    try {
      if (action === 'review') {
        await approveReview.mutateAsync({ academicYearId })
        setStatusMessage('Migration review approved. The draft is now eligible for publication.')
      } else {
        await publish.mutateAsync({ academicYearId })
        setStatusMessage(
          'Academic Year published. Its dates, Terms, and Learner Levels are now immutable.'
        )
      }
      await refresh()
    } catch (cause) {
      setError(errorMessage(cause, `Unable to ${action} this Academic Year. Retry the operation.`))
    }
  }

  const submitClose = async (event: FormEvent<HTMLFormElement>, academicYearId: string) => {
    event.preventDefault()
    setError('')
    setStatusMessage('')
    const formElement = event.currentTarget
    const form = new FormData(formElement)
    try {
      await close.mutateAsync({ academicYearId, reason: String(form.get('reason')) })
      formElement.reset()
      setStatusMessage('Academic Year closed. Its historical structure remains available.')
      await refresh()
    } catch (cause) {
      setError(errorMessage(cause, 'Unable to close this Academic Year. Retry the operation.'))
    }
  }

  const busy = create.isPending || approveReview.isPending || publish.isPending || close.isPending

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">
          School configuration
        </p>
        <h1 className="mt-2 text-2xl font-bold text-gray-950">Academic structure</h1>
        <p className="mt-1 max-w-3xl text-sm leading-6 text-gray-600">
          Configure the instructional calendar and locally named Learner Levels. Primary and high
          Schools use the same structure; only their Terms and Levels differ.
        </p>
      </div>

      <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
        <div className="flex gap-3">
          <AlertTriangle className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
          <div>
            <p className="font-semibold">Publication is an immutable history decision</p>
            <p className="mt-1 leading-5">
              Review dates, time zone, Term order, and Learner Levels first. Published structures
              can be closed but not rewritten.
            </p>
          </div>
        </div>
      </div>

      {(statusMessage || error) && (
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
          {error || statusMessage}
          {error.includes('MFA') && (
            <Link className="ml-1 underline" href="/settings/security">
              Open Security settings
            </Link>
          )}
        </div>
      )}

      <section
        aria-labelledby="school-scope-heading"
        className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm"
      >
        <h2 id="school-scope-heading" className="text-lg font-semibold text-gray-950">
          School
        </h2>
        <label className={`${LABEL_CLASS} mt-4 max-w-xl`}>
          Configure academic structure for
          <select
            className={INPUT_CLASS}
            value={effectiveSchoolId}
            onChange={(event) => setSchoolId(event.target.value)}
            disabled={schools.isLoading || Boolean(schools.error) || !schools.data?.length}
          >
            {schools.isLoading ? (
              <option value="">Loading Schools…</option>
            ) : schools.error ? (
              <option value="">Schools unavailable</option>
            ) : !schools.data?.length ? (
              <option value="">No authorized Schools</option>
            ) : (
              schools.data.map((school) => (
                <option key={school.id} value={school.id}>
                  {school.name}
                </option>
              ))
            )}
          </select>
        </label>
      </section>

      <section
        aria-labelledby="create-year-heading"
        className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm"
      >
        <div className="flex items-center gap-3">
          <CalendarRange className="size-5 text-gray-700" aria-hidden="true" />
          <h2 id="create-year-heading" className="text-lg font-semibold text-gray-950">
            Create a draft Academic Year
          </h2>
        </div>
        <form className="mt-6 space-y-8" onSubmit={submitDraft} aria-busy={create.isPending}>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            <label className={LABEL_CLASS}>
              Stable code
              <input
                className={INPUT_CLASS}
                value={code}
                onChange={(event) => setCode(event.target.value)}
                required
                maxLength={64}
                placeholder="2026-2027"
              />
            </label>
            <label className={LABEL_CLASS}>
              Display name
              <input
                className={INPUT_CLASS}
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
                maxLength={128}
                placeholder="2026–2027 Academic Year"
              />
            </label>
            <label className={LABEL_CLASS}>
              School time zone
              <input
                className={INPUT_CLASS}
                value={timeZone}
                onChange={(event) => setTimeZone(event.target.value)}
                required
                maxLength={128}
                placeholder="America/Lower_Princes"
              />
            </label>
            <label className={LABEL_CLASS}>
              Start date
              <input
                className={INPUT_CLASS}
                type="date"
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
                required
              />
            </label>
            <label className={LABEL_CLASS}>
              End date
              <input
                className={INPUT_CLASS}
                type="date"
                value={endDate}
                min={startDate || undefined}
                onChange={(event) => setEndDate(event.target.value)}
                required
              />
            </label>
          </div>

          <fieldset>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <legend className="text-base font-semibold text-gray-950">Terms</legend>
                <p className="mt-1 text-sm text-gray-600">
                  Enter non-overlapping Terms in chronological order.
                </p>
              </div>
              <button
                type="button"
                className={SECONDARY_BUTTON}
                onClick={() => setTerms((current) => [...current, emptyTerm(current.length + 1)])}
                disabled={terms.length >= 20}
              >
                <Plus className="mr-2 size-4" aria-hidden="true" />
                Add Term
              </button>
            </div>
            <div className="mt-4 space-y-4">
              {terms.map((term, index) => (
                <div
                  key={term.key}
                  className="grid gap-4 rounded-lg border border-gray-200 p-4 sm:grid-cols-2 lg:grid-cols-5"
                >
                  <p className="text-sm font-semibold text-gray-950 sm:col-span-2 lg:col-span-5">
                    Term {index + 1}
                  </p>
                  <label className={LABEL_CLASS}>
                    Code
                    <input
                      className={INPUT_CLASS}
                      value={term.code}
                      required
                      maxLength={64}
                      onChange={(event) =>
                        setTerms((current) =>
                          current.map((item) =>
                            item.key === term.key ? { ...item, code: event.target.value } : item
                          )
                        )
                      }
                    />
                  </label>
                  <label className={LABEL_CLASS}>
                    Name
                    <input
                      className={INPUT_CLASS}
                      value={term.name}
                      required
                      maxLength={128}
                      onChange={(event) =>
                        setTerms((current) =>
                          current.map((item) =>
                            item.key === term.key ? { ...item, name: event.target.value } : item
                          )
                        )
                      }
                    />
                  </label>
                  <label className={LABEL_CLASS}>
                    Starts
                    <input
                      className={INPUT_CLASS}
                      type="date"
                      value={term.startDate}
                      min={startDate || undefined}
                      max={endDate || undefined}
                      required
                      onChange={(event) =>
                        setTerms((current) =>
                          current.map((item) =>
                            item.key === term.key
                              ? { ...item, startDate: event.target.value }
                              : item
                          )
                        )
                      }
                    />
                  </label>
                  <label className={LABEL_CLASS}>
                    Ends
                    <input
                      className={INPUT_CLASS}
                      type="date"
                      value={term.endDate}
                      min={term.startDate || startDate || undefined}
                      max={endDate || undefined}
                      required
                      onChange={(event) =>
                        setTerms((current) =>
                          current.map((item) =>
                            item.key === term.key ? { ...item, endDate: event.target.value } : item
                          )
                        )
                      }
                    />
                  </label>
                  <button
                    type="button"
                    className={SECONDARY_BUTTON}
                    onClick={() =>
                      setTerms((current) => current.filter((item) => item.key !== term.key))
                    }
                    disabled={terms.length === 1}
                    aria-label={`Remove Term ${index + 1}`}
                  >
                    <Trash2 className="mr-2 size-4" aria-hidden="true" />
                    Remove
                  </button>
                </div>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <legend className="text-base font-semibold text-gray-950">Learner Levels</legend>
                <p className="mt-1 text-sm text-gray-600">
                  Use local labels such as Grade 5, Year 8, Form 3, or Standard 4.
                </p>
              </div>
              <button
                type="button"
                className={SECONDARY_BUTTON}
                onClick={() => setLevels((current) => [...current, emptyLevel(current.length + 1)])}
                disabled={levels.length >= 30}
              >
                <Plus className="mr-2 size-4" aria-hidden="true" />
                Add Level
              </button>
            </div>
            <div className="mt-4 space-y-4">
              {levels.map((level, index) => (
                <div
                  key={level.key}
                  className="grid gap-4 rounded-lg border border-gray-200 p-4 sm:grid-cols-2 lg:grid-cols-4"
                >
                  <p className="text-sm font-semibold text-gray-950 sm:col-span-2 lg:col-span-4">
                    Learner Level {index + 1}
                  </p>
                  <label className={LABEL_CLASS}>
                    Code
                    <input
                      className={INPUT_CLASS}
                      value={level.code}
                      required
                      maxLength={64}
                      onChange={(event) =>
                        setLevels((current) =>
                          current.map((item) =>
                            item.key === level.key ? { ...item, code: event.target.value } : item
                          )
                        )
                      }
                    />
                  </label>
                  <label className={LABEL_CLASS}>
                    Local name
                    <input
                      className={INPUT_CLASS}
                      value={level.name}
                      required
                      maxLength={128}
                      placeholder="Grade 5"
                      onChange={(event) =>
                        setLevels((current) =>
                          current.map((item) =>
                            item.key === level.key ? { ...item, name: event.target.value } : item
                          )
                        )
                      }
                    />
                  </label>
                  <label className={LABEL_CLASS}>
                    Education stage <span className="font-normal text-gray-500">(optional)</span>
                    <input
                      className={INPUT_CLASS}
                      value={level.educationStage}
                      maxLength={64}
                      placeholder="Primary"
                      onChange={(event) =>
                        setLevels((current) =>
                          current.map((item) =>
                            item.key === level.key
                              ? { ...item, educationStage: event.target.value }
                              : item
                          )
                        )
                      }
                    />
                  </label>
                  <button
                    type="button"
                    className={SECONDARY_BUTTON}
                    onClick={() =>
                      setLevels((current) => current.filter((item) => item.key !== level.key))
                    }
                    disabled={levels.length === 1}
                    aria-label={`Remove Learner Level ${index + 1}`}
                  >
                    <Trash2 className="mr-2 size-4" aria-hidden="true" />
                    Remove
                  </button>
                </div>
              ))}
            </div>
          </fieldset>

          <button className={PRIMARY_BUTTON} type="submit" disabled={busy || !effectiveSchoolId}>
            {create.isPending && (
              <LoaderCircle className="mr-2 size-4 animate-spin" aria-hidden="true" />
            )}
            Create draft
          </button>
        </form>
      </section>

      <section aria-labelledby="year-history-heading" className="space-y-4">
        <div>
          <h2 id="year-history-heading" className="text-lg font-semibold text-gray-950">
            Academic Year history
          </h2>
          <p className="mt-1 text-sm text-gray-600">
            Draft, current, future, and closed structures for the selected School.
          </p>
        </div>
        {years.isLoading ? (
          <output className="flex items-center gap-2 text-sm text-gray-600">
            <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
            Loading Academic Years
          </output>
        ) : years.error ? (
          <p
            role="alert"
            className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900"
          >
            Unable to load Academic Years for this School.
          </p>
        ) : !years.data?.length ? (
          <div className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center">
            <p className="font-medium text-gray-900">No canonical Academic Years yet</p>
            <p className="mt-1 text-sm text-gray-600">
              Create the first draft above. Legacy labels were retained separately as migration
              evidence.
            </p>
          </div>
        ) : (
          <ul className="space-y-4">
            {years.data.map((year) => (
              <li
                key={year.id}
                className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-lg font-semibold text-gray-950">{year.name}</h3>
                      <span className="rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-700">
                        {year.status}
                      </span>
                      {year.isCurrent && (
                        <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-800">
                          Current
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-gray-600">
                      {formatDate(year.startDate)} – {formatDate(year.endDate)} · {year.timeZone} ·{' '}
                      {year.code}
                    </p>
                  </div>
                  {year.status === 'draft' && year.migrationReviewStatus === 'needs_review' && (
                    <button
                      type="button"
                      className={SECONDARY_BUTTON}
                      disabled={busy}
                      onClick={() => runLifecycleAction('review', year.id)}
                    >
                      <CheckCircle2 className="mr-2 size-4" aria-hidden="true" />
                      Approve migration review
                    </button>
                  )}
                  {year.status === 'draft' && year.migrationReviewStatus !== 'needs_review' && (
                    <button
                      type="button"
                      className={PRIMARY_BUTTON}
                      disabled={busy}
                      onClick={() => runLifecycleAction('publish', year.id)}
                    >
                      Publish Academic Year
                    </button>
                  )}
                </div>
                <div className="mt-5 grid gap-5 md:grid-cols-2">
                  <div>
                    <h4 className="text-sm font-semibold text-gray-950">Terms</h4>
                    <ol className="mt-2 space-y-2">
                      {year.terms.map((term) => (
                        <li
                          key={term.id}
                          className="rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-700"
                        >
                          <span className="font-medium text-gray-950">{term.name}</span>
                          <span className="block text-xs text-gray-500">
                            {formatDate(term.startDate)} – {formatDate(term.endDate)} · {term.code}
                          </span>
                        </li>
                      ))}
                    </ol>
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-gray-950">Learner Levels</h4>
                    <ol className="mt-2 space-y-2">
                      {year.levels.map((level) => (
                        <li
                          key={level.id}
                          className="rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-700"
                        >
                          <span className="font-medium text-gray-950">{level.name}</span>
                          <span className="block text-xs text-gray-500">
                            {level.code}
                            {level.educationStage ? ` · ${level.educationStage}` : ''}
                          </span>
                        </li>
                      ))}
                    </ol>
                  </div>
                </div>
                {year.status === 'published' && (
                  <form
                    className="mt-5 flex flex-col gap-3 border-t border-gray-200 pt-5 sm:flex-row sm:items-end"
                    onSubmit={(event) => submitClose(event, year.id)}
                  >
                    <label className={`${LABEL_CLASS} flex-1`}>
                      Closure reason
                      <input
                        className={INPUT_CLASS}
                        name="reason"
                        required
                        minLength={3}
                        maxLength={512}
                        placeholder="Instructional year completed"
                      />
                    </label>
                    <button type="submit" className={SECONDARY_BUTTON} disabled={busy}>
                      Close Academic Year
                    </button>
                  </form>
                )}
                {year.status === 'closed' && year.closureReason && (
                  <p className="mt-5 border-t border-gray-200 pt-4 text-sm text-gray-600">
                    <span className="font-medium text-gray-800">Closure record:</span>{' '}
                    {year.closureReason}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
