"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { label: "Dashboard", href: "/", icon: "⊞" },
  { label: "MindBody", href: "/mindbody", icon: "◈" },
  { label: "Xero", href: "/xero", icon: "₿" },
  { label: "Meta Ads", href: "/meta-ads", icon: "◉" },
  { label: "GoHighLevel", href: "/gohighlevel", icon: "▲" },
  { label: "Timesheets", href: "/timesheets", icon: "◷" },
  { label: "RIG Calculator", href: "/rig/home", icon: "🏋" },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-64 min-h-screen bg-gym-surface border-r border-gym-border flex flex-col">
      {/* Logo */}
      <div className="px-6 py-6 border-b border-gym-border">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-gym-accent rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-lg">Y</span>
          </div>
          <div>
            <p className="text-gym-text font-bold text-sm leading-tight">The Yard</p>
            <p className="text-gym-accent text-xs font-semibold tracking-wider uppercase">Gym</p>
          </div>
        </div>
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
  );
}
