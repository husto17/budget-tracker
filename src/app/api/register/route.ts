import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

const DEFAULT_CATEGORIES = [
  { name: "Groceries", color: "#22C55E", icon: "shopping-cart" },
  { name: "Dining Out", color: "#F97316", icon: "utensils" },
  { name: "Transport", color: "#3B82F6", icon: "car" },
  { name: "Utilities", color: "#8B5CF6", icon: "zap" },
  { name: "Rent / Mortgage", color: "#EF4444", icon: "home" },
  { name: "Entertainment", color: "#EC4899", icon: "tv" },
  { name: "Shopping", color: "#F59E0B", icon: "shopping-bag" },
  { name: "Health", color: "#10B981", icon: "heart" },
  { name: "Subscriptions", color: "#6366F1", icon: "repeat" },
  { name: "Income", color: "#14B8A6", icon: "trending-up" },
  { name: "Transfers", color: "#6B7280", icon: "arrow-right-left" },
  { name: "Fees & Interest", color: "#DC2626", icon: "percent" },
  { name: "Other", color: "#9CA3AF", icon: "circle" },
];

export async function POST(request: Request) {
  const { email, password, name } = await request.json();

  if (!email || !password || !name) {
    return NextResponse.json(
      { error: "Email, password, and name are required" },
      { status: 400 }
    );
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json(
      { error: "An account with this email already exists" },
      { status: 400 }
    );
  }

  const hashedPassword = await bcrypt.hash(password, 12);

  const user = await prisma.user.create({
    data: { email, name, password: hashedPassword },
  });

  await prisma.category.createMany({
    data: DEFAULT_CATEGORIES.map((cat) => ({
      ...cat,
      userId: user.id,
      isDefault: true,
    })),
  });

  return NextResponse.json({ id: user.id, email: user.email, name: user.name });
}
