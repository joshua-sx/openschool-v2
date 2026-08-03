import type { Metadata } from 'next'
import { AcademicStructureSettingsPanel } from './academic-structure-settings-panel'

export const metadata: Metadata = {
  title: 'Academic structure - OpenSchool',
  description: 'Configure versioned Academic Years, Terms, and Learner Levels.',
}

export default function AcademicStructureSettingsPage() {
  return <AcademicStructureSettingsPanel />
}
