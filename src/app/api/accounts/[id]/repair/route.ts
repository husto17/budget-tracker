import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getHouseholdAccountIds } from "@/lib/household";

// Clear transferPairId on any tx in this account whose pair has been deleted
// or doesn't link back. Reveals previously-hidden debits/credits in the main
// list and stops them from showing as "half-linked" warnings.
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: accountId } = await params;
  const householdAccountIds = await getHouseholdAccountIds(session.user.id);
  if (!householdAccountIds.includes(accountId)) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  const transfers = await prisma.transaction.findMany({
    where: { accountId, transferPairId: { not: null } },
    select: { id: true, transferPairId: true },
  });

  const pairIds = [
    ...new Set(transfers.map((t) => t.transferPairId).filter((x): x is string => !!x)),
  ];
  const pairs = await prisma.transaction.findMany({
    where: { id: { in: pairIds } },
    select: { id: true, transferPairId: true },
  });
  const pairMap = new Map(pairs.map((p) => [p.id, p]));

  let fixed = 0;
  for (const t of transfers) {
    const pair = t.transferPairId ? pairMap.get(t.transferPairId) : null;
    const halfLinked = !pair || pair.transferPairId !== t.id;
    if (halfLinked) {
      await prisma.transaction.update({
        where: { id: t.id },
        data: { transferPairId: null },
      });
      fixed++;
    }
  }

  return NextResponse.json({ fixed });
}
