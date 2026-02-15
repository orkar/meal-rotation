import React, { useEffect, useMemo, useRef, useState } from 'react';

import type { AuthUser, Recipe } from './api';
import { authLogin, authLogout, authMe, authRegister, createRecipe, deleteRecipe, getRecipe, listRecipes, rescrapeRecipe, updateRecipe } from './api';

function RecipeBanner({ title, imageUrl }: { title: string; imageUrl?: string | null }) {
  const [hidden, setHidden] = useState(false);
  if (!imageUrl || hidden) return null;

  return (
    <div className="recipe-banner" aria-hidden="true">
      <img
        className="recipe-banner-img"
        src={imageUrl}
        alt={title ? `${title} banner` : 'Recipe banner'}
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setHidden(true)}
      />
      <div className="recipe-banner-fade" />
    </div>
  );
}

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

function normalizeLines(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(String).map((s) => s.trim()).filter(Boolean);

  const s = String(value)
    .replace(/\r\n/g, '\n')
    .trim();
  if (!s) return [];

  return s
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function stripLeadingStepNumber(s: string): string {
  // Avoid "1. 1. Step" when the source already numbers each line.
  return s.replace(/^\s*(?:step\s*)?\d+\s*[\).\:-]\s*/i, '').trim();
}

const UNICODE_FRACTIONS: Record<string, string> = {
  '¼': '1/4',
  '½': '1/2',
  '¾': '3/4',
  '⅐': '1/7',
  '⅑': '1/9',
  '⅒': '1/10',
  '⅓': '1/3',
  '⅔': '2/3',
  '⅕': '1/5',
  '⅖': '2/5',
  '⅗': '3/5',
  '⅘': '4/5',
  '⅙': '1/6',
  '⅚': '5/6',
  '⅛': '1/8',
  '⅜': '3/8',
  '⅝': '5/8',
  '⅞': '7/8'
};

function normalizeFractions(text: string): string {
  // "1½" -> "1 1/2"
  return text.replace(/[¼½¾⅐⅑⅒⅓⅔⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞]/g, (m) => ` ${UNICODE_FRACTIONS[m] ?? m} `).replace(/\s+/g, ' ');
}

function gcd(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y) {
    const t = x % y;
    x = y;
    y = t;
  }
  return x || 1;
}

function formatQuantity(value: number): string {
  if (!Number.isFinite(value)) return '';

  const roundedInt = Math.round(value);
  if (Math.abs(value - roundedInt) < 1e-9) return String(roundedInt);

  // Prefer common cooking fractions (nearest 1/8) if it fits well.
  const eighth = Math.round(value * 8) / 8;
  if (Math.abs(value - eighth) < 0.02) {
    const whole = Math.floor(eighth + 1e-9);
    const frac = eighth - whole;
    const num0 = Math.round(frac * 8);
    const den0 = 8;
    if (num0 === 0) return String(whole);
    const g = gcd(num0, den0);
    const num = num0 / g;
    const den = den0 / g;
    return whole > 0 ? `${whole} ${num}/${den}` : `${num}/${den}`;
  }

  // Fall back to a trimmed decimal.
  return String(Math.round(value * 100) / 100).replace(/\.0+$/, '').replace(/(\.\d*[1-9])0+$/, '$1');
}

function parseQuantityToken(token: string): number | null {
  const s = normalizeFractions(token).trim();

  const mixed = s.match(/^(\d+)\s+(\d+)\s*\/\s*(\d+)\b/);
  if (mixed) {
    const whole = Number(mixed[1]);
    const num = Number(mixed[2]);
    const den = Number(mixed[3]);
    if (Number.isFinite(whole) && Number.isFinite(num) && Number.isFinite(den) && den !== 0) {
      return whole + num / den;
    }
  }

  const frac = s.match(/^(\d+)\s*\/\s*(\d+)\b/);
  if (frac) {
    const num = Number(frac[1]);
    const den = Number(frac[2]);
    if (Number.isFinite(num) && Number.isFinite(den) && den !== 0) {
      return num / den;
    }
  }

  const dec = s.match(/^(\d+(?:\.\d+)?)/);
  if (dec) {
    const n = Number(dec[1]);
    if (Number.isFinite(n)) return n;
  }

  return null;
}

function scaleLeadingQuantity(line: string, multiplier: number): string {
  if (!line || !Number.isFinite(multiplier) || multiplier === 1) return line;

  const normalized = normalizeFractions(line);

  const qty = '(?:\\d+\\s+\\d+\\/\\d+|\\d+\\/\\d+|\\d+(?:\\.\\d+)?)';
  const re = new RegExp(`^(\\s*)(${qty})(\\s*(?:-|–|to)\\s*(${qty}))?(.*)$`, 'i');
  const m = normalized.match(re);
  if (!m) return line;

  const prefix = m[1] ?? '';
  const a = m[2] ?? '';
  const b = m[4] ?? '';
  const suffix = (m[5] ?? '').replace(/\s+/g, ' ');

  const aNum = parseQuantityToken(a);
  if (aNum === null) return line;
  const aScaled = formatQuantity(aNum * multiplier);

  if (b) {
    const bNum = parseQuantityToken(b);
    if (bNum === null) return `${prefix}${aScaled}${suffix}`;
    const bScaled = formatQuantity(bNum * multiplier);
    const sep = (m[3] ?? '').replace(b, '').trim() || '-';
    return `${prefix}${aScaled} ${sep} ${bScaled}${suffix}`.replace(/\s+/g, ' ').trim();
  }

  return `${prefix}${aScaled}${suffix}`.replace(/\s+/g, ' ').trim();
}

function scaleServingsLabel(recipe: Recipe, multiplier: number): string | null {
  const baseText = (recipe.servingsText ?? '').trim();
  const baseNum = typeof recipe.servings === 'number' && Number.isFinite(recipe.servings) ? recipe.servings : null;

  if (!baseText && baseNum === null) return null;

  if (baseText) {
    const normalized = normalizeFractions(baseText);
    const qtyRe = /(\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?)/g;
    let count = 0;
    const replaced = normalized.replace(qtyRe, (raw) => {
      if (count >= 2) return raw;
      const n = parseQuantityToken(raw);
      if (n === null) return raw;
      count += 1;
      return formatQuantity(n * multiplier);
    });

    let label = replaced.trim();
    if (/^\d/.test(label)) {
      label = label.replace(/\bservings?\b/i, '').trim();
      label = `Serves ${label}`;
    } else if (/servings?\b/i.test(label) && !/^\s*serves\b/i.test(label)) {
      label = label.replace(/\bservings?\b/i, '').trim();
      label = label ? `Serves ${label}` : 'Serves';
    }

    return label;
  }

  return `Serves ${formatQuantity((baseNum ?? 0) * multiplier)}`;
}

export function App() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [selected, setSelected] = useState<Recipe | null>(null);
  const [fullScreenRecipeId, setFullScreenRecipeId] = useState<number | null>(null);
  const [fullScreenRecipeDetail, setFullScreenRecipeDetail] = useState<Recipe | null>(null);
  const fullScreenPrevScrollYRef = useRef(0);
  const fullScreenWasOpenRef = useRef(false);
  const [sourceUrl, setSourceUrl] = useState('');
  const [editTitle, setEditTitle] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkedIngredientsByRecipeId, setCheckedIngredientsByRecipeId] = useState<Record<number, Record<number, boolean>>>({});
  const [multiplierByRecipeId, setMultiplierByRecipeId] = useState<Record<number, number>>({});

  const selectedSummary = useMemo(() => recipes.find((r) => r.id === selectedId) ?? null, [recipes, selectedId]);

  async function refreshList(nextSelectedId?: number | null) {
    const data = await listRecipes();
    setRecipes(data);
    const desiredSelectedId = nextSelectedId !== undefined ? nextSelectedId : selectedId;
    if (!desiredSelectedId) {
      if (data.length) setSelectedId(data[0].id);
      return;
    }

    if (!data.some((r) => r.id === desiredSelectedId)) {
      setSelectedId(data.length ? data[0].id : null);
    }
  }

  useEffect(() => {
    void (async () => {
      try {
        const current = await authMe();
        setUser(current);
        if (current) {
          await refreshList();
        }
      } catch (e) {
        setUser(null);
      } finally {
        setAuthLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setSelected(null);
      return;
    }

    const id = selectedId;
    let cancelled = false;

    async function load() {
      const r = await getRecipe(id);
      if (!cancelled) {
        setSelected(r);
        setEditTitle(r.title ?? '');
        setEditNotes((r.notes ?? '').toString());
      }
    }

    void load().catch((e) => setError(e instanceof Error ? e.message : 'Unknown error'));

    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  const fullScreenRecipe = useMemo(() => {
    if (!fullScreenRecipeId) return null;
    if (selected?.id === fullScreenRecipeId) return selected;
    return recipes.find((r) => r.id === fullScreenRecipeId) ?? null;
  }, [fullScreenRecipeId, recipes, selected]);

  function closeFullScreen() {
    setFullScreenRecipeId(null);
  }

  useEffect(() => {
    if (!fullScreenRecipeId) {
      setFullScreenRecipeDetail(null);
      return;
    }

    let cancelled = false;
    setFullScreenRecipeDetail(null);

    void getRecipe(fullScreenRecipeId)
      .then((r) => {
        if (!cancelled) setFullScreenRecipeDetail(r);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Unknown error');
      });

    return () => {
      cancelled = true;
    };
  }, [fullScreenRecipeId]);

  useEffect(() => {
    if (!fullScreenRecipeId) return;
    // Scroll to top when entering full screen; restore scroll position on exit.
    if (!fullScreenWasOpenRef.current) {
      fullScreenPrevScrollYRef.current = window.scrollY ?? 0;
      fullScreenWasOpenRef.current = true;
      window.scrollTo({ top: 0, behavior: 'auto' });
    } else {
      // Switching recipes while already in full screen.
      window.scrollTo({ top: 0, behavior: 'auto' });
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') closeFullScreen();
    }

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [fullScreenRecipeId]);

  useEffect(() => {
    if (fullScreenRecipeId) return;
    if (!fullScreenWasOpenRef.current) return;
    fullScreenWasOpenRef.current = false;
    window.scrollTo({ top: fullScreenPrevScrollYRef.current, behavior: 'auto' });
  }, [fullScreenRecipeId]);

  function renderIngredients(recipe: Recipe) {
    const items = normalizeLines(recipe.ingredients);
    if (!items.length) {
      return <div className="pre">No ingredients extracted yet.</div>;
    }

    const checked = checkedIngredientsByRecipeId[recipe.id] ?? {};
    const multiplier = multiplierByRecipeId[recipe.id] ?? 1;
    return (
      <ul className="checklist">
        {items.map((raw, idx) => {
          const label = multiplier !== 1 ? scaleLeadingQuantity(raw, multiplier) : raw;
          const isChecked = Boolean(checked[idx]);
          return (
            <li key={`${recipe.id}:ing:${idx}`} className="checklist-item">
              <label className="check-item">
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={(e) => {
                    const nextChecked = e.target.checked;
                    setCheckedIngredientsByRecipeId((prev) => ({
                      ...prev,
                      [recipe.id]: { ...(prev[recipe.id] ?? {}), [idx]: nextChecked }
                    }));
                  }}
                />
                <span className={isChecked ? 'check-text checked' : 'check-text'}>{label}</span>
              </label>
            </li>
          );
        })}
      </ul>
    );
  }

  function renderServingsAndMultiplier(recipe: Recipe) {
    const multiplier = multiplierByRecipeId[recipe.id] ?? 1;
    const label = scaleServingsLabel(recipe, multiplier);
    if (!label) return null;

    return (
      <div className="servings-row">
        <div className="servings-label">{label}</div>
        <label className="multiplier">
          <span>Multiplier</span>
          <div className="multiplier-box">
            <input
              className="multiplier-input"
              type="number"
              inputMode="decimal"
              min={0.1}
              max={10}
              step={0.1}
              value={String(multiplier)}
              onChange={(e) => {
                const next = Number(e.target.value);
                if (!Number.isFinite(next)) return;
                const clamped = Math.min(10, Math.max(0.1, next));
                setMultiplierByRecipeId((prev) => ({ ...prev, [recipe.id]: clamped }));
              }}
            />
            <span className="multiplier-suffix">x</span>
          </div>
        </label>
      </div>
    );
  }

  function renderInstructions(recipe: Recipe) {
    const steps = normalizeLines(recipe.instructions).map(stripLeadingStepNumber).filter(Boolean);
    if (!steps.length) {
      return <div className="pre">No instructions extracted yet.</div>;
    }

    return (
      <ol className="steps">
        {steps.map((step, idx) => (
          <li key={`${recipe.id}:step:${idx}`}>{step}</li>
        ))}
      </ol>
    );
  }

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

  async function onSaveEdits() {
    if (!selectedId) return;
    setError(null);
    setBusy(true);
    try {
      const updated = await updateRecipe(selectedId, {
        title: editTitle.trim() || undefined,
        notes: editNotes.trim() ? editNotes : null
      });
      setSelected(updated);
      await refreshList();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setBusy(false);
    }
  }

  async function onDeleteCurrent() {
    if (!selectedId) return;
    setError(null);

    const current = selected;
    const label = current?.title ? `“${current.title}”` : `#${selectedId}`;
    if (!window.confirm(`Delete recipe ${label}? This cannot be undone.`)) return;

    setBusy(true);
    try {
      await deleteRecipe(selectedId);
      setFullScreenRecipeId(null);
      setSelectedId(null);
      setSelected(null);
      await refreshList(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setBusy(false);
    }
  }

  if (fullScreenRecipeId) {
    const r = fullScreenRecipeDetail ?? fullScreenRecipe;
    return (
      <div className="fs-page">
        <header className="fs-topbar">
          <div className="fs-topbar-inner">
            <button className="btn" type="button" onClick={closeFullScreen}>
              Back
            </button>
            <div className="fs-title">{r?.title ?? 'Recipe'}</div>
            <div className="row" style={{ justifyContent: 'flex-end' }}>
              {r?.sourceUrl && (
                <a className="btn" href={r.sourceUrl} target="_blank" rel="noreferrer">
                  Open Source
                </a>
              )}
              <button className="btn" type="button" disabled={busy || !selectedId} onClick={onRescrape}>
                Re-scrape
              </button>
            </div>
          </div>
        </header>

        <main className="fs-main">
          <div className="fs-wrapper">
            <section className="panel detail">
              {!r && <div className="pre">Loading recipe…</div>}

              {r && (
                <>
                  <RecipeBanner title={r.title} imageUrl={r.imageUrl} />
                  {r.description && <div className="recipe-subtitle">{r.description}</div>}
                  {renderServingsAndMultiplier(r)}

                  <div className="row" style={{ justifyContent: 'space-between', marginTop: '0.8rem' }}>
                    <button className="btn danger" type="button" disabled={busy || selectedId !== r.id} onClick={onDeleteCurrent}>
                      Delete
                    </button>
                    <button className="btn" type="button" onClick={closeFullScreen}>
                      Close
                    </button>
                  </div>

                  {r.scrapeStatus === 'error' && r.scrapeError && <div className="error">{r.scrapeError}</div>}

                  <div className="kv">
                    <b>Ingredients</b>
                    {renderIngredients(r)}
                  </div>

                  <div className="kv">
                    <b>Instructions</b>
                    {renderInstructions(r)}
                  </div>
                </>
              )}
            </section>
          </div>
        </main>
      </div>
    );
  }

  async function onAuthenticated(nextUser: AuthUser) {
    setUser(nextUser);
    setSelectedId(null);
    setSelected(null);
    setError(null);
    await refreshList(null);
  }

  async function onLogout() {
    setError(null);
    try {
      await authLogout();
    } catch {
      // ignore
    } finally {
      setUser(null);
      setRecipes([]);
      setSelectedId(null);
      setSelected(null);
      setFullScreenRecipeId(null);
      setFullScreenRecipeDetail(null);
    }
  }

  if (authLoading) {
    return (
      <div className="container">
        <div className="panel">
          <div className="pre">Loading…</div>
        </div>
      </div>
    );
  }

  if (!user) {
    return <AuthPage onAuthenticated={(u) => void onAuthenticated(u)} />;
  }

  return (
    <div className="container">
      <header className="hero">
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
          <h1 style={{ margin: 0 }}>
            Meal Rotation{' '}
            {import.meta.env.DEV && (
              <span className="dev-badge">DEV</span>
            )}
          </h1>
          <div className="row">
            <div style={{ color: 'var(--muted)', fontWeight: 800, fontSize: '0.95rem' }}>{user.email}</div>
            <button className="btn" type="button" onClick={() => void onLogout()}>
              Logout
            </button>
          </div>
        </div>
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
              <div
                key={r.id}
                className="card"
                role="button"
                tabIndex={0}
                style={{
                  textAlign: 'left',
                  cursor: 'pointer',
                  borderColor: r.id === selectedId ? 'rgba(110,231,255,0.45)' : undefined
                }}
                onClick={() => setSelectedId(r.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setSelectedId(r.id);
                  }
                }}
              >
                <RecipeBanner title={r.title} imageUrl={r.imageUrl} />
                <div className="card-top">
                  <div>
                    <h3>{r.title}</h3>
                    <small>{r.sourceHost ?? new URL(r.sourceUrl).hostname}</small>
                  </div>
                  <div className="row" style={{ justifyContent: 'flex-end' }}>
                    <button
                      className="btn"
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedId(r.id);
                        setFullScreenRecipeId(r.id);
                      }}
                      aria-label={`Open ${r.title} full screen`}
                    >
                      Full screen
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="panel detail">
          <h2>Preview</h2>
          {!selected && <p style={{ color: 'var(--muted)', marginTop: '0.8rem' }}>Select a recipe.</p>}

          {selected && (
            <>
              <RecipeBanner title={selected.title} imageUrl={selected.imageUrl} />
              <div className="row" style={{ justifyContent: 'space-between', marginTop: '0.8rem' }}>
                <div>
                  <div style={{ fontSize: '1.2rem', fontWeight: 800 }}>{selected.title}</div>
                  <div className="recipe-subtitle">{selected.description ?? ''}</div>
                  {renderServingsAndMultiplier(selected)}
                </div>
                <div className="row">
                  <a className="btn" href={selected.sourceUrl} target="_blank" rel="noreferrer">
                    Open Source
                  </a>
                  <button className="btn" type="button" disabled={busy} onClick={() => setFullScreenRecipeId(selected.id)}>
                    Full screen
                  </button>
                  <button className="btn" type="button" disabled={busy} onClick={onRescrape}>
                    Re-scrape
                  </button>
                </div>
              </div>

              {selected.scrapeStatus === 'error' && selected.scrapeError && <div className="error">{selected.scrapeError}</div>}

              <div className="kv">
                <b>Ingredients</b>
                {renderIngredients(selected)}
              </div>

              <div className="kv">
                <b>Instructions</b>
                {renderInstructions(selected)}
              </div>

              <div className="kv">
                <b>Edit</b>
                <div className="row" style={{ marginTop: '0.35rem' }}>
                  <input className="input" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
                </div>
                <div className="row" style={{ marginTop: '0.6rem' }}>
                  <textarea
                    className="input"
                    value={editNotes}
                    onChange={(e) => setEditNotes(e.target.value)}
                    placeholder="Notes (optional)"
                    rows={5}
                    style={{ width: '100%', resize: 'vertical', minHeight: 110 }}
                  />
                </div>
                <div className="row" style={{ justifyContent: 'space-between', marginTop: '0.6rem', width: '100%' }}>
                  <button className="btn danger" type="button" disabled={busy} onClick={onDeleteCurrent}>
                    Delete
                  </button>
                  <button className="btn" type="button" disabled={busy} onClick={onSaveEdits}>
                    Save
                  </button>
                </div>
              </div>

              {selectedSummary?.lastScrapedAt && (
                <div style={{ marginTop: '0.8rem', color: 'var(--muted)', fontSize: '0.85rem' }}>
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

function AuthPage({ onAuthenticated }: { onAuthenticated: (user: AuthUser) => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function submit() {
    try {
      setSubmitting(true);
      setError('');
      const normalizedEmail = email.trim().toLowerCase();
      const response =
        mode === 'login'
          ? await authLogin({ email: normalizedEmail, password })
          : await authRegister({ email: normalizedEmail, password });
      onAuthenticated(response.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-shell">
      <div className="panel auth-card">
        <h1 className="auth-title">
          Meal Rotation{' '}
          {import.meta.env.DEV && (
            <span className="dev-badge">DEV</span>
          )}
        </h1>
        <p className="auth-subtitle">Sign in so each person has their own recipe list, notes, and checklists.</p>

        <div className="row auth-mode-row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="auth-mode-title">{mode === 'login' ? 'Login' : 'Create account'}</div>
          <div className="row" style={{ gap: '0.4rem' }}>
            <button className={mode === 'login' ? 'btn primary' : 'btn'} type="button" onClick={() => setMode('login')}>
              Login
            </button>
            <button className={mode === 'register' ? 'btn primary' : 'btn'} type="button" onClick={() => setMode('register')}>
              Register
            </button>
          </div>
        </div>

        {error ? <div className="error">{error}</div> : null}

        <div className="row" style={{ marginTop: '0.9rem' }}>
          <input
            className="input"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
          />
        </div>

        <div className="row" style={{ marginTop: '0.6rem' }}>
          <input
            className="input"
            type="password"
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password (8+ chars)"
          />
        </div>

        <div className="row" style={{ marginTop: '0.9rem', justifyContent: 'flex-end' }}>
          <button className="btn primary" type="button" onClick={() => void submit()} disabled={submitting}>
            {submitting ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}
          </button>
        </div>
      </div>
    </div>
  );
}
