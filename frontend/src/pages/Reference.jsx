/**
 * Reference — D&D 5e rules lookup tool
 *
 * Search D&D 5e rules, spells, classes, feats, items, conditions, etc.
 * Fetches from Open5e API and 5etools. Useful quick reference during gameplay.
 * Supports full-text search with formatted markdown results.
 */

import { useState, useRef, useEffect } from 'react';
import MessageContent from '../components/MessageContent';

const API_URL = import.meta.env.VITE_API_URL;

export default function Reference({ system, role }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  useEffect(() => {
    if (!loading) inputRef.current?.focus();
  }, [loading]);

  async function sendMessage(e) {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userMessage = { role: 'user', content: input.trim() };
    const updatedMessages = [...messages, userMessage];

    setMessages(updatedMessages);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch(`${API_URL}/api/ref`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: updatedMessages,
          system: system || null,
          role: role || null,
        }),
      });

      const data = await res.json();
      setMessages([
        ...updatedMessages,
        { role: 'assistant', content: data.result },
      ]);
    } catch {
      setMessages([
        ...updatedMessages,
        { role: 'assistant', content: 'Error: could not reach the server.' },
      ]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }

  return (
    <div style={styles.container}>
      <div style={styles.messages}>
        {messages.length === 0 && (
          <div style={styles.empty}>
            <div style={styles.ornament}>── ✦ ──</div>
            <p style={styles.emptyText}>
              {role === 'dm'
                ? 'Consult the Codex for rules, monsters,\nspells, items, classes, and races.'
                : 'Consult the Codex for rules, spells,\nitems, classes, and races.'}
            </p>
            <div style={styles.ornament}>── ✦ ──</div>
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} style={styles.messageBlock}>
            <div
              style={
                msg.role === 'user' ? styles.userLabel : styles.assistantLabel
              }
            >
              {msg.role === 'user' ? 'You —' : 'Codex —'}
            </div>
            <div style={styles.messageText}>
              {msg.role === 'assistant' ? (
                <MessageContent content={msg.content} />
              ) : (
                msg.content
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div style={styles.messageBlock}>
            <div style={styles.assistantLabel}>Codex —</div>
            <div style={{ ...styles.messageText, ...styles.thinking }}>
              Looking it up...
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={sendMessage} style={styles.form}>
        <input
          ref={inputRef}
          style={styles.input}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="e.g. What are the stats for a Beholder?"
          disabled={loading}
          autoFocus
        />
        <button
          style={styles.button}
          type="submit"
          disabled={loading || !input.trim()}
        >
          Send →
        </button>
      </form>
    </div>
  );
}

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
    maxWidth: '720px',
    margin: '0 auto',
    padding: '1rem',
    boxSizing: 'border-box',
    width: '100%',
  },
  messages: {
    flex: 1,
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: '0',
    paddingBottom: '1rem',
  },
  empty: {
    textAlign: 'center',
    marginTop: '3rem',
  },
  ornament: {
    color: 'var(--ink-faint)',
    fontFamily: 'var(--font-body)',
    fontSize: '1rem',
    margin: '0.5rem 0',
  },
  emptyText: {
    color: 'var(--ink-faint)',
    fontFamily: 'var(--font-body)',
    fontStyle: 'italic',
    fontSize: '1rem',
    lineHeight: 1.7,
    whiteSpace: 'pre-line',
    margin: 0,
  },
  messageBlock: {
    padding: '0.75rem 0',
    borderBottom: '1px solid var(--hover-bg)',
  },
  userLabel: {
    fontFamily: 'var(--font-body)',
    fontVariant: 'small-caps',
    fontWeight: 600,
    fontSize: '0.85rem',
    color: 'var(--accent)',
    marginBottom: '0.25rem',
  },
  assistantLabel: {
    fontFamily: 'var(--font-body)',
    fontVariant: 'small-caps',
    fontWeight: 600,
    fontSize: '0.85rem',
    color: 'var(--sepia)',
    marginBottom: '0.25rem',
  },
  messageText: {
    fontFamily: 'var(--font-body)',
    fontSize: '1rem',
    lineHeight: 1.7,
    color: 'var(--ink-medium)',
    paddingLeft: '1rem',
    whiteSpace: 'pre-wrap',
  },
  thinking: {
    color: 'var(--ink-faint)',
    fontStyle: 'italic',
  },
  form: {
    display: 'flex',
    gap: '0.5rem',
    paddingTop: '0.5rem',
    borderTop: '2px solid var(--border-medium)',
  },
  input: {
    flex: 1,
    padding: '0.75rem 0',
    border: 'none',
    borderBottom: '1px solid var(--border-medium)',
    backgroundColor: 'transparent',
    fontFamily: 'var(--font-body)',
    fontSize: '1rem',
    color: 'var(--ink-medium)',
    outline: 'none',
  },
  button: {
    padding: '0.75rem 0',
    backgroundColor: 'transparent',
    color: 'var(--accent)',
    border: 'none',
    borderBottom: '1px solid var(--accent)',
    fontFamily: 'var(--font-body)',
    fontVariant: 'small-caps',
    fontSize: '0.9rem',
    cursor: 'pointer',
  },
};
