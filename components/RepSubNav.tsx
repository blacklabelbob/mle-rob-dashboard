"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Sub-nav for the "Rep View" tab (Task 1b.3): Today (cockpit queue) | My
// Accounts (CRM-feeling book + workspace). Only renders under /rep — every
// other section of the app is untouched. One place to add sub-tabs (e.g. Team
// later) without hand-editing every rep page.
const TABS = [
  { href: "/rep", label: "Today", match: (p: string) => p === "/rep" },
  { href: "/rep/accounts", label: "My Accounts", match: (p: string) => p.startsWith("/rep/accounts") },
];

export default function RepSubNav() {
  const pathname = usePathname();
  if (!pathname.startsWith("/rep")) return null;

  return (
    <div className="border-b border-white/10 bg-black/20">
      <div className="mx-auto flex max-w-7xl gap-1 px-4 py-2 text-sm">
        {TABS.map((t) => {
          const active = t.match(pathname);
          return (
            <Link
              key={t.href}
              href={t.href}
              className={`rounded-md px-3 py-1.5 transition ${
                active
                  ? "bg-white/10 text-white"
                  : "text-slate-400 hover:bg-white/5 hover:text-white"
              }`}
            >
              {t.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
