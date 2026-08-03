import type { Metadata } from 'next'
import { SupportAccessSettingsPanel } from './support-access-settings-panel'

export const metadata: Metadata = {
  title: 'Support access - OpenSchool',
  description: 'Approve, monitor, revoke, and review time-bound support access.',
}

export default function SupportAccessSettingsPage() {
  return <SupportAccessSettingsPanel />
}
