"use client";

import { Auth } from "@supabase/auth-ui-react";
import { ThemeSupa } from "@supabase/auth-ui-shared";
import { createBrowserClient } from "@openschool/auth";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { BookOpen } from "lucide-react";

export default function LoginPage() {
  const [supabase] = useState(() => createBrowserClient());
  const router = useRouter();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session) {
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://app.openschool.local:3000";
        window.location.href = `${appUrl}/dashboard`;
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [supabase, router]);

  if (!mounted) {
    return null;
  }

  const redirectTo =
    process.env.NEXT_PUBLIC_APP_URL || "http://app.openschool.local:3000";

  return (
    <div className="min-h-screen bg-white flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link
            href="/"
            className="inline-flex items-center space-x-2 mb-6 hover:opacity-80 transition-opacity"
          >
            <div className="w-8 h-8 bg-black rounded-lg flex items-center justify-center">
              <BookOpen className="w-4 h-4 text-white" />
            </div>
            <span className="text-lg font-bold tracking-tight">
              OpenSchool
            </span>
          </Link>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            Welcome back
          </h1>
          <p className="text-gray-500">
            Sign in to your account to continue
          </p>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
          <Auth
            supabaseClient={supabase}
            appearance={{
              theme: ThemeSupa,
              variables: {
                default: {
                  colors: {
                    brand: "#000000",
                    brandAccent: "#171717",
                  },
                },
              },
            }}
            providers={[]}
            redirectTo={`${redirectTo}/auth/callback`}
            onlyThirdPartyProviders={false}
          />
        </div>

        <p className="text-center text-sm text-gray-500 mt-6">
          Don't have an account?{" "}
          <Link
            href="/auth/signup"
            className="text-black font-medium hover:underline"
          >
            Sign up
          </Link>
        </p>
      </div>
    </div>
  );
}

