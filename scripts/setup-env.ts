#!/usr/bin/env bun

/**
 * Interactive script to set up .env.local with Supabase credentials
 * Run with: bun run scripts/setup-env.ts
 */

import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

const envPath = join(process.cwd(), '.env.local')
const examplePath = join(process.cwd(), '.env.example')

console.log('🔧 OpenSchool Environment Setup\n')
console.log('This script will help you fill in your .env.local file.\n')
console.log('You can find these values in your Supabase dashboard:')
console.log('  📍 https://app.supabase.com/project/_/settings/api\n')

// Read the example file
let envContent = readFileSync(examplePath, 'utf-8')

// Prompt for values
const prompts = [
  {
    key: 'NEXT_PUBLIC_SUPABASE_URL',
    question: 'Enter your Supabase Project URL (e.g., https://xxxxx.supabase.co):',
    example: 'https://your-project-ref.supabase.co',
  },
  {
    key: 'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    question: 'Enter your Supabase Anon/Public Key:',
    example: 'your-anon-key-here',
  },
  {
    key: 'DATABASE_URL',
    question: 'Enter your Database Connection String (postgresql://...):',
    example: 'postgresql://postgres:[PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres',
  },
]

const values: Record<string, string> = {}

for (const prompt of prompts) {
  // For now, we'll use a simple approach - in a real interactive script,
  // you'd use readline or a library like inquirer
  // This is a template that shows what needs to be filled
  console.log(`\n${prompt.question}`)
  console.log(`  Example: ${prompt.example}`)
  
  // In a real interactive version, you'd read from stdin here
  // For now, we'll show instructions
}

console.log('\n\n📝 To fill in your .env.local file:')
console.log('1. Go to https://app.supabase.com/project/_/settings/api')
console.log('2. Copy the "Project URL" → NEXT_PUBLIC_SUPABASE_URL')
console.log('3. Copy the "anon public" key → NEXT_PUBLIC_SUPABASE_ANON_KEY')
console.log('4. Go to Database > Connection string > URI')
console.log('5. Copy the connection string → DATABASE_URL')
console.log('\nOr edit .env.local directly with your values.\n')

// Check if file already has real values
const currentContent = readFileSync(envPath, 'utf-8')
const hasPlaceholders = currentContent.includes('your-project-ref') || 
                        currentContent.includes('your-anon-key-here') ||
                        currentContent.includes('[YOUR-PASSWORD]')

if (hasPlaceholders) {
  console.log('⚠️  Your .env.local still contains placeholder values.')
  console.log('   Please replace them with your actual Supabase credentials.\n')
} else {
  console.log('✅ Your .env.local appears to be configured!')
  console.log('   Make sure all values are correct before running the app.\n')
}

