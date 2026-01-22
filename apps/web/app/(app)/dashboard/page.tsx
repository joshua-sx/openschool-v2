import { createServerClient, resolveTenantContext } from "@openschool/auth/server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { BookOpen, Users, School, Building2 } from "lucide-react";

export default async function DashboardPage() {
  const cookieStore = await cookies();
  const supabase = createServerClient(cookieStore);

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.user) {
    const wwwUrl = process.env.NEXT_PUBLIC_WWW_URL || "http://www.openschool.local:3000";
    redirect(`${wwwUrl}/auth/login`);
  }

  // Resolve tenant context
  let tenantContext;
  try {
    tenantContext = await resolveTenantContext(session.user.id);
  } catch (error) {
    console.error("Error resolving tenant context:", error);
    tenantContext = null;
  }

  return (
    <div className="min-h-screen bg-surface-secondary">
      {/* Header */}
      <header className="bg-surface-primary border-b border-border-default">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 bg-brand rounded-lg flex items-center justify-center">
                <BookOpen className="w-4 h-4 text-white" />
              </div>
              <span className="text-lg font-bold tracking-tight">
                OpenSchool
              </span>
            </div>
            <div className="flex items-center space-x-4">
              <span className="text-sm text-text-secondary">
                {session.user.email}
              </span>
              <form
                action={async () => {
                  "use server";
                  const cookieStore = await cookies();
                  const supabase = createServerClient(cookieStore);
                  await supabase.auth.signOut();
                  const wwwUrl = process.env.NEXT_PUBLIC_WWW_URL || "http://www.openschool.local:3000";
                  redirect(`${wwwUrl}/`);
                }}
              >
                <button
                  type="submit"
                  className="text-sm text-text-secondary hover:text-text-primary transition-colors duration-150"
                >
                  Sign Out
                </button>
              </form>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-text-primary mb-2">
            Welcome to OpenSchool
          </h1>
          <p className="text-text-secondary">
            Your school management dashboard
          </p>
        </div>

        {/* Tenant Context Display */}
        {tenantContext ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            {tenantContext.orgIds.length > 0 && (
              <div className="bg-surface-primary p-6 rounded-xl border border-border-default shadow-sm">
                <div className="flex items-center space-x-3 mb-4">
                  <div className="w-10 h-10 rounded-lg bg-surface-secondary border border-border-light flex items-center justify-center">
                    <Building2 className="w-5 h-5 text-text-primary" />
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-text-primary">
                      {tenantContext.orgIds.length}
                    </div>
                    <div className="text-sm text-text-secondary">
                      Organization{tenantContext.orgIds.length !== 1 ? "s" : ""}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {tenantContext.schoolIds.length > 0 && (
              <div className="bg-surface-primary p-6 rounded-xl border border-border-default shadow-sm">
                <div className="flex items-center space-x-3 mb-4">
                  <div className="w-10 h-10 rounded-lg bg-surface-secondary border border-border-light flex items-center justify-center">
                    <School className="w-5 h-5 text-text-primary" />
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-text-primary">
                      {tenantContext.schoolIds.length}
                    </div>
                    <div className="text-sm text-text-secondary">
                      School{tenantContext.schoolIds.length !== 1 ? "s" : ""}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {tenantContext.classIds.length > 0 && (
              <div className="bg-surface-primary p-6 rounded-xl border border-border-default shadow-sm">
                <div className="flex items-center space-x-3 mb-4">
                  <div className="w-10 h-10 rounded-lg bg-surface-secondary border border-border-light flex items-center justify-center">
                    <BookOpen className="w-5 h-5 text-text-primary" />
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-text-primary">
                      {tenantContext.classIds.length}
                    </div>
                    <div className="text-sm text-text-secondary">
                      Class{tenantContext.classIds.length !== 1 ? "es" : ""}
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="bg-surface-primary p-6 rounded-xl border border-border-default shadow-sm">
              <div className="flex items-center space-x-3 mb-4">
                <div className="w-10 h-10 rounded-lg bg-surface-secondary border border-border-light flex items-center justify-center">
                  <Users className="w-5 h-5 text-text-primary" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-text-primary capitalize">
                    {tenantContext.effectiveRole}
                  </div>
                  <div className="text-sm text-text-secondary">Your Role</div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-surface-primary p-6 rounded-xl border border-border-default shadow-sm mb-8">
            <h2 className="text-lg font-semibold text-text-primary mb-2">
              Getting Started
            </h2>
            <p className="text-text-secondary mb-4">
              You don't have any organization or school memberships yet. Contact
              your administrator to get started.
            </p>
          </div>
        )}

        {/* Quick Actions */}
        <div className="bg-surface-primary p-6 rounded-xl border border-border-default shadow-sm">
          <h2 className="text-lg font-semibold text-text-primary mb-4">
            Quick Actions
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <button className="p-4 border border-border-default rounded-lg hover:bg-surface-secondary transition-colors duration-150 text-left">
              <div className="font-medium text-text-primary mb-1">
                View Students
              </div>
              <div className="text-sm text-text-secondary">
                Manage student records
              </div>
            </button>
            <button className="p-4 border border-border-default rounded-lg hover:bg-surface-secondary transition-colors duration-150 text-left">
              <div className="font-medium text-text-primary mb-1">
                Gradebook
              </div>
              <div className="text-sm text-text-secondary">
                Enter and view grades
              </div>
            </button>
            <button className="p-4 border border-border-default rounded-lg hover:bg-surface-secondary transition-colors duration-150 text-left">
              <div className="font-medium text-text-primary mb-1">
                Reports
              </div>
              <div className="text-sm text-text-secondary">
                Generate analytics
              </div>
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}

