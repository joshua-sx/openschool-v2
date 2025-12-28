'use client'

import { useState } from 'react'
import { trpc } from '@/lib/trpc/client'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { StudentTable } from './StudentTable'
import { StudentForm } from './StudentForm'
import { LoadingState } from './LoadingState'
import { ErrorState } from './ErrorState'
import { EmptyState } from './EmptyState'
import { Plus } from 'lucide-react'

interface StudentListProps {
  schoolId: string
}

export function StudentList({ schoolId }: StudentListProps) {
  const [createDialogOpen, setCreateDialogOpen] = useState(false)

  const { data: students, isLoading, error, refetch } = trpc.students.getBySchool.useQuery({
    schoolId,
  })

  if (isLoading) {
    return <LoadingState />
  }

  if (error) {
    return (
      <ErrorState
        message={error.message || 'Failed to load students'}
        onRetry={() => refetch()}
      />
    )
  }

  if (!students || students.length === 0) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold">Students</h2>
          <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Add Student
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create New Student</DialogTitle>
                <DialogDescription>
                  Add a new student to this school. All required fields must be filled.
                </DialogDescription>
              </DialogHeader>
              <StudentForm
                mode="create"
                schoolId={schoolId}
                onSuccess={() => setCreateDialogOpen(false)}
                onCancel={() => setCreateDialogOpen(false)}
              />
            </DialogContent>
          </Dialog>
        </div>
        <EmptyState />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Students ({students.length})</h2>
        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Add Student
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Student</DialogTitle>
              <DialogDescription>
                Add a new student to this school. All required fields must be filled.
              </DialogDescription>
            </DialogHeader>
            <StudentForm
              mode="create"
              schoolId={schoolId}
              onSuccess={() => setCreateDialogOpen(false)}
              onCancel={() => setCreateDialogOpen(false)}
            />
          </DialogContent>
        </Dialog>
      </div>
      <StudentTable students={students} schoolId={schoolId} />
    </div>
  )
}

