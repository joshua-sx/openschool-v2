'use client'

import { trpc } from '@/lib/trpc/client'
import { AlertCircle, Loader2, Plus, Search, User } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'

export default function StudentsPage() {
  const [selectedSchoolId, setSelectedSchoolId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const {
    data: schools,
    isLoading: schoolsLoading,
    error: schoolsError,
  } = trpc.schools.list.useQuery()
  const effectiveSchoolId = selectedSchoolId || schools?.[0]?.id || null
  const selectedSchool = schools?.find(({ id }) => id === effectiveSchoolId)
  const {
    data: students,
    isLoading: studentsLoading,
    error: studentsError,
  } = trpc.students.getBySchool.useQuery(
    { schoolId: effectiveSchoolId ?? '' },
    { enabled: !!effectiveSchoolId }
  )
  const query = searchQuery.normalize('NFKC').trim().toLocaleLowerCase()
  const filteredStudents = students?.filter((student) => {
    if (!query) return true
    return (
      `${student.firstName} ${student.lastName}`.toLocaleLowerCase().includes(query) ||
      (student.studentNumber?.toLocaleLowerCase().includes(query) ?? false)
    )
  })

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
            Learner registry
          </p>
          <h1 className="text-2xl font-bold text-gray-900">Students</h1>
          <p className="mt-1 text-sm text-gray-500">
            Current School enrollments and official learner records.
          </p>
        </div>
        <Link
          href="/students/new"
          className="inline-flex items-center justify-center rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2"
        >
          <Plus aria-hidden="true" className="mr-2 h-4 w-4" />
          Admit learner
        </Link>
      </div>

      <div className="mb-6 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row">
          <div className="shrink-0">
            <label htmlFor="school" className="mb-1 block text-xs font-medium text-gray-600">
              School
            </label>
            <select
              id="school"
              value={effectiveSchoolId || ''}
              onChange={(event) => setSelectedSchoolId(event.target.value || null)}
              disabled={schoolsLoading || !!schoolsError || !schools?.length}
              className="block w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-gray-900 disabled:bg-gray-50 disabled:text-gray-500 sm:w-56"
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
          </div>
          <div className="flex-1">
            <label
              htmlFor="student-search"
              className="mb-1 block text-xs font-medium text-gray-600"
            >
              Search learners
            </label>
            <div className="relative">
              <Search
                aria-hidden="true"
                className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
              />
              <input
                id="student-search"
                type="search"
                placeholder="Name or student number"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                className="block w-full rounded-lg border border-gray-200 py-2 pl-10 pr-4 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
            </div>
          </div>
        </div>
        {selectedSchool && (
          <p className="mt-3 text-xs text-gray-500">
            Showing current enrollments at{' '}
            <span className="font-medium text-gray-700">{selectedSchool.name}</span>.
          </p>
        )}
      </div>

      <div
        className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm"
        aria-busy={schoolsLoading || studentsLoading}
      >
        {schoolsLoading || studentsLoading ? (
          <output className="flex items-center justify-center py-12">
            <Loader2 aria-hidden="true" className="h-6 w-6 animate-spin text-gray-400" />
            <span className="ml-2 text-gray-500">Loading learners…</span>
          </output>
        ) : schoolsError || studentsError ? (
          <div role="alert" className="flex items-center justify-center px-6 py-12 text-red-700">
            <AlertCircle aria-hidden="true" className="mr-2 h-5 w-5" />
            <span>
              {schoolsError
                ? 'Schools could not be loaded.'
                : `Learners could not be loaded. ${studentsError?.message}`}
            </span>
          </div>
        ) : !effectiveSchoolId ? (
          <div className="px-6 py-12 text-center text-gray-500">
            No School is available in your current access scope.
          </div>
        ) : !filteredStudents?.length ? (
          <div className="px-6 py-12 text-center">
            <User aria-hidden="true" className="mx-auto mb-4 h-12 w-12 text-gray-300" />
            <p className="mb-4 text-gray-500">
              {query ? 'No learners match this search.' : 'No current enrollments at this School.'}
            </p>
            {!query && (
              <Link
                href="/students/new"
                className="inline-flex items-center text-sm font-medium text-gray-900 hover:text-gray-700"
              >
                <Plus aria-hidden="true" className="mr-1 h-4 w-4" />
                Admit the first learner
              </Link>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <caption className="sr-only">
                Current learner enrollments for {selectedSchool?.name ?? 'the selected School'}
              </caption>
              <thead className="bg-gray-50">
                <tr>
                  <th
                    scope="col"
                    className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 sm:px-6"
                  >
                    Name
                  </th>
                  <th
                    scope="col"
                    className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 sm:px-6"
                  >
                    Student number
                  </th>
                  <th
                    scope="col"
                    className="hidden px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 md:table-cell"
                  >
                    Date of birth
                  </th>
                  <th
                    scope="col"
                    className="hidden px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 lg:table-cell"
                  >
                    Email
                  </th>
                  <th
                    scope="col"
                    className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 sm:px-6"
                  >
                    Record
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {filteredStudents.map((student) => (
                  <tr key={student.id} className="hover:bg-gray-50">
                    <td className="whitespace-nowrap px-4 py-4 sm:px-6">
                      <Link
                        href={`/students/${student.id}`}
                        className="group flex items-center rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2"
                      >
                        <span
                          aria-hidden="true"
                          className="mr-3 flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-sm font-medium text-gray-600"
                        >
                          {student.firstName[0]}
                          {student.lastName[0]}
                        </span>
                        <span className="text-sm font-medium text-gray-900 group-hover:underline">
                          {student.firstName} {student.lastName}
                        </span>
                      </Link>
                    </td>
                    <td className="whitespace-nowrap px-4 py-4 text-sm text-gray-500 sm:px-6">
                      {student.studentNumber || '—'}
                    </td>
                    <td className="hidden whitespace-nowrap px-6 py-4 text-sm text-gray-500 md:table-cell">
                      {student.dateOfBirth
                        ? new Date(`${student.dateOfBirth}T00:00:00`).toLocaleDateString()
                        : '—'}
                    </td>
                    <td className="hidden whitespace-nowrap px-6 py-4 text-sm text-gray-500 lg:table-cell">
                      {student.email || '—'}
                    </td>
                    <td className="whitespace-nowrap px-4 py-4 sm:px-6">
                      <span
                        className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${student.parityStatus === 'matched' ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-900'}`}
                      >
                        {student.parityStatus === 'matched' ? 'Verified' : 'Needs review'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {filteredStudents && filteredStudents.length > 0 && (
        <p className="mt-4 text-sm text-gray-500" aria-live="polite">
          Showing {filteredStudents.length} of {students?.length || 0} learners
        </p>
      )}
    </div>
  )
}
