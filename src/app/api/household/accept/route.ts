import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { token } = await request.json();

  if (!token) {
    return NextResponse.json({ error: "token is required" }, { status: 400 });
  }

  const invite = await prisma.householdInvite.findUnique({
    where: { token },
  });

  if (!invite) {
    return NextResponse.json({ error: "Invite not found" }, { status: 404 });
  }

  if (invite.expiresAt < new Date()) {
    return NextResponse.json({ error: "Invite has expired" }, { status: 410 });
  }

  // Join the household
  await prisma.user.update({
    where: { id: session.user.id },
    data: { householdId: invite.householdId },
  });

  // Delete the invite
  await prisma.householdInvite.delete({
    where: { id: invite.id },
  });

  return NextResponse.json({ success: true, householdId: invite.householdId });
}
