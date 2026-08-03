import { isOpenSignupAllowed } from '@openschool/config/server'
import { BookOpen } from 'lucide-react'
import Link from 'next/link'
import { OpenSignupForm } from './signup-form'

export default function SignupPage() {
  if (isOpenSignupAllowed()) return <OpenSignupForm />

  return (
    <main className="min-h-screen bg-surface-secondary flex items-center justify-center px-4 py-12">
      <section className="w-full max-w-md rounded-2xl border border-border-default bg-surface-primary p-8 text-center shadow-sm">
        <Link
          href="/"
          className="mb-8 inline-flex items-center gap-2 rounded-md focus-visible:outline-2 focus-visible:outline-offset-4"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand">
            <BookOpen aria-hidden="true" className="h-5 w-5 text-white" />
          </span>
          <span className="text-lg font-bold tracking-tight text-text-primary">OpenSchool</span>
        </Link>
        <h1 className="text-2xl font-bold tracking-tight text-text-primary">
          An invitation is required
        </h1>
        <p className="mt-3 text-sm leading-6 text-text-secondary">
          Your school administrator creates your account and sends a secure sign-in link to your
          verified email address.
        </p>
        <Link
          href="/auth/login"
          className="mt-8 inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-hover focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          Sign in to an existing account
        </Link>
        <p className="mt-4 text-xs leading-5 text-text-muted">
          If you expected an invitation, ask your school administrator to resend it.
        </p>
      </section>
    </main>
  )
}
