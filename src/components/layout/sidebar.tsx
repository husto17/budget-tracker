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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useState } from "react";

const navItems = [
  { href: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { href: "/transactions", icon: ArrowUpDown, label: "Transactions" },
  { href: "/quick-entry", icon: Camera, label: "Quick Entry" },
  { href: "/upload", icon: Upload, label: "Upload Statement" },
  { href: "/accounts", icon: Wallet, label: "Accounts" },
  { href: "/categories", icon: Tags, label: "Categories" },
  { href: "/insights", icon: TrendingUp, label: "Insights" },
  { href: "/settings", icon: Settings, label: "Settings" },
];

export function Sidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [open, setOpen] = useState(false);

  const initials = session?.user?.name
    ?.split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2) ?? "?";

  const sidebarContent = (
    <aside className="flex flex-col w-60 h-full bg-white border-r border-gray-200 py-6 px-4">
      <div className="mb-8 px-2 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Budget Tracker</h1>
          <p className="text-xs text-gray-500 mt-0.5">Personal Finance</p>
        </div>
        <button
          className="md:hidden text-gray-400 hover:text-gray-600"
          onClick={() => setOpen(false)}
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <nav className="flex-1 space-y-1">
        {navItems.map(({ href, icon: Icon, label }) => {
          const active = pathname === href || (href !== "/dashboard" && pathname.startsWith(href));
          return (
            <Link key={href} href={href} onClick={() => setOpen(false)}>
              <span
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                  active
                    ? "bg-gray-100 text-gray-900"
                    : "text-gray-500 hover:bg-gray-50 hover:text-gray-900"
                )}
              >
                <Icon className="w-4 h-4 shrink-0" />
                {label}
              </span>
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto pt-4 border-t border-gray-100">
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
            <p className="text-sm font-medium text-gray-900 truncate">
              {session?.user?.name}
            </p>
            <p className="text-xs text-gray-400 truncate">
              {session?.user?.email}
            </p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start text-gray-500 hover:text-gray-900"
          onClick={() => signOut({ callbackUrl: "/login" })}
        >
          <LogOut className="w-4 h-4 mr-2" />
          Sign out
        </Button>
      </div>
    </aside>
  );

  return (
    <>
      {/* Mobile hamburger button — shown in mobile header */}
      <button
        className="md:hidden fixed top-4 left-4 z-50 bg-white border border-gray-200 rounded-lg p-2 shadow-sm"
        onClick={() => setOpen(true)}
        aria-label="Open menu"
      >
        <Menu className="w-5 h-5 text-gray-600" />
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
