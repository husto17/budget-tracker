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

// Returns the canonical category owner for the household.
// Both members share this user's categories. We use earliest createdAt
// as a stable tiebreaker that never changes.
export async function getHouseholdCategoryOwnerId(userId: string): Promise<string> {
  const partnerUserId = await getPartnerUserId(userId);
  if (!partnerUserId) return userId;
  const [me, partner] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { createdAt: true } }),
    prisma.user.findUnique({ where: { id: partnerUserId }, select: { createdAt: true } }),
  ]);
  if (!me || !partner) return userId;
  return me.createdAt <= partner.createdAt ? userId : partnerUserId;
}

// One-time (idempotent) migration: moves all non-owner categories and rules
// into the canonical owner's namespace so the household shares one set.
export async function mergeHouseholdCategories(userId: string): Promise<void> {
  const ownerId = await getHouseholdCategoryOwnerId(userId);
  const partnerUserId = await getPartnerUserId(userId);
  if (!partnerUserId) return;

  const nonOwnerId = ownerId === userId ? partnerUserId : userId;

  const nonOwnerCategories = await prisma.category.findMany({
    where: { userId: nonOwnerId },
    select: { id: true, name: true },
  });
  if (nonOwnerCategories.length === 0) return;

  const ownerCategories = await prisma.category.findMany({
    where: { userId: ownerId },
    select: { id: true, name: true },
  });
  const ownerByName = new Map(ownerCategories.map((c) => [c.name.toLowerCase(), c.id]));

  for (const pc of nonOwnerCategories) {
    const existingId = ownerByName.get(pc.name.toLowerCase());
    if (existingId) {
      // Owner already has this category — migrate everything to the owner's copy.
      await prisma.transaction.updateMany({ where: { categoryId: pc.id }, data: { categoryId: existingId } });
      await prisma.categoryRule.updateMany({
        where: { categoryId: pc.id },
        data: { categoryId: existingId, userId: ownerId },
      });
      await prisma.category.delete({ where: { id: pc.id } });
    } else {
      // Owner doesn't have this category — reassign it to owner.
      await prisma.categoryRule.updateMany({
        where: { userId: nonOwnerId, categoryId: pc.id },
        data: { userId: ownerId },
      });
      await prisma.category.update({ where: { id: pc.id }, data: { userId: ownerId } });
      ownerByName.set(pc.name.toLowerCase(), pc.id);
    }
  }

  // Move any orphaned rules still under nonOwner.
  await prisma.categoryRule.updateMany({ where: { userId: nonOwnerId }, data: { userId: ownerId } });
}
