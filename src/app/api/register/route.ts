import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { DEFAULT_CATEGORIES } from "@/lib/default-categories";

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
