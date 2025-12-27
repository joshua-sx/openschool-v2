import { type NextRequest, NextResponse } from "next/server";
import { createServerClient, resolveTenantContext } from "@openschool/auth/server";
import { cookies } from "next/headers";

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const next = requestUrl.searchParams.get("next") || "/dashboard";

  if (code) {
    const cookieStore = await cookies();
    const supabase = createServerClient(cookieStore);

    // Exchange code for session
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      // Get the user session
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (session?.user) {
        // Resolve tenant context (optional - for future use)
        try {
          await resolveTenantContext(session.user.id);
        } catch (err) {
          // Tenant resolution is optional at this stage
          // User might not have any org/school memberships yet
          console.log("No tenant context found for user:", session.user.id);
        }

        // Redirect to dashboard
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://app.openschool.local:3000";
        return NextResponse.redirect(`${appUrl}${next}`);
      }
    }
  }

  // If there's an error or no code, redirect to login
  const wwwUrl = process.env.NEXT_PUBLIC_WWW_URL || "http://www.openschool.local:3000";
  return NextResponse.redirect(`${wwwUrl}/auth/login?error=auth_failed`);
}

