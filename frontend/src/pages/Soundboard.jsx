/**
 * Soundboard — DM-only catalog browser for Tabletop Audio tracks.
 *
 * Phase 1: fetches the normalized catalog from /api/soundboard/catalog,
 * offers search + tag/type filters, and lets the DM start a track via
 * the shared SoundboardProvider.
 *
 * Phase 2: adds a scene-aware "Suggest" section. The DM picks a session,
 * optionally adds a scene hint, and the LLM agent returns 3 ranked picks
 * from the catalog with a one-line fit rationale each.
 */

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useSoundboard } from '../context/useSoundboard';

const API_URL = import.meta.env.VITE_API_URL;

export default function Soundboard({ campaignId }) {
  const { currentTrack, playTrack } = useSoundboard();
  const [catalog, setCatalog] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState('');
  const [activeTag, setActiveTag] = useState(null);

  // Suggest section state
  const [sessions, setSessions] = useState([]);
  const [selectedSession, setSelectedSession] = useState('');
  const [sceneHint, setSceneHint] = useState('');
  const [suggesting, setSuggesting] = useState(false);
  const [suggestions, setSuggestions] = useState(null);
  const [suggestError, setSuggestError] = useState(null);

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

  // Fetch sessions for the suggest picker when a campaignId is available.
  useEffect(() => {
    if (!campaignId) return;
    supabase
      .from('sessions')
      .select('id, session_number, title, status')
      .eq('campaign_id', campaignId)
      .order('session_number', { ascending: false })
      .then(({ data }) => {
        if (data) setSessions(data);
      });
  }, [campaignId]);

  async function handleSuggest() {
    if (!selectedSession || !campaignId) return;
    setSuggesting(true);
    setSuggestError(null);
    setSuggestions(null);
    try {
      const res = await fetch(`${API_URL}/api/soundboard/suggest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaign_id: campaignId,
          session_id: selectedSession,
          scene_hint: sceneHint || undefined,
        }),
      });
      if (!res.ok) throw new Error(`Suggestion request failed: ${res.status}`);
      const data = await res.json();
      // Enrich each suggestion with the full track data from the catalog
      // so the DM can play it directly from the results panel.
      const trackMap = new Map((catalog?.tracks || []).map((t) => [t.id, t]));
      const enriched = (data.suggestions || []).map((s) => ({
        ...s,
        track: trackMap.get(s.id) || null,
      }));
      setSuggestions(enriched);
    } catch (err) {
      setSuggestError(err.message || 'Suggestion failed.');
    } finally {
      setSuggesting(false);
    }
  }

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
      {/* Phase 2: Scene-aware suggestions */}
      {campaignId && (
        <div style={styles.suggestSection}>
          <div style={styles.suggestRow}>
            <select
              value={selectedSession}
              onChange={(e) => {
                setSelectedSession(e.target.value);
                setSuggestions(null);
              }}
              style={styles.sessionSelect}
              aria-label="Select session"
            >
              <option value="">Select a session…</option>
              {sessions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.session_number ? `#${s.session_number} ` : ''}
                  {s.title || 'Untitled'}
                  {s.status === 'in_progress' ? ' (in progress)' : ''}
                </option>
              ))}
            </select>
            <input
              type="text"
              placeholder="Scene hint (optional)"
              value={sceneHint}
              onChange={(e) => setSceneHint(e.target.value)}
              style={styles.hintInput}
              aria-label="Scene hint"
            />
            <button
              style={
                selectedSession && !suggesting
                  ? styles.suggestBtn
                  : styles.suggestBtnDisabled
              }
              onClick={handleSuggest}
              disabled={!selectedSession || suggesting}
            >
              {suggesting ? 'Thinking…' : 'Suggest'}
            </button>
          </div>

          {suggestError && <p style={styles.error}>{suggestError}</p>}

          {suggestions && suggestions.length > 0 && (
            <div style={styles.suggestResults}>
              {suggestions.map((s, i) => {
                const track = s.track;
                const isActive = currentTrack?.id === s.id;
                return (
                  <div
                    key={s.id}
                    style={isActive ? styles.suggestCardActive : styles.suggestCard}
                  >
                    <div style={styles.suggestRank}>#{i + 1}</div>
                    <div style={styles.suggestInfo}>
                      <div style={styles.cardTitle}>{s.title}</div>
                      <div style={styles.suggestReason}>{s.reason}</div>
                    </div>
                    <button
                      style={styles.playBtn}
                      onClick={() => track && playTrack(track)}
                      disabled={!track?.url}
                    >
                      {isActive ? 'Playing' : 'Play'}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

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
  suggestSection: {
    padding: '0.75rem 1rem',
    borderBottom: '1px solid var(--border-medium)',
    backgroundColor: 'var(--sidebar-bg)',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  },
  suggestRow: {
    display: 'flex',
    gap: '0.4rem',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  sessionSelect: {
    flex: '1 1 160px',
    padding: '0.4rem 0.5rem',
    border: '1px solid var(--border-medium)',
    backgroundColor: 'var(--page-bg)',
    color: 'var(--ink-dark)',
    fontFamily: 'var(--font-body)',
    fontSize: '0.8rem',
  },
  hintInput: {
    flex: '2 1 180px',
    padding: '0.4rem 0.6rem',
    border: '1px solid var(--border-medium)',
    backgroundColor: 'var(--page-bg)',
    color: 'var(--ink-dark)',
    fontFamily: 'var(--font-body)',
    fontSize: '0.8rem',
  },
  suggestBtn: {
    padding: '0.4rem 0.8rem',
    background: 'var(--accent-rule)',
    border: '1px solid var(--accent-deep)',
    color: 'var(--page-bg)',
    fontFamily: 'var(--font-body)',
    fontSize: '0.75rem',
    fontVariant: 'small-caps',
    letterSpacing: '0.06em',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  suggestBtnDisabled: {
    padding: '0.4rem 0.8rem',
    background: 'none',
    border: '1px solid var(--border-medium)',
    color: 'var(--ink-faint)',
    fontFamily: 'var(--font-body)',
    fontSize: '0.75rem',
    fontVariant: 'small-caps',
    letterSpacing: '0.06em',
    cursor: 'not-allowed',
    whiteSpace: 'nowrap',
  },
  suggestResults: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.35rem',
  },
  suggestCard: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '0.5rem',
    border: '1px solid var(--border-medium)',
    backgroundColor: 'var(--page-bg)',
    padding: '0.5rem 0.6rem',
  },
  suggestCardActive: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '0.5rem',
    border: '2px solid var(--accent-deep)',
    backgroundColor: 'var(--hover-bg)',
    padding: '0.45rem 0.55rem',
  },
  suggestRank: {
    fontSize: '0.7rem',
    color: 'var(--ink-faint)',
    fontFamily: 'var(--font-heading)',
    fontVariant: 'small-caps',
    minWidth: '1.4rem',
    paddingTop: '0.05rem',
  },
  suggestInfo: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: '0.15rem',
  },
  suggestReason: {
    fontSize: '0.72rem',
    fontStyle: 'italic',
    color: 'var(--ink-light)',
  },
};
