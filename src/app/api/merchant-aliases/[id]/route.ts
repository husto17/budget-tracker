import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const alias = await prisma.merchantAlias.findFirst({
    where: { id, userId: session.user.id },
  });
  if (!alias) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.merchantAlias.delete({ where: { id } });
  return new NextResponse(null, { status: 204 });
}
