/**
 * Chat — AI companion chat for campaign help and collaboration
 *
 * Multi-turn conversation with Claude AI. Optionally passes campaign context
 * (characters, locations, session notes) to AI for contextual help. Displays
 * formatted messages with markdown support. Accessible to all campaign members.
 */

import { useState, useRef, useEffect } from 'react';

const API_URL = import.meta.env.VITE_API_URL;

export default function Chat({ campaignId, session, role }) {
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
      const res = await fetch(`${API_URL}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: updatedMessages,
          campaign_id: campaignId,
          user_id: session?.user?.id || null,
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
              {campaignId
                ? "Ask the Archive about this campaign\u2019s\nsessions, lore, and history."
                : 'Start a conversation...'}
            </p>
            <div style={styles.ornament}>── ✦ ──</div>
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} style={styles.messageBlock}>
            <div style={msg.role === 'user' ? styles.userLabel : styles.assistantLabel}>
              {msg.role === 'user' ? 'You —' : 'Archive —'}
            </div>
            <div style={styles.messageText}>{msg.content}</div>
          </div>
        ))}
        {loading && (
          <div style={styles.messageBlock}>
            <div style={styles.assistantLabel}>Archive —</div>
            <div style={{ ...styles.messageText, ...styles.thinking }}>
              Thinking...
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
          placeholder="Type a message..."
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
    color: 'var(--success)',
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
