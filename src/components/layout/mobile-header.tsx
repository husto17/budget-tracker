"use client";

import { Menu } from "lucide-react";

export function MobileHeader() {
  return (
    <div className="md:hidden shrink-0 flex items-center px-4 h-12 bg-gray-50 dark:bg-gray-950 border-b border-gray-100 dark:border-gray-800">
      <button
        className="flex items-center justify-center w-9 h-9 rounded-lg bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 shadow-sm"
        onClick={() => window.dispatchEvent(new Event("sidebar:open"))}
        aria-label="Open menu"
      >
        <Menu className="w-5 h-5 text-gray-600 dark:text-gray-300" />
      </button>
    </div>
  );
}
