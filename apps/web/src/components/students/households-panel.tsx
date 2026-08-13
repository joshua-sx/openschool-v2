'use client'

import { trpc } from '@/lib/trpc/client'
import {
  AlertCircle,
  Check,
  Home,
  LoaderCircle,
  MapPin,
  Pencil,
  Plus,
  Users,
  X,
} from 'lucide-react'
import { useRef, useState } from 'react'

const INPUT_CLASS =
  'mt-1 block min-h-11 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-950 focus:border-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900/15'
const BUTTON_CLASS =
  'inline-flex min-h-11 items-center justify-center rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2 disabled:opacity-50'
const PRIMARY_BUTTON_CLASS =
  'inline-flex min-h-11 items-center justify-center rounded-lg bg-gray-950 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2 disabled:opacity-50'

type AddressType = 'residential' | 'mailing' | 'temporary' | 'other'
type MembershipKind = 'resident' | 'associated'
type PanelAction =
  | { kind: 'create' }
  | { kind: 'member'; householdId: string }
  | { kind: 'preferences'; membershipId: string; version: number; validFrom: string }
  | { kind: 'end'; membershipId: string; version: number; validFrom: string }
  | { kind: 'address'; householdId: string }
  | {
      kind: 'edit-address'
      address: {
        id: string
        version: number
        addressType: AddressType
        label: string | null
        line1: string
        line2: string | null
        locality: string
        administrativeArea: string | null
        postalCode: string | null
        countryCode: string
        deliveryInstructions: string | null
        isPrimary: boolean
        validFrom: string
      }
    }

function todayLocal(): string {
  const now = new Date()
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10)
}

function nextEffectiveDate(validFrom: string): string {
  const next = new Date(validFrom)
  next.setDate(next.getDate() + 1)
  const nextLocal = new Date(next.getTime() - next.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 10)
  return nextLocal > todayLocal() ? nextLocal : todayLocal()
}

function effectiveAt(form: FormData): Date {
  return new Date(`${String(form.get('effectiveDate'))}T12:00:00`)
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'The household record could not be saved.'
}

function AddressFields({
  defaults,
  showPrimary = true,
}: {
  defaults?: Partial<{
    addressType: AddressType
    label: string | null
    line1: string
    line2: string | null
    locality: string
    administrativeArea: string | null
    postalCode: string | null
    countryCode: string
    deliveryInstructions: string | null
    isPrimary: boolean
  }>
  showPrimary?: boolean
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="text-sm font-medium text-gray-800">
        Address type
        <select
          name="addressType"
          defaultValue={defaults?.addressType ?? 'residential'}
          className={INPUT_CLASS}
        >
          <option value="residential">Residential</option>
          <option value="mailing">Mailing</option>
          <option value="temporary">Temporary</option>
          <option value="other">Other</option>
        </select>
      </label>
      <label className="text-sm font-medium text-gray-800">
        Label <span className="font-normal text-gray-500">(optional)</span>
        <input
          name="label"
          maxLength={80}
          defaultValue={defaults?.label ?? ''}
          className={INPUT_CLASS}
        />
      </label>
      <label className="text-sm font-medium text-gray-800 sm:col-span-2">
        Address line 1
        <input
          name="line1"
          required
          maxLength={200}
          defaultValue={defaults?.line1 ?? ''}
          autoComplete="address-line1"
          className={INPUT_CLASS}
        />
      </label>
      <label className="text-sm font-medium text-gray-800 sm:col-span-2">
        Address line 2 <span className="font-normal text-gray-500">(optional)</span>
        <input
          name="line2"
          maxLength={200}
          defaultValue={defaults?.line2 ?? ''}
          autoComplete="address-line2"
          className={INPUT_CLASS}
        />
      </label>
      <label className="text-sm font-medium text-gray-800">
        City or locality
        <input
          name="locality"
          required
          maxLength={120}
          defaultValue={defaults?.locality ?? ''}
          autoComplete="address-level2"
          className={INPUT_CLASS}
        />
      </label>
      <label className="text-sm font-medium text-gray-800">
        State, province, or region <span className="font-normal text-gray-500">(optional)</span>
        <input
          name="administrativeArea"
          maxLength={120}
          defaultValue={defaults?.administrativeArea ?? ''}
          autoComplete="address-level1"
          className={INPUT_CLASS}
        />
      </label>
      <label className="text-sm font-medium text-gray-800">
        Postal code <span className="font-normal text-gray-500">(optional)</span>
        <input
          name="postalCode"
          maxLength={32}
          defaultValue={defaults?.postalCode ?? ''}
          autoComplete="postal-code"
          className={INPUT_CLASS}
        />
      </label>
      <label className="text-sm font-medium text-gray-800">
        Country code
        <input
          name="countryCode"
          required
          minLength={2}
          maxLength={2}
          defaultValue={defaults?.countryCode ?? ''}
          placeholder="US"
          autoComplete="country"
          className={INPUT_CLASS}
        />
      </label>
      <label className="text-sm font-medium text-gray-800 sm:col-span-2">
        Delivery instructions <span className="font-normal text-gray-500">(optional)</span>
        <textarea
          name="deliveryInstructions"
          maxLength={500}
          rows={2}
          defaultValue={defaults?.deliveryInstructions ?? ''}
          className={INPUT_CLASS}
        />
      </label>
      {showPrimary && (
        <label className="flex min-h-11 items-center gap-3 text-sm text-gray-800 sm:col-span-2">
          <input name="isPrimary" type="checkbox" defaultChecked={defaults?.isPrimary ?? true} />
          Primary address for this household
        </label>
      )}
    </div>
  )
}

function addressInput(form: FormData) {
  const optional = (name: string) => String(form.get(name) ?? '').trim() || null
  return {
    addressType: String(form.get('addressType')) as AddressType,
    label: optional('label'),
    line1: String(form.get('line1')),
    line2: optional('line2'),
    locality: String(form.get('locality')),
    administrativeArea: optional('administrativeArea'),
    postalCode: optional('postalCode'),
    countryCode: String(form.get('countryCode')).toUpperCase(),
    deliveryInstructions: optional('deliveryInstructions'),
  }
}

function FormActions({
  pending,
  onCancel,
  label,
}: { pending: boolean; onCancel: () => void; label: string }) {
  return (
    <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
      <button type="button" onClick={onCancel} className={BUTTON_CLASS}>
        Cancel
      </button>
      <button type="submit" disabled={pending} className={PRIMARY_BUTTON_CLASS}>
        {pending && <LoaderCircle className="mr-2 size-4 animate-spin" aria-hidden="true" />}
        {label}
      </button>
    </div>
  )
}

export function HouseholdsPanel({ learnerId }: { learnerId: string }) {
  const [action, setAction] = useState<PanelAction | null>(null)
  const [search, setSearch] = useState('')
  const [selectedPersonId, setSelectedPersonId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const feedbackRef = useRef<HTMLDivElement>(null)
  const utils = trpc.useUtils()
  const households = trpc.households.getByLearner.useQuery({ learnerId }, { retry: false })
  const manageAccess = trpc.households.canManage.useQuery(undefined, { retry: false })
  const candidates = trpc.households.memberCandidates.useQuery(
    { learnerId, query: search },
    { enabled: action?.kind === 'member' && search.trim().length >= 2, retry: false }
  )
  const create = trpc.households.create.useMutation()
  const addMember = trpc.households.addMember.useMutation()
  const reviseMember = trpc.households.reviseMember.useMutation()
  const endMember = trpc.households.endMember.useMutation()
  const addAddress = trpc.households.addAddress.useMutation()
  const reviseAddress = trpc.households.reviseAddress.useMutation()
  const pending = [create, addMember, reviseMember, endMember, addAddress, reviseAddress].some(
    (mutation) => mutation.isPending
  )

  const finish = async (message: string) => {
    await utils.households.getByLearner.invalidate({ learnerId })
    setAction(null)
    setSearch('')
    setSelectedPersonId('')
    setError(null)
    setStatus(message)
    requestAnimationFrame(() => feedbackRef.current?.focus())
  }

  const fail = async (cause: unknown) => {
    setStatus(null)
    setError(errorMessage(cause))
    await utils.households.getByLearner.invalidate({ learnerId })
    requestAnimationFrame(() => feedbackRef.current?.focus())
  }

  const close = () => {
    setAction(null)
    setSearch('')
    setSelectedPersonId('')
    setError(null)
  }

  const submitCreate = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    try {
      await create.mutateAsync({
        learnerId,
        displayName: String(form.get('displayName')),
        address: addressInput(form),
        isPrimaryResidence: form.get('isPrimaryResidence') === 'on',
        isPrimaryMailing: form.get('isPrimaryMailing') === 'on',
        effectiveAt: effectiveAt(form),
        reason: String(form.get('reason')),
      })
      await finish('Household and residence recorded.')
    } catch (cause) {
      await fail(cause)
    }
  }

  const submitMember = async (event: React.FormEvent<HTMLFormElement>, householdId: string) => {
    event.preventDefault()
    if (!selectedPersonId) return
    const form = new FormData(event.currentTarget)
    try {
      await addMember.mutateAsync({
        learnerId,
        householdId,
        personId: selectedPersonId,
        membershipKind: String(form.get('membershipKind')) as MembershipKind,
        isPrimaryResidence: false,
        isPrimaryMailing: false,
        effectiveAt: effectiveAt(form),
        reason: String(form.get('reason')),
      })
      await finish('Learner linked to this household. No legal or portal authority was changed.')
    } catch (cause) {
      await fail(cause)
    }
  }

  const submitPreferences = async (
    event: React.FormEvent<HTMLFormElement>,
    current: Extract<PanelAction, { kind: 'preferences' }>
  ) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    try {
      await reviseMember.mutateAsync({
        learnerId,
        membershipId: current.membershipId,
        expectedVersion: current.version,
        membershipKind: String(form.get('membershipKind')) as MembershipKind,
        isPrimaryResidence: form.get('isPrimaryResidence') === 'on',
        isPrimaryMailing: form.get('isPrimaryMailing') === 'on',
        effectiveAt: effectiveAt(form),
        reason: String(form.get('reason')),
      })
      await finish('Residence and mailing preferences updated from the effective date.')
    } catch (cause) {
      await fail(cause)
    }
  }

  const submitEnd = async (
    event: React.FormEvent<HTMLFormElement>,
    current: Extract<PanelAction, { kind: 'end' }>
  ) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    try {
      await endMember.mutateAsync({
        learnerId,
        membershipId: current.membershipId,
        expectedVersion: current.version,
        effectiveAt: effectiveAt(form),
        reason: String(form.get('reason')),
      })
      await finish('Household membership ended. Its history remains on the learner record.')
    } catch (cause) {
      await fail(cause)
    }
  }

  const submitAddress = async (
    event: React.FormEvent<HTMLFormElement>,
    current: Extract<PanelAction, { kind: 'address' | 'edit-address' }>
  ) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const shared = {
      learnerId,
      ...addressInput(form),
      isPrimary: form.get('isPrimary') === 'on',
      effectiveAt: effectiveAt(form),
      reason: String(form.get('reason')),
    }
    try {
      if (current.kind === 'address') {
        await addAddress.mutateAsync({ ...shared, householdId: current.householdId })
        await finish('Address added to the household.')
      } else {
        await reviseAddress.mutateAsync({
          ...shared,
          addressId: current.address.id,
          expectedVersion: current.address.version,
        })
        await finish(
          'Address revised from the effective date. The prior version remains in history.'
        )
      }
    } catch (cause) {
      await fail(cause)
    }
  }

  return (
    <section className="mt-8 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-gray-200 bg-gray-50 px-5 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-6">
        <div>
          <h2 className="font-semibold text-gray-950">Households and residences</h2>
          <p className="mt-1 max-w-2xl text-sm text-gray-600">
            Record where the learner lives and receives mail. Household membership does not
            establish custody, guardianship, pickup permission, portal access, or an Account.
          </p>
        </div>
        {manageAccess.data === true && !action && (
          <button
            type="button"
            onClick={() => setAction({ kind: 'create' })}
            className={BUTTON_CLASS}
          >
            <Plus className="mr-2 size-4" aria-hidden="true" /> Add household
          </button>
        )}
      </div>

      <div
        ref={feedbackRef}
        tabIndex={-1}
        aria-live="polite"
        className={error || status ? 'px-5 pt-5 sm:px-6' : undefined}
      >
        {error && (
          <p
            role="alert"
            className="flex gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800"
          >
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {error}
          </p>
        )}
        {status && !error && (
          <p className="flex gap-2 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-900">
            <Check className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {status}
          </p>
        )}
      </div>

      {action?.kind === 'create' && (
        <form onSubmit={submitCreate} className="border-b border-gray-200 p-5 sm:p-6">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="font-semibold text-gray-950">Add a household</h3>
              <p className="mt-1 text-sm text-gray-600">
                Create the household, learner membership, and first address together.
              </p>
            </div>
            <button
              type="button"
              onClick={close}
              aria-label="Close add household form"
              className="rounded-md p-2 text-gray-500 hover:bg-gray-100"
            >
              <X className="size-5" aria-hidden="true" />
            </button>
          </div>
          <label className="mt-5 block text-sm font-medium text-gray-800">
            Household name
            <input
              name="displayName"
              required
              maxLength={160}
              placeholder="For example, Rivera household"
              className={INPUT_CLASS}
            />
          </label>
          <fieldset className="mt-5 border-t border-gray-200 pt-5">
            <legend className="text-sm font-semibold text-gray-950">First address</legend>
            <div className="mt-3">
              <AddressFields showPrimary={false} />
              <p className="mt-2 text-xs text-gray-500">
                The first address is the household’s primary address. Additional addresses can be
                added after creation.
              </p>
            </div>
          </fieldset>
          <fieldset className="mt-5 border-t border-gray-200 pt-5">
            <legend className="text-sm font-semibold text-gray-950">Learner preferences</legend>
            <div className="mt-3 grid gap-3">
              <label className="flex min-h-11 items-center gap-3 text-sm">
                <input name="isPrimaryResidence" type="checkbox" defaultChecked /> Primary residence
              </label>
              <label className="flex min-h-11 items-center gap-3 text-sm">
                <input name="isPrimaryMailing" type="checkbox" defaultChecked /> Primary mailing
                household
              </label>
            </div>
          </fieldset>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-medium text-gray-800">
              Effective date
              <input
                name="effectiveDate"
                type="date"
                required
                defaultValue={todayLocal()}
                className={INPUT_CLASS}
              />
            </label>
            <label className="text-sm font-medium text-gray-800">
              Reason for this record
              <input name="reason" required minLength={3} maxLength={512} className={INPUT_CLASS} />
            </label>
          </div>
          <FormActions pending={pending} onCancel={close} label="Add household" />
        </form>
      )}

      <div className="p-5 sm:p-6">
        {households.isLoading ? (
          <p className="flex items-center gap-2 text-sm text-gray-600">
            <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
            Loading households…
          </p>
        ) : households.error ? (
          <p role="alert" className="text-sm text-red-700">
            Households could not be loaded.
          </p>
        ) : households.data?.length === 0 ? (
          <div className="rounded-lg border border-dashed border-gray-300 p-6 text-center">
            <Home className="mx-auto size-8 text-gray-400" aria-hidden="true" />
            <p className="mt-2 text-sm font-medium text-gray-900">No household recorded</p>
            <p className="mt-1 text-sm text-gray-500">
              Add a residence and choose separate primary residence and mailing preferences.
            </p>
          </div>
        ) : (
          <div className="grid gap-5">
            {households.data?.map((household) => {
              const membership = household.membership
              return (
                <article
                  key={membership.id}
                  className={`rounded-xl border p-4 sm:p-5 ${membership.status === 'active' ? 'border-gray-200' : 'border-gray-200 bg-gray-50'}`}
                >
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold text-gray-950">{household.displayName}</h3>
                        {membership.isPrimaryResidence && (
                          <span className="rounded-full bg-blue-50 px-2 py-1 text-xs font-medium text-blue-800">
                            Primary residence
                          </span>
                        )}
                        {membership.isPrimaryMailing && (
                          <span className="rounded-full bg-violet-50 px-2 py-1 text-xs font-medium text-violet-800">
                            Primary mailing
                          </span>
                        )}
                        {membership.status === 'ended' && (
                          <span className="rounded-full bg-gray-200 px-2 py-1 text-xs font-medium text-gray-700">
                            Ended
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-sm text-gray-600">
                        {membership.kind === 'resident' ? 'Resident' : 'Associated person'} from{' '}
                        {new Date(membership.validFrom).toLocaleDateString()}
                        {membership.validUntil
                          ? ` to ${new Date(membership.validUntil).toLocaleDateString()}`
                          : ''}
                      </p>
                    </div>
                    {manageAccess.data === true && membership.status === 'active' && !action && (
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            setAction({
                              kind: 'preferences',
                              membershipId: membership.id,
                              version: membership.version,
                              validFrom: membership.validFrom,
                            })
                          }
                          className={BUTTON_CLASS}
                        >
                          <Pencil className="mr-2 size-4" aria-hidden="true" />
                          Preferences
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setAction({
                              kind: 'end',
                              membershipId: membership.id,
                              version: membership.version,
                              validFrom: membership.validFrom,
                            })
                          }
                          className={BUTTON_CLASS}
                        >
                          End membership
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="mt-5 grid gap-4 lg:grid-cols-2">
                    <div className="rounded-lg bg-gray-50 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <h4 className="flex items-center gap-2 text-sm font-semibold text-gray-950">
                          <MapPin className="size-4" aria-hidden="true" />
                          Addresses
                        </h4>
                        {manageAccess.data === true &&
                          membership.status === 'active' &&
                          !action && (
                            <button
                              type="button"
                              onClick={() =>
                                setAction({ kind: 'address', householdId: household.householdId })
                              }
                              className="text-sm font-medium text-gray-700 underline underline-offset-4"
                            >
                              Add address
                            </button>
                          )}
                      </div>
                      <div className="mt-3 grid gap-3">
                        {household.addresses.length === 0 ? (
                          <p className="text-sm text-gray-500">No visible addresses.</p>
                        ) : (
                          household.addresses.map((address) => (
                            <div
                              key={address.id}
                              className={address.status === 'active' ? '' : 'opacity-60'}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <p className="text-sm text-gray-800">
                                  <span className="font-medium">
                                    {address.label || address.addressType}
                                  </span>
                                  {address.isPrimary ? ' · Primary household address' : ''}
                                  <br />
                                  {address.line1}
                                  {address.line2 ? `, ${address.line2}` : ''}
                                  <br />
                                  {[
                                    address.locality,
                                    address.administrativeArea,
                                    address.postalCode,
                                    address.countryCode,
                                  ]
                                    .filter(Boolean)
                                    .join(', ')}
                                </p>
                                {manageAccess.data === true &&
                                  address.status === 'active' &&
                                  !action && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setAction({
                                          kind: 'edit-address',
                                          address: {
                                            ...address,
                                            addressType: address.addressType as AddressType,
                                          },
                                        })
                                      }
                                      className="text-sm font-medium text-gray-700 underline underline-offset-4"
                                    >
                                      Revise
                                    </button>
                                  )}
                              </div>
                              {address.deliveryInstructions && (
                                <p className="mt-1 text-xs text-gray-500">
                                  Delivery: {address.deliveryInstructions}
                                </p>
                              )}
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                    <div className="rounded-lg bg-gray-50 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <h4 className="flex items-center gap-2 text-sm font-semibold text-gray-950">
                          <Users className="size-4" aria-hidden="true" />
                          Current members
                        </h4>
                        {manageAccess.data === true &&
                          membership.status === 'active' &&
                          !action && (
                            <button
                              type="button"
                              onClick={() =>
                                setAction({ kind: 'member', householdId: household.householdId })
                              }
                              className="text-sm font-medium text-gray-700 underline underline-offset-4"
                            >
                              Link learner
                            </button>
                          )}
                      </div>
                      <ul className="mt-3 grid gap-2 text-sm text-gray-800">
                        {household.currentMembers.map((member) => (
                          <li key={member.membershipId}>
                            {member.displayName}
                            {member.isLearner ? ' · This learner' : ''}
                            <span className="text-gray-500"> · {member.kind}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  {action?.kind === 'member' && action.householdId === household.householdId && (
                    <form
                      onSubmit={(event) => submitMember(event, household.householdId)}
                      className="mt-5 rounded-lg border border-gray-200 p-4"
                    >
                      <h4 className="font-semibold text-gray-950">Link another learner</h4>
                      <p className="mt-1 text-sm text-gray-600">
                        Searches only current learners visible in your authorized scope. This does
                        not create a guardian or portal relationship.
                      </p>
                      <label className="mt-4 block text-sm font-medium text-gray-800">
                        Learner name
                        <input
                          type="search"
                          value={search}
                          onChange={(event) => {
                            setSearch(event.target.value)
                            setSelectedPersonId('')
                          }}
                          minLength={2}
                          maxLength={160}
                          className={INPUT_CLASS}
                        />
                      </label>
                      {candidates.isFetching && (
                        <p className="mt-2 text-sm text-gray-500">Searching…</p>
                      )}
                      {candidates.data && (
                        <ul className="mt-3 grid gap-2">
                          {candidates.data.length === 0 ? (
                            <li className="text-sm text-gray-500">No visible learners match.</li>
                          ) : (
                            candidates.data.map((candidate) => (
                              <li key={candidate.personId}>
                                <button
                                  type="button"
                                  onClick={() => setSelectedPersonId(candidate.personId)}
                                  className={`w-full rounded-lg border p-3 text-left text-sm ${selectedPersonId === candidate.personId ? 'border-gray-950 bg-gray-50' : 'border-gray-200'}`}
                                >
                                  {candidate.displayName}
                                </button>
                              </li>
                            ))
                          )}
                        </ul>
                      )}
                      <input type="hidden" name="membershipKind" value="resident" />
                      <div className="mt-4 grid gap-4 sm:grid-cols-2">
                        <label className="text-sm font-medium text-gray-800">
                          Effective date
                          <input
                            name="effectiveDate"
                            type="date"
                            required
                            defaultValue={todayLocal()}
                            className={INPUT_CLASS}
                          />
                        </label>
                        <label className="text-sm font-medium text-gray-800">
                          Reason for linking
                          <input
                            name="reason"
                            required
                            minLength={3}
                            maxLength={512}
                            className={INPUT_CLASS}
                          />
                        </label>
                      </div>
                      <FormActions
                        pending={pending || !selectedPersonId}
                        onCancel={close}
                        label="Link learner"
                      />
                    </form>
                  )}

                  {action?.kind === 'preferences' && action.membershipId === membership.id && (
                    <form
                      onSubmit={(event) => submitPreferences(event, action)}
                      className="mt-5 rounded-lg border border-gray-200 p-4"
                    >
                      <h4 className="font-semibold text-gray-950">Change learner preferences</h4>
                      <p className="mt-1 text-sm text-gray-600">
                        This creates a new effective-dated version; it does not change legal
                        authority.
                      </p>
                      <div className="mt-4 grid gap-3">
                        <label className="text-sm font-medium text-gray-800">
                          Membership type
                          <select
                            name="membershipKind"
                            defaultValue={membership.kind}
                            className={INPUT_CLASS}
                          >
                            <option value="resident">Resident</option>
                            <option value="associated">Associated person</option>
                          </select>
                        </label>
                        <label className="flex min-h-11 items-center gap-3 text-sm">
                          <input
                            name="isPrimaryResidence"
                            type="checkbox"
                            defaultChecked={membership.isPrimaryResidence}
                          />{' '}
                          Primary residence
                        </label>
                        <label className="flex min-h-11 items-center gap-3 text-sm">
                          <input
                            name="isPrimaryMailing"
                            type="checkbox"
                            defaultChecked={membership.isPrimaryMailing}
                          />{' '}
                          Primary mailing household
                        </label>
                      </div>
                      <div className="mt-4 grid gap-4 sm:grid-cols-2">
                        <label className="text-sm font-medium text-gray-800">
                          Effective date
                          <input
                            name="effectiveDate"
                            type="date"
                            required
                            min={nextEffectiveDate(action.validFrom)}
                            defaultValue={nextEffectiveDate(action.validFrom)}
                            className={INPUT_CLASS}
                          />
                        </label>
                        <label className="text-sm font-medium text-gray-800">
                          Reason for change
                          <input
                            name="reason"
                            required
                            minLength={3}
                            maxLength={512}
                            className={INPUT_CLASS}
                          />
                        </label>
                      </div>
                      <FormActions pending={pending} onCancel={close} label="Save preferences" />
                    </form>
                  )}

                  {action?.kind === 'end' && action.membershipId === membership.id && (
                    <form
                      onSubmit={(event) => submitEnd(event, action)}
                      className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-4"
                    >
                      <h4 className="font-semibold text-gray-950">End this household membership</h4>
                      <p className="mt-1 text-sm text-gray-700">
                        The historical record will remain available. This action does not alter
                        guardian, pickup, or portal facts.
                      </p>
                      <div className="mt-4 grid gap-4 sm:grid-cols-2">
                        <label className="text-sm font-medium text-gray-800">
                          Effective date
                          <input
                            name="effectiveDate"
                            type="date"
                            required
                            min={nextEffectiveDate(action.validFrom)}
                            defaultValue={nextEffectiveDate(action.validFrom)}
                            className={INPUT_CLASS}
                          />
                        </label>
                        <label className="text-sm font-medium text-gray-800">
                          Reason for ending
                          <input
                            name="reason"
                            required
                            minLength={3}
                            maxLength={512}
                            className={INPUT_CLASS}
                          />
                        </label>
                      </div>
                      <FormActions pending={pending} onCancel={close} label="End membership" />
                    </form>
                  )}

                  {action?.kind === 'address' && action.householdId === household.householdId && (
                    <form
                      onSubmit={(event) => submitAddress(event, action)}
                      className="mt-5 rounded-lg border border-gray-200 p-4"
                    >
                      <h4 className="font-semibold text-gray-950">Add an address</h4>
                      <div className="mt-4">
                        <AddressFields />
                      </div>
                      <div className="mt-4 grid gap-4 sm:grid-cols-2">
                        <label className="text-sm font-medium text-gray-800">
                          Effective date
                          <input
                            name="effectiveDate"
                            type="date"
                            required
                            defaultValue={todayLocal()}
                            className={INPUT_CLASS}
                          />
                        </label>
                        <label className="text-sm font-medium text-gray-800">
                          Reason for adding
                          <input
                            name="reason"
                            required
                            minLength={3}
                            maxLength={512}
                            className={INPUT_CLASS}
                          />
                        </label>
                      </div>
                      <FormActions pending={pending} onCancel={close} label="Add address" />
                    </form>
                  )}

                  {action?.kind === 'edit-address' &&
                    household.addresses.some(({ id }) => id === action.address.id) && (
                      <form
                        onSubmit={(event) => submitAddress(event, action)}
                        className="mt-5 rounded-lg border border-gray-200 p-4"
                      >
                        <h4 className="font-semibold text-gray-950">Revise address</h4>
                        <p className="mt-1 text-sm text-gray-600">
                          The existing address is ended on the effective date and retained in
                          history.
                        </p>
                        <div className="mt-4">
                          <AddressFields defaults={action.address} />
                        </div>
                        <div className="mt-4 grid gap-4 sm:grid-cols-2">
                          <label className="text-sm font-medium text-gray-800">
                            Effective date
                            <input
                              name="effectiveDate"
                              type="date"
                              required
                              min={nextEffectiveDate(action.address.validFrom)}
                              defaultValue={nextEffectiveDate(action.address.validFrom)}
                              className={INPUT_CLASS}
                            />
                          </label>
                          <label className="text-sm font-medium text-gray-800">
                            Reason for revision
                            <input
                              name="reason"
                              required
                              minLength={3}
                              maxLength={512}
                              className={INPUT_CLASS}
                            />
                          </label>
                        </div>
                        <FormActions pending={pending} onCancel={close} label="Revise address" />
                      </form>
                    )}
                </article>
              )
            })}
          </div>
        )}
      </div>
    </section>
  )
}
