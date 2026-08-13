import {
  addHouseholdAddress,
  addHouseholdMember,
  createHousehold,
  endHouseholdMember,
  findHouseholdMemberCandidates,
  getLearnerHouseholds,
  reviseHouseholdAddress,
  reviseHouseholdMember,
} from '@/services/households'
import { CAPABILITIES } from '@openschool/rbac'
import { z } from 'zod'
import { protectedProcedure, router } from '../trpc'

const effectiveAt = z.coerce.date()
const reason = z.string().trim().min(3).max(512)
const membershipFacts = z.object({
  membershipKind: z.enum(['resident', 'associated']),
  isPrimaryResidence: z.boolean(),
  isPrimaryMailing: z.boolean(),
})
const address = z.object({
  addressType: z.enum(['residential', 'mailing', 'temporary', 'other']),
  label: z.string().trim().max(80).optional().nullable(),
  line1: z.string().trim().min(1).max(200),
  line2: z.string().trim().max(200).optional().nullable(),
  locality: z.string().trim().min(1).max(120),
  administrativeArea: z.string().trim().max(120).optional().nullable(),
  postalCode: z.string().trim().max(32).optional().nullable(),
  countryCode: z
    .string()
    .trim()
    .regex(/^[A-Za-z]{2}$/),
  deliveryInstructions: z.string().trim().max(500).optional().nullable(),
})

export const householdsRouter = router({
  canManage: protectedProcedure(CAPABILITIES.HOUSEHOLDS_MANAGE).query(() => true),
  getByLearner: protectedProcedure(CAPABILITIES.HOUSEHOLDS_READ)
    .input(z.object({ learnerId: z.uuid() }))
    .query(({ ctx, input }) =>
      getLearnerHouseholds(
        ctx.requestContext,
        ctx.policyContext,
        ctx.policyDecision,
        input.learnerId
      )
    ),
  memberCandidates: protectedProcedure(CAPABILITIES.HOUSEHOLDS_MANAGE)
    .input(
      z.object({
        learnerId: z.uuid(),
        query: z.string().trim().min(2).max(160),
      })
    )
    .query(({ ctx, input }) =>
      findHouseholdMemberCandidates(
        ctx.requestContext,
        ctx.policyContext,
        ctx.policyDecision,
        input.learnerId,
        input.query
      )
    ),
  create: protectedProcedure(CAPABILITIES.HOUSEHOLDS_MANAGE)
    .input(
      z
        .object({
          learnerId: z.uuid(),
          displayName: z.string().trim().min(1).max(160),
          address,
          effectiveAt,
          reason,
        })
        .extend(membershipFacts.pick({ isPrimaryResidence: true, isPrimaryMailing: true }).shape)
    )
    .mutation(({ ctx, input }) =>
      createHousehold(ctx.requestContext, ctx.policyContext, ctx.policyDecision, input)
    ),
  addMember: protectedProcedure(CAPABILITIES.HOUSEHOLDS_MANAGE)
    .input(
      z
        .object({
          learnerId: z.uuid(),
          householdId: z.uuid(),
          personId: z.uuid(),
          effectiveAt,
          reason,
        })
        .extend(membershipFacts.shape)
        .superRefine((value, context) => {
          if (
            value.membershipKind === 'associated' &&
            (value.isPrimaryResidence || value.isPrimaryMailing)
          ) {
            context.addIssue({
              code: 'custom',
              path: ['membershipKind'],
              message: 'Associated people cannot have primary residence or mailing preferences',
            })
          }
        })
    )
    .mutation(({ ctx, input }) =>
      addHouseholdMember(ctx.requestContext, ctx.policyContext, ctx.policyDecision, input)
    ),
  reviseMember: protectedProcedure(CAPABILITIES.HOUSEHOLDS_MANAGE)
    .input(
      z
        .object({
          learnerId: z.uuid(),
          membershipId: z.uuid(),
          expectedVersion: z.number().int().positive(),
          effectiveAt,
          reason,
        })
        .extend(membershipFacts.shape)
    )
    .mutation(({ ctx, input }) =>
      reviseHouseholdMember(ctx.requestContext, ctx.policyContext, ctx.policyDecision, input)
    ),
  endMember: protectedProcedure(CAPABILITIES.HOUSEHOLDS_MANAGE)
    .input(
      z.object({
        learnerId: z.uuid(),
        membershipId: z.uuid(),
        expectedVersion: z.number().int().positive(),
        effectiveAt,
        reason,
      })
    )
    .mutation(({ ctx, input }) =>
      endHouseholdMember(ctx.requestContext, ctx.policyContext, ctx.policyDecision, input)
    ),
  addAddress: protectedProcedure(CAPABILITIES.HOUSEHOLDS_MANAGE)
    .input(
      z
        .object({
          learnerId: z.uuid(),
          householdId: z.uuid(),
          isPrimary: z.boolean(),
          effectiveAt,
          reason,
        })
        .extend(address.shape)
    )
    .mutation(({ ctx, input }) =>
      addHouseholdAddress(ctx.requestContext, ctx.policyContext, ctx.policyDecision, input)
    ),
  reviseAddress: protectedProcedure(CAPABILITIES.HOUSEHOLDS_MANAGE)
    .input(
      z
        .object({
          learnerId: z.uuid(),
          addressId: z.uuid(),
          expectedVersion: z.number().int().positive(),
          isPrimary: z.boolean(),
          effectiveAt,
          reason,
        })
        .extend(address.shape)
    )
    .mutation(({ ctx, input }) =>
      reviseHouseholdAddress(ctx.requestContext, ctx.policyContext, ctx.policyDecision, input)
    ),
})
