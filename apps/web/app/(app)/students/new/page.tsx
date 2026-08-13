'use client'

import {
  type StudentFormData,
  type StudentFormErrors,
  type StudentFormField,
  firstStudentFormError,
  validateStudentForm,
} from '@/lib/student-form'
import { trpc } from '@/lib/trpc/client'
import { AlertCircle, ArrowLeft, Loader2, Save } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useRef, useState } from 'react'

const INPUT_CLASS =
  'block w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-gray-900 disabled:bg-gray-50 disabled:text-gray-500 aria-[invalid=true]:border-red-500 aria-[invalid=true]:ring-red-500'

const EMPTY_FORM: StudentFormData = {
  schoolId: '',
  firstName: '',
  lastName: '',
  dateOfBirth: '',
  studentNumber: '',
  email: '',
}

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null
  return (
    <p id={id} className="mt-1 text-sm text-red-700">
      {message}
    </p>
  )
}

export default function NewStudentPage() {
  const router = useRouter()
  const [formData, setFormData] = useState<StudentFormData>(EMPTY_FORM)
  const [fieldErrors, setFieldErrors] = useState<StudentFormErrors>({})
  const [serverError, setServerError] = useState<string | null>(null)
  const fields = useRef<Partial<Record<StudentFormField, HTMLInputElement | HTMLSelectElement>>>({})

  const {
    data: schools,
    isLoading: schoolsLoading,
    error: schoolsError,
  } = trpc.schools.list.useQuery()
  const effectiveSchoolId = formData.schoolId || schools?.[0]?.id || ''
  const selectedSchool = schools?.find(({ id }) => id === effectiveSchoolId)

  const createMutation = trpc.students.create.useMutation({
    onSuccess: (student) => {
      const warning = student.possibleDuplicateCount ?? 0
      router.push(
        warning > 0
          ? `/students/${student.id}?possibleDuplicates=${warning}`
          : `/students/${student.id}`
      )
    },
    onError: (error) => setServerError(error.message),
  })

  const updateField = (field: StudentFormField, value: string) => {
    setFormData((current) => ({ ...current, [field]: value }))
    if (fieldErrors[field]) {
      setFieldErrors((current) => ({ ...current, [field]: undefined }))
    }
  }

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const submitted = { ...formData, schoolId: effectiveSchoolId }
    const errors = validateStudentForm(submitted, { requireSchool: true })
    setFieldErrors(errors)
    setServerError(null)
    const firstError = firstStudentFormError(errors)
    if (firstError) {
      fields.current[firstError]?.focus()
      return
    }

    createMutation.mutate({
      schoolId: submitted.schoolId,
      firstName: submitted.firstName,
      lastName: submitted.lastName,
      dateOfBirth: submitted.dateOfBirth || null,
      studentNumber: submitted.studentNumber || null,
      email: submitted.email || null,
    })
  }

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href="/students"
        className="mb-6 inline-flex items-center text-sm text-gray-600 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2"
      >
        <ArrowLeft aria-hidden="true" className="mr-1 h-4 w-4" />
        Back to students
      </Link>

      <div className="mb-6">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
          Learner registry
        </p>
        <h1 className="text-2xl font-bold text-gray-900">Admit a learner</h1>
        <p className="mt-1 text-sm text-gray-500">
          Create the learner’s official record and current School enrollment.
        </p>
      </div>

      {serverError && (
        <div
          role="alert"
          className="mb-6 flex gap-2 rounded-lg border border-red-200 bg-red-50 p-3"
        >
          <AlertCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
          <p className="text-sm text-red-800">The learner could not be admitted. {serverError}</p>
        </div>
      )}

      <form noValidate onSubmit={handleSubmit} aria-busy={createMutation.isPending}>
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-200 bg-gray-50 px-6 py-4">
            <p className="text-sm font-medium text-gray-900">
              {selectedSchool ? selectedSchool.name : 'School placement'}
            </p>
            <p className="mt-1 text-xs text-gray-500">
              This School will own the learner’s current enrollment and School-level access.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-6 p-6 md:grid-cols-2">
            <div className="md:col-span-2">
              <label htmlFor="school" className="mb-1 block text-sm font-medium text-gray-700">
                School{' '}
                <span aria-hidden="true" className="text-red-600">
                  *
                </span>
              </label>
              <select
                ref={(element) => {
                  fields.current.schoolId = element ?? undefined
                }}
                id="school"
                required
                value={effectiveSchoolId}
                onChange={(event) => updateField('schoolId', event.target.value)}
                disabled={schoolsLoading || !!schoolsError || !schools?.length}
                aria-invalid={!!fieldErrors.schoolId}
                aria-describedby={fieldErrors.schoolId ? 'school-error' : 'school-help'}
                className={INPUT_CLASS}
              >
                {schoolsLoading ? (
                  <option value="">Loading schools…</option>
                ) : schoolsError ? (
                  <option value="">Schools unavailable</option>
                ) : !schools?.length ? (
                  <option value="">No schools available</option>
                ) : (
                  schools.map((school) => (
                    <option key={school.id} value={school.id}>
                      {school.name}
                    </option>
                  ))
                )}
              </select>
              <p id="school-help" className="mt-1 text-xs text-gray-500">
                Required. You can only select a School within your authorized scope.
              </p>
              <FieldError id="school-error" message={fieldErrors.schoolId} />
            </div>

            <div>
              <label htmlFor="firstName" className="mb-1 block text-sm font-medium text-gray-700">
                First name{' '}
                <span aria-hidden="true" className="text-red-600">
                  *
                </span>
              </label>
              <input
                ref={(element) => {
                  fields.current.firstName = element ?? undefined
                }}
                id="firstName"
                name="firstName"
                type="text"
                autoComplete="given-name"
                required
                maxLength={100}
                value={formData.firstName}
                onChange={(event) => updateField('firstName', event.target.value)}
                aria-invalid={!!fieldErrors.firstName}
                aria-describedby={fieldErrors.firstName ? 'firstName-error' : undefined}
                className={INPUT_CLASS}
              />
              <FieldError id="firstName-error" message={fieldErrors.firstName} />
            </div>

            <div>
              <label htmlFor="lastName" className="mb-1 block text-sm font-medium text-gray-700">
                Last name{' '}
                <span aria-hidden="true" className="text-red-600">
                  *
                </span>
              </label>
              <input
                ref={(element) => {
                  fields.current.lastName = element ?? undefined
                }}
                id="lastName"
                name="lastName"
                type="text"
                autoComplete="family-name"
                required
                maxLength={100}
                value={formData.lastName}
                onChange={(event) => updateField('lastName', event.target.value)}
                aria-invalid={!!fieldErrors.lastName}
                aria-describedby={fieldErrors.lastName ? 'lastName-error' : undefined}
                className={INPUT_CLASS}
              />
              <FieldError id="lastName-error" message={fieldErrors.lastName} />
            </div>

            <div>
              <label
                htmlFor="studentNumber"
                className="mb-1 block text-sm font-medium text-gray-700"
              >
                Student number <span className="font-normal text-gray-500">(optional)</span>
              </label>
              <input
                ref={(element) => {
                  fields.current.studentNumber = element ?? undefined
                }}
                id="studentNumber"
                name="studentNumber"
                type="text"
                maxLength={64}
                value={formData.studentNumber}
                onChange={(event) => updateField('studentNumber', event.target.value)}
                aria-invalid={!!fieldErrors.studentNumber}
                aria-describedby={fieldErrors.studentNumber ? 'studentNumber-error' : undefined}
                className={INPUT_CLASS}
              />
              <FieldError id="studentNumber-error" message={fieldErrors.studentNumber} />
            </div>

            <div>
              <label htmlFor="dateOfBirth" className="mb-1 block text-sm font-medium text-gray-700">
                Date of birth <span className="font-normal text-gray-500">(optional)</span>
              </label>
              <input
                ref={(element) => {
                  fields.current.dateOfBirth = element ?? undefined
                }}
                id="dateOfBirth"
                name="dateOfBirth"
                type="date"
                value={formData.dateOfBirth}
                onChange={(event) => updateField('dateOfBirth', event.target.value)}
                aria-invalid={!!fieldErrors.dateOfBirth}
                aria-describedby={fieldErrors.dateOfBirth ? 'dateOfBirth-error' : undefined}
                className={INPUT_CLASS}
              />
              <FieldError id="dateOfBirth-error" message={fieldErrors.dateOfBirth} />
            </div>

            <div className="md:col-span-2">
              <label htmlFor="email" className="mb-1 block text-sm font-medium text-gray-700">
                Email <span className="font-normal text-gray-500">(optional)</span>
              </label>
              <input
                ref={(element) => {
                  fields.current.email = element ?? undefined
                }}
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                maxLength={320}
                value={formData.email}
                onChange={(event) => updateField('email', event.target.value)}
                aria-invalid={!!fieldErrors.email}
                aria-describedby={fieldErrors.email ? 'email-error' : undefined}
                className={INPUT_CLASS}
              />
              <FieldError id="email-error" message={fieldErrors.email} />
            </div>
          </div>

          <div className="flex flex-col-reverse gap-3 border-t border-gray-200 bg-gray-50 px-6 py-4 sm:flex-row sm:justify-end">
            <Link
              href="/students"
              className="inline-flex items-center justify-center rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={
                createMutation.isPending || schoolsLoading || !!schoolsError || !schools?.length
              }
              className="inline-flex items-center justify-center rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {createMutation.isPending ? (
                <Loader2 aria-hidden="true" className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save aria-hidden="true" className="mr-2 h-4 w-4" />
              )}
              {createMutation.isPending ? 'Admitting learner…' : 'Admit learner'}
            </button>
          </div>
        </div>
        {schoolsLoading && <output className="sr-only">Loading available schools</output>}
      </form>
    </div>
  )
}
