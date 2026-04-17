import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = session.user.id;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { householdId: true, email: true },
  });

  // Check if there's a pending invite for this user's email
  const pendingInvite = user?.email
    ? await prisma.householdInvite.findFirst({
        where: {
          invitedEmail: user.email,
          expiresAt: { gt: new Date() },
        },
        include: {
          household: {
            include: {
              members: { select: { id: true, name: true, email: true, image: true } },
            },
          },
        },
      })
    : null;

  if (user?.householdId) {
    const household = await prisma.household.findUnique({
      where: { id: user.householdId },
      include: {
        members: { select: { id: true, name: true, email: true, image: true } },
      },
    });
    return NextResponse.json({ household, pendingInvite });
  }

  return NextResponse.json({ household: null, pendingInvite });
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = session.user.id;
  const { partnerEmail } = await request.json();

  if (!partnerEmail) {
    return NextResponse.json({ error: "partnerEmail is required" }, { status: 400 });
  }

  const currentUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { householdId: true },
  });

  let householdId = currentUser?.householdId;

  if (!householdId) {
    // Create a new household
    const household = await prisma.household.create({ data: {} });
    householdId = household.id;
    await prisma.user.update({
      where: { id: userId },
      data: { householdId },
    });
  }

  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const invite = await prisma.householdInvite.create({
    data: {
      householdId,
      invitedEmail: partnerEmail,
      expiresAt,
    },
  });

  return NextResponse.json({ invite });
}

export async function DELETE() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await prisma.user.update({
    where: { id: session.user.id },
    data: { householdId: null },
  });

  return NextResponse.json({ success: true });
}
