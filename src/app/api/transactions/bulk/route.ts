import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Bulk categorize transactions
export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { ids, categoryId } = await request.json();

  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: "ids array required" }, { status: 400 });
  }

  // Verify all transactions belong to this user
  const txns = await prisma.transaction.findMany({
    where: { id: { in: ids } },
    include: { account: { select: { userId: true } } },
  });

  const unauthorized = txns.some((t: { account: { userId: string } }) => t.account.userId !== session.user.id);
  if (unauthorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  await prisma.transaction.updateMany({
    where: { id: { in: ids } },
    data: { categoryId: categoryId || null },
  });

  return NextResponse.json({ updated: ids.length });
}
