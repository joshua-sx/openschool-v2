# OpenSchool

A modern K-12 school management platform built for developing and semi-digital contexts.

## Features

- 🏢 **Multi-tenant**: Organization → School → Class hierarchy
- 🔐 **Role-based access**: 7 roles with granular permissions
- 📊 **Student management**: Enrollment, grades, attendance
- 👨‍🏫 **Teacher tools**: Class rosters, gradebook, assignments
- 👨‍👩‍👧 **Parent portal**: View child's progress
- 📝 **Audit logging**: Compliance-ready activity tracking

## Tech Stack

- **Monorepo**: Turborepo + Bun
- **Frontend**: Next.js 15 (App Router) + shadcn/ui + Tailwind
- **API**: tRPC v11 + Hono
- **Database**: Supabase PostgreSQL + Drizzle ORM
- **Auth**: Supabase Auth + Custom RBAC

## Getting Started

### Prerequisites

- [Bun](https://bun.sh) >= 1.0
- [Supabase CLI](https://supabase.com/docs/guides/cli)
- PostgreSQL (via Supabase)

### Installation

# Clone the repository

git clone hhttps://github.com/joshua-sx/openschool-v2.git

cd openschool

# Install dependencies

bun install

# Copy environment variables

cp .env.example .env.local

# Set up the database

bun run db:migrate

bun run db:seed

# Start development

bun run dev


### Environment Variables

See `.env.example` for required variables.

## Project Structure

openschool/

├── apps/

│   ├── web/                    # Next.js web application

│   └── api/                    # Standalone API server

├── packages/

│   ├── db/                     # Database schema & migrations

│   ├── rbac/                   # Role-based access control

│   ├── auth/                   # Authentication utilities

│   ├── audit/                  # Audit logging

│   ├── ui/                     # Shared UI components

│   └── config/                 # Shared configurations

├── scripts/                    # Build & utility scripts

└── docs/                       # Documentation

```

## Development

```

# Run all apps

bun run dev

# Run specific app

bun run dev --filter=web

# Type check

bun run typecheck

# Lint

bun run lint

# Build

bun run build

```

## Database

```

# Generate types after schema changes

bun run db:generate

# Run migrations

bun run db:migrate

# Seed database

bun run db:seed

# Open Drizzle Studio

bun run db:studio


## Documentation

- [Architecture Guide](./docs/ARCHITECTURE.md)
- [RBAC System](./docs/RBAC.md)
- [API Reference](./docs/API.md)

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

## License

MIT