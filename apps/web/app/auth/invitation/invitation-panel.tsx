'use client'

import { trpc } from '@/lib/trpc/client'
import { BookOpen, CheckCircle2, LoaderCircle, ShieldAlert } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'

type PanelState = 'loading' | 'success' | 'error' | 'missing'

export function InvitationPanel() {
  const [state, setState] = useState<PanelState>('loading')
  const [token, setToken] = useState<string | null>(null)
  const startedForToken = useRef<string | null>(null)
  const acceptance = trpc.invitations.accept.useMutation({
    onSuccess: () => {
      setState('success')
    },
    onError: () => setState('error'),
  })

  useEffect(() => {
    const url = new URL(window.location.href)
    const tokenFromFragment = new URLSearchParams(url.hash.slice(1)).get('invitation_token')
    if (tokenFromFragment) {
      window.history.replaceState({}, '', `${url.pathname}${url.search}`)
    }
    let active = true
    queueMicrotask(() => {
      if (!active) return
      setToken(tokenFromFragment)
      if (!tokenFromFragment) setState('missing')
    })
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (!token || startedForToken.current === token) return
    startedForToken.current = token
    acceptance.mutate({ token })
  }, [acceptance, token])

  const retry = () => {
    if (!token || acceptance.isPending) return
    setState('loading')
    acceptance.mutate({ token })
  }

  return (
    <main className="min-h-screen bg-surface-secondary flex items-center justify-center px-4 py-12">
      <section
        aria-busy={state === 'loading'}
        className="w-full max-w-md rounded-2xl border border-border-default bg-surface-primary p-8 text-center shadow-sm"
      >
        <Link
          href="/"
          className="mb-8 inline-flex items-center gap-2 rounded-md focus-visible:outline-2 focus-visible:outline-offset-4"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand">
            <BookOpen aria-hidden="true" className="h-5 w-5 text-white" />
          </span>
          <span className="text-lg font-bold tracking-tight text-text-primary">OpenSchool</span>
        </Link>

        {state === 'loading' ? (
          <output aria-live="polite" className="block">
            <LoaderCircle
              aria-hidden="true"
              className="mx-auto h-10 w-10 animate-spin text-text-secondary motion-reduce:animate-none"
            />
            <h1 className="mt-5 text-2xl font-bold tracking-tight text-text-primary">
              Setting up your account
            </h1>
            <p className="mt-3 text-sm leading-6 text-text-secondary">
              We’re verifying the invitation and applying the access approved by your school.
            </p>
          </output>
        ) : null}

        {state === 'success' ? (
          <output aria-live="polite" className="block">
            <CheckCircle2 aria-hidden="true" className="mx-auto h-10 w-10 text-emerald-600" />
            <h1 className="mt-5 text-2xl font-bold tracking-tight text-text-primary">
              Your account is ready
            </h1>
            <p className="mt-3 text-sm leading-6 text-text-secondary">
              Your school access has been activated. You can now continue to OpenSchool.
            </p>
            <a
              href="/dashboard"
              className="mt-8 inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-hover focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              Continue to dashboard
            </a>
          </output>
        ) : null}

        {state === 'error' || state === 'missing' ? (
          <div role="alert">
            <ShieldAlert aria-hidden="true" className="mx-auto h-10 w-10 text-amber-600" />
            <h1 className="mt-5 text-2xl font-bold tracking-tight text-text-primary">
              We couldn’t use this invitation
            </h1>
            <p className="mt-3 text-sm leading-6 text-text-secondary">
              The link may be expired, cancelled, already used, or intended for a different
              signed-in account. Ask your school administrator to send a new invitation.
            </p>
            {state === 'error' && token ? (
              <button
                type="button"
                onClick={retry}
                disabled={acceptance.isPending}
                className="mt-8 inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-border-dark px-4 py-2.5 text-sm font-semibold text-text-primary hover:bg-surface-secondary focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                Try again
              </button>
            ) : null}
            <Link
              href="/auth/login"
              className="mt-4 inline-flex min-h-11 items-center justify-center rounded-md px-3 text-sm font-medium text-text-secondary underline-offset-4 hover:text-text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              Sign in with another account
            </Link>
          </div>
        ) : null}
      </section>
    </main>
  )
}
