import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const tag = await prisma.tag.findFirst({ where: { id, userId: session.user.id } });
  if (!tag) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { name, color } = await request.json();
  const updated = await prisma.tag.update({
    where: { id },
    data: {
      name: name !== undefined ? String(name).trim() : undefined,
      color: color !== undefined ? String(color) : undefined,
    },
  });
  return NextResponse.json(updated);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const tag = await prisma.tag.findFirst({ where: { id, userId: session.user.id } });
  if (!tag) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.tag.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
