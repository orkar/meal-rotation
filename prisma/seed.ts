import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Intentionally no-op: don't create placeholder/example recipes.
}

main()
  .then(async () => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
