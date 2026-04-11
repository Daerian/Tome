/**
 * AdventureViewer — Published adventure module viewer
 *
 * Display full adventure module content indexed by chapters/sections.
 * Converts markdown to readable formatted text. DM-only view (via campaign.adventure_source).
 * Provides easy navigation through adventure content during prep and play.
 */

import { useState, useEffect } from 'react';
import MessageContent from '../components/MessageContent';

const API_URL = import.meta.env.VITE_API_URL;

export default function AdventureViewer({ code }) {
  const [toc, setToc] = useState(null);
  const [activeSection, setActiveSection] = useState(null);
  const [sectionContent, setSectionContent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function fetchToc() {
      setLoading(true);
      setError('');
      try {
        const res = await fetch(`${API_URL}/api/adventure/${code}/toc`);
        const data = await res.json();
        if (data.error) {
          setError(data.error);
        } else {
          setToc(data);
        }
      } catch {
        setError('Failed to load adventure data.');
      } finally {
        setLoading(false);
      }
    }
    fetchToc();
  }, [code]);

  async function loadSection(sectionName) {
    setActiveSection(sectionName);
    setSectionContent(null);
    setLoading(true);
    try {
      const res = await fetch(
        `${API_URL}/api/adventure/${code}/section?name=${encodeURIComponent(sectionName)}`,
      );
      const data = await res.json();
      if (data.error) {
        setSectionContent({
          title: sectionName,
          content: `Error: ${data.error}`,
        });
      } else {
        setSectionContent(data);
      }
    } catch {
      setSectionContent({
        title: sectionName,
        content: 'Failed to load section.',
      });
    } finally {
      setLoading(false);
    }
  }

  function backToToc() {
    setActiveSection(null);
    setSectionContent(null);
  }

  if (loading && !toc && !sectionContent) {
    return (
      <div style={styles.container}>
        <p style={styles.loading}>Loading adventure...</p>
      </div>
    );
  }

  if (error && !toc) {
    return (
      <div style={styles.container}>
        <p style={styles.error}>{error}</p>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        {activeSection ? (
          <button style={styles.backBtn} onClick={backToToc}>
            &larr; Contents
          </button>
        ) : (
          <span style={styles.headerTitle}>{toc?.name}</span>
        )}
      </div>

      {/* Content area */}
      <div style={styles.content}>
        {!activeSection && toc && (
          <div style={styles.tocList}>
            {toc.sections.map((s) => (
              <button
                key={s.index}
                style={styles.tocItem}
                onClick={() => loadSection(s.name)}
              >
                <span style={styles.tocNumber}>{s.index + 1}.</span>
                <span style={styles.tocName}>{s.name}</span>
                {s.page && <span style={styles.tocPage}>p. {s.page}</span>}
              </button>
            ))}
          </div>
        )}

        {activeSection && loading && (
          <p style={styles.loading}>Loading section...</p>
        )}

        {activeSection && sectionContent && (
          <div style={styles.sectionContent}>
            <h3 style={styles.sectionTitle}>{sectionContent.title}</h3>
            <div style={styles.sectionBody}>
              <MessageContent content={sectionContent.content} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    backgroundColor: 'var(--card-bg)',
    borderRight: '1px solid var(--border-light)',
  },
  header: {
    padding: '0.75rem 1rem',
    borderBottom: '2px solid var(--border-medium)',
    backgroundColor: 'var(--sidebar-bg)',
    minHeight: '2.5rem',
    display: 'flex',
    alignItems: 'center',
  },
  headerTitle: {
    fontWeight: 600,
    fontSize: '0.95rem',
    fontFamily: 'var(--font-heading)',
    color: 'var(--sepia)',
  },
  backBtn: {
    background: 'none',
    border: 'none',
    color: 'var(--accent)',
    cursor: 'pointer',
    fontSize: '0.875rem',
    fontWeight: 600,
    padding: 0,
    fontFamily: 'var(--font-body)',
  },
  content: {
    flex: 1,
    overflowY: 'auto',
    padding: '0.5rem',
  },
  tocList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  tocItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    padding: '0.6rem 0.75rem',
    background: 'none',
    border: 'none',
    borderBottom: '1px solid var(--hover-bg)',
    cursor: 'pointer',
    textAlign: 'left',
    fontSize: '0.875rem',
    fontFamily: 'var(--font-body)',
    color: 'var(--ink-dark)',
    transition: 'background-color 0.15s',
  },
  tocNumber: {
    color: 'var(--sepia)',
    fontWeight: 600,
    minWidth: '1.5rem',
  },
  tocName: {
    flex: 1,
  },
  tocPage: {
    color: 'var(--ink-faint)',
    fontSize: '0.75rem',
    fontStyle: 'italic',
  },
  sectionContent: {
    padding: '0.5rem',
  },
  sectionTitle: {
    margin: '0 0 0.75rem 0',
    fontSize: '1.1rem',
    fontFamily: 'var(--font-heading)',
    color: 'var(--sepia)',
  },
  sectionBody: {
    fontSize: '0.875rem',
    fontFamily: 'var(--font-body)',
    lineHeight: '1.6',
    color: 'var(--ink-dark)',
    whiteSpace: 'pre-wrap',
  },
  loading: {
    textAlign: 'center',
    color: 'var(--ink-faint)',
    fontStyle: 'italic',
    marginTop: '2rem',
  },
  error: {
    textAlign: 'center',
    color: 'var(--danger)',
    marginTop: '2rem',
  },
};
