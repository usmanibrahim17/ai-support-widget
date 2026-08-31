"use client";

import {
  Building2,
  FileText,
  LayoutGrid,
  Menu,
  MessagesSquare,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { BusinessIdProvider } from "./business-id-context";
import LogoutButton from "./logout-button";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Overview", icon: LayoutGrid },
  { href: "/dashboard/profile", label: "Business Profile", icon: Building2 },
  { href: "/dashboard/documents", label: "Documents", icon: FileText },
  { href: "/dashboard/logs", label: "Chat Logs", icon: MessagesSquare },
];

function isActive(pathname: string, href: string) {
  if (href === "/dashboard") {
    return pathname === "/dashboard";
  }
  return pathname.startsWith(href);
}

function NavLinks({
  pathname,
  onNavigate,
}: {
  pathname: string;
  onNavigate?: () => void;
}) {
  return (
    <nav className="flex-1 space-y-1 px-3 py-6">
      {NAV_ITEMS.map((item) => {
        const active = isActive(pathname, item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
              active
                ? "bg-white/10 text-white"
                : "text-paper/65 hover:bg-white/5 hover:text-white"
            }`}
          >
            <Icon size={17} strokeWidth={2} />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export default function DashboardShell({
  businessId,
  userEmail,
  children,
}: {
  businessId: string;
  userEmail: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <BusinessIdProvider businessId={businessId}>
      <div className="flex min-h-screen bg-paper font-body text-ink">
        {/* Desktop sidebar */}
        <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col bg-primary-dark md:flex">
          <div className="flex items-center gap-2.5 border-b border-white/10 px-6 py-6">
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-accent text-primary-dark">
              <MessagesSquare size={17} strokeWidth={2.25} />
            </span>
            <span className="font-display text-lg text-white">Console</span>
          </div>

          <NavLinks pathname={pathname} />

          <div className="border-t border-white/10 px-6 py-5">
            <p className="mb-3 truncate text-xs text-paper/50">{userEmail}</p>
            <LogoutButton variant="dark" />
          </div>
        </aside>

        {/* Mobile top bar */}
        <div className="fixed inset-x-0 top-0 z-40 flex items-center justify-between border-b border-white/10 bg-primary-dark px-4 py-3.5 md:hidden">
          <span className="flex items-center gap-2.5">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-accent text-primary-dark">
              <MessagesSquare size={15} strokeWidth={2.25} />
            </span>
            <span className="font-display text-base text-white">Console</span>
          </span>
          <button
            type="button"
            onClick={() => setMobileOpen((open) => !open)}
            className="p-1 text-white"
            aria-label="Toggle menu"
          >
            {mobileOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>

        {mobileOpen ? (
          <div className="fixed inset-0 top-[57px] z-30 flex flex-col bg-primary-dark md:hidden">
            <NavLinks pathname={pathname} onNavigate={() => setMobileOpen(false)} />
            <div className="border-t border-white/10 px-6 py-5">
              <p className="mb-3 truncate text-xs text-paper/50">{userEmail}</p>
              <LogoutButton variant="dark" />
            </div>
          </div>
        ) : null}

        <div className="min-w-0 flex-1 pt-[57px] md:pt-0">
          <main className="mx-auto max-w-4xl px-5 py-10 md:px-12 md:py-14">
            {children}
          </main>
        </div>
      </div>
    </BusinessIdProvider>
  );
}
