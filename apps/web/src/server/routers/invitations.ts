import { InvitationAcceptanceError, acceptAccountInvitation } from '@openschool/auth/server'
import { CAPABILITIES } from '@openschool/rbac'
import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import { cancelAccountInvitation, issueAccountInvitation } from '../../services/invitations'
import { protectedProcedure, requireVerifiedIdentity, router } from '../trpc'

const roleTemplateKey = z.enum([
  'org_admin',
  'org_viewer',
  'school_admin',
  'staff',
  'teacher',
  'parent',
  'student',
])
const scope = z.discriminatedUnion('type', [
  z.object({ type: z.literal('tenant') }),
  z.object({
    type: z.literal('education_organization'),
    educationOrganizationId: z.string().uuid(),
  }),
  z.object({ type: z.literal('school'), schoolId: z.string().uuid() }),
  z.object({ type: z.literal('class'), classId: z.string().uuid() }),
])

export const invitationsRouter = router({
  issue: protectedProcedure(CAPABILITIES.ACCOUNTS_INVITE)
    .input(
      z.object({
        personId: z.string().uuid(),
        intendedEmail: z.string().email().max(320),
        affiliationKind: z.enum([
          'student',
          'guardian',
          'employee',
          'teacher',
          'administrator',
          'member',
        ]),
        scope,
        roleTemplateKeys: z.array(roleTemplateKey).length(1),
        issuanceReason: z.string().trim().min(3).max(512),
        expiresAt: z.coerce.date().optional(),
        affiliationValidUntil: z.coerce.date().optional(),
      })
    )
    .mutation(({ ctx, input }) =>
      issueAccountInvitation(ctx.requestContext, ctx.policyContext, ctx.policyDecision, input)
    ),
  cancel: protectedProcedure(CAPABILITIES.ACCOUNTS_MANAGE)
    .input(
      z.object({
        invitationId: z.string().uuid(),
        reason: z.string().trim().min(3).max(512),
      })
    )
    .mutation(({ ctx, input }) =>
      cancelAccountInvitation(
        ctx.requestContext,
        ctx.policyContext,
        ctx.policyDecision,
        input.invitationId,
        input.reason
      )
    ),
  accept: requireVerifiedIdentity
    .input(z.object({ token: z.string().min(50).max(64) }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await acceptAccountInvitation(ctx.identity, input.token)
      } catch (error) {
        if (error instanceof InvitationAcceptanceError) {
          throw new TRPCError({
            code:
              error.reason === 'INVITATION_UNAVAILABLE' ||
              error.reason === 'INVITATION_ACCOUNT_CONFLICT'
                ? 'CONFLICT'
                : 'FORBIDDEN',
            message: error.reason,
            cause: error,
          })
        }
        throw error
      }
    }),
})
