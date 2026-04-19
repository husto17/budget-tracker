import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const aliases = await prisma.merchantAlias.findMany({
    where: { userId: session.user.id },
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

  const alias = await prisma.merchantAlias.upsert({
    where: { userId_fromName: { userId: session.user.id, fromName } },
    create: { userId: session.user.id, fromName, toName },
    update: { toName },
  });
  return NextResponse.json(alias, { status: 201 });
}
