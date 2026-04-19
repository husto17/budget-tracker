import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tags = await prisma.tag.findMany({
    where: { userId: session.user.id },
    orderBy: { name: "asc" },
  });
  return NextResponse.json(tags);
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { name, color } = await request.json();
  if (!name?.trim()) return NextResponse.json({ error: "name required" }, { status: 400 });

  const existing = await prisma.tag.findFirst({
    where: { userId: session.user.id, name: name.trim() },
  });
  if (existing) return NextResponse.json(existing);

  const tag = await prisma.tag.create({
    data: { userId: session.user.id, name: name.trim(), color: color ?? "#6366f1" },
  });
  return NextResponse.json(tag, { status: 201 });
}
