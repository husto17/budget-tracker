import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getHouseholdId } from "@/lib/household";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const householdId = await getHouseholdId(session.user.id);
  const where = householdId ? { householdId } : { userId: session.user.id };

  const aliases = await prisma.merchantAlias.findMany({
    where,
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(aliases);
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  if (!body || typeof body.fromName !== "string" || typeof body.toName !== "string") {
    return NextResponse.json({ error: "fromName and toName required" }, { status: 400 });
  }
  const fromName = body.fromName.trim();
  const toName = body.toName.trim();
  if (!fromName || !toName) {
    return NextResponse.json({ error: "fromName and toName must not be empty" }, { status: 400 });
  }

  const householdId = await getHouseholdId(session.user.id);

  // Manual find+create/update instead of upsert — Neon HTTP adapter can't run the
  // implicit transaction that upsert uses.
  if (householdId) {
    const existing = await prisma.merchantAlias.findFirst({ where: { householdId, fromName } });
    if (existing) {
      const alias = await prisma.merchantAlias.update({ where: { id: existing.id }, data: { toName } });
      return NextResponse.json(alias, { status: 200 });
    }
    const alias = await prisma.merchantAlias.create({
      data: { userId: session.user.id, householdId, fromName, toName },
    });
    return NextResponse.json(alias, { status: 201 });
  } else {
    const existing = await prisma.merchantAlias.findUnique({
      where: { userId_fromName: { userId: session.user.id, fromName } },
    });
    if (existing) {
      const alias = await prisma.merchantAlias.update({ where: { id: existing.id }, data: { toName } });
      return NextResponse.json(alias, { status: 200 });
    }
    const alias = await prisma.merchantAlias.create({
      data: { userId: session.user.id, fromName, toName },
    });
    return NextResponse.json(alias, { status: 201 });
  }
}
