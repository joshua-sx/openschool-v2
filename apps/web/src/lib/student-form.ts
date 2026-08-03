export interface StudentFormData {
  schoolId: string
  firstName: string
  lastName: string
  dateOfBirth: string
  studentNumber: string
  email: string
}

export type StudentFormField = keyof StudentFormData
export type StudentFormErrors = Partial<Record<StudentFormField, string>>

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const FIELD_ORDER: readonly StudentFormField[] = [
  'schoolId',
  'firstName',
  'lastName',
  'studentNumber',
  'dateOfBirth',
  'email',
]

function dateOnlyIsValid(value: string): boolean {
  if (!DATE_ONLY_PATTERN.test(value)) return false
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

export function validateStudentForm(
  data: StudentFormData,
  options: { requireSchool: boolean }
): StudentFormErrors {
  const errors: StudentFormErrors = {}
  const firstName = data.firstName.normalize('NFKC').trim()
  const lastName = data.lastName.normalize('NFKC').trim()
  const email = data.email.normalize('NFKC').trim()
  if (options.requireSchool && !data.schoolId) errors.schoolId = 'Choose a school'
  if (!firstName) errors.firstName = 'Enter a first name'
  else if (firstName.length > 100) errors.firstName = 'Use 100 characters or fewer'
  if (!lastName) errors.lastName = 'Enter a last name'
  else if (lastName.length > 100) errors.lastName = 'Use 100 characters or fewer'
  if (data.studentNumber.normalize('NFKC').trim().length > 64) {
    errors.studentNumber = 'Use 64 characters or fewer'
  }
  if (data.dateOfBirth) {
    if (!dateOnlyIsValid(data.dateOfBirth)) {
      errors.dateOfBirth = 'Enter a valid date'
    } else if (data.dateOfBirth > new Date().toISOString().slice(0, 10)) {
      errors.dateOfBirth = 'Date of birth cannot be in the future'
    }
  }
  if (email && !EMAIL_PATTERN.test(email)) errors.email = 'Enter a valid email address'
  else if (email.length > 320) errors.email = 'Use 320 characters or fewer'
  return errors
}

export function firstStudentFormError(errors: StudentFormErrors): StudentFormField | null {
  return FIELD_ORDER.find((field) => errors[field]) ?? null
}
