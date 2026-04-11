/**
 * Home — Campaign list and discovery hub
 *
 * Main page after login. Shows all campaigns the user is a member of.
 * Quick links to create a new campaign or join an existing one via campaign ID.
 * Displays campaign name, system, member count, and user's role (DM/Player).
 */

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';

export default function Home({ session }) {
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchCampaigns() {
      const { data, error } = await supabase
        .from('campaign_members')
        .select('role, campaigns(id, name, description, system)')
        .eq('user_id', session.user.id);

      if (!error && data) {
        setCampaigns(data.map((m) => ({ ...m.campaigns, role: m.role })));
      }
      setLoading(false);
    }
    fetchCampaigns();
  }, [session]);

  if (loading) {
    return <p style={styles.loading}>Loading campaigns...</p>;
  }

  return (
    <div style={styles.container}>
      <div style={styles.titleRow}>
        <h1 style={styles.title}>Your Campaigns</h1>
        <div style={styles.actions}>
          <Link to="/campaign/new" style={styles.button}>
            Create Campaign
          </Link>
          <Link to="/campaign/join" style={styles.buttonOutline}>
            Join Campaign
          </Link>
        </div>
      </div>

      {campaigns.length === 0 ? (
        <div style={styles.empty}>
          <p style={styles.emptyText}>You're not in any campaigns yet.</p>
          <p style={styles.emptyHint}>
            Create one or join an existing campaign to get started.
          </p>
        </div>
      ) : (
        <div style={styles.grid}>
          {campaigns.map((c) => (
            <Link to={`/campaign/${c.id}`} key={c.id} style={styles.card}>
              <div style={styles.cardTop}>
                <h3 style={styles.cardTitle}>{c.name}</h3>
                <span style={styles.badge}>{c.role.toUpperCase()}</span>
              </div>
              {c.description && <p style={styles.cardDesc}>{c.description}</p>}
              <span style={styles.system}>{c.system}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

const styles = {
  container: {
    maxWidth: '900px',
    margin: '0 auto',
    padding: '2rem 1.5rem',
  },
  loading: {
    textAlign: 'center',
    marginTop: '3rem',
    color: 'var(--ink-faint)',
    fontFamily: 'var(--font-body)',
    fontStyle: 'italic',
  },
  titleRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: '1rem',
    marginBottom: '1.5rem',
  },
  title: {
    fontSize: '1.75rem',
    margin: 0,
    fontFamily: 'var(--font-heading)',
    color: 'var(--ink-dark)',
  },
  actions: {
    display: 'flex',
    gap: '0.5rem',
  },
  button: {
    padding: '0.6rem 1.25rem',
    borderRadius: '2px',
    backgroundColor: 'var(--accent)',
    color: '#fff',
    border: 'none',
    fontFamily: 'var(--font-body)',
    fontSize: '0.875rem',
    textDecoration: 'none',
    cursor: 'pointer',
  },
  buttonOutline: {
    padding: '0.6rem 1.25rem',
    borderRadius: '2px',
    backgroundColor: 'transparent',
    color: 'var(--accent)',
    border: '1px solid var(--border-medium)',
    fontFamily: 'var(--font-body)',
    fontSize: '0.875rem',
    textDecoration: 'none',
    cursor: 'pointer',
  },
  empty: {
    textAlign: 'center',
    padding: '3rem 1rem',
    backgroundColor: 'var(--card-bg)',
    borderRadius: '3px',
    border: '1px dashed var(--border-medium)',
  },
  emptyText: {
    fontSize: '1.1rem',
    fontFamily: 'var(--font-body)',
    fontStyle: 'italic',
    color: 'var(--ink-medium)',
    margin: '0 0 0.5rem 0',
  },
  emptyHint: {
    fontSize: '0.9rem',
    color: 'var(--ink-light)',
    margin: 0,
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
    gap: '1rem',
  },
  card: {
    display: 'block',
    padding: '1.25rem',
    borderRadius: '3px',
    border: '1px solid var(--border-light)',
    backgroundColor: 'var(--card-bg)',
    textDecoration: 'none',
    color: 'inherit',
    transition: 'box-shadow 0.15s',
  },
  cardTop: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: '0.5rem',
    marginBottom: '0.5rem',
  },
  cardTitle: {
    margin: 0,
    fontSize: '1.1rem',
    fontFamily: 'var(--font-heading)',
    color: 'var(--ink-dark)',
  },
  badge: {
    fontSize: '0.7rem',
    fontWeight: 600,
    fontVariant: 'small-caps',
    letterSpacing: '0.08em',
    fontFamily: 'var(--font-body)',
    color: 'var(--accent)',
    whiteSpace: 'nowrap',
  },
  cardDesc: {
    fontSize: '0.875rem',
    fontFamily: 'var(--font-body)',
    color: 'var(--ink-light)',
    margin: '0 0 0.75rem 0',
    lineHeight: 1.4,
  },
  system: {
    fontSize: '0.75rem',
    color: 'var(--ink-faint)',
  },
};
