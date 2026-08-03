import { TRPCProvider } from '@/lib/trpc/provider'
import type { Metadata } from 'next'
import { InvitationPanel } from './invitation-panel'

export const metadata: Metadata = {
  title: 'Accept invitation - OpenSchool',
  description: 'Activate the school access approved for your OpenSchool account.',
}

export default function InvitationPage() {
  return (
    <TRPCProvider>
      <InvitationPanel />
    </TRPCProvider>
  )
}
