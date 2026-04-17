"use client";

import {
  ShoppingCart,
  Utensils,
  Car,
  Zap,
  Home,
  Tv,
  ShoppingBag,
  Heart,
  Repeat,
  TrendingUp,
  ArrowRightLeft,
  Circle,
  Tag,
  Fuel,
  Plane,
  Coffee,
  Music,
  BookOpen,
  Dumbbell,
  Wifi,
  Phone,
  Briefcase,
  GraduationCap,
  Gift,
  type LucideIcon,
} from "lucide-react";

const ICON_MAP: Record<string, LucideIcon> = {
  "shopping-cart": ShoppingCart,
  "shopping-bag": ShoppingBag,
  utensils: Utensils,
  car: Car,
  zap: Zap,
  home: Home,
  tv: Tv,
  heart: Heart,
  repeat: Repeat,
  "trending-up": TrendingUp,
  "arrow-right-left": ArrowRightLeft,
  circle: Circle,
  tag: Tag,
  fuel: Fuel,
  plane: Plane,
  coffee: Coffee,
  music: Music,
  "book-open": BookOpen,
  dumbbell: Dumbbell,
  wifi: Wifi,
  phone: Phone,
  briefcase: Briefcase,
  "graduation-cap": GraduationCap,
  gift: Gift,
};

interface CategoryIconProps {
  icon?: string | null;
  color?: string;
  size?: "sm" | "md";
  className?: string;
}

export function CategoryIcon({ icon, color, size = "sm", className }: CategoryIconProps) {
  const IconComponent = icon ? (ICON_MAP[icon] ?? Circle) : Circle;
  const sizeClass = size === "sm" ? "w-3 h-3" : "w-4 h-4";

  return (
    <IconComponent
      className={`${sizeClass} flex-shrink-0 ${className ?? ""}`}
      style={color ? { color } : undefined}
    />
  );
}
