'use client'

import { trpc } from '@/lib/trpc/client'
import {
  AlertCircle,
  Check,
  KeyRound,
  LoaderCircle,
  Mail,
  Pencil,
  Phone,
  Plus,
  ShieldCheck,
  UserRound,
  X,
} from 'lucide-react'
import { type FormEvent, useEffect, useRef, useState } from 'react'

const INPUT_CLASS =
  'mt-1 block min-h-10 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-950 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:bg-gray-100'
const BUTTON_CLASS =
  'inline-flex min-h-10 items-center justify-center rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-60'
const PRIMARY_BUTTON_CLASS =
  'inline-flex min-h-10 items-center justify-center rounded-lg bg-gray-950 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-60'

type RelationshipType = 'parent_of' | 'guardian_of' | 'emergency_contact_of'
type DecisionAuthority = 'none' | 'shared' | 'sole' | 'limited'
type PreferredContactMethod = 'email' | 'phone' | 'sms' | 'none'

interface RelationshipFacts {
  legalAuthority: boolean
  decisionAuthority: DecisionAuthority
  emergencyPriority: string
  pickupAuthority: boolean
  portalEligible: boolean
}

const RELATIONSHIP_LABELS: Readonly<Record<RelationshipType, string>> = {
  parent_of: 'Parent',
  guardian_of: 'Guardian',
  emergency_contact_of: 'Emergency contact',
}

const DECISION_LABELS: Readonly<Record<DecisionAuthority, string>> = {
  none: 'No decision authority',
  shared: 'Shared decision authority',
  sole: 'Sole decision authority',
  limited: 'Limited decision authority',
}

function errorMessage(error: unknown): string {
  const message =
    error && typeof error === 'object' && 'message' in error
      ? String((error as { message: unknown }).message)
      : ''
  if (message.includes('MFA_REQUIRED')) {
    return 'Verify with MFA in Security settings, then return here and retry.'
  }
  if (message.includes('changed') || message.includes('CONFLICT')) {
    return 'The contact changed after this page loaded. The list has been refreshed.'
  }
  if (message.includes('not found') || message.includes('NOT_FOUND')) {
    return 'The learner or contact is unavailable in your authorized School scope.'
  }
  return 'The contact change could not be completed. Review the details and try again.'
}

function isAccessDenied(
  error: { data?: { code?: string | null } | null; message: string } | null
): boolean {
  return Boolean(
    error &&
      (error.data?.code === 'FORBIDDEN' ||
        error.message.includes('SCOPE_NOT_GRANTED') ||
        error.message.includes('UNKNOWN_CAPABILITY'))
  )
}

function FactsFields({
  value,
  onChange,
  relationshipType,
}: {
  value: RelationshipFacts
  onChange: (value: RelationshipFacts) => void
  relationshipType: RelationshipType
}) {
  const portalAllowed = relationshipType !== 'emergency_contact_of'
  useEffect(() => {
    if (!portalAllowed && value.portalEligible) {
      onChange({ ...value, portalEligible: false })
    }
  }, [onChange, portalAllowed, value])

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="block text-sm font-medium text-gray-800">
        Decision authority
        <select
          value={value.decisionAuthority}
          onChange={(event) =>
            onChange({ ...value, decisionAuthority: event.target.value as DecisionAuthority })
          }
          className={INPUT_CLASS}
        >
          {Object.entries(DECISION_LABELS).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm font-medium text-gray-800">
        Emergency priority
        <input
          type="number"
          inputMode="numeric"
          min={1}
          max={99}
          value={value.emergencyPriority}
          onChange={(event) => onChange({ ...value, emergencyPriority: event.target.value })}
          placeholder="Optional"
          className={INPUT_CLASS}
        />
      </label>
      <label className="flex min-h-11 items-start gap-3 rounded-lg border border-gray-200 p-3 text-sm text-gray-800">
        <input
          type="checkbox"
          checked={value.legalAuthority}
          onChange={(event) => onChange({ ...value, legalAuthority: event.target.checked })}
          className="mt-0.5 size-4 rounded border-gray-300"
        />
        <span>
          <span className="block font-medium">Legal authority</span>
          <span className="mt-0.5 block text-xs text-gray-500">Recorded as a separate fact.</span>
        </span>
      </label>
      <label className="flex min-h-11 items-start gap-3 rounded-lg border border-gray-200 p-3 text-sm text-gray-800">
        <input
          type="checkbox"
          checked={value.pickupAuthority}
          onChange={(event) => onChange({ ...value, pickupAuthority: event.target.checked })}
          className="mt-0.5 size-4 rounded border-gray-300"
        />
        <span>
          <span className="block font-medium">Pickup authority</span>
          <span className="mt-0.5 block text-xs text-gray-500">May collect the learner.</span>
        </span>
      </label>
      <label className="flex min-h-11 items-start gap-3 rounded-lg border border-gray-200 p-3 text-sm text-gray-800 sm:col-span-2">
        <input
          type="checkbox"
          checked={value.portalEligible}
          disabled={!portalAllowed}
          onChange={(event) => onChange({ ...value, portalEligible: event.target.checked })}
          className="mt-0.5 size-4 rounded border-gray-300"
        />
        <span>
          <span className="block font-medium">Eligible for parent portal access</span>
          <span className="mt-0.5 block text-xs text-gray-500">
            Eligibility does not create an Account or send an invitation. Those remain separate
            administrator actions.
          </span>
        </span>
      </label>
    </div>
  )
}

const EMPTY_FACTS: RelationshipFacts = {
  legalAuthority: false,
  decisionAuthority: 'none',
  emergencyPriority: '',
  pickupAuthority: false,
  portalEligible: false,
}

export function GuardianContactsPanel({ learnerId }: { learnerId: string }) {
  const utils = trpc.useUtils()
  const contacts = trpc.guardianContacts.getByLearner.useQuery({ learnerId }, { retry: false })
  const manageAccess = trpc.guardianContacts.canManage.useQuery(undefined, { retry: false })
  const createContact = trpc.guardianContacts.create.useMutation()
  const updateContact = trpc.guardianContacts.update.useMutation()
  const endContact = trpc.guardianContacts.end.useMutation()
  const [showAdd, setShowAdd] = useState(false)
  const [contactMode, setContactMode] = useState<'new' | 'existing'>('new')
  const [search, setSearch] = useState('')
  const candidates = trpc.guardianContacts.candidates.useQuery(
    { learnerId, query: search.trim() },
    { enabled: showAdd && contactMode === 'existing' && search.trim().length >= 2, retry: false }
  )
  const [selectedPersonId, setSelectedPersonId] = useState('')
  const [relationshipType, setRelationshipType] = useState<RelationshipType>('parent_of')
  const [facts, setFacts] = useState<RelationshipFacts>(EMPTY_FACTS)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingFacts, setEditingFacts] = useState<RelationshipFacts>(EMPTY_FACTS)
  const [endingId, setEndingId] = useState<string | null>(null)
  const [endingReason, setEndingReason] = useState('')
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const feedbackRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (error || status) feedbackRef.current?.focus()
  }, [error, status])

  if (isAccessDenied(contacts.error)) return null

  const refresh = async () => {
    await Promise.all([
      utils.guardianContacts.getByLearner.invalidate({ learnerId }),
      utils.guardianContacts.candidates.invalidate(),
    ])
  }

  const resetAdd = () => {
    setShowAdd(false)
    setContactMode('new')
    setSearch('')
    setSelectedPersonId('')
    setRelationshipType('parent_of')
    setFacts(EMPTY_FACTS)
  }

  const submitCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    setStatus('')
    const form = new FormData(event.currentTarget)
    try {
      await createContact.mutateAsync({
        learnerId,
        contact:
          contactMode === 'existing'
            ? { kind: 'existing', personId: selectedPersonId }
            : {
                kind: 'new',
                firstName: String(form.get('firstName') ?? ''),
                lastName: String(form.get('lastName') ?? ''),
                email: String(form.get('email') ?? '') || null,
                phone: String(form.get('phone') ?? '') || null,
                preferredContactMethod: String(
                  form.get('preferredContactMethod') ?? 'none'
                ) as PreferredContactMethod,
              },
        relationshipType,
        legalAuthority: facts.legalAuthority,
        decisionAuthority: facts.decisionAuthority,
        emergencyPriority: facts.emergencyPriority ? Number(facts.emergencyPriority) : null,
        pickupAuthority: facts.pickupAuthority,
        portalEligible: facts.portalEligible,
        issuanceReason: String(form.get('issuanceReason') ?? ''),
      })
      await refresh()
      resetAdd()
      setStatus(
        'Contact added. Operational permissions and portal eligibility were recorded separately.'
      )
    } catch (cause) {
      setError(errorMessage(cause))
      await refresh()
    }
  }

  const submitUpdate = async (relationshipId: string, expectedVersion: number) => {
    setError('')
    setStatus('')
    try {
      await updateContact.mutateAsync({
        relationshipId,
        expectedVersion,
        legalAuthority: editingFacts.legalAuthority,
        decisionAuthority: editingFacts.decisionAuthority,
        emergencyPriority: editingFacts.emergencyPriority
          ? Number(editingFacts.emergencyPriority)
          : null,
        pickupAuthority: editingFacts.pickupAuthority,
        portalEligible: editingFacts.portalEligible,
      })
      await refresh()
      setEditingId(null)
      setStatus('Contact permissions updated and authorization caches invalidated where required.')
    } catch (cause) {
      setError(errorMessage(cause))
      await refresh()
    }
  }

  const submitEnd = async (relationshipId: string, expectedVersion: number) => {
    setError('')
    setStatus('')
    try {
      await endContact.mutateAsync({
        relationshipId,
        expectedVersion,
        reason: endingReason,
      })
      await refresh()
      setEndingId(null)
      setEndingReason('')
      setStatus(
        'Relationship ended. Its history remains available and portal access no longer applies.'
      )
    } catch (cause) {
      setError(errorMessage(cause))
      await refresh()
    }
  }

  return (
    <section className="mt-8 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-gray-200 bg-gray-50 px-5 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-6">
        <div>
          <h2 className="font-semibold text-gray-950">Family and emergency contacts</h2>
          <p className="mt-1 max-w-2xl text-sm text-gray-600">
            Contact details, legal authority, pickup permission, and portal eligibility are recorded
            independently.
          </p>
        </div>
        {manageAccess.data === true && !showAdd && (
          <button type="button" onClick={() => setShowAdd(true)} className={BUTTON_CLASS}>
            <Plus className="mr-2 size-4" aria-hidden="true" />
            Add contact
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

      {showAdd && (
        <form onSubmit={submitCreate} className="border-b border-gray-200 p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="font-semibold text-gray-950">Add a contact</h3>
              <p className="mt-1 text-sm text-gray-600">
                Search first to avoid duplicate People. Selecting a suggestion never merges records.
              </p>
            </div>
            <button
              type="button"
              onClick={resetAdd}
              className="rounded-md p-2 text-gray-500 hover:bg-gray-100 focus-visible:outline-2 focus-visible:outline-offset-2"
              aria-label="Close add contact form"
            >
              <X className="size-5" aria-hidden="true" />
            </button>
          </div>

          <fieldset className="mt-5">
            <legend className="text-sm font-semibold text-gray-950">Contact Person</legend>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {(['new', 'existing'] as const).map((mode) => (
                <label
                  key={mode}
                  className="flex min-h-11 items-center gap-3 rounded-lg border border-gray-200 p-3 text-sm"
                >
                  <input
                    type="radio"
                    name="contactMode"
                    value={mode}
                    checked={contactMode === mode}
                    onChange={() => {
                      setContactMode(mode)
                      setSelectedPersonId('')
                    }}
                  />
                  <span className="font-medium">
                    {mode === 'new' ? 'Create a new Person' : 'Use an existing Person'}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          {contactMode === 'new' ? (
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="text-sm font-medium text-gray-800">
                First name
                <input
                  name="firstName"
                  required
                  maxLength={100}
                  autoComplete="given-name"
                  className={INPUT_CLASS}
                />
              </label>
              <label className="text-sm font-medium text-gray-800">
                Last name
                <input
                  name="lastName"
                  required
                  maxLength={100}
                  autoComplete="family-name"
                  className={INPUT_CLASS}
                />
              </label>
              <label className="text-sm font-medium text-gray-800">
                Email
                <input
                  name="email"
                  type="email"
                  maxLength={320}
                  autoComplete="email"
                  className={INPUT_CLASS}
                />
              </label>
              <label className="text-sm font-medium text-gray-800">
                Phone
                <input
                  name="phone"
                  type="tel"
                  maxLength={32}
                  autoComplete="tel"
                  className={INPUT_CLASS}
                />
              </label>
              <label className="text-sm font-medium text-gray-800 sm:col-span-2">
                Preferred contact method
                <select name="preferredContactMethod" defaultValue="none" className={INPUT_CLASS}>
                  <option value="none">Not specified</option>
                  <option value="email">Email</option>
                  <option value="phone">Phone call</option>
                  <option value="sms">Text message</option>
                </select>
              </label>
            </div>
          ) : (
            <div className="mt-4">
              <label className="text-sm font-medium text-gray-800">
                Search by name or email
                <input
                  type="search"
                  value={search}
                  onChange={(event) => {
                    setSearch(event.target.value)
                    setSelectedPersonId('')
                  }}
                  minLength={2}
                  maxLength={200}
                  className={INPUT_CLASS}
                  aria-describedby="contact-search-help"
                />
              </label>
              <p id="contact-search-help" className="mt-1 text-xs text-gray-500">
                Suggestions are limited to contacts already visible in your authorized scope.
              </p>
              {candidates.isFetching && <p className="mt-3 text-sm text-gray-500">Searching…</p>}
              {candidates.data && (
                <ul className="mt-3 grid gap-2" aria-label="Possible existing People">
                  {candidates.data.length === 0 ? (
                    <li className="rounded-lg bg-gray-50 p-3 text-sm text-gray-600">
                      No visible matches. Create a new Person instead.
                    </li>
                  ) : (
                    candidates.data.map((candidate) => (
                      <li key={candidate.id}>
                        <button
                          type="button"
                          onClick={() => setSelectedPersonId(candidate.id)}
                          className={`w-full rounded-lg border p-3 text-left focus-visible:outline-2 focus-visible:outline-offset-2 ${selectedPersonId === candidate.id ? 'border-gray-950 bg-gray-50' : 'border-gray-200 hover:bg-gray-50'}`}
                        >
                          <span className="block text-sm font-medium text-gray-950">
                            {candidate.displayName}
                          </span>
                          <span className="mt-0.5 block text-xs text-gray-500">
                            {candidate.normalizedEmail ?? 'No email'} · Suggested match only
                          </span>
                        </button>
                      </li>
                    ))
                  )}
                </ul>
              )}
            </div>
          )}

          <fieldset className="mt-6 border-t border-gray-200 pt-5">
            <legend className="text-sm font-semibold text-gray-950">
              Relationship and permissions
            </legend>
            <label className="mt-3 block text-sm font-medium text-gray-800">
              Relationship to learner
              <select
                value={relationshipType}
                onChange={(event) => setRelationshipType(event.target.value as RelationshipType)}
                className={INPUT_CLASS}
              >
                {Object.entries(RELATIONSHIP_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <div className="mt-4">
              <FactsFields value={facts} onChange={setFacts} relationshipType={relationshipType} />
            </div>
            <label className="mt-4 block text-sm font-medium text-gray-800">
              Reason for adding this relationship
              <textarea
                name="issuanceReason"
                required
                minLength={3}
                maxLength={512}
                rows={2}
                className={INPUT_CLASS}
              />
            </label>
          </fieldset>

          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" onClick={resetAdd} className={BUTTON_CLASS}>
              Cancel
            </button>
            <button
              type="submit"
              disabled={
                createContact.isPending || (contactMode === 'existing' && !selectedPersonId)
              }
              className={PRIMARY_BUTTON_CLASS}
            >
              {createContact.isPending && (
                <LoaderCircle className="mr-2 size-4 animate-spin" aria-hidden="true" />
              )}
              Add contact
            </button>
          </div>
        </form>
      )}

      <div className="p-5 sm:p-6">
        {contacts.isLoading ? (
          <p className="flex items-center gap-2 text-sm text-gray-600">
            <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
            Loading contacts…
          </p>
        ) : contacts.error ? (
          <p role="alert" className="text-sm text-red-700">
            Contacts could not be loaded.
          </p>
        ) : contacts.data?.length === 0 ? (
          <div className="rounded-lg border border-dashed border-gray-300 p-6 text-center">
            <UserRound className="mx-auto size-8 text-gray-400" aria-hidden="true" />
            <p className="mt-2 text-sm font-medium text-gray-900">No contacts recorded</p>
            <p className="mt-1 text-sm text-gray-500">
              Add a parent, guardian, or emergency contact.
            </p>
          </div>
        ) : (
          <div className="grid gap-4">
            {contacts.data?.map((contact) => {
              const isEditing = editingId === contact.relationshipId
              const isEnding = endingId === contact.relationshipId
              return (
                <article
                  key={contact.relationshipId}
                  className={`rounded-xl border p-4 sm:p-5 ${contact.isCurrent ? 'border-gray-200' : 'border-gray-200 bg-gray-50'}`}
                >
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold text-gray-950">{contact.displayName}</h3>
                        <span className="rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-700">
                          {RELATIONSHIP_LABELS[contact.relationshipType as RelationshipType]}
                        </span>
                        {!contact.isCurrent && (
                          <span className="rounded-full bg-gray-200 px-2 py-1 text-xs font-medium text-gray-700">
                            Ended
                          </span>
                        )}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-600">
                        <span className="inline-flex items-center gap-1.5">
                          <Mail className="size-4" aria-hidden="true" />
                          {contact.email ?? 'No email'}
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                          <Phone className="size-4" aria-hidden="true" />
                          {contact.phone ?? 'No phone'}
                        </span>
                      </div>
                    </div>
                    {manageAccess.data === true && contact.isCurrent && !isEditing && !isEnding && (
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingId(contact.relationshipId)
                            setEditingFacts({
                              legalAuthority: contact.legalAuthority,
                              decisionAuthority: contact.decisionAuthority as DecisionAuthority,
                              emergencyPriority: contact.emergencyPriority?.toString() ?? '',
                              pickupAuthority: contact.pickupAuthority,
                              portalEligible: contact.portalEligible,
                            })
                          }}
                          className={BUTTON_CLASS}
                        >
                          <Pencil className="mr-2 size-4" aria-hidden="true" />
                          Edit permissions
                        </button>
                        <button
                          type="button"
                          onClick={() => setEndingId(contact.relationshipId)}
                          className={BUTTON_CLASS}
                        >
                          End relationship
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="mt-4 grid gap-3 border-t border-gray-100 pt-4 sm:grid-cols-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                        Operational
                      </p>
                      <p className="mt-1 text-sm text-gray-800">
                        {contact.emergencyPriority
                          ? `Emergency priority ${contact.emergencyPriority}`
                          : 'No emergency priority'}{' '}
                        · {contact.pickupAuthority ? 'Pickup approved' : 'No pickup authority'}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                        Legal and decisions
                      </p>
                      <p className="mt-1 text-sm text-gray-800">
                        {contact.legalAuthority ? 'Legal authority' : 'No legal authority'} ·{' '}
                        {DECISION_LABELS[contact.decisionAuthority as DecisionAuthority]}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                        Portal access
                      </p>
                      <p className="mt-1 flex items-start gap-1.5 text-sm text-gray-800">
                        {contact.accountLinked ? (
                          <KeyRound className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                        ) : (
                          <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                        )}
                        <span>
                          {contact.accountLinked
                            ? contact.portalEligible
                              ? 'Account linked; current relationship contributes access'
                              : 'Account linked; this relationship does not contribute access'
                            : contact.invitationEligible
                              ? 'Eligible for a separate portal invitation'
                              : contact.portalEligible
                                ? 'Portal eligible; email required before invitation'
                                : 'Not portal eligible'}
                        </span>
                      </p>
                    </div>
                  </div>

                  {isEditing && (
                    <div className="mt-5 rounded-lg border border-gray-200 bg-gray-50 p-4">
                      <h4 className="text-sm font-semibold text-gray-950">
                        Edit relationship permissions
                      </h4>
                      <div className="mt-3">
                        <FactsFields
                          value={editingFacts}
                          onChange={setEditingFacts}
                          relationshipType={contact.relationshipType as RelationshipType}
                        />
                      </div>
                      <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                        <button
                          type="button"
                          onClick={() => setEditingId(null)}
                          className={BUTTON_CLASS}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => submitUpdate(contact.relationshipId, contact.version)}
                          disabled={updateContact.isPending}
                          className={PRIMARY_BUTTON_CLASS}
                        >
                          Save permissions
                        </button>
                      </div>
                    </div>
                  )}

                  {isEnding && (
                    <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-4">
                      <h4 className="text-sm font-semibold text-amber-950">
                        End this relationship?
                      </h4>
                      <p className="mt-1 text-sm text-amber-900">
                        Portal authorization stops immediately. The historical record is retained.
                      </p>
                      <label className="mt-3 block text-sm font-medium text-amber-950">
                        Reason
                        <textarea
                          value={endingReason}
                          onChange={(event) => setEndingReason(event.target.value)}
                          minLength={3}
                          maxLength={512}
                          rows={2}
                          className={INPUT_CLASS}
                        />
                      </label>
                      <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                        <button
                          type="button"
                          onClick={() => {
                            setEndingId(null)
                            setEndingReason('')
                          }}
                          className={BUTTON_CLASS}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => submitEnd(contact.relationshipId, contact.version)}
                          disabled={endContact.isPending || endingReason.trim().length < 3}
                          className="inline-flex min-h-10 items-center justify-center rounded-lg bg-amber-900 px-4 py-2 text-sm font-medium text-white hover:bg-amber-800 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-60"
                        >
                          End relationship
                        </button>
                      </div>
                    </div>
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
