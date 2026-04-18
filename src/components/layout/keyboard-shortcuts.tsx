"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { HelpModal } from "./help-modal";

const GO_MAP: Record<string, string> = {
  d: "/dashboard",
  t: "/transactions",
  a: "/accounts",
  c: "/categories",
  g: "/goals",
  i: "/insights",
  u: "/upload",
  q: "/quick-entry",
  s: "/settings",
  "?": "/ask",
};

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (el.isContentEditable) return true;
  return false;
}

export function KeyboardShortcuts() {
  const router = useRouter();
  const [helpOpen, setHelpOpen] = useState(false);

  useEffect(() => {
    let awaitingGo = false;
    let goTimer: ReturnType<typeof setTimeout> | null = null;

    function handle(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTypingTarget(e.target)) return;

      if (awaitingGo) {
        const dest = GO_MAP[e.key.toLowerCase()];
        awaitingGo = false;
        if (goTimer) { clearTimeout(goTimer); goTimer = null; }
        if (dest) {
          e.preventDefault();
          router.push(dest);
        }
        return;
      }

      if (e.key === "g") {
        e.preventDefault();
        awaitingGo = true;
        goTimer = setTimeout(() => { awaitingGo = false; }, 1200);
        return;
      }

      // ? opens the help modal (not preceded by g, which jumps to /ask)
      if (e.key === "?") {
        e.preventDefault();
        setHelpOpen(true);
        return;
      }

      if (e.key === "/") {
        const search = document.querySelector<HTMLInputElement>(
          'input[placeholder*="Search" i]',
        );
        if (search) {
          e.preventDefault();
          search.focus();
          search.select();
        }
      }
    }

    window.addEventListener("keydown", handle);
    return () => {
      window.removeEventListener("keydown", handle);
      if (goTimer) clearTimeout(goTimer);
    };
  }, [router]);

  return <HelpModal open={helpOpen} onOpenChange={setHelpOpen} />;
}
