'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { trpc } from '@/lib/trpc/client'
import { ArrowLeft, Loader2, AlertCircle, Save } from 'lucide-react'

export default function NewStudentPage() {
  const router = useRouter()
  const [formData, setFormData] = useState({
    schoolId: '',
    firstName: '',
    lastName: '',
    dateOfBirth: '',
    studentNumber: '',
    email: '',
  })
  const [formErrors, setFormErrors] = useState<string[]>([])

  // Fetch schools for selector
  const { data: schools, isLoading: schoolsLoading } = trpc.schools.list.useQuery()

  // Create mutation
  const createMutation = trpc.students.create.useMutation({
    onSuccess: (student) => {
      router.push(`/students/${student.id}`)
    },
    onError: (err) => {
      setFormErrors([err.message])
    },
  })

  // Auto-select first school if none selected
  const effectiveSchoolId = formData.schoolId || schools?.[0]?.id || ''

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setFormErrors([])

    // Client-side validation
    const errors: string[] = []
    if (!formData.firstName.trim()) {
      errors.push('First name is required')
    }
    if (!formData.lastName.trim()) {
      errors.push('Last name is required')
    }
    if (!effectiveSchoolId) {
      errors.push('Please select a school')
    }

    if (errors.length > 0) {
      setFormErrors(errors)
      return
    }

    createMutation.mutate({
      schoolId: effectiveSchoolId,
      firstName: formData.firstName.trim(),
      lastName: formData.lastName.trim(),
      dateOfBirth: formData.dateOfBirth || null,
      studentNumber: formData.studentNumber.trim() || null,
      email: formData.email.trim() || null,
    })
  }

  return (
    <div>
      {/* Back Link */}
      <Link
        href="/students"
        className="inline-flex items-center text-sm text-gray-600 hover:text-gray-900 mb-6"
      >
        <ArrowLeft className="w-4 h-4 mr-1" />
        Back to Students
      </Link>

      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Add New Student</h1>
        <p className="text-gray-500 text-sm mt-1">
          Create a new student record
        </p>
      </div>

      {/* Form Errors */}
      {formErrors.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <div className="flex items-center mb-2">
            <AlertCircle className="w-4 h-4 text-red-600 mr-2" />
            <span className="text-sm font-medium text-red-800">
              Please fix the following errors:
            </span>
          </div>
          <ul className="list-disc list-inside text-sm text-red-700">
            {formErrors.map((error, i) => (
              <li key={i}>{error}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit}>
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* School Selector */}
              <div className="md:col-span-2">
                <label
                  htmlFor="school"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  School <span className="text-red-500">*</span>
                </label>
                <select
                  id="school"
                  value={effectiveSchoolId}
                  onChange={(e) =>
                    setFormData({ ...formData, schoolId: e.target.value })
                  }
                  disabled={schoolsLoading || !schools?.length}
                  className="block w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent disabled:bg-gray-50 disabled:text-gray-500"
                >
                  {schoolsLoading ? (
                    <option>Loading schools...</option>
                  ) : !schools?.length ? (
                    <option>No schools available</option>
                  ) : (
                    schools.map((school) => (
                      <option key={school.id} value={school.id}>
                        {school.name}
                      </option>
                    ))
                  )}
                </select>
              </div>

              {/* First Name */}
              <div>
                <label
                  htmlFor="firstName"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  First Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  id="firstName"
                  value={formData.firstName}
                  onChange={(e) =>
                    setFormData({ ...formData, firstName: e.target.value })
                  }
                  className="block w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                  placeholder="Enter first name"
                />
              </div>

              {/* Last Name */}
              <div>
                <label
                  htmlFor="lastName"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Last Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  id="lastName"
                  value={formData.lastName}
                  onChange={(e) =>
                    setFormData({ ...formData, lastName: e.target.value })
                  }
                  className="block w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                  placeholder="Enter last name"
                />
              </div>

              {/* Student Number */}
              <div>
                <label
                  htmlFor="studentNumber"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Student Number
                </label>
                <input
                  type="text"
                  id="studentNumber"
                  value={formData.studentNumber}
                  onChange={(e) =>
                    setFormData({ ...formData, studentNumber: e.target.value })
                  }
                  className="block w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                  placeholder="Optional"
                />
              </div>

              {/* Date of Birth */}
              <div>
                <label
                  htmlFor="dateOfBirth"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Date of Birth
                </label>
                <input
                  type="date"
                  id="dateOfBirth"
                  value={formData.dateOfBirth}
                  onChange={(e) =>
                    setFormData({ ...formData, dateOfBirth: e.target.value })
                  }
                  className="block w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                />
              </div>

              {/* Email */}
              <div className="md:col-span-2">
                <label
                  htmlFor="email"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Email
                </label>
                <input
                  type="email"
                  id="email"
                  value={formData.email}
                  onChange={(e) =>
                    setFormData({ ...formData, email: e.target.value })
                  }
                  className="block w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                  placeholder="Optional"
                />
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex justify-end space-x-3">
            <Link
              href="/students"
              className="inline-flex items-center px-4 py-2 border border-gray-200 text-gray-700 text-sm font-medium rounded-lg hover:bg-white transition-colors"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={createMutation.isPending || !schools?.length}
              className="inline-flex items-center px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50"
            >
              {createMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Save className="w-4 h-4 mr-2" />
              )}
              Create Student
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}
