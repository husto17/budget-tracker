import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getHouseholdAccountIds, getHouseholdId } from "@/lib/household";

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

  const body = await request.json().catch(() => ({})) as {
    settled?: boolean;
    reimbursementTxId?: string | null;
  };

  const data: Record<string, unknown> = {};

  if ("reimbursementTxId" in body) {
    if (body.reimbursementTxId) {
      // Verify credit tx belongs to household
      const householdAccountIds = await getHouseholdAccountIds(session.user.id);
      const creditTx = await prisma.transaction.findUnique({
        where: { id: body.reimbursementTxId },
        select: { accountId: true },
      });
      if (!creditTx || !householdAccountIds.includes(creditTx.accountId)) {
        return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
      }
      data.reimbursementTxId = body.reimbursementTxId;
      data.settled = true;
      data.settledAt = new Date();
    } else {
      data.reimbursementTxId = null;
      data.settled = false;
      data.settledAt = null;
    }
  } else if (body.settled !== undefined) {
    data.settled = Boolean(body.settled);
    data.settledAt = body.settled ? new Date() : null;
  }

  const updated = await prisma.reimbursement.update({ where: { id }, data });
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
