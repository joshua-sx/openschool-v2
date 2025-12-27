"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import {
  Menu,
  X,
  BookOpen,
  Users,
  Award,
  ArrowRight,
  Check,
  Star,
  Play,
  BarChart3,
  MessageSquare,
  Shield,
  Smartphone,
  Zap,
  ChevronDown,
} from "lucide-react";

const navigationLinks = [
  { id: "features", label: "Features", href: "#features" },
  { id: "how-it-works", label: "How It Works", href: "#how-it-works" },
  { id: "pricing", label: "Pricing", href: "#pricing" },
  { id: "faq", label: "FAQ", href: "#faq" },
];

const howItWorksSteps = [
  {
    id: "setup",
    title: "Quick Setup",
    description:
      "Create your school profile and customize your dashboard in minutes",
    icon: BookOpen,
  },
  {
    id: "connect",
    title: "Connect Everyone",
    description:
      "Invite teachers, students, and parents to join your digital ecosystem",
    icon: Users,
  },
  {
    id: "succeed",
    title: "Watch Success",
    description:
      "Track progress, improve outcomes, and celebrate achievements together",
    icon: Award,
  },
];

const testimonials = [
  {
    id: "sarah",
    name: "Sarah Johnson",
    role: "Principal, Riverside Elementary",
    content:
      "OpenSchool transformed how we manage our school. Communication is seamless and parents are more engaged than ever.",
    rating: 5,
  },
  {
    id: "michael",
    name: "Michael Chen",
    role: "Teacher, Lincoln High School",
    content:
      "The gradebook and assignment features save me hours each week. My students love the interactive learning tools.",
    rating: 5,
  },
  {
    id: "maria",
    name: "Maria Rodriguez",
    role: "Parent of 2 students",
    content:
      "Finally, I can stay connected with my children's education. The app makes it so easy to track their progress.",
    rating: 5,
  },
];

const pricingTiers = [
  {
    id: "starter",
    name: "Starter",
    price: "Free",
    description: "Perfect for small schools getting started",
    features: [
      "Up to 100 students",
      "Basic gradebook",
      "Parent communication",
      "Mobile app access",
    ],
    popular: false,
  },
  {
    id: "professional",
    name: "Professional",
    price: "$29/month",
    description: "Everything you need for growing schools",
    features: [
      "Up to 500 students",
      "Advanced analytics",
      "Custom reports",
      "Priority support",
      "Integration tools",
    ],
    popular: true,
  },
  {
    id: "enterprise",
    name: "Enterprise",
    price: "Custom",
    description: "Tailored solutions for large institutions",
    features: [
      "Unlimited students",
      "Custom integrations",
      "Dedicated support",
      "Advanced security",
      "Training included",
    ],
    popular: false,
  },
];

const features = [
  {
    id: "student-management",
    icon: Users,
    title: "Student Management",
    description:
      "Comprehensive student profiles, enrollment tracking, and academic history management.",
    benefits: [
      "Digital student records",
      "Attendance tracking",
      "Parent contact management",
    ],
    userType: "Administrators",
  },
  {
    id: "gradebook",
    icon: BookOpen,
    title: "Smart Gradebook",
    description:
      "Intuitive grading system with automated calculations and real-time progress updates.",
    benefits: [
      "Automated calculations",
      "Assignment distribution",
      "Progress reports",
    ],
    userType: "Teachers",
  },
  {
    id: "analytics",
    icon: BarChart3,
    title: "Advanced Analytics",
    description:
      "Data-driven insights into student performance with visual dashboards.",
    benefits: [
      "Performance dashboards",
      "Trend analysis",
      "Custom reports",
    ],
    userType: "Administrators",
  },
  {
    id: "communication",
    icon: MessageSquare,
    title: "Unified Communication",
    description:
      "Seamless messaging between teachers, students, and parents.",
    benefits: [
      "Real-time messaging",
      "Announcements",
      "Discussion forums",
    ],
    userType: "Everyone",
  },
  {
    id: "security",
    icon: Shield,
    title: "Enterprise Security",
    description:
      "Bank-level security with data encryption and role-based access.",
    benefits: [
      "Data encryption",
      "Role-based access",
      "FERPA compliance",
    ],
    userType: "IT Teams",
  },
  {
    id: "mobile",
    icon: Smartphone,
    title: "Mobile Experience",
    description:
      "Native mobile apps ensuring access anytime, anywhere.",
    benefits: [
      "Native apps",
      "Push notifications",
      "Offline access",
    ],
    userType: "Parents & Students",
  },
  {
    id: "integrations",
    icon: Zap,
    title: "Smart Integrations",
    description:
      "Connect with existing school systems and third-party tools.",
    benefits: [
      "LMS integration",
      "SIS connectivity",
      "API access",
    ],
    userType: "IT Teams",
  },
];

const faqs = [
  {
    id: "1",
    question: "Is OpenSchool free to use?",
    answer:
      "Yes, our Starter plan is completely free for schools with up to 100 students. It includes all essential features to get you up and running.",
  },
  {
    id: "2",
    question: "Can I import data from my existing system?",
    answer:
      "Absolutely. We offer easy import tools for CSV files and direct integrations with many popular SIS platforms on our Professional and Enterprise plans.",
  },
  {
    id: "3",
    question: "Is my data secure?",
    answer:
      "Security is our top priority. We use bank-level encryption for all data and are fully FERPA and GDPR compliant. Your data is backed up daily.",
  },
  {
    id: "4",
    question: "Do you offer training for teachers?",
    answer:
      "Yes! We provide comprehensive video tutorials, a help center, and live onboarding sessions for your staff to ensure a smooth transition.",
  },
  {
    id: "5",
    question: "Can parents access OpenSchool?",
    answer:
      "Yes, we have a dedicated mobile app and web portal for parents to track their child's progress, attendance, and communicate with teachers.",
  },
];

export default function LandingPage() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [openFaqId, setOpenFaqId] = useState<string | null>(null);

  const scrollToSection = (href: string) => {
    const element = document.querySelector(href);
    if (element) {
      element.scrollIntoView({ behavior: "smooth" });
    }
    setIsMenuOpen(false);
  };

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
    setIsMenuOpen(false);
  };

  return (
    <div className="min-h-screen bg-white font-sans text-gray-900 selection:bg-gray-100 selection:text-gray-900">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-md border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <button
              onClick={scrollToTop}
              className="flex items-center space-x-2 hover:opacity-80 transition-opacity"
            >
              <div className="w-8 h-8 bg-black rounded-lg flex items-center justify-center">
                <BookOpen className="w-4 h-4 text-white" />
              </div>
              <span className="text-lg font-bold tracking-tight">
                OpenSchool
              </span>
            </button>

            <nav className="hidden md:flex items-center space-x-8">
              {navigationLinks.map((link) => (
                <button
                  key={link.id}
                  onClick={() => scrollToSection(link.href)}
                  className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
                >
                  {link.label}
                </button>
              ))}
            </nav>

            <div className="hidden md:flex items-center space-x-4">
              <Link
                href="/auth/login"
                className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
              >
                Sign In
              </Link>
              <Link
                href="/auth/signup"
                className="bg-black text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-gray-800 transition-all shadow-sm hover:shadow-md"
              >
                Get Started
              </Link>
            </div>

            <button
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
              className="md:hidden py-4 border-t border-gray-100 bg-white"
            >
              <nav className="flex flex-col space-y-4">
                {navigationLinks.map((link) => (
                  <button
                    key={link.id}
                    onClick={() => scrollToSection(link.href)}
                    className="text-left text-gray-600 hover:text-gray-900 font-medium py-2"
                  >
                    {link.label}
                  </button>
                ))}
                <div className="flex flex-col space-y-3 pt-4 border-t border-gray-100">
                  <Link
                    href="/auth/login"
                    className="text-left text-gray-900 font-medium py-2"
                  >
                    Sign In
                  </Link>
                  <Link
                    href="/auth/signup"
                    className="bg-black text-white px-6 py-3 rounded-lg font-medium text-center"
                  >
                    Get Started
                  </Link>
                </div>
              </nav>
            </motion.div>
          )}
        </div>
      </header>

      {/* Hero Section */}
      <section className="pt-32 pb-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-4xl mx-auto mb-16">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
            >
              <div className="inline-flex items-center space-x-2 bg-gray-50 border border-gray-200 px-3 py-1 rounded-full text-xs font-medium text-gray-600 mb-6">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-gray-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-gray-900"></span>
                </span>
                <span>Now available for districts</span>
              </div>

              <h1 className="text-5xl md:text-6xl lg:text-7xl font-bold text-gray-900 tracking-tight mb-6 leading-[1.1]">
                The modern operating system for schools.
              </h1>

              <p className="text-xl text-gray-500 leading-relaxed max-w-2xl mx-auto mb-10">
                Streamline operations, enhance learning, and build stronger
                communities with a platform designed for the future of
                education.
              </p>

              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Link
                  href="/auth/signup"
                  className="bg-black text-white px-8 py-4 rounded-xl font-medium hover:bg-gray-800 transition-all flex items-center justify-center space-x-2 shadow-lg hover:shadow-xl hover:-translate-y-0.5 duration-200"
                >
                  <span>Start Free Trial</span>
                  <ArrowRight className="w-4 h-4" />
                </Link>
                <button className="bg-white text-gray-900 border border-gray-200 px-8 py-4 rounded-xl font-medium hover:bg-gray-50 transition-all flex items-center justify-center space-x-2">
                  <Play className="w-4 h-4" />
                  <span>Watch Demo</span>
                </button>
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
            <div className="bg-gray-50 rounded-2xl p-2 border border-gray-200 shadow-2xl shadow-gray-200/50 overflow-hidden">
              <div className="bg-white rounded-xl overflow-hidden border border-gray-200/50">
                {/* Mockup Header */}
                <div className="h-12 border-b border-gray-100 flex items-center px-4 gap-2">
                  <div className="flex gap-1.5">
                    <div className="w-3 h-3 rounded-full bg-gray-200" />
                    <div className="w-3 h-3 rounded-full bg-gray-200" />
                    <div className="w-3 h-3 rounded-full bg-gray-200" />
                  </div>
                  <div className="flex-1 flex justify-center">
                    <div className="bg-gray-50 px-3 py-1 rounded-md text-[10px] text-gray-400 font-medium border border-gray-100">
                      openschool.app
                    </div>
                  </div>
                </div>
                {/* Mockup Content */}
                <div className="grid grid-cols-12 h-[500px]">
                  <div className="col-span-2 border-r border-gray-100 bg-gray-50/50 p-4 space-y-4 hidden md:block">
                    <div className="space-y-1">
                      <div className="h-8 bg-white border border-gray-200 rounded-lg mb-4" />
                      {[1, 2, 3, 4, 5].map((i) => (
                        <div
                          key={i}
                          className="h-8 rounded-lg hover:bg-gray-100 transition-colors"
                        />
                      ))}
                    </div>
                  </div>
                  <div className="col-span-12 md:col-span-10 bg-white p-6 md:p-8">
                    <div className="flex justify-between items-end mb-8">
                      <div>
                        <div className="h-8 w-48 bg-gray-100 rounded-lg mb-2" />
                        <div className="h-4 w-32 bg-gray-50 rounded-lg" />
                      </div>
                      <div className="h-10 w-32 bg-black rounded-lg" />
                    </div>
                    <div className="grid grid-cols-3 gap-6 mb-8">
                      {[1, 2, 3].map((i) => (
                        <div
                          key={i}
                          className="h-32 border border-gray-100 rounded-xl p-4 shadow-sm bg-white"
                        >
                          <div className="h-8 w-8 bg-gray-50 rounded-lg mb-4" />
                          <div className="h-6 w-24 bg-gray-100 rounded-lg mb-2" />
                          <div className="h-4 w-16 bg-gray-50 rounded-lg" />
                        </div>
                      ))}
                    </div>
                    <div className="h-64 border border-gray-100 rounded-xl bg-gray-50/30" />
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Trusted By Strip */}
      <section className="py-12 border-b border-gray-100 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <p className="text-sm font-medium text-gray-500 mb-8 uppercase tracking-wider">
            Trusted by leading institutions
          </p>
          <div className="flex flex-wrap justify-center items-center gap-8 md:gap-16 opacity-50 grayscale">
            {/* Placeholder Logos - using text for simplicity but styled to look like logos */}
            <div className="text-xl font-bold font-serif">HARVARD</div>
            <div className="text-xl font-bold font-mono">Stanford</div>
            <div className="text-xl font-extrabold tracking-tighter">MIT</div>
            <div className="text-xl font-bold">Berkeley</div>
            <div className="text-xl font-bold font-serif italic">Oxford</div>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section id="features" className="py-24 bg-gray-50/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-3xl font-bold text-gray-900 tracking-tight mb-4">
              Everything you need to run a modern school
            </h2>
            <p className="text-gray-500 max-w-2xl mx-auto">
              Powerful tools for administrators, teachers, students, and
              parents.
            </p>
          </motion.div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {features.map((feature, index) => {
              const IconComponent = feature.icon;
              return (
                <motion.div
                  key={feature.id}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.1 }}
                  className="bg-white p-6 rounded-xl border border-gray-200 hover:shadow-lg hover:border-gray-300 transition-all duration-300 group"
                >
                  <div className="w-10 h-10 rounded-lg bg-gray-50 border border-gray-100 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                    <IconComponent className="w-5 h-5 text-gray-900" />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">
                    {feature.title}
                  </h3>
                  <p className="text-sm text-gray-500 leading-relaxed">
                    {feature.description}
                  </p>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="py-24 bg-white border-t border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-gray-900 tracking-tight mb-4">
              How it works
            </h2>
            <p className="text-gray-500 max-w-2xl mx-auto">
              Get started in minutes, not months.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-12">
            {howItWorksSteps.map((step, index) => {
              const Icon = step.icon;
              return (
                <motion.div
                  key={step.id}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.2 }}
                  className="text-center relative"
                >
                  <div className="w-16 h-16 mx-auto bg-gray-50 rounded-2xl border border-gray-100 flex items-center justify-center mb-6">
                    <Icon className="w-8 h-8 text-gray-900" />
                  </div>
                  <h3 className="text-xl font-semibold text-gray-900 mb-3">
                    {step.title}
                  </h3>
                  <p className="text-gray-500 leading-relaxed">
                    {step.description}
                  </p>

                  {index < howItWorksSteps.length - 1 && (
                    <div className="hidden md:block absolute top-8 -right-6 w-12 border-t-2 border-dashed border-gray-200" />
                  )}
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-24 bg-gray-50/50 border-t border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-gray-900 tracking-tight mb-4">
              Loved by educators
            </h2>
            <p className="text-gray-500 max-w-2xl mx-auto">
              Don't just take our word for it.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {testimonials.map((item, index) => (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                className="bg-white p-8 rounded-2xl border border-gray-200 shadow-sm"
              >
                <div className="flex gap-1 mb-4">
                  {[...Array(5)].map((_, i) => (
                    <Star
                      key={i}
                      className="w-4 h-4 fill-current text-gray-900"
                    />
                  ))}
                </div>
                <p className="text-gray-600 mb-6 leading-relaxed">
                  "{item.content}"
                </p>
                <div>
                  <div className="font-semibold text-gray-900">{item.name}</div>
                  <div className="text-sm text-gray-500">{item.role}</div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-24 bg-white border-t border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-gray-900 tracking-tight mb-4">
              Simple pricing
            </h2>
            <p className="text-gray-500 max-w-2xl mx-auto">
              Transparent pricing for schools of all sizes.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {pricingTiers.map((tier, index) => (
              <motion.div
                key={tier.id}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                className={`relative p-8 rounded-2xl border ${
                  tier.popular
                    ? "border-gray-900 shadow-lg"
                    : "border-gray-200 bg-gray-50/50"
                }`}
              >
                {tier.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-xs font-medium px-3 py-1 rounded-full">
                    Most Popular
                  </div>
                )}
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  {tier.name}
                </h3>
                <div className="text-3xl font-bold text-gray-900 mb-4">
                  {tier.price}
                </div>
                <p className="text-gray-500 text-sm mb-6">{tier.description}</p>

                <ul className="space-y-3 mb-8">
                  {tier.features.map((feature) => (
                    <li
                      key={feature}
                      className="flex items-center gap-3 text-sm text-gray-600"
                    >
                      <Check className="w-4 h-4 text-gray-900 shrink-0" />
                      {feature}
                    </li>
                  ))}
                </ul>

                <Link
                  href="/auth/signup"
                  className={`w-full py-2.5 rounded-xl font-medium transition-all block text-center ${
                    tier.popular
                      ? "bg-gray-900 text-white hover:bg-black"
                      : "bg-white border border-gray-200 text-gray-900 hover:bg-gray-50"
                  }`}
                >
                  Get Started
                </Link>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="py-24 bg-gray-50/50 border-t border-gray-100">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-gray-900 tracking-tight mb-4">
              Frequently asked questions
            </h2>
          </div>

          <div className="space-y-4">
            {faqs.map((faq) => (
              <div
                key={faq.id}
                className="bg-white rounded-xl border border-gray-200 overflow-hidden"
              >
                <button
                  onClick={() =>
                    setOpenFaqId(openFaqId === faq.id ? null : faq.id)
                  }
                  className="w-full flex items-center justify-between p-6 text-left"
                >
                  <span className="font-medium text-gray-900">
                    {faq.question}
                  </span>
                  <ChevronDown
                    className={`w-5 h-5 text-gray-500 transition-transform ${
                      openFaqId === faq.id ? "rotate-180" : ""
                    }`}
                  />
                </button>
                {openFaqId === faq.id && (
                  <div className="px-6 pb-6 text-gray-500 text-sm leading-relaxed">
                    {faq.answer}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-24 bg-white border-t border-gray-100">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <h2 className="text-4xl font-bold text-gray-900 tracking-tight mb-6">
            Ready to get started?
          </h2>
          <p className="text-lg text-gray-500 mb-8">
            Join thousands of forward-thinking schools today.
          </p>
          <div className="flex justify-center gap-4">
            <Link
              href="/auth/signup"
              className="bg-black text-white px-8 py-4 rounded-xl font-medium hover:bg-gray-800 transition-all"
            >
              Start Free Trial
            </Link>
            <button className="bg-white text-gray-900 border border-gray-200 px-8 py-4 rounded-xl font-medium hover:bg-gray-50 transition-all">
              Contact Sales
            </button>
          </div>
        </div>
      </section>

      {/* Simple Footer */}
      <footer className="py-12 bg-white border-t border-gray-100">
        <div className="max-w-7xl mx-auto px-4 text-center">
          <p className="text-gray-400 text-sm">
            © 2025 OpenSchool. Designed for the future of education.
          </p>
        </div>
      </footer>
    </div>
  );
}

