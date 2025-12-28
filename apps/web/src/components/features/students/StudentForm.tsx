'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { trpc } from '@/lib/trpc/client'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { DialogFooter } from '@/components/ui/dialog'
import { Loader2 } from 'lucide-react'

const createStudentSchema = z.object({
  schoolId: z.string().uuid(),
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  dateOfBirth: z.string().date().optional().nullable(),
  studentNumber: z.string().optional().nullable(),
  email: z.string().email('Invalid email address').optional().nullable(),
})

const updateStudentSchema = z.object({
  firstName: z.string().min(1, 'First name is required').optional(),
  lastName: z.string().min(1, 'Last name is required').optional(),
  dateOfBirth: z.string().date().optional().nullable(),
  studentNumber: z.string().optional().nullable(),
  email: z.string().email('Invalid email address').optional().nullable(),
})

type CreateStudentFormData = z.infer<typeof createStudentSchema>
type UpdateStudentFormData = z.infer<typeof updateStudentSchema>

interface StudentFormProps {
  mode: 'create' | 'edit'
  schoolId: string
  studentId?: string
  defaultValues?: Partial<CreateStudentFormData>
  onSuccess?: () => void
  onCancel?: () => void
}

export function StudentForm({
  mode,
  schoolId,
  studentId,
  defaultValues,
  onSuccess,
  onCancel,
}: StudentFormProps) {
  const utils = trpc.useUtils()
  const createMutation = trpc.students.create.useMutation({
    onSuccess: () => {
      utils.students.getBySchool.invalidate({ schoolId })
      onSuccess?.()
    },
  })
  const updateMutation = trpc.students.update.useMutation({
    onSuccess: () => {
      if (studentId) {
        utils.students.getById.invalidate({ studentId })
      }
      utils.students.getBySchool.invalidate({ schoolId })
      onSuccess?.()
    },
  })

  const form = useForm<CreateStudentFormData | UpdateStudentFormData>({
    resolver: zodResolver(mode === 'create' ? createStudentSchema : updateStudentSchema),
    defaultValues: mode === 'create'
      ? { schoolId, ...defaultValues }
      : (defaultValues as UpdateStudentFormData),
  })

  const isLoading = createMutation.isPending || updateMutation.isPending

  const onSubmit = async (data: CreateStudentFormData | UpdateStudentFormData) => {
    try {
      if (mode === 'create') {
        await createMutation.mutateAsync(data as CreateStudentFormData)
      } else if (studentId) {
        await updateMutation.mutateAsync({
          studentId,
          ...(data as UpdateStudentFormData),
        })
      }
    } catch (error) {
      // Error is handled by tRPC and will be available in mutation.error
      console.error('Form submission error:', error)
    }
  }

  const error = createMutation.error || updateMutation.error

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        {mode === 'create' && (
          <FormField
            control={form.control}
            name="schoolId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>School ID</FormLabel>
                <FormControl>
                  <Input {...field} disabled />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="firstName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>First Name *</FormLabel>
                <FormControl>
                  <Input {...field} placeholder="John" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="lastName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Last Name *</FormLabel>
                <FormControl>
                  <Input {...field} placeholder="Doe" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="dateOfBirth"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Date of Birth</FormLabel>
              <FormControl>
                <Input
                  type="date"
                  {...field}
                  value={field.value || ''}
                  onChange={(e) => field.onChange(e.target.value || null)}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="studentNumber"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Student Number</FormLabel>
              <FormControl>
                <Input {...field} value={field.value || ''} placeholder="STU-001" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input
                  type="email"
                  {...field}
                  value={field.value || ''}
                  placeholder="john.doe@example.com"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {error && (
          <div className="rounded-md bg-destructive/15 p-3 text-sm text-destructive">
            {error.message || 'An error occurred. Please try again.'}
          </div>
        )}

        <DialogFooter>
          {onCancel && (
            <Button type="button" variant="outline" onClick={onCancel} disabled={isLoading}>
              Cancel
            </Button>
          )}
          <Button type="submit" disabled={isLoading}>
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {mode === 'create' ? 'Create Student' : 'Update Student'}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  )
}

