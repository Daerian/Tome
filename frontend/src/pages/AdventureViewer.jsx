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
    backgroundColor: '#fefce8',
    borderRight: '1px solid #e2e8f0',
  },
  header: {
    padding: '0.75rem 1rem',
    borderBottom: '1px solid #e2e8f0',
    backgroundColor: '#fffbeb',
    minHeight: '2.5rem',
    display: 'flex',
    alignItems: 'center',
  },
  headerTitle: {
    fontWeight: 600,
    fontSize: '0.95rem',
    color: '#92400e',
  },
  backBtn: {
    background: 'none',
    border: 'none',
    color: '#2563eb',
    cursor: 'pointer',
    fontSize: '0.875rem',
    fontWeight: 600,
    padding: 0,
    fontFamily: 'inherit',
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
    borderRadius: '6px',
    cursor: 'pointer',
    textAlign: 'left',
    fontSize: '0.875rem',
    color: '#1e293b',
    fontFamily: 'inherit',
    transition: 'background-color 0.15s',
  },
  tocNumber: {
    color: '#94a3b8',
    fontWeight: 600,
    minWidth: '1.5rem',
  },
  tocName: {
    flex: 1,
  },
  tocPage: {
    color: '#94a3b8',
    fontSize: '0.75rem',
  },
  sectionContent: {
    padding: '0.5rem',
  },
  sectionTitle: {
    margin: '0 0 0.75rem 0',
    fontSize: '1.1rem',
    color: '#92400e',
  },
  sectionBody: {
    fontSize: '0.875rem',
    lineHeight: '1.6',
    color: '#334155',
    whiteSpace: 'pre-wrap',
  },
  loading: {
    textAlign: 'center',
    color: '#94a3b8',
    marginTop: '2rem',
  },
  error: {
    textAlign: 'center',
    color: '#dc2626',
    marginTop: '2rem',
  },
};
