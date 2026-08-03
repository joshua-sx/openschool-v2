import type { Metadata } from 'next'
import { SecuritySettingsPanel } from './security-settings-panel'

export const metadata: Metadata = {
  title: 'Security settings - OpenSchool',
  description: 'Manage multifactor authentication and refresh security verification.',
}

export default function SecuritySettingsPage() {
  return <SecuritySettingsPanel />
}
