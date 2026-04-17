import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getHouseholdAccountIds } from "@/lib/household";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const householdAccountIds = await getHouseholdAccountIds(session.user.id);

  const uploads = await prisma.upload.findMany({
    where: { accountId: { in: householdAccountIds } },
    include: {
      _count: { select: { transactions: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  // Fetch account info for each upload
  const accountIds = [...new Set(uploads.map((u) => u.accountId))];
  const accounts = await prisma.account.findMany({
    where: { id: { in: accountIds } },
    select: { id: true, name: true, type: true },
  });
  const accountMap = new Map(accounts.map((a) => [a.id, a]));

  const result = uploads.map((u) => ({
    ...u,
    account: accountMap.get(u.accountId) ?? { id: u.accountId, name: "Unknown", type: "" },
  }));

  return NextResponse.json(result);
}
