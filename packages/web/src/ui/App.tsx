import React, { useEffect, useMemo, useState } from 'react';

import type { Recipe } from './api';
import { createRecipe, getRecipe, listRecipes, rescrapeRecipe } from './api';

function statusClass(status: Recipe['scrapeStatus']): string {
  if (status === 'ok') return 'badge ok';
  if (status === 'error') return 'badge error';
  return 'badge pending';
}

function statusText(status: Recipe['scrapeStatus']): string {
  if (status === 'ok') return 'Ready';
  if (status === 'error') return 'Scrape error';
  return 'Scraping';
}

function stringifyList(value: unknown): string {
  if (!value) return '';
  if (Array.isArray(value)) return value.map(String).join('\n');
  return String(value);
}

export function App() {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [selected, setSelected] = useState<Recipe | null>(null);
  const [sourceUrl, setSourceUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedSummary = useMemo(() => recipes.find((r) => r.id === selectedId) ?? null, [recipes, selectedId]);

  async function refreshList() {
    const data = await listRecipes();
    setRecipes(data);
    if (!selectedId && data.length) {
      setSelectedId(data[0].id);
    }
  }

  useEffect(() => {
    void refreshList().catch((e) => setError(e instanceof Error ? e.message : 'Unknown error'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setSelected(null);
      return;
    }

    let cancelled = false;

    async function load() {
      const r = await getRecipe(selectedId);
      if (!cancelled) setSelected(r);
    }

    void load().catch((e) => setError(e instanceof Error ? e.message : 'Unknown error'));

    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  async function onAdd(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const created = await createRecipe(sourceUrl);
      setSourceUrl('');
      await refreshList();
      setSelectedId(created.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setBusy(false);
    }
  }

  async function onRescrape() {
    if (!selectedId) return;
    setError(null);
    setBusy(true);
    try {
      const updated = await rescrapeRecipe(selectedId);
      setSelected(updated);
      await refreshList();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="container">
      <header className="hero">
        <h1>Meal Rotation</h1>
        <p>
          Add a recipe URL. The app will try to extract the recipe (JSON-LD) and present it in a consistent view.
          If scraping fails, you can still keep the link and re-scrape later.
        </p>
      </header>

      <div className="grid">
        <section className="panel">
          <h2>Recipes</h2>
          <form onSubmit={onAdd} className="row" style={{ marginTop: '0.8rem' }}>
            <input
              className="input"
              value={sourceUrl}
              onChange={(e) => setSourceUrl(e.target.value)}
              placeholder="Paste recipe URL (e.g. https://...)"
            />
            <button className="btn primary" disabled={busy || !sourceUrl.trim()} type="submit">
              Add
            </button>
          </form>

          <div className="list" role="list">
            {recipes.map((r) => (
              <button
                key={r.id}
                className="card"
                style={{ textAlign: 'left', cursor: 'pointer', borderColor: r.id === selectedId ? 'rgba(110,231,255,0.45)' : undefined }}
                onClick={() => setSelectedId(r.id)}
                type="button"
              >
                <div className="card-top">
                  <div>
                    <h3>{r.title}</h3>
                    <small>{r.sourceHost ?? new URL(r.sourceUrl).hostname}</small>
                  </div>
                  <span className={statusClass(r.scrapeStatus)}>{statusText(r.scrapeStatus)}</span>
                </div>
              </button>
            ))}
          </div>
        </section>

        <section className="panel detail">
          <h2>Preview</h2>
          {!selected && <p style={{ color: 'rgba(210,220,238,0.72)', marginTop: '0.8rem' }}>Select a recipe.</p>}

          {selected && (
            <>
              <div className="row" style={{ justifyContent: 'space-between', marginTop: '0.8rem' }}>
                <div>
                  <div style={{ fontSize: '1.2rem', fontWeight: 800 }}>{selected.title}</div>
                  <div style={{ color: 'rgba(210,220,238,0.72)', marginTop: '0.2rem' }}>{selected.description ?? ''}</div>
                </div>
                <div className="row">
                  <a className="btn" href={selected.sourceUrl} target="_blank" rel="noreferrer">
                    Open Source
                  </a>
                  <button className="btn" type="button" disabled={busy} onClick={onRescrape}>
                    Re-scrape
                  </button>
                </div>
              </div>

              {selected.scrapeStatus === 'error' && selected.scrapeError && <div className="error">{selected.scrapeError}</div>}

              <div className="kv">
                <b>Ingredients</b>
                <div className="pre">{stringifyList(selected.ingredients) || 'No ingredients extracted yet.'}</div>
              </div>

              <div className="kv">
                <b>Instructions</b>
                <div className="pre">{stringifyList(selected.instructions) || 'No instructions extracted yet.'}</div>
              </div>

              {selectedSummary?.lastScrapedAt && (
                <div style={{ marginTop: '0.8rem', color: 'rgba(210,220,238,0.6)', fontSize: '0.85rem' }}>
                  Last scraped: {new Date(selectedSummary.lastScrapedAt).toLocaleString()}
                </div>
              )}
            </>
          )}
        </section>
      </div>

      {error && <div className="panel" style={{ marginTop: '1.2rem', borderColor: 'rgba(251,113,133,0.35)' }}>{error}</div>}
    </div>
  );
}
