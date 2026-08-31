"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";

export default function LogoutButton({
  variant = "light",
}: {
  variant?: "light" | "dark";
}) {
  const router = useRouter();

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const styles =
    variant === "dark"
      ? "text-paper/70 hover:text-white"
      : "text-muted hover:text-ink";

  return (
    <button
      type="button"
      onClick={handleLogout}
      className={`flex items-center gap-1.5 text-sm font-medium transition-colors ${styles}`}
    >
      <LogOut size={15} />
      Log out
    </button>
  );
}
