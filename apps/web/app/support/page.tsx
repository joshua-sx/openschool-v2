import { TRPCProvider } from '@/lib/trpc/provider'
import type { Metadata } from 'next'
import { SupportSessionPanel } from './support-session-panel'

export const metadata: Metadata = {
  title: 'Support workspace - OpenSchool',
  description: 'Purpose-bound diagnostic access for authorized OpenSchool support operators.',
}

export default function SupportPage() {
  return (
    <TRPCProvider>
      <SupportSessionPanel />
    </TRPCProvider>
  )
}
