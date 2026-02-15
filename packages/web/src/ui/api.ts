export type Recipe = {
  id: number;
  title: string;
  sourceUrl: string;
  sourceHost?: string | null;
  imageUrl?: string | null;
  description?: string | null;
  servings?: number | null;
  servingsText?: string | null;
  ingredients?: unknown;
  instructions?: unknown;
  scrapeStatus: 'pending' | 'ok' | 'error';
  scrapeError?: string | null;
  lastScrapedAt?: string | null;
  updatedAt: string;
  notes?: string | null;
  tags?: unknown;
};

export type AuthUser = {
  id: number;
  email: string;
};

async function apiFetch(path: string, init?: RequestInit) {
  const res = await fetch(`/api${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      // Only set content-type for JSON bodies; for GETs this header is misleading and can
      // cause some intermediaries to behave oddly.
      ...(init?.body ? { 'content-type': 'application/json' } : {}),
      accept: 'application/json',
      ...(init?.headers ?? {})
    }
  });

  const contentType = res.headers.get('content-type') ?? '';
  const isJson = contentType.toLowerCase().includes('application/json');

  // When /api isn't actually proxied to the API (common in prod misconfig),
  // the frontend server returns index.html with status 200 and JSON parsing
  // throws "Unexpected token '<' ...". Detect and raise a clear message.
  if (!isJson) {
    const text = await res.text().catch(() => '');
    const hint =
      contentType.toLowerCase().includes('text/html') || text.trimStart().startsWith('<!doctype')
        ? ' (got HTML; is /api proxying to the API?)'
        : '';
    throw new Error(`API returned non-JSON response (${res.status}${hint})`);
  }

  let body: any;
  try {
    body = await res.json();
  } catch {
    throw new Error(`API returned invalid JSON (${res.status})`);
  }

  if (!res.ok) {
    throw new Error(body?.error || `Request failed (${res.status})`);
  }

  return body;
}

export async function authMe(): Promise<AuthUser | null> {
  const data = await apiFetch('/auth/me');
  return data.user;
}

export async function authRegister(payload: { email: string; password: string }): Promise<{ user: AuthUser }> {
  return apiFetch('/auth/register', { method: 'POST', body: JSON.stringify(payload) });
}

export async function authLogin(payload: { email: string; password: string }): Promise<{ user: AuthUser }> {
  return apiFetch('/auth/login', { method: 'POST', body: JSON.stringify(payload) });
}

export async function authLogout(): Promise<void> {
  await apiFetch('/auth/logout', { method: 'POST' });
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

export async function deleteRecipe(id: number): Promise<void> {
  await apiFetch(`/recipes/${id}`, { method: 'DELETE' });
}

export async function updateRecipe(
  id: number,
  patch: { title?: string; notes?: string | null; tags?: string[] | null }
): Promise<Recipe> {
  const data = await apiFetch(`/recipes/${id}`, { method: 'PUT', body: JSON.stringify(patch) });
  return data.recipe;
}
