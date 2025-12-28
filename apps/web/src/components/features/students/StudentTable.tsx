'use client'

import Link from 'next/link'

// Student type from tRPC (dates are serialized as strings)
type Student = {
  id: string
  schoolId: string
  firstName: string
  lastName: string
  dateOfBirth: string | null
  studentNumber: string | null
  email: string | null
  status: 'active' | 'archived' | 'read_only'
  createdAt: string
  updatedAt: string
}
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Pencil } from 'lucide-react'

interface StudentTableProps {
  students: Student[]
  schoolId: string
}

export function StudentTable({ students, schoolId }: StudentTableProps) {
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <Badge variant="default">Active</Badge>
      case 'archived':
        return <Badge variant="secondary">Archived</Badge>
      case 'read_only':
        return <Badge variant="outline">Read Only</Badge>
      default:
        return <Badge>{status}</Badge>
    }
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Student Number</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Date of Birth</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {students.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="text-center text-muted-foreground">
                No students found
              </TableCell>
            </TableRow>
          ) : (
            students.map((student) => (
              <TableRow key={student.id}>
                <TableCell className="font-medium">
                  {student.firstName} {student.lastName}
                </TableCell>
                <TableCell>{student.studentNumber || '-'}</TableCell>
                <TableCell>{student.email || '-'}</TableCell>
                <TableCell>
                  {student.dateOfBirth
                    ? new Date(student.dateOfBirth).toLocaleDateString()
                    : '-'}
                </TableCell>
                <TableCell>{getStatusBadge(student.status)}</TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="sm" asChild>
                    <Link href={`/students/${student.id}`}>
                      <Pencil className="h-4 w-4 mr-2" />
                      View
                    </Link>
                  </Button>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  )
}

