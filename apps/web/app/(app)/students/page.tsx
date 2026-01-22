'use client'

import { useState } from 'react'
import Link from 'next/link'
import { trpc } from '@/lib/trpc/client'
import { Plus, Search, User, Loader2, AlertCircle } from 'lucide-react'

export default function StudentsPage() {
  const [selectedSchoolId, setSelectedSchoolId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  // Fetch schools for selector
  const { data: schools, isLoading: schoolsLoading } = trpc.schools.list.useQuery()

  // Auto-select first school if none selected
  const effectiveSchoolId = selectedSchoolId || schools?.[0]?.id || null

  // Fetch students for selected school
  const {
    data: students,
    isLoading: studentsLoading,
    error: studentsError,
  } = trpc.students.getBySchool.useQuery(
    { schoolId: effectiveSchoolId! },
    { enabled: !!effectiveSchoolId }
  )

  // Filter students by search query
  const filteredStudents = students?.filter((student) => {
    if (!searchQuery) return true
    const fullName = `${student.firstName} ${student.lastName}`.toLowerCase()
    const studentNumber = student.studentNumber?.toLowerCase() || ''
    const query = searchQuery.toLowerCase()
    return fullName.includes(query) || studentNumber.includes(query)
  })

  return (
    <div>
      {/* Page Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Students</h1>
          <p className="text-gray-500 text-sm mt-1">
            Manage student records and information
          </p>
        </div>
        <Link
          href="/students/new"
          className="inline-flex items-center px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors"
        >
          <Plus className="w-4 h-4 mr-2" />
          Add Student
        </Link>
      </div>

      {/* Filters Bar */}
      <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm mb-6">
        <div className="flex flex-col sm:flex-row gap-4">
          {/* School Selector */}
          <div className="flex-shrink-0">
            <label htmlFor="school" className="sr-only">
              Select School
            </label>
            <select
              id="school"
              value={effectiveSchoolId || ''}
              onChange={(e) => setSelectedSchoolId(e.target.value || null)}
              disabled={schoolsLoading || !schools?.length}
              className="block w-full sm:w-48 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent disabled:bg-gray-50 disabled:text-gray-500"
            >
              {schoolsLoading ? (
                <option>Loading...</option>
              ) : !schools?.length ? (
                <option>No schools</option>
              ) : (
                schools.map((school) => (
                  <option key={school.id} value={school.id}>
                    {school.name}
                  </option>
                ))
              )}
            </select>
          </div>

          {/* Search */}
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search by name or student number..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="block w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Students List */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {studentsLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
            <span className="ml-2 text-gray-500">Loading students...</span>
          </div>
        ) : studentsError ? (
          <div className="flex items-center justify-center py-12 text-red-600">
            <AlertCircle className="w-5 h-5 mr-2" />
            <span>Error loading students: {studentsError.message}</span>
          </div>
        ) : !effectiveSchoolId ? (
          <div className="text-center py-12 text-gray-500">
            <p>Select a school to view students</p>
          </div>
        ) : !filteredStudents?.length ? (
          <div className="text-center py-12">
            <User className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500 mb-4">
              {searchQuery ? 'No students match your search' : 'No students found'}
            </p>
            {!searchQuery && (
              <Link
                href="/students/new"
                className="inline-flex items-center text-sm text-gray-900 hover:text-gray-700"
              >
                <Plus className="w-4 h-4 mr-1" />
                Add your first student
              </Link>
            )}
          </div>
        ) : (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Name
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Student Number
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Date of Birth
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Email
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredStudents.map((student) => (
                <tr
                  key={student.id}
                  className="hover:bg-gray-50 cursor-pointer"
                  onClick={() => window.location.href = `/students/${student.id}`}
                >
                  <td className="px-6 py-4 whitespace-nowrap">
                    <Link
                      href={`/students/${student.id}`}
                      className="flex items-center"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center mr-3">
                        <span className="text-sm font-medium text-gray-600">
                          {student.firstName[0]}
                          {student.lastName[0]}
                        </span>
                      </div>
                      <div>
                        <div className="text-sm font-medium text-gray-900">
                          {student.firstName} {student.lastName}
                        </div>
                      </div>
                    </Link>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {student.studentNumber || '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {student.dateOfBirth
                      ? new Date(student.dateOfBirth).toLocaleDateString()
                      : '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {student.email || '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
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
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Results count */}
      {filteredStudents && filteredStudents.length > 0 && (
        <div className="mt-4 text-sm text-gray-500">
          Showing {filteredStudents.length} of {students?.length || 0} students
        </div>
      )}
    </div>
  )
}
