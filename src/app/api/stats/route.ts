import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getHouseholdAccountIds } from "@/lib/household";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const accountIds = await getHouseholdAccountIds(session.user.id);

  const [uncategorized, pending] = await Promise.all([
    prisma.transaction.count({
      where: {
        accountId: { in: accountIds },
        categoryId: null,
        isCredit: false,
        transferPairId: null,
        deletedAt: null,
      },
    }),
    prisma.transaction.count({
      where: {
        accountId: { in: accountIds },
        isPending: true,
        deletedAt: null,
      },
    }),
  ]);

  return NextResponse.json({ uncategorized, pending });
}
