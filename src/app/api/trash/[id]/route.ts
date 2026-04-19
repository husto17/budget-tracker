import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getHouseholdAccountIds } from "@/lib/household";

// Restore a soft-deleted transaction
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const accountIds = await getHouseholdAccountIds(session.user.id);

  const tx = await prisma.transaction.findFirst({
    where: { id, deletedAt: { not: null }, accountId: { in: accountIds } },
  });
  if (!tx) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.transaction.update({ where: { id }, data: { deletedAt: null } });

  return NextResponse.json({ success: true });
}

// Hard-purge a single soft-deleted transaction
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const accountIds = await getHouseholdAccountIds(session.user.id);

  const tx = await prisma.transaction.findFirst({
    where: { id, deletedAt: { not: null }, accountId: { in: accountIds } },
  });
  if (!tx) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.transaction.delete({ where: { id } });

  return NextResponse.json({ success: true });
}
