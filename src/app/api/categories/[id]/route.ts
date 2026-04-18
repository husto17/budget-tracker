import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const data = await request.json();

  const category = await prisma.category.findUnique({ where: { id } });
  if (!category || category.userId !== session.user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let monthlyBudget: number | null = null;
  if (data.monthlyBudget != null) {
    const parsed = parseFloat(String(data.monthlyBudget));
    if (!isFinite(parsed) || parsed < 0) {
      return NextResponse.json({ error: "Invalid monthly budget" }, { status: 400 });
    }
    monthlyBudget = parsed;
  }

  const updated = await prisma.category.update({
    where: { id },
    data: {
      name: data.name,
      color: data.color,
      icon: data.icon,
      monthlyBudget,
    },
  });

  return NextResponse.json(updated);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const category = await prisma.category.findUnique({ where: { id } });
  if (!category || category.userId !== session.user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (category.isDefault) {
    return NextResponse.json({ error: "Cannot delete a default category" }, { status: 400 });
  }

  await prisma.category.delete({ where: { id } });

  return NextResponse.json({ success: true });
}
