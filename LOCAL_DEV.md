# Local Development Setup

## Quick Start

### 1. Set up localhost entries

Run the setup script (requires sudo password):

```bash
bash scripts/setup-localhost.sh
```

Or manually add to `/etc/hosts`:
```
127.0.0.1 www.openschool.local
127.0.0.1 app.openschool.local
```

### 2. Create environment file

Create `apps/web/.env.local` with your Supabase credentials:

```bash
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here

# Local Development URLs
NEXT_PUBLIC_APP_URL=http://app.openschool.local:3000
NEXT_PUBLIC_WWW_URL=http://www.openschool.local:3000

# Database (if needed)
DATABASE_URL=your_database_connection_string
```

### 3. Configure Supabase

In your Supabase dashboard, add these redirect URLs under Authentication > URL Configuration:

- **Site URL**: `http://www.openschool.local:3000`
- **Redirect URLs**:
  - `http://app.openschool.local:3000/auth/callback`
  - `http://www.openschool.local:3000/auth/callback`

### 4. Install dependencies (if not done)

```bash
bun install
```

### 5. Run the development server

**Using Bun (recommended):**

From the root directory:
```bash
bun run dev
```

Or from `apps/web`:
```bash
cd apps/web
bun dev
# or
bun run dev
```

**Note:** Bun can run Next.js directly - no need for npm/node. The scripts are already configured to work with Bun.

### 6. Access the app

- **Marketing/Landing Page**: http://www.openschool.local:3000
- **App Dashboard** (after login): http://app.openschool.local:3000/dashboard
- **Login Page**: http://www.openschool.local:3000/auth/login
- **Signup Page**: http://www.openschool.local:3000/auth/signup

## How It Works

### Subdomain Routing

- `www.openschool.local` → Marketing site (landing page, auth pages)
- `app.openschool.local` → Authenticated app (dashboard, protected routes)

The middleware automatically:
- Redirects unauthenticated users from `app.*` to `www.*/auth/login`
- Redirects authenticated users from `www.*/auth/*` to `app.*/dashboard`
- Enforces authentication on all `app.*` routes

### Testing the Flow

1. Visit http://www.openschool.local:3000 → See landing page
2. Click "Get Started" → Goes to signup page
3. Create account → Redirects to app subdomain dashboard
4. Sign out → Redirects back to marketing site

## Troubleshooting

### "Cannot connect to localhost"

- Make sure you're using `www.openschool.local:3000` not `localhost:3000`
- Verify `/etc/hosts` entries are correct
- Try `ping www.openschool.local` to verify DNS resolution

### "Auth redirect not working"

- Check Supabase redirect URLs are configured correctly
- Verify `NEXT_PUBLIC_APP_URL` and `NEXT_PUBLIC_WWW_URL` in `.env.local`
- Check browser console for errors

### "Middleware not detecting subdomain"

- Make sure you're accessing via the full subdomain URL
- Check middleware logs in terminal
- For localhost testing, you can use `?subdomain=app` query param as fallback

## Alternative: Port-based routing (if subdomains don't work)

If you can't set up subdomains, you can modify the middleware to use ports:
- `localhost:3000` → Marketing
- `localhost:3001` → App

But subdomain routing is recommended for production-like testing.

