'use client'

import { trpc } from '@/lib/trpc/client'
import { AlertTriangle, BookOpen, LoaderCircle, Plus, Users } from 'lucide-react'
import Link from 'next/link'
import { type FormEvent, useEffect, useRef, useState } from 'react'

const INPUT =
  'mt-1 min-h-10 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-950 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:bg-gray-100'
const LABEL = 'block text-sm font-medium text-gray-800'
const BUTTON =
  'inline-flex min-h-10 items-center justify-center rounded-lg bg-gray-950 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-60'
const SECONDARY =
  'inline-flex min-h-9 items-center justify-center rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-800 hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-60'

function formValue(form: FormData, name: string): string {
  return String(form.get(name) ?? '').trim()
}

function optional(form: FormData, name: string): string | null {
  return formValue(form, name) || null
}

function instant(value: string): string {
  return new Date(value).toISOString()
}

function friendlyError(error: unknown): string {
  const message =
    error && typeof error === 'object' && 'message' in error ? String(error.message) : ''
  if (message.includes('MFA_REQUIRED')) return 'Verify with MFA in Security settings, then retry.'
  if (message.includes('overlap')) return message
  if (message.includes('invalid')) return message
  if (message.includes('POLICY_SCOPE_MISMATCH'))
    return 'You do not have access to that School or record.'
  return 'The operation could not be completed. Review the values and retry.'
}

function dateLabel(value: string | Date): string {
  const date = typeof value === 'string' ? new Date(`${value}T00:00:00Z`) : new Date(value)
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeZone: 'UTC' }).format(date)
}

export function SectionSettingsPanel() {
  const utils = trpc.useUtils()
  const schools = trpc.schools.list.useQuery(undefined, { retry: false })
  const [schoolId, setSchoolId] = useState('')
  const effectiveSchoolId = schoolId || schools.data?.[0]?.id || ''
  const workspace = trpc.sections.workspace.useQuery(
    { schoolId: effectiveSchoolId },
    { enabled: Boolean(effectiveSchoolId), retry: false }
  )
  const createCourse = trpc.sections.createCourse.useMutation()
  const createSection = trpc.sections.createSection.useMutation()
  const assignStaff = trpc.sections.assignStaff.useMutation()
  const addRoster = trpc.sections.addRosterMember.useMutation()
  const endStaff = trpc.sections.endStaff.useMutation()
  const endRoster = trpc.sections.endRoster.useMutation()
  const close = trpc.sections.close.useMutation()
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [sectionYearId, setSectionYearId] = useState('')
  const feedbackRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (message || error) feedbackRef.current?.focus()
  }, [message, error])

  const refresh = async () => {
    if (effectiveSchoolId)
      await utils.sections.workspace.invalidate({ schoolId: effectiveSchoolId })
  }
  const run = async <T,>(
    operation: () => Promise<T>,
    success: string | ((result: T) => string)
  ): Promise<boolean> => {
    setError('')
    setMessage('')
    try {
      const result = await operation()
      setMessage(typeof success === 'function' ? success(result) : success)
      await refresh()
      return true
    } catch (cause) {
      setError(friendlyError(cause))
      return false
    }
  }
  const submitCourse = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const element = event.currentTarget
    const form = new FormData(element)
    const succeeded = await run(
      () =>
        createCourse.mutateAsync({
          schoolId: effectiveSchoolId,
          code: formValue(form, 'code'),
          name: formValue(form, 'name'),
          courseType: formValue(form, 'courseType') as
            | 'general'
            | 'subject'
            | 'elective'
            | 'support',
          subjectArea: optional(form, 'subjectArea'),
          creditValue: optional(form, 'creditValue')
            ? Number(formValue(form, 'creditValue'))
            : null,
          reason: formValue(form, 'reason'),
        }),
      'Course created.'
    )
    if (succeeded) element.reset()
  }
  const submitSection = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const element = event.currentTarget
    const form = new FormData(element)
    const succeeded = await run(
      () =>
        createSection.mutateAsync({
          schoolId: effectiveSchoolId,
          academicYearId: formValue(form, 'academicYearId'),
          academicTermId: optional(form, 'academicTermId'),
          learnerLevelId: optional(form, 'learnerLevelId'),
          courseId: optional(form, 'courseId'),
          code: formValue(form, 'code'),
          name: formValue(form, 'name'),
          sectionType: formValue(form, 'sectionType') as 'homeroom' | 'course',
          startDate: formValue(form, 'startDate'),
          endDate: formValue(form, 'endDate'),
          capacity: optional(form, 'capacity') ? Number(formValue(form, 'capacity')) : null,
          reason: formValue(form, 'reason'),
        }),
      'Section created and activated.'
    )
    if (succeeded) {
      element.reset()
      setSectionYearId('')
    }
  }
  const busy = [
    createCourse,
    createSection,
    assignStaff,
    addRoster,
    endStaff,
    endRoster,
    close,
  ].some(({ isPending }) => isPending)
  const activeSections = workspace.data?.sections.filter(({ status }) => status === 'active') ?? []
  const historicalSections =
    workspace.data?.sections.filter(({ status }) => status !== 'active') ?? []
  const publishedYears =
    workspace.data?.academicYears.filter(({ status }) => status === 'published') ?? []

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <header>
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">
          Academic operations
        </p>
        <h1 className="mt-2 text-2xl font-bold text-gray-950">Courses and sections</h1>
        <p className="mt-1 max-w-3xl text-sm leading-6 text-gray-600">
          Use one model for primary homerooms and high-school course sections. Staff assignments and
          student rosters are effective-dated and preserved as history.
        </p>
      </header>

      {(message || error) && (
        <div
          ref={feedbackRef}
          tabIndex={-1}
          role={error ? 'alert' : 'status'}
          className={`rounded-lg border p-3 text-sm ${error ? 'border-red-300 bg-red-50 text-red-900' : 'border-emerald-300 bg-emerald-50 text-emerald-900'}`}
        >
          {error || message}
          {error.includes('MFA') && (
            <Link href="/settings/security" className="ml-1 underline">
              Open Security settings
            </Link>
          )}
        </div>
      )}

      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <label className={`${LABEL} max-w-xl`}>
          School
          <select
            className={INPUT}
            value={effectiveSchoolId}
            onChange={(event) => setSchoolId(event.target.value)}
            disabled={!schools.data?.length}
          >
            {schools.data?.map((school) => (
              <option key={school.id} value={school.id}>
                {school.name}
              </option>
            ))}
          </select>
        </label>
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        <form
          onSubmit={submitCourse}
          className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm"
        >
          <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-950">
            <BookOpen className="size-5" aria-hidden="true" />
            Create a course
          </h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className={LABEL}>
              Code
              <input required name="code" className={INPUT} />
            </label>
            <label className={LABEL}>
              Name
              <input required name="name" className={INPUT} />
            </label>
            <label className={LABEL}>
              Type
              <select name="courseType" className={INPUT}>
                <option value="subject">Subject</option>
                <option value="general">General</option>
                <option value="elective">Elective</option>
                <option value="support">Support</option>
              </select>
            </label>
            <label className={LABEL}>
              Subject area
              <input name="subjectArea" className={INPUT} />
            </label>
            <label className={LABEL}>
              Credit value
              <input
                name="creditValue"
                type="number"
                min="0"
                max="100"
                step="0.001"
                className={INPUT}
              />
            </label>
            <label className={LABEL}>
              Reason
              <input
                required
                name="reason"
                minLength={3}
                className={INPUT}
                defaultValue="Course setup"
              />
            </label>
          </div>
          <button type="submit" disabled={busy || !effectiveSchoolId} className={`${BUTTON} mt-5`}>
            <Plus className="mr-2 size-4" aria-hidden="true" />
            Create course
          </button>
        </form>

        <form
          onSubmit={submitSection}
          className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm"
        >
          <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-950">
            <Users className="size-5" aria-hidden="true" />
            Create a section
          </h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className={LABEL}>
              Academic Year
              <select
                required
                name="academicYearId"
                className={INPUT}
                value={sectionYearId}
                onChange={(event) => setSectionYearId(event.target.value)}
              >
                <option value="">Select…</option>
                {publishedYears.map((year) => (
                  <option key={year.id} value={year.id}>
                    {year.name}
                  </option>
                ))}
              </select>
            </label>
            <label className={LABEL}>
              Type
              <select name="sectionType" className={INPUT}>
                <option value="homeroom">Homeroom</option>
                <option value="course">Course section</option>
              </select>
            </label>
            <label className={LABEL}>
              Code
              <input required name="code" className={INPUT} />
            </label>
            <label className={LABEL}>
              Name
              <input required name="name" className={INPUT} />
            </label>
            <label className={LABEL}>
              Course
              <select name="courseId" className={INPUT}>
                <option value="">None</option>
                {workspace.data?.courses
                  .filter(({ status }) => status === 'active')
                  .map((course) => (
                    <option key={course.id} value={course.id}>
                      {course.name}
                    </option>
                  ))}
              </select>
            </label>
            <label className={LABEL}>
              Learner Level
              <select name="learnerLevelId" className={INPUT}>
                <option value="">None</option>
                {workspace.data?.levels
                  .filter((level) => level.academicYearId === sectionYearId)
                  .map((level) => (
                    <option key={level.id} value={level.id}>
                      {level.name}
                    </option>
                  ))}
              </select>
            </label>
            <label className={LABEL}>
              Term
              <select name="academicTermId" className={INPUT}>
                <option value="">Whole year</option>
                {workspace.data?.terms
                  .filter((term) => term.academicYearId === sectionYearId)
                  .map((term) => (
                    <option key={term.id} value={term.id}>
                      {term.name}
                    </option>
                  ))}
              </select>
            </label>
            <label className={LABEL}>
              Capacity
              <input name="capacity" type="number" min="1" max="10000" className={INPUT} />
            </label>
            <label className={LABEL}>
              Start date
              <input required name="startDate" type="date" className={INPUT} />
            </label>
            <label className={LABEL}>
              End date
              <input required name="endDate" type="date" className={INPUT} />
            </label>
            <label className={`${LABEL} sm:col-span-2`}>
              Reason
              <input
                required
                name="reason"
                minLength={3}
                className={INPUT}
                defaultValue="Section setup"
              />
            </label>
          </div>
          <button
            type="submit"
            disabled={busy || !effectiveSchoolId || publishedYears.length === 0}
            className={`${BUTTON} mt-5`}
          >
            <Plus className="mr-2 size-4" aria-hidden="true" />
            Create section
          </button>
        </form>
      </div>

      {workspace.isLoading && (
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <LoaderCircle className="size-4 animate-spin" />
          Loading sections…
        </div>
      )}
      {workspace.error && (
        <div
          role="alert"
          className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-900"
        >
          {friendlyError(workspace.error)}
        </div>
      )}

      <section className="space-y-4" aria-labelledby="active-sections-heading">
        <div>
          <h2 id="active-sections-heading" className="text-xl font-semibold text-gray-950">
            Current sections
          </h2>
          <p className="mt-1 text-sm text-gray-600">
            Capacity is advisory: exceeding it displays a warning but does not block enrollment.
          </p>
        </div>
        {activeSections.length === 0 && !workspace.isLoading && (
          <div className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-600">
            No active sections for this School.
          </div>
        )}
        {activeSections.map((section) => {
          const staff =
            workspace.data?.staffAssignments.filter((item) => item.sectionId === section.id) ?? []
          const roster =
            workspace.data?.rosterMemberships.filter((item) => item.sectionId === section.id) ?? []
          const currentRoster = roster.filter(({ status }) => status === 'active')
          const overCapacity = section.capacity !== null && currentRoster.length > section.capacity
          return (
            <article
              key={section.id}
              className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                    {section.sectionType === 'homeroom' ? 'Homeroom' : 'Course section'} ·{' '}
                    {section.code}
                  </p>
                  <h3 className="mt-1 text-lg font-semibold text-gray-950">{section.name}</h3>
                  <p className="mt-1 text-sm text-gray-600">
                    {dateLabel(section.startDate)} – {dateLabel(section.endDate)} ·{' '}
                    {currentRoster.length}
                    {section.capacity ? ` / ${section.capacity}` : ''} students
                  </p>
                </div>
                {overCapacity && (
                  <div className="flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950">
                    <AlertTriangle className="size-4" />
                    Over capacity
                  </div>
                )}
              </div>
              <div className="mt-6 grid gap-6 lg:grid-cols-2">
                <div>
                  <h4 className="font-medium text-gray-950">Staff</h4>
                  <ul className="mt-2 space-y-2 text-sm">
                    {staff.map((item) => (
                      <li
                        key={item.id}
                        className="flex items-center justify-between gap-3 rounded-lg bg-gray-50 p-3"
                      >
                        <span>
                          {item.displayName} · {item.role.replace('_', ' ')}
                        </span>
                        {item.status === 'active' && (
                          <button
                            type="button"
                            className={SECONDARY}
                            disabled={busy}
                            onClick={() =>
                              run(
                                () =>
                                  endStaff.mutateAsync({
                                    id: item.id,
                                    validUntil: new Date().toISOString(),
                                    reason: 'Assignment ended by administrator',
                                  }),
                                'Staff assignment ended.'
                              )
                            }
                          >
                            End
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                  <form
                    className="mt-3 grid gap-2"
                    onSubmit={(event) => {
                      event.preventDefault()
                      const form = new FormData(event.currentTarget)
                      void run(
                        () =>
                          assignStaff.mutateAsync({
                            sectionId: section.id,
                            personId: formValue(form, 'personId'),
                            role: formValue(form, 'role') as
                              | 'lead_teacher'
                              | 'teacher'
                              | 'assistant'
                              | 'counselor',
                            isPrimary: form.get('isPrimary') === 'on',
                            validFrom: instant(formValue(form, 'validFrom')),
                            validUntil: optional(form, 'validUntil')
                              ? instant(formValue(form, 'validUntil'))
                              : null,
                            reason: 'Staff assigned by administrator',
                          }),
                        'Staff assigned.'
                      )
                    }}
                  >
                    <select required name="personId" className={INPUT}>
                      <option value="">Select staff…</option>
                      {workspace.data?.staffCandidates.map((person) => (
                        <option key={person.id} value={person.id}>
                          {person.displayName}
                        </option>
                      ))}
                    </select>
                    <div className="grid grid-cols-2 gap-2">
                      <select name="role" className={INPUT}>
                        <option value="lead_teacher">Lead teacher</option>
                        <option value="teacher">Teacher</option>
                        <option value="assistant">Assistant</option>
                        <option value="counselor">Counselor</option>
                      </select>
                      <input
                        required
                        aria-label="Assignment starts"
                        name="validFrom"
                        type="datetime-local"
                        className={INPUT}
                      />
                    </div>
                    <label className="text-sm text-gray-700">
                      <input name="isPrimary" type="checkbox" className="mr-2" />
                      Primary assignment
                    </label>
                    <button type="submit" disabled={busy} className={SECONDARY}>
                      Assign staff
                    </button>
                  </form>
                </div>
                <div>
                  <h4 className="font-medium text-gray-950">Roster</h4>
                  <ul className="mt-2 max-h-64 space-y-2 overflow-auto text-sm">
                    {roster.map((item) => (
                      <li
                        key={item.id}
                        className="flex items-center justify-between gap-3 rounded-lg bg-gray-50 p-3"
                      >
                        <span>
                          {item.displayName}
                          {item.status !== 'active' ? ' · ended' : ''}
                        </span>
                        {item.status === 'active' && (
                          <button
                            type="button"
                            className={SECONDARY}
                            disabled={busy}
                            onClick={() =>
                              run(
                                () =>
                                  endRoster.mutateAsync({
                                    id: item.id,
                                    validUntil: new Date().toISOString(),
                                    reason: 'Roster membership ended by administrator',
                                  }),
                                'Roster membership ended.'
                              )
                            }
                          >
                            End
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                  <form
                    className="mt-3 grid gap-2"
                    onSubmit={(event) => {
                      event.preventDefault()
                      const form = new FormData(event.currentTarget)
                      void run(
                        () =>
                          addRoster.mutateAsync({
                            sectionId: section.id,
                            schoolEnrollmentId: formValue(form, 'schoolEnrollmentId'),
                            validFrom: instant(formValue(form, 'validFrom')),
                            validUntil: null,
                            reason: 'Added to roster by administrator',
                          }),
                        (result) =>
                          result.capacityExceeded
                            ? 'Student added. This Section is now over its advisory capacity.'
                            : 'Student added to the roster.'
                      )
                    }}
                  >
                    <select required name="schoolEnrollmentId" className={INPUT}>
                      <option value="">Select enrolled student…</option>
                      {workspace.data?.studentCandidates.map((person) => (
                        <option key={person.schoolEnrollmentId} value={person.schoolEnrollmentId}>
                          {person.displayName}
                        </option>
                      ))}
                    </select>
                    <input
                      required
                      aria-label="Roster membership starts"
                      name="validFrom"
                      type="datetime-local"
                      className={INPUT}
                    />
                    <button type="submit" disabled={busy} className={SECONDARY}>
                      Add student
                    </button>
                  </form>
                </div>
              </div>
              <div className="mt-6 border-t border-gray-200 pt-4">
                <button
                  type="button"
                  disabled={busy}
                  className={SECONDARY}
                  onClick={() =>
                    run(
                      () =>
                        close.mutateAsync({
                          sectionId: section.id,
                          reason: 'Section closed by administrator',
                        }),
                      'Section closed; its roster and assignments remain in history.'
                    )
                  }
                >
                  Close section
                </button>
              </div>
            </article>
          )
        })}
      </section>

      <section
        aria-labelledby="history-heading"
        className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm"
      >
        <h2 id="history-heading" className="text-lg font-semibold text-gray-950">
          Historical and migration records
        </h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div>
            <h3 className="text-sm font-medium text-gray-900">Closed sections</h3>
            <ul className="mt-2 space-y-2 text-sm text-gray-600">
              {historicalSections.map((section) => (
                <li key={section.id}>
                  {section.name} · {section.status}
                </li>
              ))}
              {historicalSections.length === 0 && <li>None yet.</li>}
            </ul>
          </div>
          <div>
            <h3 className="text-sm font-medium text-gray-900">Legacy Classes awaiting placement</h3>
            <p className="mt-2 text-sm text-gray-600">
              {workspace.data?.legacyCompatibility.filter(
                ({ mappingStatus }) => mappingStatus !== 'mapped'
              ).length ?? 0}{' '}
              retained on the legacy read path. No Academic Year dates were guessed.
            </p>
          </div>
        </div>
      </section>
    </div>
  )
}
