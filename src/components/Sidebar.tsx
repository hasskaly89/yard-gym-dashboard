"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { PAGES } from "@/lib/access";
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
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
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
                    <span className="text-base">{item.icon}</span>
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
                <span className="text-base">◐</span>
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
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            Sign out
          </button>
        </div>
      </aside>
    </>
  );
}
