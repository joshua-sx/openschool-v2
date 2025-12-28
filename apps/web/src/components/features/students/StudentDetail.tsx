'use client'

import { useState } from 'react'
import { trpc } from '@/lib/trpc/client'

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
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { StudentForm } from './StudentForm'
import { LoadingState } from './LoadingState'
import { ErrorState } from './ErrorState'
import { Pencil } from 'lucide-react'

interface StudentDetailProps {
  studentId: string
}

export function StudentDetail({ studentId }: StudentDetailProps) {
  const [editDialogOpen, setEditDialogOpen] = useState(false)

  const { data: student, isLoading, error, refetch } = trpc.students.getById.useQuery({
    studentId,
  })

  if (isLoading) {
    return <LoadingState />
  }

  if (error) {
    return (
      <ErrorState
        message={error.message || 'Failed to load student'}
        onRetry={() => refetch()}
      />
    )
  }

  if (!student) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Student Not Found</CardTitle>
          <CardDescription>The student you're looking for doesn't exist.</CardDescription>
        </CardHeader>
      </Card>
    )
  }

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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">
            {student.firstName} {student.lastName}
          </h1>
          <p className="text-muted-foreground mt-1">Student Profile</p>
        </div>
        <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Pencil className="h-4 w-4 mr-2" />
              Edit Student
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Student</DialogTitle>
              <DialogDescription>
                Update student information. All required fields must be filled.
              </DialogDescription>
            </DialogHeader>
            <StudentForm
              mode="edit"
              schoolId={student.schoolId}
              studentId={student.id}
              defaultValues={{
                firstName: student.firstName,
                lastName: student.lastName,
                dateOfBirth: student.dateOfBirth || null,
                studentNumber: student.studentNumber || null,
                email: student.email || null,
              }}
              onSuccess={() => {
                setEditDialogOpen(false)
                refetch()
              }}
              onCancel={() => setEditDialogOpen(false)}
            />
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Personal Information</CardTitle>
            <CardDescription>Basic student details</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm font-medium text-muted-foreground">First Name</p>
              <p className="text-base">{student.firstName}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Last Name</p>
              <p className="text-base">{student.lastName}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Date of Birth</p>
              <p className="text-base">
                {student.dateOfBirth
                  ? new Date(student.dateOfBirth).toLocaleDateString()
                  : '-'}
              </p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Status</p>
              <div className="mt-1">{getStatusBadge(student.status)}</div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Contact Information</CardTitle>
            <CardDescription>Email and student number</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Email</p>
              <p className="text-base">{student.email || '-'}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Student Number</p>
              <p className="text-base">{student.studentNumber || '-'}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>System Information</CardTitle>
            <CardDescription>Record metadata</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Student ID</p>
              <p className="text-base font-mono text-sm">{student.id}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">School ID</p>
              <p className="text-base font-mono text-sm">{student.schoolId}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Created</p>
              <p className="text-base">
                {student.createdAt ? new Date(student.createdAt).toLocaleString() : '-'}
              </p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Last Updated</p>
              <p className="text-base">
                {student.updatedAt ? new Date(student.updatedAt).toLocaleString() : '-'}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

