import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { redirect } from "next/navigation";
import "../globals.css";
import { createServerClient } from "@openschool/auth/server";
import { cookies } from "next/headers";
import { TRPCProvider } from "@/lib/trpc/provider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "OpenSchool - Dashboard",
  description: "Your school management dashboard",
};

export default async function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const supabase = createServerClient(cookieStore);

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://app.openschool.local:3000";
    const wwwUrl = process.env.NEXT_PUBLIC_WWW_URL || "http://www.openschool.local:3000";
    redirect(`${wwwUrl}/auth/login`);
  }

  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
        suppressHydrationWarning
      >
        <TRPCProvider>{children}</TRPCProvider>
      </body>
    </html>
  );
}

