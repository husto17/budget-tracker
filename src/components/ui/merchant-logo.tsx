"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

interface MerchantLogoProps {
  merchant: string;
  fallbackColor?: string | null;
  size?: "sm" | "md";
  className?: string;
}

// Best-effort domain guess: strip non-alphanumerics and append .com.
// Works for "Amazon", "Starbucks", "Walgreens", "Uber", etc.
// For merchants without matching domains the favicon 404s and we fall back.
function guessDomain(merchant: string): string | null {
  const clean = merchant
    .toLowerCase()
    .replace(/['’.,&]/g, "")
    .replace(/\s+/g, "")
    .replace(/[^a-z0-9-]/g, "");
  if (clean.length < 3) return null;
  return `${clean}.com`;
}

export function MerchantLogo({ merchant, fallbackColor, size = "sm", className }: MerchantLogoProps) {
  const [failed, setFailed] = useState(false);
  const domain = guessDomain(merchant);
  const dim = size === "sm" ? "w-8 h-8" : "w-10 h-10";
  const text = size === "sm" ? "text-xs" : "text-sm";

  const initial = merchant.trim().charAt(0).toUpperCase() || "?";
  const bg = fallbackColor ? `${fallbackColor}1f` : "#f3f4f6";
  const color = fallbackColor ?? "#6b7280";

  if (!domain || failed) {
    return (
      <div
        className={cn(dim, text, "rounded-full flex items-center justify-center font-semibold shrink-0", className)}
        style={{ backgroundColor: bg, color }}
      >
        {initial}
      </div>
    );
  }

  // Prefer Logo.dev when a publishable token is configured — it returns
  // 128px PNGs with transparent backgrounds. Falls back to Google's favicon
  // resolver (128px too, but scaled from lower-res source).
  const logoDevToken = process.env.NEXT_PUBLIC_LOGO_DEV_TOKEN;
  const src = logoDevToken
    ? `https://img.logo.dev/${domain}?token=${logoDevToken}&size=128&format=png&retina=true`
    : `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      className={cn(dim, "rounded-full object-cover bg-white shrink-0", className)}
      onError={() => setFailed(true)}
    />
  );
}
