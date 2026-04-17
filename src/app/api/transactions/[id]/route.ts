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

  const tx = await prisma.transaction.findUnique({
    where: { id },
    include: { account: true },
  });
  if (!tx || tx.account.userId !== session.user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const updated = await prisma.transaction.update({
    where: { id },
    data: {
      categoryId: data.categoryId !== undefined ? (data.categoryId || null) : undefined,
      notes: data.notes !== undefined ? data.notes : undefined,
      description: data.description !== undefined ? data.description : undefined,
      merchant: data.merchant !== undefined ? data.merchant : undefined,
    },
    include: { category: true, account: { select: { id: true, name: true, type: true } } },
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

  const tx = await prisma.transaction.findUnique({
    where: { id },
    include: { account: true },
  });
  if (!tx || tx.account.userId !== session.user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.transaction.delete({ where: { id } });

  return NextResponse.json({ success: true });
}
