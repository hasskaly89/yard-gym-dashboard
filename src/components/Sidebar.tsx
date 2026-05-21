"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { label: "Dashboard", href: "/", icon: "⊞" },
  { label: "MindBody", href: "/mindbody", icon: "◈" },
  { label: "Retention", href: "/retention", icon: "♥" },
  { label: "Xero", href: "/xero", icon: "₿" },
  { label: "Meta Ads", href: "/meta-ads", icon: "◉" },
  { label: "GoHighLevel", href: "/gohighlevel", icon: "▲" },
  { label: "Milestones", href: "/milestones", icon: "🏆" },
  { label: "Timesheets", href: "/timesheets", icon: "◷" },
];

export default function Sidebar({
  mobileOpen = false,
  onMobileClose,
}: {
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}) {
  const pathname = usePathname();

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
        <nav className="flex-1 px-3 py-4">
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
        </nav>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gym-border">
          <p className="text-gym-muted text-xs">© 2026 The Yard Gym</p>
        </div>
      </aside>
    </>
  );
}
