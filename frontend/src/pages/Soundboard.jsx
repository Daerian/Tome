/**
 * Soundboard — DM-only catalog browser for Tabletop Audio tracks.
 *
 * Phase 1: fetches the normalized catalog from /api/soundboard/catalog,
 * offers search + tag/type filters, and lets the DM start a track via
 * the shared SoundboardProvider. Later phases add scene-aware LLM
 * suggestions, Freesound SFX, DM uploads, and ElevenLabs generation.
 */

import { useEffect, useMemo, useState } from 'react';
import { useSoundboard } from '../context/useSoundboard';

const API_URL = import.meta.env.VITE_API_URL;

export default function Soundboard() {
  const { currentTrack, playTrack } = useSoundboard();
  const [catalog, setCatalog] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState('');
  const [activeTag, setActiveTag] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`${API_URL}/api/soundboard/catalog`);
        if (!res.ok) throw new Error(`Catalog request failed: ${res.status}`);
        const data = await res.json();
        // Proxy URLs are relative (/api/soundboard/proxy?...) — prepend the
        // backend origin so Howler gets a full URL it can fetch.
        const tracks = (data.tracks || []).map((t) => ({
          ...t,
          url: t.url ? `${API_URL}${t.url}` : '',
        }));
        if (!cancelled) setCatalog({ ...data, tracks });
      } catch (err) {
        if (!cancelled) setError(err.message || 'Failed to load catalog.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const topTags = useMemo(() => {
    if (!catalog?.tracks) return [];
    const counts = new Map();
    for (const t of catalog.tracks) {
      for (const g of t.genres || []) {
        counts.set(g, (counts.get(g) || 0) + 1);
      }
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 18)
      .map(([tag]) => tag);
  }, [catalog]);

  const filtered = useMemo(() => {
    if (!catalog?.tracks) return [];
    const q = query.trim().toLowerCase();
    return catalog.tracks.filter((t) => {
      if (activeTag && !(t.genres || []).includes(activeTag)) return false;
      if (!q) return true;
      if (t.title?.toLowerCase().includes(q)) return true;
      if (t.flavor?.toLowerCase().includes(q)) return true;
      if ((t.tags || []).some((tag) => tag.toLowerCase().includes(q)))
        return true;
      if ((t.genres || []).some((g) => g.toLowerCase().includes(q)))
        return true;
      return false;
    });
  }, [catalog, query, activeTag]);

  return (
    <div style={styles.wrap}>
      <div style={styles.toolbar}>
        <input
          type="text"
          placeholder="Search tracks by title, tag, or flavor…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={styles.search}
        />
        <div style={styles.tagRow}>
          <button
            style={activeTag === null ? styles.tagActive : styles.tag}
            onClick={() => setActiveTag(null)}
          >
            All
          </button>
          {topTags.map((tag) => (
            <button
              key={tag}
              style={activeTag === tag ? styles.tagActive : styles.tag}
              onClick={() => setActiveTag(activeTag === tag ? null : tag)}
            >
              {tag}
            </button>
          ))}
        </div>
      </div>

      <div style={styles.body}>
        {loading && <p style={styles.muted}>Loading catalog…</p>}
        {error && <p style={styles.error}>{error}</p>}
        {!loading && !error && catalog && (
          <>
            <p style={styles.muted}>
              {filtered.length} of {catalog.count} tracks
            </p>
            <div style={styles.grid}>
              {filtered.map((track) => {
                const isActive = currentTrack?.id === track.id;
                return (
                  <div
                    key={track.id}
                    style={isActive ? styles.cardActive : styles.card}
                  >
                    <div style={styles.cardTitle}>{track.title}</div>
                    {track.flavor && (
                      <div style={styles.cardFlavor}>{track.flavor}</div>
                    )}
                    {track.genres?.length > 0 && (
                      <div style={styles.cardTags}>
                        {track.genres.slice(0, 4).map((g) => (
                          <span key={g} style={styles.cardTag}>
                            {g}
                          </span>
                        ))}
                      </div>
                    )}
                    <button
                      style={styles.playBtn}
                      onClick={() => playTrack(track)}
                      disabled={!track.url}
                    >
                      {isActive ? 'Playing' : 'Play'}
                    </button>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {catalog?.attribution && (
        <div style={styles.footer}>
          Ambiences by{' '}
          <a
            href={catalog.attribution.url}
            target="_blank"
            rel="noreferrer"
            style={styles.footerLink}
          >
            {catalog.attribution.name}
          </a>
          {catalog.attribution.note ? ` — ${catalog.attribution.note}` : null}
        </div>
      )}
    </div>
  );
}

const styles = {
  wrap: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    fontFamily: 'var(--font-body)',
  },
  toolbar: {
    padding: '0.75rem 1rem',
    borderBottom: '1px solid var(--border-light)',
    backgroundColor: 'var(--sidebar-bg)',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  },
  search: {
    padding: '0.4rem 0.6rem',
    border: '1px solid var(--border-medium)',
    backgroundColor: 'var(--page-bg)',
    color: 'var(--ink-dark)',
    fontFamily: 'var(--font-body)',
    fontSize: '0.85rem',
  },
  tagRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '0.3rem',
  },
  tag: {
    padding: '0.2rem 0.55rem',
    background: 'none',
    border: '1px solid var(--border-medium)',
    color: 'var(--ink-medium)',
    fontSize: '0.7rem',
    fontFamily: 'var(--font-body)',
    fontVariant: 'small-caps',
    letterSpacing: '0.04em',
    cursor: 'pointer',
  },
  tagActive: {
    padding: '0.2rem 0.55rem',
    background: 'var(--accent-rule)',
    border: '1px solid var(--accent-deep)',
    color: 'var(--page-bg)',
    fontSize: '0.7rem',
    fontFamily: 'var(--font-body)',
    fontVariant: 'small-caps',
    letterSpacing: '0.04em',
    cursor: 'pointer',
  },
  body: {
    flex: 1,
    overflowY: 'auto',
    padding: '0.75rem 1rem',
  },
  muted: {
    color: 'var(--ink-faint)',
    fontStyle: 'italic',
    fontSize: '0.8rem',
    margin: '0 0 0.5rem',
  },
  error: {
    color: 'var(--danger)',
    fontSize: '0.85rem',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
    gap: '0.6rem',
  },
  card: {
    border: '1px solid var(--border-medium)',
    backgroundColor: 'var(--page-bg)',
    padding: '0.6rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.3rem',
  },
  cardActive: {
    border: '2px solid var(--accent-deep)',
    backgroundColor: 'var(--hover-bg)',
    padding: '0.55rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.3rem',
  },
  cardTitle: {
    fontSize: '0.9rem',
    color: 'var(--ink-dark)',
    fontFamily: 'var(--font-heading)',
  },
  cardFlavor: {
    fontSize: '0.75rem',
    fontStyle: 'italic',
    color: 'var(--ink-light)',
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
  },
  cardTags: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '0.2rem',
  },
  cardTag: {
    fontSize: '0.65rem',
    color: 'var(--ink-medium)',
    backgroundColor: 'var(--sidebar-bg)',
    border: '1px solid var(--border-light)',
    padding: '0.05rem 0.35rem',
    fontVariant: 'small-caps',
    letterSpacing: '0.04em',
  },
  playBtn: {
    marginTop: 'auto',
    padding: '0.35rem 0.6rem',
    background: 'none',
    border: '1px solid var(--accent-deep)',
    color: 'var(--accent-deep)',
    fontFamily: 'var(--font-body)',
    fontSize: '0.75rem',
    fontVariant: 'small-caps',
    letterSpacing: '0.06em',
    cursor: 'pointer',
  },
  footer: {
    padding: '0.5rem 1rem',
    borderTop: '1px solid var(--border-light)',
    backgroundColor: 'var(--sidebar-bg)',
    fontSize: '0.7rem',
    color: 'var(--ink-faint)',
  },
  footerLink: {
    color: 'var(--accent-deep)',
    textDecoration: 'none',
    borderBottom: '1px solid var(--accent-rule)',
  },
};
