import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function CreateCampaign({ session }) {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [system, setSystem] = useState('5e')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!name.trim()) {
      setError('Campaign name is required.')
      return
    }

    setSaving(true)
    setError('')

    const { data, error: err } = await supabase
      .from('campaigns')
      .insert({
        name: name.trim(),
        description: description.trim() || null,
        system,
        owner_id: session.user.id,
      })
      .select()
      .single()

    if (err) {
      setError('Failed to create campaign. Please try again.')
      setSaving(false)
      return
    }

    navigate(`/campaign/${data.id}`)
  }

  return (
    <div style={styles.container}>
      <h1 style={styles.title}>Create a Campaign</h1>

      <form onSubmit={handleSubmit} style={styles.form}>
        <label style={styles.label}>
          Campaign Name *
          <input
            style={styles.input}
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. Curse of Strahd"
            autoFocus
          />
        </label>

        <label style={styles.label}>
          Description
          <textarea
            style={{ ...styles.input, minHeight: '80px', resize: 'vertical' }}
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="A brief description of the campaign..."
          />
        </label>

        <label style={styles.label}>
          Game System
          <select
            style={styles.input}
            value={system}
            onChange={e => setSystem(e.target.value)}
          >
            <option value="5e">D&D 5th Edition</option>
            <option value="3.5e">D&D 3.5 Edition</option>
            <option value="pf2e">Pathfinder 2e</option>
            <option value="other">Other</option>
          </select>
        </label>

        {error && <p style={styles.error}>{error}</p>}

        <button style={styles.button} type="submit" disabled={saving}>
          {saving ? 'Creating...' : 'Create Campaign'}
        </button>
      </form>
    </div>
  )
}

const styles = {
  container: {
    maxWidth: '480px',
    margin: '0 auto',
    padding: '2rem 1.5rem',
  },
  title: {
    fontSize: '1.75rem',
    color: '#1e293b',
    margin: '0 0 1.5rem 0',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
  },
  label: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
    fontSize: '0.875rem',
    fontWeight: 600,
    color: '#334155',
  },
  input: {
    padding: '0.75rem 1rem',
    borderRadius: '8px',
    border: '1px solid #cbd5e1',
    fontSize: '1rem',
    outline: 'none',
    fontFamily: 'inherit',
  },
  error: {
    color: '#dc2626',
    fontSize: '0.875rem',
    margin: 0,
  },
  button: {
    marginTop: '0.5rem',
    padding: '0.75rem 1.5rem',
    borderRadius: '8px',
    backgroundColor: '#2563eb',
    color: '#fff',
    border: 'none',
    fontSize: '1rem',
    cursor: 'pointer',
  },
}
