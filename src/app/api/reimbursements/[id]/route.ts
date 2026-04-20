import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getHouseholdAccountIds } from "@/lib/household";

async function getAuthorizedLink(id: string, userId: string) {
  const link = await prisma.reimbursement.findUnique({
    where: { id },
    include: { originalTx: { select: { accountId: true } } },
  });
  const householdAccountIds = await getHouseholdAccountIds(userId);
  if (!link || !householdAccountIds.includes(link.originalTx.accountId)) return null;
  return link;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const link = await getAuthorizedLink(id, session.user.id);
  if (!link) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await request.json().catch(() => ({})) as { settled?: boolean };
  const settled = Boolean(body.settled);

  const updated = await prisma.reimbursement.update({
    where: { id },
    data: { settled, settledAt: settled ? new Date() : null },
  });

  return NextResponse.json(updated);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const link = await getAuthorizedLink(id, session.user.id);
  if (!link) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.reimbursement.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
