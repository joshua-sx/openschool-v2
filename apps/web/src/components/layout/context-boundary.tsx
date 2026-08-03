import type { AvailableTenantContext, TenantContextDenialReason } from '@openschool/auth/server'

interface ContextBoundaryProps {
  denialReason: TenantContextDenialReason
  options: AvailableTenantContext[]
}

function optionLabel(option: AvailableTenantContext): string {
  return option.schoolName ?? option.educationOrganizationName ?? option.tenantName
}

export function ContextBoundary({ denialReason, options }: ContextBoundaryProps) {
  if (denialReason === 'CONTEXT_REQUIRED') {
    return (
      <section className="max-w-2xl mx-auto py-12" aria-labelledby="context-heading">
        <p className="text-sm font-medium text-blue-700">OpenSchool context</p>
        <h1 id="context-heading" className="mt-2 text-2xl font-semibold text-gray-950">
          Choose where you’re working
        </h1>
        <p className="mt-2 text-sm leading-6 text-gray-600">
          Your account is connected to more than one school or organization. Choose one to keep its
          people and records in the correct context.
        </p>
        <div className="mt-6 grid gap-3">
          {options.length === 0 && (
            <p className="rounded-xl border border-gray-200 bg-white px-4 py-4 text-sm text-gray-600">
              No active context is available. Contact your school administrator to review your
              access.
            </p>
          )}
          {options.map((option) => (
            <form key={option.key} action="/context/select" method="POST">
              <input type="hidden" name="tenantId" value={option.tenantId} />
              {option.educationOrganizationId && (
                <input
                  type="hidden"
                  name="educationOrganizationId"
                  value={option.educationOrganizationId}
                />
              )}
              {option.schoolId && <input type="hidden" name="schoolId" value={option.schoolId} />}
              <button
                type="submit"
                className="w-full rounded-xl border border-gray-200 bg-white px-4 py-4 text-left shadow-sm transition-colors hover:border-gray-300 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
              >
                <span className="block font-medium text-gray-950">{optionLabel(option)}</span>
                <span className="mt-1 block text-sm text-gray-600">
                  {option.tenantName}
                  {' · '}
                  {option.roleTemplateKeys.join(', ').replaceAll('_', ' ')}
                </span>
              </button>
            </form>
          ))}
        </div>
      </section>
    )
  }

  const accountUnavailable = denialReason === 'ACCOUNT_DISABLED'
  const mfaRequired = denialReason === 'MFA_REQUIRED'
  const mfaRecoveryPending = denialReason === 'MFA_RECOVERY_PENDING'
  return (
    <section className="max-w-xl mx-auto py-12" aria-labelledby="access-heading">
      <h1 id="access-heading" className="text-2xl font-semibold text-gray-950">
        {accountUnavailable
          ? 'Your OpenSchool account is unavailable'
          : mfaRequired
            ? 'Additional verification is required'
            : mfaRecoveryPending
              ? 'Account recovery is still in progress'
              : 'We couldn’t open this school context'}
      </h1>
      <p className="mt-3 text-sm leading-6 text-gray-600">
        {accountUnavailable
          ? 'Contact your school administrator if you believe your access should still be active.'
          : mfaRequired
            ? 'Sign in again with the verification method required for this action.'
            : mfaRecoveryPending
              ? 'Your existing sessions are disabled while OpenSchool removes the previous verification methods. Contact your school administrator if this continues.'
              : 'Your access may have changed. Choose another context or contact your school administrator.'}
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        {!accountUnavailable && !mfaRequired && !mfaRecoveryPending && (
          <form action="/context/clear" method="POST">
            <button
              type="submit"
              className="rounded-lg bg-gray-950 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-950 focus-visible:ring-offset-2"
            >
              Choose another context
            </button>
          </form>
        )}
        <form action="/auth/signout" method="POST">
          <button
            type="submit"
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-950 focus-visible:ring-offset-2"
          >
            Sign out
          </button>
        </form>
      </div>
    </section>
  )
}
