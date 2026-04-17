import { prisma } from "./prisma";

export async function getPartnerUserId(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { householdId: true },
  });
  if (!user?.householdId) return null;
  const partner = await prisma.user.findFirst({
    where: { householdId: user.householdId, id: { not: userId } },
    select: { id: true },
  });
  return partner?.id ?? null;
}

export async function getHouseholdAccountIds(userId: string): Promise<string[]> {
  const partnerUserId = await getPartnerUserId(userId);
  const userIds = partnerUserId ? [userId, partnerUserId] : [userId];
  const accounts = await prisma.account.findMany({
    where: { userId: { in: userIds } },
    select: { id: true },
  });
  return accounts.map((a) => a.id);
}
