import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getHouseholdAccountIds } from "@/lib/household";

// Bulk categorize transactions (legacy POST)
export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { ids, categoryId } = await request.json();

  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: "ids array required" }, { status: 400 });
  }

  const householdAccountIds = await getHouseholdAccountIds(session.user.id);
  const result = await prisma.transaction.updateMany({
    where: {
      id: { in: ids },
      accountId: { in: householdAccountIds },
    },
    data: { categoryId: categoryId || null },
  });

  return NextResponse.json({ updated: result.count });
}

// Bulk re-categorize via PATCH
export async function PATCH(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { transactionIds, categoryId } = await request.json();

  if (!Array.isArray(transactionIds) || transactionIds.length === 0) {
    return NextResponse.json({ error: "transactionIds array required" }, { status: 400 });
  }

  const householdAccountIds = await getHouseholdAccountIds(session.user.id);

  // Grab merchant names before we update so we can learn rules from this action.
  const toUpdate = await prisma.transaction.findMany({
    where: {
      id: { in: transactionIds },
      accountId: { in: householdAccountIds },
    },
    select: { merchant: true },
  });

  const result = await prisma.transaction.updateMany({
    where: {
      id: { in: transactionIds },
      accountId: { in: householdAccountIds },
    },
    data: { categoryId: categoryId ?? null },
  });

  // Learn a rule per unique merchant when assigning (not clearing) a category.
  if (categoryId) {
    const uniqueMerchants = Array.from(
      new Set(
        toUpdate
          .map((t) => t.merchant?.trim())
          .filter((m): m is string => !!m && m.length >= 3),
      ),
    );
    if (uniqueMerchants.length > 0) {
      const existing = await prisma.categoryRule.findMany({
        where: {
          userId: session.user.id,
          isRegex: false,
          pattern: { in: uniqueMerchants },
        },
        select: { id: true, pattern: true, categoryId: true },
      });
      const byPattern = new Map(existing.map((r) => [r.pattern, r]));
      const toCreate: Array<{ userId: string; categoryId: string; pattern: string }> = [];
      const toMove: string[] = [];
      for (const m of uniqueMerchants) {
        const r = byPattern.get(m);
        if (!r) toCreate.push({ userId: session.user.id, categoryId, pattern: m });
        else if (r.categoryId !== categoryId) toMove.push(r.id);
      }
      for (const r of toCreate) {
        await prisma.categoryRule.create({ data: r });
      }
      if (toMove.length > 0) {
        await prisma.categoryRule.updateMany({
          where: { id: { in: toMove } },
          data: { categoryId },
        });
      }
    }
  }

  return NextResponse.json({ updated: result.count });
}

// Bulk field update: supports isExcluded, soft-delete
export async function PUT(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { transactionIds, patch } = await request.json() as {
    transactionIds: string[];
    patch: { isExcluded?: boolean; deletedAt?: true };
  };

  if (!Array.isArray(transactionIds) || transactionIds.length === 0) {
    return NextResponse.json({ error: "transactionIds required" }, { status: 400 });
  }

  const householdAccountIds = await getHouseholdAccountIds(session.user.id);
  const data: Record<string, unknown> = {};
  if (patch.isExcluded !== undefined) data.isExcluded = patch.isExcluded;
  if (patch.deletedAt) data.deletedAt = new Date();

  const result = await prisma.transaction.updateMany({
    where: { id: { in: transactionIds }, accountId: { in: householdAccountIds } },
    data,
  });

  return NextResponse.json({ updated: result.count });
}
