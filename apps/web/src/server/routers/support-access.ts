import {
  approveSupportAccess,
  closeCurrentSupportAccess,
  getSupportSchools,
  getSupportStudents,
  listTenantSupportGrants,
  listTenantSupportNotifications,
  openEmergencySupportAccess,
  reviewTenantSupportAccess,
  revokeTenantSupportAccess,
} from '@/services/support-access'
import { CAPABILITIES } from '@openschool/rbac'
import { z } from 'zod'
import { platformProcedure, protectedProcedure, requireVerifiedIdentity, router } from '../trpc'

const supportCapabilities = z.enum(['support.schools.read', 'support.students.read'])
const scopeInput = z
  .object({
    scopeType: z.enum(['tenant', 'organization_subtree', 'school']),
    educationOrganizationId: z.uuid().optional(),
    schoolId: z.uuid().optional(),
  })
  .superRefine((value, context) => {
    const valid =
      (value.scopeType === 'tenant' && !value.educationOrganizationId && !value.schoolId) ||
      (value.scopeType === 'organization_subtree' &&
        Boolean(value.educationOrganizationId) &&
        !value.schoolId) ||
      (value.scopeType === 'school' && !value.educationOrganizationId && Boolean(value.schoolId))
    if (!valid)
      context.addIssue({ code: 'custom', message: 'Scope identifiers do not match scope' })
  })

const approveInput = scopeInput.and(
  z.object({
    supportAccountId: z.uuid(),
    allowedCapabilities: z
      .array(supportCapabilities)
      .min(1)
      .max(2)
      .refine((capabilities) => new Set(capabilities).size === capabilities.length, {
        message: 'Capabilities must be unique',
      }),
    purpose: z.enum(['customer_support', 'incident_response']),
    ticketReference: z.string().trim().min(3).max(128),
    authorizationReason: z.string().trim().min(3).max(512),
    validUntil: z.iso.datetime(),
  })
)

const breakGlassInput = scopeInput.and(
  z.object({
    tenantId: z.uuid(),
    allowedCapabilities: z
      .array(supportCapabilities)
      .min(1)
      .max(2)
      .refine((capabilities) => new Set(capabilities).size === capabilities.length, {
        message: 'Capabilities must be unique',
      }),
    ticketReference: z.string().trim().min(3).max(128),
    emergencyRuleReference: z.string().trim().min(3).max(128),
    authorizationReason: z.string().trim().min(3).max(512),
    validUntil: z.iso.datetime(),
  })
)

const boundGrantInput = z.object({
  tenantId: z.uuid(),
  supportGrantId: z.uuid(),
})

export const supportAccessRouter = router({
  grants: protectedProcedure(CAPABILITIES.SUPPORT_GRANTS_MANAGE)
    .input(z.object({ limit: z.number().int().min(1).max(100).default(50) }).optional())
    .query(({ ctx, input }) =>
      listTenantSupportGrants(
        ctx.requestContext,
        ctx.policyContext,
        ctx.policyDecision,
        input?.limit
      )
    ),
  notifications: protectedProcedure(CAPABILITIES.SUPPORT_GRANTS_MANAGE)
    .input(z.object({ limit: z.number().int().min(1).max(100).default(50) }).optional())
    .query(({ ctx, input }) =>
      listTenantSupportNotifications(
        ctx.requestContext,
        ctx.policyContext,
        ctx.policyDecision,
        input?.limit
      )
    ),
  approve: protectedProcedure(CAPABILITIES.SUPPORT_GRANTS_MANAGE)
    .input(approveInput)
    .mutation(({ ctx, input }) =>
      approveSupportAccess(ctx.requestContext, ctx.policyContext, ctx.policyDecision, input)
    ),
  revoke: protectedProcedure(CAPABILITIES.SUPPORT_GRANTS_MANAGE)
    .input(z.object({ supportGrantId: z.uuid(), reason: z.string().trim().min(3).max(512) }))
    .mutation(({ ctx, input }) =>
      revokeTenantSupportAccess(
        ctx.requestContext,
        ctx.policyContext,
        ctx.policyDecision,
        input.supportGrantId,
        input.reason
      )
    ),
  review: protectedProcedure(CAPABILITIES.SUPPORT_GRANTS_MANAGE)
    .input(
      z.object({
        supportGrantId: z.uuid(),
        outcome: z.enum(['confirmed', 'no_impact', 'control_gap', 'incident']),
        notes: z.string().trim().min(3).max(2048),
      })
    )
    .mutation(({ ctx, input }) =>
      reviewTenantSupportAccess(
        ctx.requestContext,
        ctx.policyContext,
        ctx.policyDecision,
        input.supportGrantId,
        input.outcome,
        input.notes
      )
    ),
  openBreakGlass: platformProcedure(CAPABILITIES.PLATFORM_BREAK_GLASS_OPEN)
    .input(breakGlassInput)
    .mutation(({ ctx, input }) =>
      openEmergencySupportAccess(ctx.identity, ctx.platformContext, ctx.policyDecision, input)
    ),
  schools: requireVerifiedIdentity
    .input(boundGrantInput.extend({ schoolId: z.uuid().optional() }))
    .query(({ ctx, input }) => getSupportSchools(ctx.identity, input)),
  students: requireVerifiedIdentity
    .input(boundGrantInput.extend({ schoolId: z.uuid() }))
    .query(({ ctx, input }) => getSupportStudents(ctx.identity, input)),
  close: requireVerifiedIdentity
    .input(boundGrantInput.extend({ reason: z.string().trim().min(3).max(512) }))
    .mutation(({ ctx, input }) => closeCurrentSupportAccess(ctx.identity, input)),
})
