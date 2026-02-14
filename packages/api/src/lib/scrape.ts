import * as cheerio from 'cheerio';
import he from 'he';

export type ScrapedRecipe = {
  title: string;
  description?: string;
  imageUrl?: string;
  ingredients?: string[];
  instructions?: string[];
  sourceHost?: string;
};

function normalizeText(value: string): string {
  return he
    .decode(value)
    .replace(/\s+/g, ' ')
    .replace(/\u00a0/g, ' ')
    .trim();
}

function toStringArray(value: unknown): string[] | undefined {
  if (Array.isArray(value)) {
    const out = value
      .map((v) => (typeof v === 'string' ? normalizeText(v) : null))
      .filter(Boolean) as string[];
    return out.length ? out : undefined;
  }

  if (typeof value === 'string') {
    const single = normalizeText(value);
    return single ? [single] : undefined;
  }

  return undefined;
}

function flattenJsonLd(json: unknown): unknown[] {
  if (!json) {
    return [];
  }

  if (Array.isArray(json)) {
    return json.flatMap(flattenJsonLd);
  }

  if (typeof json === 'object') {
    const obj = json as Record<string, unknown>;
    if (Array.isArray(obj['@graph'])) {
      return flattenJsonLd(obj['@graph']);
    }

    return [obj];
  }

  return [];
}

function isRecipeType(typeValue: unknown): boolean {
  if (typeof typeValue === 'string') {
    return typeValue.toLowerCase() === 'recipe';
  }

  if (Array.isArray(typeValue)) {
    return typeValue.some((t) => typeof t === 'string' && t.toLowerCase() === 'recipe');
  }

  return false;
}

function pickImageUrl(image: unknown): string | undefined {
  if (typeof image === 'string') {
    return image;
  }
  if (Array.isArray(image)) {
    const first = image.find((v) => typeof v === 'string');
    return typeof first === 'string' ? first : undefined;
  }
  if (typeof image === 'object' && image) {
    const url = (image as Record<string, unknown>)['url'];
    if (typeof url === 'string') {
      return url;
    }
  }
  return undefined;
}

function parseInstructions(value: unknown): string[] | undefined {
  if (!value) {
    return undefined;
  }

  if (typeof value === 'string') {
    const text = normalizeText(value);
    // Some sites put all steps in one blob.
    const split = text.split(/\s*(?:\r?\n|\d+\.|•|\u2022)\s*/).map(normalizeText).filter(Boolean);
    return split.length ? split : [text];
  }

  if (Array.isArray(value)) {
    const out: string[] = [];
    for (const item of value) {
      if (typeof item === 'string') {
        const t = normalizeText(item);
        if (t) out.push(t);
        continue;
      }
      if (typeof item === 'object' && item) {
        const obj = item as Record<string, unknown>;
        const text = obj['text'];
        if (typeof text === 'string') {
          const t = normalizeText(text);
          if (t) out.push(t);
          continue;
        }
        // Sections may contain itemListElement.
        const ile = obj['itemListElement'];
        const nested = parseInstructions(ile);
        if (nested?.length) out.push(...nested);
      }
    }

    return out.length ? out : undefined;
  }

  return undefined;
}

export async function scrapeRecipe(sourceUrl: string): Promise<ScrapedRecipe> {
  const url = new URL(sourceUrl);

  const res = await fetch(sourceUrl, {
    headers: {
      // Many recipe sites block default node user agents.
      'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123 Safari/537.36',
      'accept': 'text/html,application/xhtml+xml',
      'accept-language': 'en-US,en;q=0.9'
    },
    redirect: 'follow'
  });

  if (!res.ok) {
    throw new Error(`Fetch failed (${res.status})`);
  }

  const html = await res.text();
  const $ = cheerio.load(html);

  const scripts = $('script[type="application/ld+json"]')
    .toArray()
    .map((el) => $(el).text())
    .map((t) => t.trim())
    .filter(Boolean);

  let jsonNodes: unknown[] = [];

  for (const raw of scripts) {
    try {
      // Some sites include multiple JSON values in one tag; keep it simple for now.
      const parsed = JSON.parse(raw);
      jsonNodes.push(...flattenJsonLd(parsed));
    } catch {
      // ignore
    }
  }

  const recipeNode = jsonNodes.find((node) => typeof node === 'object' && node && isRecipeType((node as any)['@type'])) as
    | Record<string, unknown>
    | undefined;

  const titleFromHtml = normalizeText($('meta[property="og:title"]').attr('content') || $('title').text() || 'Untitled recipe');

  if (!recipeNode) {
    return {
      title: titleFromHtml,
      sourceHost: url.hostname
    };
  }

  const title = typeof recipeNode['name'] === 'string' ? normalizeText(recipeNode['name']) : titleFromHtml;
  const description = typeof recipeNode['description'] === 'string' ? normalizeText(recipeNode['description']) : undefined;
  const ingredients = toStringArray(recipeNode['recipeIngredient']);
  const instructions = parseInstructions(recipeNode['recipeInstructions']);
  const imageUrl = pickImageUrl(recipeNode['image']);

  return {
    title,
    description,
    imageUrl,
    ingredients,
    instructions,
    sourceHost: url.hostname
  };
}
