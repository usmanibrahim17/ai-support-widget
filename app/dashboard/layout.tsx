import { IBM_Plex_Sans, Newsreader } from "next/font/google";
import { redirect } from "next/navigation";

import DashboardShell from "./dashboard-shell";
import { createClient } from "@/lib/supabase/server";

const displayFont = Newsreader({
  subsets: ["latin"],
  weight: ["500", "600"],
  variable: "--font-display",
});

const bodyFont = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-body",
});

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <div className={`${displayFont.variable} ${bodyFont.variable}`}>
      <DashboardShell businessId={user.id} userEmail={user.email ?? ""}>
        {children}
      </DashboardShell>
    </div>
  );
}
