#!/usr/bin/env bun

import { readFileSync } from 'node:fs'
import { relative, resolve } from 'node:path'
import { Glob } from 'bun'

const root = resolve(import.meta.dir, '..')
const scanRoots = ['apps', 'packages/auth', 'packages/audit']
const violations: string[] = []

for (const scanRoot of scanRoots) {
  const absoluteRoot = resolve(root, scanRoot)
  for await (const file of new Glob('**/*.{ts,tsx}').scan({ cwd: absoluteRoot, absolute: true })) {
    if (/ [23]\.tsx?$/.test(file) || file.includes('/.next/') || file.includes('/node_modules/')) {
      continue
    }
    const source = readFileSync(file, 'utf8')
    const path = relative(root, file)
    if (/\bgetDb\s*\(|\bcreateMigrationClient\s*\(/.test(source) && !path.endsWith('-poc.ts')) {
      violations.push(`${path}: product code cannot create or obtain a global database client`)
    }
    if (source.includes('DATABASE_MIGRATION_URL') && !path.endsWith('-poc.ts')) {
      violations.push(`${path}: product code cannot read the migration-owner credential`)
    }
    if (/from ['"]postgres['"]/.test(source) && !path.endsWith('-poc.ts')) {
      violations.push(`${path}: direct postgres-js access is restricted to guarded proofs`)
    }
    if (/\.unsafe\s*\(/.test(source)) {
      violations.push(`${path}: raw SQL is not on the reviewed infrastructure allowlist`)
    }
  }
}

if (violations.length > 0) {
  console.error(
    `Database boundary check failed:\n${violations.map((value) => `- ${value}`).join('\n')}`
  )
  process.exit(1)
}

console.log(
  'Database boundary check passed: product code has no owner/global client or unreviewed raw SQL path.'
)
