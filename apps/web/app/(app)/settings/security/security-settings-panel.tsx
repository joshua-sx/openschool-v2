'use client'

import { createBrowserClient } from '@openschool/auth'
import { CheckCircle2, KeyRound, LoaderCircle, ShieldCheck, ShieldOff } from 'lucide-react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react'

interface TotpFactor {
  id: string
  friendlyName: string
  createdAt: string
}

interface TotpEnrollment {
  factorId: string
  qrCode: string
  secret: string
}

type ReauthenticationStep = 'password' | 'totp'

function messageFor(error: unknown, fallback: string): string {
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message = String((error as { message: unknown }).message)
    if (/invalid login credentials/i.test(message))
      return 'Enter your current password and try again.'
    if (/invalid.*code|challenge/i.test(message)) {
      return 'Enter the current six-digit code from your authenticator app.'
    }
  }
  return fallback
}

function formatEnrollmentDate(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? 'Enrollment date unavailable'
    : `Added ${new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(date)}`
}

export function SecuritySettingsPanel() {
  const router = useRouter()
  const [supabase] = useState(() => createBrowserClient())
  const [factors, setFactors] = useState<readonly TotpFactor[]>([])
  const [assuranceLevel, setAssuranceLevel] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [busyAction, setBusyAction] = useState<string | null>(null)
  const [enrollment, setEnrollment] = useState<TotpEnrollment | null>(null)
  const [enrollmentCode, setEnrollmentCode] = useState('')
  const [enrollmentError, setEnrollmentError] = useState<string | null>(null)
  const [removingFactorId, setRemovingFactorId] = useState<string | null>(null)
  const [password, setPassword] = useState('')
  const [reauthenticationCode, setReauthenticationCode] = useState('')
  const [reauthenticationStep, setReauthenticationStep] = useState<ReauthenticationStep>('password')
  const [reauthenticationFactorId, setReauthenticationFactorId] = useState<string | null>(null)
  const [reauthenticationError, setReauthenticationError] = useState<string | null>(null)
  const [statusMessage, setStatusMessage] = useState('')
  const enrollmentCodeRef = useRef<HTMLInputElement>(null)
  const passwordRef = useRef<HTMLInputElement>(null)
  const reauthenticationCodeRef = useRef<HTMLInputElement>(null)
  const removeConfirmationRef = useRef<HTMLButtonElement>(null)
  const removeTriggerRefs = useRef(new Map<string, HTMLButtonElement>())

  const loadSecurityState = useCallback(async () => {
    const [listed, assurance] = await Promise.all([
      supabase.auth.mfa.listFactors(),
      supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
    ])
    if (listed.error) throw listed.error
    if (assurance.error) throw assurance.error
    setFactors(
      (listed.data?.totp ?? []).map((factor) => ({
        id: factor.id,
        friendlyName: factor.friendly_name?.trim() || 'Authenticator app',
        createdAt: factor.created_at,
      }))
    )
    setAssuranceLevel(assurance.data?.currentLevel ?? null)
  }, [supabase])

  useEffect(() => {
    let active = true
    queueMicrotask(() => {
      loadSecurityState()
        .catch(() => {
          if (active) {
            setStatusMessage('Unable to load security settings. Refresh the page to try again.')
          }
        })
        .finally(() => {
          if (active) setLoading(false)
        })
    })
    return () => {
      active = false
    }
  }, [loadSecurityState])

  useEffect(() => {
    if (enrollment) enrollmentCodeRef.current?.focus()
  }, [enrollment])

  useEffect(() => {
    if (reauthenticationStep === 'totp') reauthenticationCodeRef.current?.focus()
  }, [reauthenticationStep])

  useEffect(() => {
    if (removingFactorId) removeConfirmationRef.current?.focus()
  }, [removingFactorId])

  const beginEnrollment = async () => {
    setEnrollmentError(null)
    setStatusMessage('')
    setBusyAction('enroll')
    try {
      const result = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: 'OpenSchool authenticator',
      })
      if (result.error) throw result.error
      if (!result.data || result.data.type !== 'totp')
        throw new Error('TOTP enrollment unavailable')
      setEnrollment({
        factorId: result.data.id,
        qrCode: result.data.totp.qr_code,
        secret: result.data.totp.secret,
      })
      setEnrollmentCode('')
    } catch (error) {
      setEnrollmentError(messageFor(error, 'Unable to start enrollment. Try again.'))
    } finally {
      setBusyAction(null)
    }
  }

  const cancelEnrollment = async () => {
    if (!enrollment) return
    setBusyAction('cancel-enrollment')
    try {
      const result = await supabase.auth.mfa.unenroll({ factorId: enrollment.factorId })
      if (result.error) throw result.error
      setEnrollment(null)
      setEnrollmentCode('')
      setEnrollmentError(null)
      setStatusMessage('Authenticator enrollment cancelled.')
    } catch (error) {
      setEnrollmentError(messageFor(error, 'Unable to cancel enrollment. Try again.'))
    } finally {
      setBusyAction(null)
    }
  }

  const verifyEnrollment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!enrollment) return
    if (!/^\d{6}$/.test(enrollmentCode)) {
      setEnrollmentError('Enter the six-digit code from your authenticator app.')
      enrollmentCodeRef.current?.focus()
      return
    }
    setEnrollmentError(null)
    setBusyAction('verify-enrollment')
    try {
      const result = await supabase.auth.mfa.challengeAndVerify({
        factorId: enrollment.factorId,
        code: enrollmentCode,
      })
      if (result.error) throw result.error
      setEnrollment(null)
      setEnrollmentCode('')
      await loadSecurityState()
      setStatusMessage('Authenticator app added. This session now has stronger verification.')
      router.refresh()
    } catch (error) {
      setEnrollmentError(
        messageFor(error, 'Unable to verify this code. Enter a new code and try again.')
      )
      enrollmentCodeRef.current?.focus()
    } finally {
      setBusyAction(null)
    }
  }

  const removeFactor = async (factorId: string) => {
    setBusyAction(`remove:${factorId}`)
    setStatusMessage('')
    try {
      const result = await supabase.auth.mfa.unenroll({ factorId })
      if (result.error) throw result.error
      setRemovingFactorId(null)
      await loadSecurityState()
      setStatusMessage('Authenticator removed. Administrative changes will require MFA enrollment.')
      router.refresh()
    } catch (error) {
      setStatusMessage(messageFor(error, 'Unable to remove this authenticator. Try again.'))
    } finally {
      setBusyAction(null)
    }
  }

  const verifyPassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!password) {
      setReauthenticationError('Enter your current password.')
      passwordRef.current?.focus()
      return
    }
    setReauthenticationError(null)
    setStatusMessage('')
    setBusyAction('verify-password')
    const submittedPassword = password
    setPassword('')
    try {
      const userResult = await supabase.auth.getUser()
      const email = userResult.data.user?.email
      if (userResult.error || !email) throw userResult.error ?? new Error('Email unavailable')
      const signedIn = await supabase.auth.signInWithPassword({
        email,
        password: submittedPassword,
      })
      if (signedIn.error) throw signedIn.error
      const listed = await supabase.auth.mfa.listFactors()
      if (listed.error) throw listed.error
      const factor = listed.data?.totp[0]
      if (factor) {
        setReauthenticationFactorId(factor.id)
        setReauthenticationStep('totp')
        setReauthenticationCode('')
      } else {
        await loadSecurityState()
        setStatusMessage(
          'Password verified. Add an authenticator to approve administrative changes.'
        )
        router.refresh()
      }
    } catch (error) {
      setReauthenticationError(messageFor(error, 'Unable to verify your password. Try again.'))
      passwordRef.current?.focus()
    } finally {
      setBusyAction(null)
    }
  }

  const verifyReauthenticationCode = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!reauthenticationFactorId) return
    if (!/^\d{6}$/.test(reauthenticationCode)) {
      setReauthenticationError('Enter the current six-digit code from your authenticator app.')
      reauthenticationCodeRef.current?.focus()
      return
    }
    setReauthenticationError(null)
    setBusyAction('verify-reauthentication')
    try {
      const result = await supabase.auth.mfa.challengeAndVerify({
        factorId: reauthenticationFactorId,
        code: reauthenticationCode,
      })
      if (result.error) throw result.error
      setReauthenticationStep('password')
      setReauthenticationFactorId(null)
      setReauthenticationCode('')
      await loadSecurityState()
      setStatusMessage('Security verification refreshed for the next 15 minutes.')
      router.refresh()
    } catch (error) {
      setReauthenticationError(
        messageFor(error, 'Unable to verify this code. Enter a new code and try again.')
      )
      reauthenticationCodeRef.current?.focus()
    } finally {
      setBusyAction(null)
    }
  }

  if (loading) {
    return (
      <output className="flex min-h-48 items-center justify-center text-sm text-gray-600">
        <LoaderCircle
          aria-hidden="true"
          className="mr-2 h-5 w-5 animate-spin motion-reduce:animate-none"
        />
        Loading security settings
      </output>
    )
  }

  return (
    <div className="mx-auto w-full max-w-3xl">
      <div className="mb-8">
        <p className="text-sm font-medium text-gray-600">Settings</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-gray-950">Account security</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-600">
          Administrative changes require an authenticator and a password verified within the last 15
          minutes.
        </p>
      </div>

      <output aria-live="polite" className="mb-4 block min-h-6 text-sm text-gray-700">
        {statusMessage}
      </output>

      <div className="space-y-6">
        <section
          aria-labelledby="mfa-heading"
          className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm"
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2
                id="mfa-heading"
                className="flex items-center text-lg font-semibold text-gray-950"
              >
                <ShieldCheck aria-hidden="true" className="mr-2 h-5 w-5" />
                Authenticator app
              </h2>
              <p className="mt-2 text-sm leading-6 text-gray-600">
                Use a time-based one-time code in addition to your password.
              </p>
            </div>
            <span className="inline-flex shrink-0 items-center rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700">
              {factors.length > 0 ? 'Enrolled' : 'Not enrolled'}
            </span>
          </div>

          {factors.length > 0 ? (
            <ul className="mt-5 divide-y divide-gray-200 rounded-lg border border-gray-200">
              {factors.map((factor) => (
                <li
                  key={factor.id}
                  className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="text-sm font-medium text-gray-950">{factor.friendlyName}</p>
                    <p className="mt-1 text-xs text-gray-600">
                      {formatEnrollmentDate(factor.createdAt)}
                    </p>
                  </div>
                  {removingFactorId === factor.id ? (
                    <fieldset className="sm:max-w-sm">
                      <legend className="sr-only">Remove {factor.friendlyName}</legend>
                      <p className="mb-2 text-sm leading-5 text-gray-700">
                        Removing this authenticator may sign you out and blocks administrative
                        changes until you enroll another one.
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <button
                          ref={removeConfirmationRef}
                          type="button"
                          onClick={() => removeFactor(factor.id)}
                          disabled={busyAction !== null}
                          className="min-h-10 rounded-lg bg-red-700 px-3 py-2 text-sm font-medium text-white hover:bg-red-800 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-wait disabled:opacity-60"
                        >
                          Remove authenticator
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const trigger = removeTriggerRefs.current.get(factor.id)
                            setRemovingFactorId(null)
                            queueMicrotask(() => trigger?.focus())
                          }}
                          disabled={busyAction !== null}
                          className="min-h-10 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-wait disabled:opacity-60"
                        >
                          Keep authenticator
                        </button>
                      </div>
                    </fieldset>
                  ) : (
                    <button
                      ref={(node) => {
                        if (node) removeTriggerRefs.current.set(factor.id, node)
                        else removeTriggerRefs.current.delete(factor.id)
                      }}
                      type="button"
                      onClick={() => setRemovingFactorId(factor.id)}
                      className="min-h-10 self-start rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-offset-2 sm:self-auto"
                    >
                      Remove
                    </button>
                  )}
                </li>
              ))}
            </ul>
          ) : null}

          {enrollment ? (
            <div className="mt-6 rounded-xl bg-gray-50 p-5">
              <h3 className="text-base font-semibold text-gray-950">
                Add OpenSchool to your authenticator
              </h3>
              <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-6 text-gray-700">
                <li>Scan this QR code with your authenticator app.</li>
                <li>Enter the six-digit code shown by the app.</li>
              </ol>
              <Image
                src={enrollment.qrCode}
                alt="QR code for this OpenSchool authenticator enrollment"
                width={192}
                height={192}
                unoptimized
                className="mt-5 rounded-lg border border-gray-200 bg-white p-2"
              />
              <details className="mt-4 text-sm text-gray-700">
                <summary className="min-h-10 cursor-pointer py-2 font-medium focus-visible:outline-2 focus-visible:outline-offset-2">
                  Enter the setup key instead
                </summary>
                <p className="mt-2 break-all rounded-lg border border-gray-200 bg-white p-3 font-mono text-xs">
                  {enrollment.secret}
                </p>
              </details>
              <form onSubmit={verifyEnrollment} className="mt-5 max-w-sm" noValidate>
                <label
                  htmlFor="enrollment-code"
                  className="block text-sm font-medium text-gray-900"
                >
                  Six-digit code
                </label>
                <input
                  ref={enrollmentCodeRef}
                  id="enrollment-code"
                  name="enrollmentCode"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  value={enrollmentCode}
                  onChange={(event) =>
                    setEnrollmentCode(event.target.value.replace(/\D/g, '').slice(0, 6))
                  }
                  aria-invalid={enrollmentError ? 'true' : undefined}
                  aria-describedby={enrollmentError ? 'enrollment-error' : undefined}
                  className="mt-2 block min-h-11 w-full rounded-lg border border-gray-300 px-3 text-base tracking-[0.3em] text-gray-950 focus-visible:outline-2 focus-visible:outline-offset-2"
                />
                {enrollmentError ? (
                  <p id="enrollment-error" className="mt-2 text-sm text-red-700">
                    {enrollmentError}
                  </p>
                ) : null}
                <div className="mt-4 flex flex-wrap gap-3">
                  <button
                    type="submit"
                    disabled={busyAction !== null}
                    className="min-h-11 rounded-lg bg-gray-950 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-wait disabled:opacity-60"
                  >
                    Verify and add authenticator
                  </button>
                  <button
                    type="button"
                    onClick={cancelEnrollment}
                    disabled={busyAction !== null}
                    className="min-h-11 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-800 hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-wait disabled:opacity-60"
                  >
                    Cancel enrollment
                  </button>
                </div>
              </form>
            </div>
          ) : (
            <button
              type="button"
              onClick={beginEnrollment}
              disabled={busyAction !== null}
              className="mt-5 min-h-11 rounded-lg bg-gray-950 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-wait disabled:opacity-60"
            >
              Add authenticator
            </button>
          )}
        </section>

        <section
          aria-labelledby="reauthentication-heading"
          className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm"
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2
                id="reauthentication-heading"
                className="flex items-center text-lg font-semibold text-gray-950"
              >
                <KeyRound aria-hidden="true" className="mr-2 h-5 w-5" />
                Refresh security verification
              </h2>
              <p className="mt-2 text-sm leading-6 text-gray-600">
                Verify your password and authenticator before changing accounts, roles, or sessions.
              </p>
            </div>
            <span className="inline-flex shrink-0 items-center rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700">
              {assuranceLevel === 'aal2' ? (
                <>
                  <CheckCircle2 aria-hidden="true" className="mr-1 h-3.5 w-3.5" />
                  MFA verified
                </>
              ) : (
                <>
                  <ShieldOff aria-hidden="true" className="mr-1 h-3.5 w-3.5" />
                  Verification needed
                </>
              )}
            </span>
          </div>

          {reauthenticationStep === 'password' ? (
            <form onSubmit={verifyPassword} className="mt-5 max-w-sm" noValidate>
              <label htmlFor="current-password" className="block text-sm font-medium text-gray-900">
                Current password
              </label>
              <input
                ref={passwordRef}
                id="current-password"
                name="currentPassword"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                aria-invalid={reauthenticationError ? 'true' : undefined}
                aria-describedby={reauthenticationError ? 'reauthentication-error' : undefined}
                className="mt-2 block min-h-11 w-full rounded-lg border border-gray-300 px-3 text-base text-gray-950 focus-visible:outline-2 focus-visible:outline-offset-2"
              />
              {reauthenticationError ? (
                <p id="reauthentication-error" className="mt-2 text-sm text-red-700">
                  {reauthenticationError}
                </p>
              ) : null}
              <button
                type="submit"
                disabled={busyAction !== null}
                className="mt-4 min-h-11 rounded-lg bg-gray-950 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-wait disabled:opacity-60"
              >
                Verify password
              </button>
            </form>
          ) : (
            <form onSubmit={verifyReauthenticationCode} className="mt-5 max-w-sm" noValidate>
              <label
                htmlFor="reauthentication-code"
                className="block text-sm font-medium text-gray-900"
              >
                Authenticator code
              </label>
              <input
                ref={reauthenticationCodeRef}
                id="reauthentication-code"
                name="reauthenticationCode"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                maxLength={6}
                value={reauthenticationCode}
                onChange={(event) =>
                  setReauthenticationCode(event.target.value.replace(/\D/g, '').slice(0, 6))
                }
                aria-invalid={reauthenticationError ? 'true' : undefined}
                aria-describedby={reauthenticationError ? 'reauthentication-error' : undefined}
                className="mt-2 block min-h-11 w-full rounded-lg border border-gray-300 px-3 text-base tracking-[0.3em] text-gray-950 focus-visible:outline-2 focus-visible:outline-offset-2"
              />
              {reauthenticationError ? (
                <p id="reauthentication-error" className="mt-2 text-sm text-red-700">
                  {reauthenticationError}
                </p>
              ) : null}
              <button
                type="submit"
                disabled={busyAction !== null}
                className="mt-4 min-h-11 rounded-lg bg-gray-950 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-wait disabled:opacity-60"
              >
                Verify authenticator
              </button>
            </form>
          )}
        </section>
      </div>
    </div>
  )
}
