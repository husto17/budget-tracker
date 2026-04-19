import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getHouseholdAccountIds } from "@/lib/household";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const accountIds = await getHouseholdAccountIds(session.user.id);
  const tx = await prisma.transaction.findFirst({ where: { id, deletedAt: null } });
  if (!tx || !accountIds.includes(tx.accountId))
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { tagId, name, color } = await request.json();

  let resolvedTagId = tagId;
  if (!resolvedTagId && name) {
    // Create-or-find by name
    const existing = await prisma.tag.findFirst({
      where: { userId: session.user.id, name: String(name).trim() },
    });
    if (existing) {
      resolvedTagId = existing.id;
    } else {
      const created = await prisma.tag.create({
        data: { userId: session.user.id, name: String(name).trim(), color: color ?? "#6366f1" },
      });
      resolvedTagId = created.id;
    }
  }

  if (!resolvedTagId) return NextResponse.json({ error: "tagId or name required" }, { status: 400 });

  // Verify tag belongs to this user's household
  const tag = await prisma.tag.findFirst({ where: { id: resolvedTagId, userId: session.user.id } });
  if (!tag) return NextResponse.json({ error: "Tag not found" }, { status: 404 });

  // Upsert (idempotent)
  const existing = await prisma.transactionTag.findFirst({
    where: { transactionId: id, tagId: resolvedTagId },
  });
  if (!existing) {
    await prisma.transactionTag.create({ data: { transactionId: id, tagId: resolvedTagId } });
  }

  return NextResponse.json(tag);
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const accountIds = await getHouseholdAccountIds(session.user.id);
  const tx = await prisma.transaction.findFirst({ where: { id, deletedAt: null } });
  if (!tx || !accountIds.includes(tx.accountId))
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { tagId } = await request.json();
  if (!tagId) return NextResponse.json({ error: "tagId required" }, { status: 400 });

  await prisma.transactionTag.deleteMany({ where: { transactionId: id, tagId } });
  return NextResponse.json({ success: true });
}
