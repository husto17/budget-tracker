import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { HouseholdSettings } from "./HouseholdSettings";

export default async function SettingsPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const userId = session.user.id;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { householdId: true, email: true },
  });

  const pendingInvite = user?.email
    ? await prisma.householdInvite.findFirst({
        where: {
          invitedEmail: user.email,
          expiresAt: { gt: new Date() },
        },
        select: {
          id: true,
          token: true,
          household: {
            select: {
              members: {
                select: { id: true, name: true, email: true, image: true },
              },
            },
          },
        },
      })
    : null;

  let household = null;
  if (user?.householdId) {
    household = await prisma.household.findUnique({
      where: { id: user.householdId },
      select: {
        id: true,
        members: {
          select: { id: true, name: true, email: true, image: true },
        },
      },
    });
  }

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Settings</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Manage your household and preferences</p>
      </div>
      <HouseholdSettings
        currentUserId={userId}
        household={household}
        pendingInvite={pendingInvite}
      />
    </div>
  );
}
