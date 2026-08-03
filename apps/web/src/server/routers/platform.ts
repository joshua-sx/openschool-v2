import { CAPABILITIES } from '@openschool/rbac'
import { z } from 'zod'
import { changeTenantLifecycle } from '../../services/tenant-lifecycle'
import { platformProcedure, router } from '../trpc'

const tenantLifecycleInput = z.object({
  tenantId: z.uuid(),
  reason: z.string().trim().min(3).max(512),
})

export const platformRouter = router({
  suspendTenant: platformProcedure(CAPABILITIES.PLATFORM_TENANTS_MANAGE)
    .input(tenantLifecycleInput)
    .mutation(({ ctx, input }) =>
      changeTenantLifecycle(ctx.identity, ctx.platformContext, ctx.policyDecision, {
        action: 'suspend',
        ...input,
      })
    ),
  reactivateTenant: platformProcedure(CAPABILITIES.PLATFORM_TENANTS_MANAGE)
    .input(tenantLifecycleInput)
    .mutation(({ ctx, input }) =>
      changeTenantLifecycle(ctx.identity, ctx.platformContext, ctx.policyDecision, {
        action: 'reactivate',
        ...input,
      })
    ),
})
