import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getHouseholdAccountIds } from "@/lib/household";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const link = await prisma.reimbursement.findUnique({
    where: { id },
    include: { originalTx: { select: { accountId: true } } },
  });
  const householdAccountIds = await getHouseholdAccountIds(session.user.id);
  if (!link || !householdAccountIds.includes(link.originalTx.accountId)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  await prisma.reimbursement.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
