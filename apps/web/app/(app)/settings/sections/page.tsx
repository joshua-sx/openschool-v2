import type { Metadata } from 'next'
import { SectionSettingsPanel } from './section-settings-panel'

export const metadata: Metadata = {
  title: 'Courses and sections - OpenSchool',
  description: 'Manage courses, homerooms, teaching assignments, and authoritative rosters.',
}

export default function SectionSettingsPage() {
  return <SectionSettingsPanel />
}
