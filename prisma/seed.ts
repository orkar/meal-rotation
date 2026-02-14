import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Keep seed minimal; user will add real recipes.
  await prisma.recipe.upsert({
    where: { sourceUrl: 'https://example.com' },
    update: {},
    create: {
      title: 'Example Recipe',
      sourceUrl: 'https://example.com',
      sourceHost: 'example.com',
      description: 'Seed recipe. Replace me with your real recipes.',
      ingredients: ['1 example ingredient'],
      instructions: ['Open the app and add recipes you like.'],
      scrapeStatus: 'ok',
      lastScrapedAt: new Date()
    }
  });
}

main()
  .then(async () => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
