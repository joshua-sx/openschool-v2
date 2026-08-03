'use client'

import { StudentEnrollmentLifecycle } from '@/components/students/student-enrollment-lifecycle'
import {
  type StudentFormData,
  type StudentFormErrors,
  type StudentFormField,
  firstStudentFormError,
  validateStudentForm,
} from '@/lib/student-form'
import { trpc } from '@/lib/trpc/client'
import {
  AlertCircle,
  ArrowLeft,
  Calendar,
  Edit,
  Hash,
  Loader2,
  Mail,
  Save,
  School,
  User,
  X,
} from 'lucide-react'
import Link from 'next/link'
import { use, useRef, useState } from 'react'

interface StudentDetailPageProps {
  params: Promise<{ id: string }>
}

const INPUT_CLASS =
  'block w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-gray-900 aria-[invalid=true]:border-red-500 aria-[invalid=true]:ring-red-500'

function toStudentFormData(student: {
  schoolId: string
  firstName: string
  lastName: string
  dateOfBirth: string | null
  studentNumber: string | null
  email: string | null
}): StudentFormData {
  return {
    schoolId: student.schoolId,
    firstName: student.firstName,
    lastName: student.lastName,
    dateOfBirth: student.dateOfBirth || '',
    studentNumber: student.studentNumber || '',
    email: student.email || '',
  }
}

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null
  return (
    <p id={id} className="mt-1 text-sm text-red-700">
      {message}
    </p>
  )
}

export default function StudentDetailPage({ params }: StudentDetailPageProps) {
  const { id } = use(params)
  const [isEditing, setIsEditing] = useState(false)
  const [formData, setFormData] = useState<StudentFormData | null>(null)
  const [fieldErrors, setFieldErrors] = useState<StudentFormErrors>({})
  const [serverError, setServerError] = useState<string | null>(null)
  const fields = useRef<Partial<Record<StudentFormField, HTMLInputElement>>>({})
  const utils = trpc.useUtils()
  const { data: student, isLoading, error } = trpc.students.getById.useQuery({ studentId: id })

  const updateMutation = trpc.students.update.useMutation({
    onSuccess: async () => {
      await utils.students.getById.invalidate({ studentId: id })
      setFormData(null)
      setIsEditing(false)
      setFieldErrors({})
      setServerError(null)
    },
    onError: (mutationError) => setServerError(mutationError.message),
  })

  const handleSave = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!student) return
    const submitted = formData ?? toStudentFormData(student)
    const errors = validateStudentForm(submitted, { requireSchool: false })
    setFieldErrors(errors)
    setServerError(null)
    const firstError = firstStudentFormError(errors)
    if (firstError) {
      fields.current[firstError]?.focus()
      return
    }
    updateMutation.mutate({
      studentId: id,
      firstName: submitted.firstName,
      lastName: submitted.lastName,
      dateOfBirth: submitted.dateOfBirth || null,
      studentNumber: submitted.studentNumber || null,
      email: submitted.email || null,
    })
  }

  const updateField = (field: StudentFormField, value: string) => {
    if (!student) return
    setFormData((current) => ({ ...(current ?? toStudentFormData(student)), [field]: value }))
    if (fieldErrors[field]) setFieldErrors((current) => ({ ...current, [field]: undefined }))
  }

  const handleCancel = () => {
    setFormData(null)
    setIsEditing(false)
    setFieldErrors({})
    setServerError(null)
  }

  if (isLoading) {
    return (
      <output className="flex items-center justify-center py-12">
        <Loader2 aria-hidden="true" className="h-6 w-6 animate-spin text-gray-400" />
        <span className="ml-2 text-gray-500">Loading learner…</span>
      </output>
    )
  }

  if (error || !student) {
    return (
      <div role={error ? 'alert' : undefined} className="py-12 text-center">
        {error ? (
          <AlertCircle aria-hidden="true" className="mx-auto mb-4 h-12 w-12 text-red-400" />
        ) : (
          <User aria-hidden="true" className="mx-auto mb-4 h-12 w-12 text-gray-300" />
        )}
        <p className={error ? 'mb-4 text-red-700' : 'mb-4 text-gray-500'}>
          {error ? `Learner could not be loaded. ${error.message}` : 'Learner not found.'}
        </p>
        <Link
          href="/students"
          className="inline-flex items-center text-gray-600 hover:text-gray-900"
        >
          <ArrowLeft aria-hidden="true" className="mr-1 h-4 w-4" />
          Back to students
        </Link>
      </div>
    )
  }

  const displayed = formData ?? toStudentFormData(student)

  return (
    <div className="mx-auto max-w-4xl">
      <Link
        href="/students"
        className="mb-6 inline-flex items-center text-sm text-gray-600 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2"
      >
        <ArrowLeft aria-hidden="true" className="mr-1 h-4 w-4" />
        Back to students
      </Link>

      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center">
          <span
            aria-hidden="true"
            className="mr-4 flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-gray-100 text-lg font-medium text-gray-600 sm:h-16 sm:w-16 sm:text-xl"
          >
            {student.firstName[0]}
            {student.lastName[0]}
          </span>
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-gray-500">
              Official learner record
            </p>
            <h1 className="text-2xl font-bold text-gray-900">
              {student.firstName} {student.lastName}
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              {student.schoolName} ·{' '}
              {student.isCurrentEnrollment
                ? 'Current enrollment'
                : student.status === 'graduated'
                  ? 'Graduated learner'
                  : student.status === 'withdrawn'
                    ? 'Withdrawn learner'
                    : 'Historical enrollment'}
            </p>
          </div>
        </div>
        {!isEditing && student.isCurrentEnrollment && (
          <button
            type="button"
            onClick={() => setIsEditing(true)}
            className="inline-flex items-center justify-center rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2"
          >
            <Edit aria-hidden="true" className="mr-2 h-4 w-4" />
            Edit record
          </button>
        )}
      </div>

      {serverError && (
        <div
          role="alert"
          className="mb-6 flex gap-2 rounded-lg border border-red-200 bg-red-50 p-3"
        >
          <AlertCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
          <p className="text-sm text-red-800">The record could not be saved. {serverError}</p>
        </div>
      )}

      <form noValidate onSubmit={handleSave} aria-busy={updateMutation.isPending}>
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-gray-200 bg-gray-50 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-semibold text-gray-900">Learner information</h2>
              <p className="mt-1 text-xs text-gray-500">
                Identity details shared across School services.
              </p>
            </div>
            <span
              className={`inline-flex w-fit rounded-full px-2 py-1 text-xs font-medium ${student.parityStatus === 'matched' ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-900'}`}
            >
              {student.parityStatus === 'matched' ? 'Record verified' : 'Needs review'}
            </span>
          </div>

          <div className="grid grid-cols-1 gap-6 p-6 md:grid-cols-2">
            <div>
              <label htmlFor="firstName" className="mb-1 block text-sm font-medium text-gray-700">
                First name
              </label>
              {isEditing ? (
                <>
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
                    value={displayed.firstName}
                    onChange={(event) => updateField('firstName', event.target.value)}
                    aria-invalid={!!fieldErrors.firstName}
                    aria-describedby={fieldErrors.firstName ? 'firstName-error' : undefined}
                    className={INPUT_CLASS}
                  />
                  <FieldError id="firstName-error" message={fieldErrors.firstName} />
                </>
              ) : (
                <p className="flex items-center text-gray-900">
                  <User aria-hidden="true" className="mr-2 h-4 w-4 text-gray-400" />
                  {student.firstName}
                </p>
              )}
            </div>

            <div>
              <label htmlFor="lastName" className="mb-1 block text-sm font-medium text-gray-700">
                Last name
              </label>
              {isEditing ? (
                <>
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
                    value={displayed.lastName}
                    onChange={(event) => updateField('lastName', event.target.value)}
                    aria-invalid={!!fieldErrors.lastName}
                    aria-describedby={fieldErrors.lastName ? 'lastName-error' : undefined}
                    className={INPUT_CLASS}
                  />
                  <FieldError id="lastName-error" message={fieldErrors.lastName} />
                </>
              ) : (
                <p className="flex items-center text-gray-900">
                  <User aria-hidden="true" className="mr-2 h-4 w-4 text-gray-400" />
                  {student.lastName}
                </p>
              )}
            </div>

            <div>
              <label
                htmlFor="studentNumber"
                className="mb-1 block text-sm font-medium text-gray-700"
              >
                Student number
              </label>
              {isEditing ? (
                <>
                  <input
                    ref={(element) => {
                      fields.current.studentNumber = element ?? undefined
                    }}
                    id="studentNumber"
                    name="studentNumber"
                    type="text"
                    maxLength={64}
                    value={displayed.studentNumber}
                    onChange={(event) => updateField('studentNumber', event.target.value)}
                    aria-invalid={!!fieldErrors.studentNumber}
                    aria-describedby={fieldErrors.studentNumber ? 'studentNumber-error' : undefined}
                    className={INPUT_CLASS}
                  />
                  <FieldError id="studentNumber-error" message={fieldErrors.studentNumber} />
                </>
              ) : (
                <p className="flex items-center text-gray-900">
                  <Hash aria-hidden="true" className="mr-2 h-4 w-4 text-gray-400" />
                  {student.studentNumber || '—'}
                </p>
              )}
            </div>

            <div>
              <label htmlFor="dateOfBirth" className="mb-1 block text-sm font-medium text-gray-700">
                Date of birth
              </label>
              {isEditing ? (
                <>
                  <input
                    ref={(element) => {
                      fields.current.dateOfBirth = element ?? undefined
                    }}
                    id="dateOfBirth"
                    name="dateOfBirth"
                    type="date"
                    value={displayed.dateOfBirth}
                    onChange={(event) => updateField('dateOfBirth', event.target.value)}
                    aria-invalid={!!fieldErrors.dateOfBirth}
                    aria-describedby={fieldErrors.dateOfBirth ? 'dateOfBirth-error' : undefined}
                    className={INPUT_CLASS}
                  />
                  <FieldError id="dateOfBirth-error" message={fieldErrors.dateOfBirth} />
                </>
              ) : (
                <p className="flex items-center text-gray-900">
                  <Calendar aria-hidden="true" className="mr-2 h-4 w-4 text-gray-400" />
                  {student.dateOfBirth
                    ? new Date(`${student.dateOfBirth}T00:00:00`).toLocaleDateString()
                    : '—'}
                </p>
              )}
            </div>

            <div>
              <label htmlFor="email" className="mb-1 block text-sm font-medium text-gray-700">
                Email
              </label>
              {isEditing ? (
                <>
                  <input
                    ref={(element) => {
                      fields.current.email = element ?? undefined
                    }}
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    maxLength={320}
                    value={displayed.email}
                    onChange={(event) => updateField('email', event.target.value)}
                    aria-invalid={!!fieldErrors.email}
                    aria-describedby={fieldErrors.email ? 'email-error' : undefined}
                    className={INPUT_CLASS}
                  />
                  <FieldError id="email-error" message={fieldErrors.email} />
                </>
              ) : (
                <p className="flex items-center text-gray-900">
                  <Mail aria-hidden="true" className="mr-2 h-4 w-4 text-gray-400" />
                  {student.email || '—'}
                </p>
              )}
            </div>

            <div>
              <span className="mb-1 block text-sm font-medium text-gray-700">
                Current enrollment
              </span>
              <p className="flex items-center text-gray-900">
                <School aria-hidden="true" className="mr-2 h-4 w-4 text-gray-400" />
                {student.schoolName}
              </p>
            </div>
          </div>

          {isEditing && (
            <div className="flex flex-col-reverse gap-3 border-t border-gray-200 bg-gray-50 px-6 py-4 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={handleCancel}
                disabled={updateMutation.isPending}
                className="inline-flex items-center justify-center rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2 disabled:opacity-50"
              >
                <X aria-hidden="true" className="mr-2 h-4 w-4" />
                Cancel
              </button>
              <button
                type="submit"
                disabled={updateMutation.isPending}
                className="inline-flex items-center justify-center rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2 disabled:opacity-50"
              >
                {updateMutation.isPending ? (
                  <Loader2 aria-hidden="true" className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Save aria-hidden="true" className="mr-2 h-4 w-4" />
                )}
                {updateMutation.isPending ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          )}
        </div>
      </form>

      <StudentEnrollmentLifecycle personId={student.personId} studentLookupId={id} />

      <div className="mt-6 border-t border-gray-200 pt-4 text-xs text-gray-500">
        <p>
          Enrolled {new Date(student.enrolledAt).toLocaleDateString()} · Record created{' '}
          {new Date(student.createdAt).toLocaleDateString()}
        </p>
        <p className="mt-1">Last updated {new Date(student.updatedAt).toLocaleString()}</p>
      </div>
    </div>
  )
}
