#!/bin/bash

# Script to set up environment variables for OpenSchool
# Run with: bash scripts/setup-env.sh

ENV_FILE="apps/web/.env.local"

echo "Setting up environment variables for OpenSchool..."
echo ""

if [ -f "$ENV_FILE" ]; then
    echo "⚠️  $ENV_FILE already exists!"
    read -p "Do you want to overwrite it? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Aborted."
        exit 0
    fi
fi

echo "Please provide your Supabase credentials."
echo "You can find these at: https://supabase.com/dashboard/project/_/settings/api"
echo ""

read -p "Enter your Supabase Project URL: " SUPABASE_URL
read -p "Enter your Supabase Anon Key: " SUPABASE_ANON_KEY

# Set defaults for local URLs
APP_URL="http://app.openschool.local:3000"
WWW_URL="http://www.openschool.local:3000"

cat > "$ENV_FILE" << EOF
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=$SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=$SUPABASE_ANON_KEY

# Local Development URLs
NEXT_PUBLIC_APP_URL=$APP_URL
NEXT_PUBLIC_WWW_URL=$WWW_URL
EOF

echo ""
echo "✅ Created $ENV_FILE"
echo ""
echo "⚠️  IMPORTANT: Make sure to configure Supabase redirect URLs:"
echo "   - Site URL: $WWW_URL"
echo "   - Redirect URLs: $APP_URL/auth/callback"
echo ""
echo "You can find this in: Supabase Dashboard > Authentication > URL Configuration"

