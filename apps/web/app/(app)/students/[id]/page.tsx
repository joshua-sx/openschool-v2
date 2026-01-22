'use client'

import { useState, use, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { trpc } from '@/lib/trpc/client'
import {
  ArrowLeft,
  Edit,
  Loader2,
  AlertCircle,
  User,
  Mail,
  Calendar,
  Hash,
  Save,
  X,
} from 'lucide-react'

interface StudentDetailPageProps {
  params: Promise<{ id: string }>
}

export default function StudentDetailPage({ params }: StudentDetailPageProps) {
  const { id } = use(params)
  const router = useRouter()
  const [isEditing, setIsEditing] = useState(false)
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    dateOfBirth: '',
    studentNumber: '',
    email: '',
  })
  const [formErrors, setFormErrors] = useState<string[]>([])
  const [formInitialized, setFormInitialized] = useState(false)

  const utils = trpc.useUtils()

  // Fetch student
  const {
    data: student,
    isLoading,
    error,
  } = trpc.students.getById.useQuery({ studentId: id })

  // Initialize form data when student data is loaded
  useEffect(() => {
    if (student && !formInitialized) {
      setFormData({
        firstName: student.firstName,
        lastName: student.lastName,
        dateOfBirth: student.dateOfBirth || '',
        studentNumber: student.studentNumber || '',
        email: student.email || '',
      })
      setFormInitialized(true)
    }
  }, [student, formInitialized])

  // Update mutation
  const updateMutation = trpc.students.update.useMutation({
    onSuccess: () => {
      utils.students.getById.invalidate({ studentId: id })
      setIsEditing(false)
      setFormErrors([])
    },
    onError: (err) => {
      setFormErrors([err.message])
    },
  })

  const handleSave = () => {
    updateMutation.mutate({
      studentId: id,
      firstName: formData.firstName,
      lastName: formData.lastName,
      dateOfBirth: formData.dateOfBirth || null,
      studentNumber: formData.studentNumber || null,
      email: formData.email || null,
    })
  }

  const handleCancel = () => {
    if (student) {
      setFormData({
        firstName: student.firstName,
        lastName: student.lastName,
        dateOfBirth: student.dateOfBirth || '',
        studentNumber: student.studentNumber || '',
        email: student.email || '',
      })
    }
    setIsEditing(false)
    setFormErrors([])
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
        <span className="ml-2 text-gray-500">Loading student...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
        <p className="text-red-600 mb-4">Error loading student: {error.message}</p>
        <Link
          href="/students"
          className="text-gray-600 hover:text-gray-900 inline-flex items-center"
        >
          <ArrowLeft className="w-4 h-4 mr-1" />
          Back to Students
        </Link>
      </div>
    )
  }

  if (!student) {
    return (
      <div className="text-center py-12">
        <User className="w-12 h-12 text-gray-300 mx-auto mb-4" />
        <p className="text-gray-500 mb-4">Student not found</p>
        <Link
          href="/students"
          className="text-gray-600 hover:text-gray-900 inline-flex items-center"
        >
          <ArrowLeft className="w-4 h-4 mr-1" />
          Back to Students
        </Link>
      </div>
    )
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
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center">
          <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mr-4">
            <span className="text-xl font-medium text-gray-600">
              {student.firstName[0]}
              {student.lastName[0]}
            </span>
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {student.firstName} {student.lastName}
            </h1>
            <p className="text-gray-500 text-sm">
              {student.studentNumber ? `Student #${student.studentNumber}` : 'No student number'}
            </p>
          </div>
        </div>
        {!isEditing && (
          <button
            onClick={() => setIsEditing(true)}
            className="inline-flex items-center px-4 py-2 border border-gray-200 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
          >
            <Edit className="w-4 h-4 mr-2" />
            Edit
          </button>
        )}
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

      {/* Student Details Card */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Student Information
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* First Name */}
            <div>
              <label htmlFor="firstName" className="block text-sm font-medium text-gray-700 mb-1">
                First Name
              </label>
              {isEditing ? (
                <input
                  id="firstName"
                  type="text"
                  value={formData.firstName}
                  onChange={(e) =>
                    setFormData({ ...formData, firstName: e.target.value })
                  }
                  className="block w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                />
              ) : (
                <div className="flex items-center text-gray-900">
                  <User className="w-4 h-4 text-gray-400 mr-2" />
                  {student.firstName}
                </div>
              )}
            </div>

            {/* Last Name */}
            <div>
              <label htmlFor="lastName" className="block text-sm font-medium text-gray-700 mb-1">
                Last Name
              </label>
              {isEditing ? (
                <input
                  id="lastName"
                  type="text"
                  value={formData.lastName}
                  onChange={(e) =>
                    setFormData({ ...formData, lastName: e.target.value })
                  }
                  className="block w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                />
              ) : (
                <div className="flex items-center text-gray-900">
                  <User className="w-4 h-4 text-gray-400 mr-2" />
                  {student.lastName}
                </div>
              )}
            </div>

            {/* Student Number */}
            <div>
              <label htmlFor="studentNumber" className="block text-sm font-medium text-gray-700 mb-1">
                Student Number
              </label>
              {isEditing ? (
                <input
                  id="studentNumber"
                  type="text"
                  value={formData.studentNumber}
                  onChange={(e) =>
                    setFormData({ ...formData, studentNumber: e.target.value })
                  }
                  className="block w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                  placeholder="Optional"
                />
              ) : (
                <div className="flex items-center text-gray-900">
                  <Hash className="w-4 h-4 text-gray-400 mr-2" />
                  {student.studentNumber || '-'}
                </div>
              )}
            </div>

            {/* Date of Birth */}
            <div>
              <label htmlFor="dateOfBirth" className="block text-sm font-medium text-gray-700 mb-1">
                Date of Birth
              </label>
              {isEditing ? (
                <input
                  id="dateOfBirth"
                  type="date"
                  value={formData.dateOfBirth}
                  onChange={(e) =>
                    setFormData({ ...formData, dateOfBirth: e.target.value })
                  }
                  className="block w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                />
              ) : (
                <div className="flex items-center text-gray-900">
                  <Calendar className="w-4 h-4 text-gray-400 mr-2" />
                  {student.dateOfBirth
                    ? new Date(student.dateOfBirth + 'T00:00:00').toLocaleDateString()
                    : '-'}
                </div>
              )}
            </div>

            {/* Email */}
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                Email
              </label>
              {isEditing ? (
                <input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) =>
                    setFormData({ ...formData, email: e.target.value })
                  }
                  className="block w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                  placeholder="Optional"
                />
              ) : (
                <div className="flex items-center text-gray-900">
                  <Mail className="w-4 h-4 text-gray-400 mr-2" />
                  {student.email || '-'}
                </div>
              )}
            </div>

            {/* Status */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Status
              </label>
              <div className="flex items-center">
                <span
                  className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                    student.status === 'active'
                      ? 'bg-green-100 text-green-800'
                      : student.status === 'archived'
                      ? 'bg-gray-100 text-gray-800'
                      : 'bg-yellow-100 text-yellow-800'
                  }`}
                >
                  {student.status}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Edit Actions */}
        {isEditing && (
          <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex justify-end space-x-3">
            <button
              onClick={handleCancel}
              disabled={updateMutation.isPending}
              className="inline-flex items-center px-4 py-2 border border-gray-200 text-gray-700 text-sm font-medium rounded-lg hover:bg-white transition-colors disabled:opacity-50"
            >
              <X className="w-4 h-4 mr-2" />
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={updateMutation.isPending}
              className="inline-flex items-center px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50"
            >
              {updateMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Save className="w-4 h-4 mr-2" />
              )}
              Save Changes
            </button>
          </div>
        )}
      </div>

      {/* Metadata */}
      <div className="mt-6 text-sm text-gray-500">
        <p>
          Created: {new Date(student.createdAt).toLocaleDateString()} at{' '}
          {new Date(student.createdAt).toLocaleTimeString()}
        </p>
        <p>
          Last Updated: {new Date(student.updatedAt).toLocaleDateString()} at{' '}
          {new Date(student.updatedAt).toLocaleTimeString()}
        </p>
      </div>
    </div>
  )
}
