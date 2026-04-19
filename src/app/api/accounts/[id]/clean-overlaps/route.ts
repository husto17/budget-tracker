import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getHouseholdAccountIds } from "@/lib/household";

// Delete Upload rows that cover the same statement period as another upload
// AND contributed zero new transactions (the telltale of a re-upload that
// got fully dedup'd). Keeps the first upload of each period.
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

  const uploads = await prisma.upload.findMany({
    where: {
      accountId,
      statementStart: { not: null },
      statementEnd: { not: null },
    },
    include: { _count: { select: { transactions: true } } },
    orderBy: { createdAt: "asc" },
  });

  const seen = new Map<string, string>(); // periodKey → first upload id
  const toDelete: string[] = [];
  for (const u of uploads) {
    const key = `${u.statementStart!.toISOString().slice(0, 10)}|${u.statementEnd!.toISOString().slice(0, 10)}`;
    const first = seen.get(key);
    if (!first) {
      seen.set(key, u.id);
      continue;
    }
    // Duplicate period. Safe to drop only if this upload didn't contribute
    // transactions (e.g. 0 rows, because the original absorbed them all).
    if (u._count.transactions === 0) {
      toDelete.push(u.id);
    }
  }

  for (const id of toDelete) {
    await prisma.upload.delete({ where: { id } });
  }

  return NextResponse.json({ deleted: toDelete.length });
}
