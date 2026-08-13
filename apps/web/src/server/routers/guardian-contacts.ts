import {
  createGuardianContact,
  endGuardianContact,
  findGuardianContactCandidates,
  getGuardianContacts,
  updateGuardianContact,
} from '@/services/guardian-contacts'
import { CAPABILITIES } from '@openschool/rbac'
import { z } from 'zod'
import { protectedProcedure, router } from '../trpc'

const relationshipType = z.enum(['parent_of', 'guardian_of', 'emergency_contact_of'])
const decisionAuthority = z.enum(['none', 'shared', 'sole', 'limited'])
const preferredContactMethod = z.enum(['email', 'phone', 'sms', 'none'])
const relationshipFacts = z.object({
  legalAuthority: z.boolean(),
  decisionAuthority,
  emergencyPriority: z.number().int().min(1).max(99).optional().nullable(),
  pickupAuthority: z.boolean(),
  portalEligible: z.boolean(),
})

const newContact = z
  .object({
    kind: z.literal('new'),
    firstName: z.string().trim().min(1).max(100),
    lastName: z.string().trim().min(1).max(100),
    email: z.email().max(320).optional().nullable(),
    phone: z.string().trim().min(5).max(32).optional().nullable(),
    preferredContactMethod,
  })
  .superRefine((value, context) => {
    if (value.preferredContactMethod === 'email' && !value.email) {
      context.addIssue({ code: 'custom', path: ['email'], message: 'Email is required' })
    }
    if (['phone', 'sms'].includes(value.preferredContactMethod) && !value.phone) {
      context.addIssue({ code: 'custom', path: ['phone'], message: 'Phone is required' })
    }
  })

const createContact = z
  .object({
    learnerId: z.uuid(),
    contact: z.union([newContact, z.object({ kind: z.literal('existing'), personId: z.uuid() })]),
    relationshipType,
    issuanceReason: z.string().trim().min(3).max(512),
  })
  .extend(relationshipFacts.shape)
  .superRefine((value, context) => {
    if (value.relationshipType === 'emergency_contact_of' && value.portalEligible) {
      context.addIssue({
        code: 'custom',
        path: ['portalEligible'],
        message: 'Emergency contacts are not portal eligible',
      })
    }
  })

export const guardianContactsRouter = router({
  canManage: protectedProcedure(CAPABILITIES.GUARDIAN_CONTACTS_MANAGE).query(() => true),
  getByLearner: protectedProcedure(CAPABILITIES.GUARDIAN_CONTACTS_READ)
    .input(z.object({ learnerId: z.uuid() }))
    .query(({ ctx, input }) =>
      getGuardianContacts(
        ctx.requestContext,
        ctx.policyContext,
        ctx.policyDecision,
        input.learnerId
      )
    ),
  candidates: protectedProcedure(CAPABILITIES.GUARDIAN_CONTACTS_MANAGE)
    .input(
      z.object({
        learnerId: z.uuid(),
        query: z.string().trim().min(2).max(200),
      })
    )
    .query(({ ctx, input }) =>
      findGuardianContactCandidates(
        ctx.requestContext,
        ctx.policyContext,
        ctx.policyDecision,
        input.learnerId,
        input.query
      )
    ),
  create: protectedProcedure(CAPABILITIES.GUARDIAN_CONTACTS_MANAGE)
    .input(createContact)
    .mutation(({ ctx, input }) =>
      createGuardianContact(ctx.requestContext, ctx.policyContext, ctx.policyDecision, input)
    ),
  update: protectedProcedure(CAPABILITIES.GUARDIAN_CONTACTS_MANAGE)
    .input(
      z
        .object({
          relationshipId: z.uuid(),
          expectedVersion: z.number().int().positive(),
        })
        .extend(relationshipFacts.shape)
    )
    .mutation(({ ctx, input }) =>
      updateGuardianContact(ctx.requestContext, ctx.policyContext, ctx.policyDecision, input)
    ),
  end: protectedProcedure(CAPABILITIES.GUARDIAN_CONTACTS_MANAGE)
    .input(
      z.object({
        relationshipId: z.uuid(),
        expectedVersion: z.number().int().positive(),
        reason: z.string().trim().min(3).max(512),
      })
    )
    .mutation(({ ctx, input }) =>
      endGuardianContact(
        ctx.requestContext,
        ctx.policyContext,
        ctx.policyDecision,
        input.relationshipId,
        input.expectedVersion,
        input.reason
      )
    ),
})
