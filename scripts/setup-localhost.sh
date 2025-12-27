#!/bin/bash

# Script to add localhost entries for OpenSchool development
# Run with: bash scripts/setup-localhost.sh

echo "Setting up localhost entries for OpenSchool..."

# Check if entries already exist
if grep -q "openschool.local" /etc/hosts; then
    echo "✓ OpenSchool entries already exist in /etc/hosts"
else
    echo "Adding OpenSchool entries to /etc/hosts (requires sudo)..."
    sudo bash -c 'echo "" >> /etc/hosts'
    sudo bash -c 'echo "# OpenSchool local development" >> /etc/hosts'
    sudo bash -c 'echo "127.0.0.1 www.openschool.local" >> /etc/hosts'
    sudo bash -c 'echo "127.0.0.1 app.openschool.local" >> /etc/hosts'
    echo "✓ Added OpenSchool entries to /etc/hosts"
fi

echo ""
echo "Setup complete! You can now access:"
echo "  - Marketing site: http://www.openschool.local:3000"
echo "  - App: http://app.openschool.local:3000"
echo ""
echo "Note: Make sure to set up your .env.local file with Supabase credentials."

