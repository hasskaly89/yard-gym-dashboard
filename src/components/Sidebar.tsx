"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { PAGES, type NavIcon } from "@/lib/access";
import {
  LayoutGrid,
  Users,
  HeartPulse,
  ClipboardList,
  Wallet,
  Megaphone,
  Workflow,
  Trophy,
  Clock,
  ShieldCheck,
  LogOut,
  X,
} from "lucide-react";

// One icon set, one stroke width — replacing the unicode glyphs the nav used to
// render, which were emoji-as-icons and inconsistent in weight because a font
// drew them rather than an icon set.
const NAV_ICON: Record<NavIcon, typeof LayoutGrid> = {
  dashboard: LayoutGrid,
  members: Users,
  retention: HeartPulse,
  logs: ClipboardList,
  finance: Wallet,
  ads: Megaphone,
  crm: Workflow,
  milestones: Trophy,
  timesheets: Clock,
  admin: ShieldCheck,
};
import type { NavAccess } from "./RootLayoutClient";

export default function Sidebar({
  mobileOpen = false,
  onMobileClose,
  access,
}: {
  mobileOpen?: boolean;
  onMobileClose?: () => void;
  access: NavAccess;
}) {
  const pathname = usePathname();
  const router = useRouter();

  // Only show pages this user is allowed to see (admins see all).
  const allowed = new Set(access?.allowedPages ?? []);
  const navItems =
    access?.role === "admin"
      ? PAGES
      : PAGES.filter((p) => allowed.has(p.key));

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <>
      {/* Backdrop — mobile only, when drawer is open */}
      {mobileOpen && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-black/40"
          onClick={onMobileClose}
          aria-hidden="true"
        />
      )}

      <aside
        className={`
          w-64 min-h-screen bg-gym-surface border-r border-gym-border flex flex-col
          fixed inset-y-0 left-0 z-50
          md:relative md:translate-x-0
          transition-transform duration-200 ease-out
          ${mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"}
        `}
      >
        {/* Logo */}
        <div className="px-6 py-6 border-b border-gym-border flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-gym-accent rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-lg">Y</span>
            </div>
            <div>
              <p className="text-gym-text font-bold text-sm leading-tight">The Yard</p>
              <p className="text-gym-accent text-xs font-semibold tracking-wider uppercase">Gym</p>
            </div>
          </div>
          {/* Close button — mobile only */}
          <button
            type="button"
            onClick={onMobileClose}
            aria-label="Close navigation"
            className="md:hidden p-1.5 -mr-1 rounded text-gym-muted hover:bg-gym-border hover:text-gym-text"
          >
            <X size={20} strokeWidth={1.75} aria-hidden />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 overflow-y-auto">
          <p className="text-gym-muted text-xs font-semibold tracking-widest uppercase px-3 mb-3">Navigation</p>
          <ul className="space-y-1">
            {navItems.map((item) => {
              const isActive = pathname === item.href;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onMobileClose}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 ${
                      isActive
                        ? "bg-gym-accent text-white"
                        : "text-gym-text-secondary hover:text-gym-text hover:bg-gym-border"
                    }`}
                  >
                    {(() => {
                      const Icon = NAV_ICON[item.icon] ?? LayoutGrid;
                      return <Icon size={17} strokeWidth={1.75} aria-hidden />;
                    })()}
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>

          {/* Admin-only: Team Access */}
          {access?.role === "admin" && (
            <>
              <p className="text-gym-muted text-xs font-semibold tracking-widest uppercase px-3 mt-6 mb-3">
                Admin
              </p>
              <Link
                href="/admin"
                onClick={onMobileClose}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 ${
                  pathname === "/admin"
                    ? "bg-gym-accent text-white"
                    : "text-gym-text-secondary hover:text-gym-text hover:bg-gym-border"
                }`}
              >
                <ShieldCheck size={17} strokeWidth={1.75} aria-hidden />
                Team Access
              </Link>
            </>
          )}
        </nav>

        {/* Footer — user + logout */}
        <div className="px-4 py-4 border-t border-gym-border">
          {access?.email && (
            <div className="mb-3 px-2">
              <p className="text-gym-text text-xs font-medium truncate" title={access.email}>
                {access.email}
              </p>
              <p className="text-gym-muted text-[10px] uppercase tracking-wider">
                {access.role === "admin" ? "Admin" : "Staff"}
              </p>
            </div>
          )}
          <button
            type="button"
            onClick={handleLogout}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-gym-text-secondary hover:text-gym-text hover:bg-gym-border transition"
          >
            <LogOut size={16} strokeWidth={1.75} aria-hidden />
            Sign out
          </button>
        </div>
      </aside>
    </>
  );
}
