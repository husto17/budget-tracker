"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import {
  LayoutDashboard,
  Wallet,
  Tags,
  ArrowUpDown,
  Upload,
  LogOut,
  TrendingUp,
  Settings,
  Menu,
  X,
  Camera,
  Sparkles,
  Target,
  Sun,
  Moon,
  HelpCircle,
  ArrowLeftRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { fetchJson } from "@/lib/fetcher";

const navGroups: Array<{
  items: Array<{ href: string; icon: typeof LayoutDashboard; label: string }>;
}> = [
  {
    items: [
      { href: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
      { href: "/insights", icon: TrendingUp, label: "Insights" },
      { href: "/compare", icon: ArrowLeftRight, label: "Compare" },
    ],
  },
  {
    items: [
      { href: "/transactions", icon: ArrowUpDown, label: "Transactions" },
      { href: "/upload", icon: Upload, label: "Upload Statement" },
      { href: "/quick-entry", icon: Camera, label: "Snap" },
    ],
  },
  {
    items: [
      { href: "/goals", icon: Target, label: "Goals" },
      { href: "/categories", icon: Tags, label: "Categories" },
      { href: "/accounts", icon: Wallet, label: "Accounts" },
    ],
  },
  {
    items: [
      { href: "/ask", icon: Sparkles, label: "Ask" },
      { href: "/settings", icon: Settings, label: "Settings" },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const { setTheme, resolvedTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const [uncategorized, setUncategorized] = useState<number | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const isDark = mounted && resolvedTheme === "dark";

  useEffect(() => {
    let cancelled = false;
    fetchJson<{ uncategorized: number; pending: number }>("/api/stats")
      .then((d) => { if (!cancelled) setUncategorized(d.uncategorized); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [pathname]);

  const initials = session?.user?.name
    ?.split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2) ?? "?";

  const sidebarContent = (
    <aside className="flex flex-col w-60 h-full bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 py-6 px-4">
      <div className="mb-8 px-2 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Budget Tracker</h1>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Personal Finance</p>
        </div>
        <button
          className="md:hidden text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-200"
          onClick={() => setOpen(false)}
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <nav className="flex-1 space-y-1">
        {navGroups.map((group, gi) => (
          <div key={gi} className={cn(gi > 0 && "pt-2 mt-2 border-t border-gray-100 dark:border-gray-800")}>
            {group.items.map(({ href, icon: Icon, label }) => {
              const active = pathname === href || (href !== "/dashboard" && pathname.startsWith(href));
              const showBadge = href === "/transactions" && uncategorized && uncategorized > 0;
              return (
                <Link key={href} href={href} onClick={() => setOpen(false)}>
                  <span
                    className={cn(
                      "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                      active
                        ? "bg-gray-100 dark:bg-gray-800 text-gray-900 dark:bg-gray-800 dark:text-gray-100"
                        : "text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100"
                    )}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span className="flex-1">{label}</span>
                    {showBadge && (
                      <span className="text-xs font-semibold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">
                        {uncategorized}
                      </span>
                    )}
                  </span>
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="mt-auto pt-4 border-t border-gray-100 dark:border-gray-800">
        <div className="flex items-center gap-3 px-2 mb-3">
          <Avatar className="w-8 h-8">
            {session?.user?.image && (
              <AvatarImage src={session.user.image} alt={session.user.name ?? "User"} />
            )}
            <AvatarFallback className="text-xs bg-blue-100 text-blue-700">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
              {session?.user?.name}
            </p>
            <p className="text-xs text-gray-400 dark:text-gray-400 truncate">
              {session?.user?.email}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="flex-1 justify-start text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
            onClick={() => signOut({ callbackUrl: "/login" })}
          >
            <LogOut className="w-4 h-4 mr-2" />
            Sign out
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-gray-500 dark:text-gray-400"
            onClick={() => setTheme(isDark ? "light" : "dark")}
            title={isDark ? "Switch to light" : "Switch to dark"}
            aria-label="Toggle theme"
            suppressHydrationWarning
          >
            {mounted ? (isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />) : <Moon className="w-4 h-4" />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-gray-500 dark:text-gray-400"
            onClick={() => window.dispatchEvent(new Event("help:open"))}
            title="Shortcuts & tips (?)"
            aria-label="Open help"
          >
            <HelpCircle className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </aside>
  );

  return (
    <>
      {/* Mobile hamburger button — shown in mobile header */}
      <button
        className="md:hidden fixed top-4 left-4 z-50 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-2 shadow-sm"
        onClick={() => setOpen(true)}
        aria-label="Open menu"
      >
        <Menu className="w-5 h-5 text-gray-600 dark:text-gray-300" />
      </button>

      {/* Desktop sidebar */}
      <div className="hidden md:flex flex-col w-60 min-h-screen">
        {sidebarContent}
      </div>

      {/* Mobile sidebar drawer */}
      {open && (
        <div className="md:hidden fixed inset-0 z-40 flex">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/30"
            onClick={() => setOpen(false)}
          />
          {/* Drawer */}
          <div className="relative flex flex-col w-60 h-full">
            {sidebarContent}
          </div>
        </div>
      )}
    </>
  );
}
