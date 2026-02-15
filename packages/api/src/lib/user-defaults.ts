import { prisma } from './db.js';

export async function ensureUserDefaults(userId: number): Promise<void> {
  // Treat recipes with no owner as templates, and copy them into new accounts.
  const templates = await prisma.recipe.findMany({
    where: { userId: null },
    select: {
      title: true,
      sourceUrl: true,
      sourceHost: true,
      imageUrl: true,
      description: true,
      servings: true,
      servingsText: true,
      ingredients: true,
      instructions: true,
      scrapeStatus: true,
      scrapeError: true,
      lastScrapedAt: true,
      notes: true,
      tags: true
    },
    orderBy: { updatedAt: 'desc' }
  });

  if (!templates.length) {
    return;
  }

  await prisma.recipe.createMany({
    data: templates.map((r) => ({
      userId,
      title: r.title,
      sourceUrl: r.sourceUrl,
      sourceHost: r.sourceHost,
      imageUrl: r.imageUrl,
      description: r.description,
      servings: r.servings,
      servingsText: r.servingsText,
      ingredients: r.ingredients ?? undefined,
      instructions: r.instructions ?? undefined,
      scrapeStatus: r.scrapeStatus,
      scrapeError: r.scrapeError,
      lastScrapedAt: r.lastScrapedAt,
      notes: r.notes,
      tags: r.tags ?? undefined
    })),
    skipDuplicates: true
  });
}
