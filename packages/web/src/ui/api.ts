export type Recipe = {
  id: number;
  title: string;
  sourceUrl: string;
  sourceHost?: string | null;
  imageUrl?: string | null;
  description?: string | null;
  ingredients?: unknown;
  instructions?: unknown;
  scrapeStatus: 'pending' | 'ok' | 'error';
  scrapeError?: string | null;
  lastScrapedAt?: string | null;
  updatedAt: string;
  notes?: string | null;
  tags?: unknown;
};

async function apiFetch(path: string, init?: RequestInit) {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(init?.headers ?? {})
    }
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error || `Request failed (${res.status})`);
  }

  return res.json();
}

export async function listRecipes(): Promise<Recipe[]> {
  const data = await apiFetch('/recipes');
  return data.recipes;
}

export async function createRecipe(sourceUrl: string, title?: string): Promise<{ id: number; alreadyExists?: boolean }> {
  return apiFetch('/recipes', { method: 'POST', body: JSON.stringify({ sourceUrl, title }) });
}

export async function getRecipe(id: number): Promise<Recipe> {
  const data = await apiFetch(`/recipes/${id}`);
  return data.recipe;
}

export async function rescrapeRecipe(id: number): Promise<Recipe> {
  const data = await apiFetch(`/recipes/${id}/rescrape`, { method: 'POST' });
  return data.recipe;
}

export async function updateRecipe(
  id: number,
  patch: { title?: string; notes?: string | null; tags?: string[] | null }
): Promise<Recipe> {
  const data = await apiFetch(`/recipes/${id}`, { method: 'PUT', body: JSON.stringify(patch) });
  return data.recipe;
}
