import { Router } from 'express';
import { z } from 'zod';

import { Prisma } from '@prisma/client';
import { asyncRoute } from '../lib/async-route.js';
import { prisma } from '../lib/db.js';
import { HttpError } from '../lib/http-error.js';
import { scrapeRecipe } from '../lib/scrape.js';

const router = Router();

const createSchema = z.object({
  sourceUrl: z.string().trim().url(),
  title: z.string().trim().min(1).max(180).optional()
});

const updateSchema = z.object({
  title: z.string().trim().min(1).max(180).optional(),
  notes: z.string().trim().max(5000).optional().nullable(),
  tags: z.array(z.string().trim().min(1).max(32)).max(25).optional().nullable()
});

router.get(
  '/',
  asyncRoute(async (_req, res) => {
    const recipes = await prisma.recipe.findMany({
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        title: true,
        sourceUrl: true,
        sourceHost: true,
        imageUrl: true,
        scrapeStatus: true,
        lastScrapedAt: true,
        updatedAt: true
      }
    });
    res.json({ recipes });
  })
);

router.post(
  '/',
  asyncRoute(async (req, res) => {
    const body = createSchema.parse(req.body);

    const existing = await prisma.recipe.findUnique({ where: { sourceUrl: body.sourceUrl }, select: { id: true } });
    if (existing) {
      res.status(200).json({ id: existing.id, alreadyExists: true });
      return;
    }

    const url = new URL(body.sourceUrl);

    const recipe = await prisma.recipe.create({
      data: {
        title: body.title ?? url.hostname,
        sourceUrl: body.sourceUrl,
        sourceHost: url.hostname,
        scrapeStatus: 'pending'
      },
      select: { id: true }
    });

    // Fire-and-forget scrape; client can poll recipe detail.
    void (async () => {
      try {
        const scraped = await scrapeRecipe(body.sourceUrl);
        await prisma.recipe.update({
          where: { id: recipe.id },
          data: {
            title: body.title ?? scraped.title,
            description: scraped.description,
            imageUrl: scraped.imageUrl,
            ingredients: scraped.ingredients ?? undefined,
            instructions: scraped.instructions ?? undefined,
            sourceHost: scraped.sourceHost,
            scrapeStatus: 'ok',
            scrapeError: null,
            lastScrapedAt: new Date()
          }
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown scrape error';
        await prisma.recipe.update({
          where: { id: recipe.id },
          data: {
            scrapeStatus: 'error',
            scrapeError: message,
            lastScrapedAt: new Date()
          }
        });
      }
    })();

    res.status(201).json({ id: recipe.id });
  })
);

router.get(
  '/:id',
  asyncRoute(async (req, res) => {
    const id = Number.parseInt(req.params.id ?? '', 10);
    if (!Number.isInteger(id)) {
      throw new HttpError(400, 'Invalid id');
    }

    const recipe = await prisma.recipe.findUnique({ where: { id } });
    if (!recipe) {
      throw new HttpError(404, 'Recipe not found');
    }

    res.json({ recipe });
  })
);

router.put(
  '/:id',
  asyncRoute(async (req, res) => {
    const id = Number.parseInt(req.params.id ?? '', 10);
    if (!Number.isInteger(id)) {
      throw new HttpError(400, 'Invalid id');
    }

    const body = updateSchema.parse(req.body);

    const recipe = await prisma.recipe.update({
      where: { id },
      data: {
        ...(body.title ? { title: body.title } : {}),
        ...(body.notes !== undefined ? { notes: body.notes } : {}),
        ...(body.tags !== undefined
          ? { tags: body.tags === null ? Prisma.JsonNull : body.tags }
          : {})
      }
    });

    res.json({ recipe });
  })
);

router.delete(
  '/:id',
  asyncRoute(async (req, res) => {
    const id = Number.parseInt(req.params.id ?? '', 10);
    if (!Number.isInteger(id)) {
      throw new HttpError(400, 'Invalid id');
    }

    try {
      await prisma.recipe.delete({ where: { id } });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
        throw new HttpError(404, 'Recipe not found');
      }
      throw err;
    }

    res.json({ ok: true });
  })
);

router.post(
  '/:id/rescrape',
  asyncRoute(async (req, res) => {
    const id = Number.parseInt(req.params.id ?? '', 10);
    if (!Number.isInteger(id)) {
      throw new HttpError(400, 'Invalid id');
    }

    const recipe = await prisma.recipe.findUnique({ where: { id } });
    if (!recipe) {
      throw new HttpError(404, 'Recipe not found');
    }

    await prisma.recipe.update({
      where: { id },
      data: { scrapeStatus: 'pending', scrapeError: null }
    });

    try {
      const scraped = await scrapeRecipe(recipe.sourceUrl);
      const updated = await prisma.recipe.update({
        where: { id },
        data: {
          title: scraped.title,
          description: scraped.description,
          imageUrl: scraped.imageUrl,
          ingredients: scraped.ingredients ?? undefined,
          instructions: scraped.instructions ?? undefined,
          sourceHost: scraped.sourceHost,
          scrapeStatus: 'ok',
          scrapeError: null,
          lastScrapedAt: new Date()
        }
      });

      res.json({ recipe: updated });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown scrape error';
      const updated = await prisma.recipe.update({
        where: { id },
        data: {
          scrapeStatus: 'error',
          scrapeError: message,
          lastScrapedAt: new Date()
        }
      });

      res.status(200).json({ recipe: updated });
    }
  })
);

export default router;
