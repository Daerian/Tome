import { useState, useRef, useEffect } from 'react'

const API_URL = import.meta.env.VITE_API_URL

export default function Chat() {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  async function sendMessage(e) {
    e.preventDefault()
    if (!input.trim() || loading) return

    const userMessage = { role: 'user', content: input.trim() }
    const updatedMessages = [...messages, userMessage]

    setMessages(updatedMessages)
    setInput('')
    setLoading(true)

    try {
      const res = await fetch(`${API_URL}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: updatedMessages }),
      })

      const data = await res.json()
      setMessages([...updatedMessages, { role: 'assistant', content: data.result }])
    } catch (err) {
      setMessages([...updatedMessages, { role: 'assistant', content: 'Error: could not reach the server.' }])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={styles.container}>
      <div style={styles.messages}>
        {messages.length === 0 && (
          <p style={styles.empty}>Start a conversation...</p>
        )}
        {messages.map((msg, i) => (
          <div key={i} style={{ ...styles.bubble, ...(msg.role === 'user' ? styles.user : styles.assistant) }}>
            {msg.content}
          </div>
        ))}
        {loading && (
          <div style={{ ...styles.bubble, ...styles.assistant, ...styles.thinking }}>
            Thinking...
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={sendMessage} style={styles.form}>
        <input
          style={styles.input}
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Type a message..."
          disabled={loading}
        />
        <button style={styles.button} type="submit" disabled={loading || !input.trim()}>
          Send
        </button>
      </form>
    </div>
  )
}

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    maxWidth: '720px',
    margin: '0 auto',
    padding: '1rem',
    boxSizing: 'border-box',
  },
  messages: {
    flex: 1,
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
    paddingBottom: '1rem',
  },
  empty: {
    textAlign: 'center',
    color: '#888',
    marginTop: '2rem',
  },
  bubble: {
    padding: '0.75rem 1rem',
    borderRadius: '12px',
    maxWidth: '80%',
    whiteSpace: 'pre-wrap',
    lineHeight: '1.5',
  },
  user: {
    alignSelf: 'flex-end',
    backgroundColor: '#2563eb',
    color: '#fff',
  },
  assistant: {
    alignSelf: 'flex-start',
    backgroundColor: '#f1f5f9',
    color: '#1e293b',
  },
  thinking: {
    color: '#94a3b8',
    fontStyle: 'italic',
  },
  form: {
    display: 'flex',
    gap: '0.5rem',
    paddingTop: '0.5rem',
    borderTop: '1px solid #e2e8f0',
  },
  input: {
    flex: 1,
    padding: '0.75rem 1rem',
    borderRadius: '8px',
    border: '1px solid #cbd5e1',
    fontSize: '1rem',
    outline: 'none',
  },
  button: {
    padding: '0.75rem 1.25rem',
    borderRadius: '8px',
    backgroundColor: '#2563eb',
    color: '#fff',
    border: 'none',
    fontSize: '1rem',
    cursor: 'pointer',
  },
}
