import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getHouseholdAccountIds } from "@/lib/household";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const householdAccountIds = await getHouseholdAccountIds(session.user.id);

  const upload = await prisma.upload.findUnique({
    where: { id },
    select: { id: true, accountId: true },
  });

  if (!upload || !householdAccountIds.includes(upload.accountId)) {
    return NextResponse.json({ error: "Upload not found" }, { status: 404 });
  }

  // Delete transactions linked to this upload (orphaned ones too)
  await prisma.transaction.deleteMany({ where: { uploadId: id } });

  // Delete the upload record
  await prisma.upload.delete({ where: { id } });

  return NextResponse.json({ success: true });
}
