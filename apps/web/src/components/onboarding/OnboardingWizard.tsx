'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { School, Building2, ArrowRight, Loader2, CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { trpc } from '@/lib/trpc/client'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

type OnboardingMode = 'single' | 'org'

interface OnboardingData {
  orgName: string
  schoolName: string
}

export function OnboardingWizard() {
  const router = useRouter()
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [mode, setMode] = useState<OnboardingMode | null>(null)
  const [data, setData] = useState<OnboardingData>({ orgName: '', schoolName: '' })
  
  const createMutation = trpc.onboarding.complete.useMutation({
    onSuccess: () => {
      setStep(3)
      setTimeout(() => {
        router.push('/dashboard')
        router.refresh()
      }, 2000)
    },
    onError: (error) => {
      toast.error(error.message)
    },
  })

  const handleModeSelect = (selectedMode: OnboardingMode) => {
    setMode(selectedMode)
    setStep(2)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    // Logic to handle naming based on mode
    const finalOrgName = mode === 'single' ? data.schoolName : data.orgName
    const finalSchoolName = data.schoolName

    if (!finalSchoolName || (!finalOrgName && mode === 'org')) return

    await createMutation.mutateAsync({
      orgName: finalOrgName,
      schoolName: finalSchoolName,
    })
  }

  return (
    <div className="w-full max-w-2xl">
      <AnimatePresence mode="wait">
        {step === 1 && (
          <motion.div
            key="step1"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-8"
          >
            <div className="text-center space-y-4">
              <h1 className="text-4xl font-bold tracking-tight text-gray-900">
                Welcome to OpenSchool
              </h1>
              <p className="text-lg text-gray-500 max-w-lg mx-auto">
                Let's get you set up. How are you planning to use OpenSchool?
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4">
              <ModeCard
                icon={School}
                title="Single School"
                description="I manage one school. Keep it simple."
                onClick={() => handleModeSelect('single')}
              />
              <ModeCard
                icon={Building2}
                title="Organization"
                description="I manage a district or network of schools."
                onClick={() => handleModeSelect('org')}
              />
            </div>
          </motion.div>
        )}

        {step === 2 && (
          <motion.div
            key="step2"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="max-w-md mx-auto space-y-8"
          >
            <div className="space-y-2">
              <Button 
                variant="ghost" 
                onClick={() => setStep(1)} 
                className="pl-0 hover:bg-transparent hover:text-gray-900 text-gray-500"
              >
                ← Back
              </Button>
              <h2 className="text-2xl font-bold tracking-tight text-gray-900">
                {mode === 'single' ? 'Name your school' : 'Setup your organization'}
              </h2>
              <p className="text-gray-500">
                {mode === 'single' 
                  ? "This will be the name displayed on your dashboard and student reports."
                  : "Start with your organization name. You'll add your first school next."}
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              {mode === 'org' && (
                <div className="space-y-2">
                  <Label htmlFor="orgName">Organization Name</Label>
                  <Input
                    id="orgName"
                    autoFocus
                    placeholder="e.g. Springfield District"
                    value={data.orgName}
                    onChange={(e) => setData({ ...data, orgName: e.target.value })}
                    className="h-12 text-lg"
                  />
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="schoolName">
                  {mode === 'single' ? 'School Name' : 'First School Name'}
                </Label>
                <Input
                  id="schoolName"
                  autoFocus={mode === 'single'}
                  placeholder={mode === 'single' ? "e.g. Springfield High" : "e.g. Lincoln Elementary"}
                  value={data.schoolName}
                  onChange={(e) => setData({ ...data, schoolName: e.target.value })}
                  className="h-12 text-lg"
                />
              </div>

              <Button 
                type="submit" 
                size="lg" 
                className="w-full h-12 text-base"
                disabled={!data.schoolName || (mode === 'org' && !data.orgName) || createMutation.isPending}
              >
                {createMutation.isPending ? (
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                ) : (
                  <>
                    Complete Setup <ArrowRight className="ml-2 h-5 w-5" />
                  </>
                )}
              </Button>
            </form>
          </motion.div>
        )}

        {step === 3 && (
          <motion.div
            key="step3"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col items-center justify-center space-y-6 text-center py-12"
          >
            <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center text-green-600 mb-4">
              <CheckCircle2 className="w-10 h-10" />
            </div>
            <h2 className="text-3xl font-bold tracking-tight text-gray-900">
              All set!
            </h2>
            <p className="text-gray-500 text-lg">
              Redirecting you to your dashboard...
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function ModeCard({ 
  icon: Icon, 
  title, 
  description, 
  onClick 
}: { 
  icon: any, 
  title: string, 
  description: string, 
  onClick: () => void 
}) {
  return (
    <button
      onClick={onClick}
      className="group relative flex flex-col items-start p-8 rounded-2xl border border-gray-200 bg-white hover:border-gray-300 hover:shadow-md transition-all duration-200 text-left w-full"
    >
      <div className="w-12 h-12 rounded-xl bg-gray-50 border border-gray-100 flex items-center justify-center mb-6 group-hover:bg-gray-100 transition-colors">
        <Icon className="w-6 h-6 text-gray-900" />
      </div>
      <h3 className="text-xl font-bold text-gray-900 mb-2">{title}</h3>
      <p className="text-gray-500 leading-relaxed">{description}</p>
    </button>
  )
}

