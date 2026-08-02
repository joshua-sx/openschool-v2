'use client'

import { motion } from 'framer-motion'
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  Check,
  ChevronDown,
  Menu,
  Shield,
  Users,
  X,
} from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'

const navigationLinks = [
  { id: 'current-scope', label: 'Current Scope', href: '#current-scope' },
  { id: 'approach', label: 'Approach', href: '#approach' },
  { id: 'roadmap', label: 'Roadmap', href: '#roadmap' },
  { id: 'faq', label: 'FAQ', href: '#faq' },
]

const howItWorksSteps = [
  {
    id: 'evidence',
    title: 'Show the evidence',
    description: 'Tie every public capability to working code, tests, or an explicit roadmap item.',
    icon: BookOpen,
  },
  {
    id: 'foundation',
    title: 'Harden the foundation',
    description: 'Prove tenant isolation, authorization, auditability, and recovery before pilots.',
    icon: Shield,
  },
  {
    id: 'workflow',
    title: 'Deliver complete workflows',
    description: 'Build school outcomes end to end instead of shipping disconnected feature demos.',
    icon: Users,
  },
]

const validationPriorities = [
  {
    id: 'isolation',
    title: 'Tenant isolation',
    description:
      'Prove that organization and school data remains isolated across every API, database, file, job, cache, and export path.',
    icon: Shield,
  },
  {
    id: 'school-fit',
    title: 'School workflow fit',
    description:
      'Validate primary and high-school workflows with administrators, teachers, families, and students before calling them complete.',
    icon: Users,
  },
  {
    id: 'operations',
    title: 'Operational readiness',
    description:
      'Demonstrate monitoring, backup and restore, incident response, accessibility, support, and safe data offboarding.',
    icon: BarChart3,
  },
]

const roadmapStages = [
  {
    id: 'preview',
    name: 'Development preview',
    status: 'Available now',
    description: 'Useful for evaluating the direction—not for operating a school with real data.',
    features: [
      'Organization and school schema',
      'Email authentication shell',
      'Basic student list, create, view, and edit flows',
      'Early role and audit primitives',
    ],
  },
  {
    id: 'foundation',
    name: 'Production foundation',
    status: 'In progress',
    description: 'Security and operational gates required before controlled school pilots.',
    features: [
      'Verified tenant isolation and organization hierarchy',
      'Identity, scoped authorization, and privileged access',
      'Auditable migrations, RLS, and recovery evidence',
      'Production monitoring and go/no-go review',
    ],
  },
  {
    id: 'operations',
    name: 'School operations',
    status: 'Planned',
    description: 'Complete workflows delivered in dependency order after the foundation is proven.',
    features: [
      'Admissions, people, enrollment, and academic structure',
      'Attendance, assessment, gradebook, and report cards',
      'Portals, communications, scheduling, and documents',
      'Billing, analytics, reporting, and integrations',
    ],
  },
]

const features = [
  {
    id: 'student-management',
    icon: Users,
    title: 'Basic student records',
    description:
      'Authenticated administrators can list, create, view, and edit a limited student record.',
    status: 'Preview',
  },
  {
    id: 'organization-model',
    icon: BookOpen,
    title: 'Organization and school model',
    description:
      'The schema represents organizations, schools, memberships, classes, and enrollments; hierarchy behavior is still being hardened.',
    status: 'Partial',
  },
  {
    id: 'access-foundation',
    icon: Shield,
    title: 'Access-control foundation',
    description:
      'Authentication, tenant context, permission primitives, and focused authorization tests exist; the model is not yet production-approved.',
    status: 'Partial',
  },
  {
    id: 'delivery-foundation',
    icon: BarChart3,
    title: 'Verified delivery gate',
    description:
      'Frozen installs, formatting, lint, workspace type checks, unit tests, and production builds run in GitHub Actions.',
    status: 'Available',
  },
]

const faqs = [
  {
    id: 'available',
    question: 'What works today?',
    answer:
      'The development preview includes the application shell, email authentication, organization and school data models, and limited administrator student-record flows. The public capability status links each claim to code.',
  },
  {
    id: 'real-data',
    question: 'Can a school use real student data yet?',
    answer:
      'No. OpenSchool is pre-production software. Tenant isolation, access control, privacy, recovery, and operational readiness must be independently verified before any real school data is used.',
  },
  {
    id: 'school-types',
    question: 'Is OpenSchool for primary schools or high schools?',
    answer:
      'The target architecture is shared across both. High schools drive the more complex scheduling, course, credit, and assessment requirements; primary schools use the same foundations with simpler operating profiles. These workflows still require field validation.',
  },
  {
    id: 'multi-school',
    question: 'Does multi-school management work?',
    answer:
      'The schema and early tenant context support organizations with multiple schools, but descendant visibility, scoped roles, isolation, and context selection are part of the active production-foundation roadmap.',
  },
  {
    id: 'pricing',
    question: 'Is there a free trial or published pricing?',
    answer:
      'No commercial plans or trial are currently offered. Pricing will be evaluated only after the product is safe for controlled pilots and the support and hosting model is understood.',
  },
]

export default function LandingPage() {
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [openFaqId, setOpenFaqId] = useState<string | null>(null)

  const scrollToSection = (href: string) => {
    const element = document.querySelector(href)
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' })
    }
    setIsMenuOpen(false)
  }

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
    setIsMenuOpen(false)
  }

  return (
    <div className="min-h-screen bg-surface-primary font-sans text-text-primary selection:bg-surface-tertiary selection:text-text-primary">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-surface-primary/80 backdrop-blur-md border-b border-border-light">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <button
              type="button"
              onClick={scrollToTop}
              className="flex items-center space-x-2 hover:opacity-80 transition-opacity"
            >
              <div className="w-8 h-8 bg-brand rounded-lg flex items-center justify-center">
                <BookOpen className="w-4 h-4 text-white" />
              </div>
              <span className="text-lg font-bold tracking-tight">OpenSchool</span>
            </button>

            <nav className="hidden md:flex items-center space-x-8">
              {navigationLinks.map((link) => (
                <button
                  type="button"
                  key={link.id}
                  onClick={() => scrollToSection(link.href)}
                  className="text-sm font-medium text-text-secondary hover:text-text-primary transition-colors duration-150"
                >
                  {link.label}
                </button>
              ))}
            </nav>

            <div className="hidden md:flex items-center space-x-4">
              <Link
                href="/auth/login"
                className="text-sm font-medium text-text-secondary hover:text-text-primary transition-colors duration-150"
              >
                Developer Sign In
              </Link>
              <button
                type="button"
                onClick={() => scrollToSection('#current-scope')}
                className="bg-brand text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-brand-hover transition-all duration-200 shadow-sm hover:shadow-md"
              >
                View Current Scope
              </button>
            </div>

            <button
              type="button"
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="md:hidden p-2 text-gray-900"
            >
              {isMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>

          {isMenuOpen && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="md:hidden py-4 border-t border-border-light bg-surface-primary"
            >
              <nav className="flex flex-col space-y-4">
                {navigationLinks.map((link) => (
                  <button
                    type="button"
                    key={link.id}
                    onClick={() => scrollToSection(link.href)}
                    className="text-left text-text-secondary hover:text-text-primary font-medium py-2 transition-colors duration-150"
                  >
                    {link.label}
                  </button>
                ))}
                <div className="flex flex-col space-y-3 pt-4 border-t border-border-light">
                  <Link href="/auth/login" className="text-left text-text-primary font-medium py-2">
                    Developer Sign In
                  </Link>
                  <button
                    type="button"
                    onClick={() => scrollToSection('#current-scope')}
                    className="bg-brand text-white px-6 py-3 rounded-lg font-medium text-center"
                  >
                    View Current Scope
                  </button>
                </div>
              </nav>
            </motion.div>
          )}
        </div>
      </header>

      {/* Hero Section */}
      <section className="pt-32 pb-20 bg-surface-primary">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-4xl mx-auto mb-16">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
            >
              <div className="inline-flex items-center space-x-2 bg-surface-secondary border border-border-default px-3 py-1 rounded-full text-xs font-medium text-text-secondary mb-6">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-text-muted opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-text-primary" />
                </span>
                <span>Early development preview</span>
              </div>

              <h1 className="text-5xl md:text-6xl lg:text-7xl font-bold text-text-primary tracking-tight mb-6 leading-[1.1]">
                Building the operating system schools deserve.
              </h1>

              <p className="text-xl text-text-secondary leading-relaxed max-w-2xl mx-auto mb-10">
                OpenSchool is an early-stage, publicly developed school administration platform. The
                current preview demonstrates basic organization, school, account, and student record
                flows while the production foundation is being hardened.
              </p>

              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <button
                  type="button"
                  onClick={() => scrollToSection('#current-scope')}
                  className="bg-brand text-white px-8 py-4 rounded-xl font-medium hover:bg-brand-hover transition-all flex items-center justify-center space-x-2 shadow-lg hover:shadow-xl hover:-translate-y-0.5 duration-200"
                >
                  <span>See What Works</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
                <Link
                  href="https://github.com/joshua-sx/openschool-v2/milestone/1"
                  target="_blank"
                  rel="noreferrer"
                  className="bg-surface-primary text-text-primary border border-border-default px-8 py-4 rounded-xl font-medium hover:bg-surface-secondary transition-all duration-200 flex items-center justify-center space-x-2"
                >
                  <span>Review the Roadmap</span>
                </Link>
              </div>
            </motion.div>
          </div>

          {/* Dashboard Mockup */}
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.8 }}
            className="relative"
          >
            <div className="bg-surface-secondary rounded-2xl p-2 border border-border-default shadow-lg overflow-hidden">
              <div className="bg-surface-primary rounded-xl overflow-hidden border border-border-default/50">
                {/* Mockup Header */}
                <div className="h-12 border-b border-border-light flex items-center px-4 gap-2">
                  <div className="flex gap-1.5">
                    <div className="w-3 h-3 rounded-full bg-border-default" />
                    <div className="w-3 h-3 rounded-full bg-border-default" />
                    <div className="w-3 h-3 rounded-full bg-border-default" />
                  </div>
                  <div className="flex-1 flex justify-center">
                    <div className="bg-surface-secondary px-3 py-1 rounded-md text-[10px] text-text-muted font-medium border border-border-light">
                      openschool.app
                    </div>
                  </div>
                </div>
                {/* Mockup Content */}
                <div className="grid grid-cols-12 h-[500px]">
                  <div className="col-span-2 border-r border-border-light bg-surface-secondary/50 p-4 space-y-4 hidden md:block">
                    <div className="space-y-1">
                      <div className="h-8 bg-surface-primary border border-border-default rounded-lg mb-4" />
                      {[1, 2, 3, 4, 5].map((i) => (
                        <div
                          key={i}
                          className="h-8 rounded-lg hover:bg-surface-tertiary transition-colors duration-150"
                        />
                      ))}
                    </div>
                  </div>
                  <div className="col-span-12 md:col-span-10 bg-surface-primary p-6 md:p-8">
                    <div className="flex justify-between items-end mb-8">
                      <div>
                        <div className="h-8 w-48 bg-surface-tertiary rounded-lg mb-2" />
                        <div className="h-4 w-32 bg-surface-secondary rounded-lg" />
                      </div>
                      <div className="h-10 w-32 bg-brand rounded-lg" />
                    </div>
                    <div className="grid grid-cols-3 gap-6 mb-8">
                      {[1, 2, 3].map((i) => (
                        <div
                          key={i}
                          className="h-32 border border-border-light rounded-xl p-4 shadow-sm bg-surface-primary"
                        >
                          <div className="h-8 w-8 bg-surface-secondary rounded-lg mb-4" />
                          <div className="h-6 w-24 bg-surface-tertiary rounded-lg mb-2" />
                          <div className="h-4 w-16 bg-surface-secondary rounded-lg" />
                        </div>
                      ))}
                    </div>
                    <div className="h-64 border border-border-light rounded-xl bg-surface-secondary/30" />
                  </div>
                </div>
              </div>
            </div>
            <p className="text-center text-xs text-text-muted mt-4">
              Illustrative interface preview. No customer or live school data is shown.
            </p>
          </motion.div>
        </div>
      </section>

      {/* Public Build Principles */}
      <section className="py-12 border-b border-border-light bg-surface-primary">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <p className="text-sm font-medium text-text-secondary mb-8 uppercase tracking-wider">
            Built in public
          </p>
          <div className="flex flex-wrap justify-center items-center gap-8 md:gap-16 text-sm font-semibold text-text-primary">
            <div>Public issue tracker</div>
            <div>Evidence-backed capability status</div>
            <div>Reviewable delivery gates</div>
          </div>
        </div>
      </section>

      {/* Current Scope Grid */}
      <section id="current-scope" className="py-24 bg-surface-secondary/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-3xl font-bold text-text-primary tracking-tight mb-4">
              What the preview supports today
            </h2>
            <p className="text-text-secondary max-w-2xl mx-auto">
              A narrow, inspectable slice of the intended platform—not a production school system.
            </p>
          </motion.div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {features.map((feature, index) => {
              const IconComponent = feature.icon
              return (
                <motion.div
                  key={feature.id}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.1 }}
                  className="bg-surface-primary p-6 rounded-xl border border-border-default hover:shadow-md hover:border-border-dark transition-all duration-200 group"
                >
                  <div className="w-10 h-10 rounded-lg bg-surface-secondary border border-border-light flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-200">
                    <IconComponent className="w-5 h-5 text-text-primary" />
                  </div>
                  <h3 className="text-lg font-semibold text-text-primary mb-2">{feature.title}</h3>
                  <span className="inline-flex px-2 py-1 text-xs font-medium rounded-full bg-surface-secondary border border-border-light text-text-secondary mb-3">
                    {feature.status}
                  </span>
                  <p className="text-sm text-text-secondary leading-relaxed">
                    {feature.description}
                  </p>
                </motion.div>
              )
            })}
          </div>
        </div>
      </section>

      {/* Delivery Approach */}
      <section id="approach" className="py-24 bg-surface-primary border-t border-border-light">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-text-primary tracking-tight mb-4">
              How we are building it
            </h2>
            <p className="text-text-secondary max-w-2xl mx-auto">
              Trust must be earned before breadth is marketed.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-12">
            {howItWorksSteps.map((step, index) => {
              const Icon = step.icon
              return (
                <motion.div
                  key={step.id}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.2 }}
                  className="text-center relative"
                >
                  <div className="w-16 h-16 mx-auto bg-surface-secondary rounded-2xl border border-border-light flex items-center justify-center mb-6">
                    <Icon className="w-8 h-8 text-text-primary" />
                  </div>
                  <h3 className="text-xl font-semibold text-text-primary mb-3">{step.title}</h3>
                  <p className="text-text-secondary leading-relaxed">{step.description}</p>

                  {index < howItWorksSteps.length - 1 && (
                    <div className="hidden md:block absolute top-8 -right-6 w-12 border-t-2 border-dashed border-border-default" />
                  )}
                </motion.div>
              )
            })}
          </div>
        </div>
      </section>

      {/* Validation Priorities */}
      <section className="py-24 bg-surface-secondary/50 border-t border-border-light">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-text-primary tracking-tight mb-4">
              What must be proven before pilots
            </h2>
            <p className="text-text-secondary max-w-2xl mx-auto">
              These are active validation gates, not completed security or readiness claims.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {validationPriorities.map((item, index) => {
              const Icon = item.icon
              return (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.1 }}
                  className="bg-surface-primary p-8 rounded-xl border border-border-default shadow-sm"
                >
                  <div className="w-10 h-10 rounded-lg bg-surface-secondary border border-border-light flex items-center justify-center mb-5">
                    <Icon className="w-5 h-5 text-text-primary" />
                  </div>
                  <h3 className="font-semibold text-text-primary mb-3">{item.title}</h3>
                  <p className="text-text-secondary leading-relaxed">{item.description}</p>
                </motion.div>
              )
            })}
          </div>
        </div>
      </section>

      {/* Roadmap */}
      <section id="roadmap" className="py-24 bg-surface-primary border-t border-border-light">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-text-primary tracking-tight mb-4">
              A staged path to school readiness
            </h2>
            <p className="text-text-secondary max-w-2xl mx-auto">
              No commercial plans or free trial are offered while the platform remains
              pre-production.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {roadmapStages.map((stage, index) => (
              <motion.div
                key={stage.id}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                className="relative p-8 rounded-xl border border-border-default bg-surface-secondary/50"
              >
                <span className="inline-flex px-2 py-1 text-xs font-medium rounded-full bg-surface-primary border border-border-default text-text-secondary mb-4">
                  {stage.status}
                </span>
                <h3 className="text-lg font-semibold text-text-primary mb-2">{stage.name}</h3>
                <p className="text-text-secondary text-sm mb-6">{stage.description}</p>

                <ul className="space-y-3 mb-8">
                  {stage.features.map((feature) => (
                    <li
                      key={feature}
                      className="flex items-center gap-3 text-sm text-text-secondary"
                    >
                      <Check className="w-4 h-4 text-text-primary shrink-0" />
                      {feature}
                    </li>
                  ))}
                </ul>

                <Link
                  href="https://github.com/joshua-sx/openschool-v2/milestone/1"
                  target="_blank"
                  rel="noreferrer"
                  className="w-full py-2.5 rounded-xl font-medium transition-all duration-200 block text-center bg-surface-primary border border-border-default text-text-primary hover:bg-surface-secondary"
                >
                  View delivery issues
                </Link>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="py-24 bg-surface-secondary/50 border-t border-border-light">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-text-primary tracking-tight mb-4">
              Frequently asked questions
            </h2>
          </div>

          <div className="space-y-4">
            {faqs.map((faq) => (
              <div
                key={faq.id}
                className="bg-surface-primary rounded-xl border border-border-default overflow-hidden"
              >
                <button
                  type="button"
                  onClick={() => setOpenFaqId(openFaqId === faq.id ? null : faq.id)}
                  className="w-full flex items-center justify-between p-6 text-left"
                >
                  <span className="font-medium text-text-primary">{faq.question}</span>
                  <ChevronDown
                    className={`w-5 h-5 text-text-secondary transition-transform duration-200 ${
                      openFaqId === faq.id ? 'rotate-180' : ''
                    }`}
                  />
                </button>
                {openFaqId === faq.id && (
                  <div className="px-6 pb-6 text-text-secondary text-sm leading-relaxed">
                    {faq.answer}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-24 bg-surface-primary border-t border-border-light">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <h2 className="text-3xl font-bold text-text-primary tracking-tight mb-6">
            Follow the build, not a promise
          </h2>
          <p className="text-lg text-text-secondary mb-8">
            Review the evidence, open issues, and production gates as OpenSchool develops.
          </p>
          <div className="flex justify-center gap-4">
            <Link
              href="https://github.com/joshua-sx/openschool-v2/milestone/1"
              target="_blank"
              rel="noreferrer"
              className="bg-brand text-white px-8 py-4 rounded-xl font-medium hover:bg-brand-hover transition-all duration-200"
            >
              Review the Roadmap
            </Link>
            <Link
              href="https://github.com/joshua-sx/openschool-v2"
              target="_blank"
              rel="noreferrer"
              className="bg-surface-primary text-text-primary border border-border-default px-8 py-4 rounded-xl font-medium hover:bg-surface-secondary transition-all duration-200"
            >
              Inspect the Source
            </Link>
          </div>
        </div>
      </section>

      {/* Simple Footer */}
      <footer className="py-12 bg-surface-primary border-t border-border-light">
        <div className="max-w-7xl mx-auto px-4 text-center">
          <p className="text-text-muted text-sm">
            © 2026 OpenSchool. Pre-production software—do not use with real student data.
          </p>
        </div>
      </footer>
    </div>
  )
}
