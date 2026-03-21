import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function JoinCampaign() {
  const navigate = useNavigate()
  const [campaignId, setCampaignId] = useState('')
  const [error, setError] = useState('')
  const [joining, setJoining] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!campaignId.trim()) {
      setError('Please enter a campaign ID.')
      return
    }

    setJoining(true)
    setError('')

    const { error: err } = await supabase.rpc('join_campaign', {
      p_campaign_id: campaignId.trim(),
    })

    if (err) {
      if (err.message?.includes('Already a member')) {
        setError('You are already in this campaign.')
      } else if (err.message?.includes('not found')) {
        setError('Campaign not found. Check the ID and try again.')
      } else {
        setError('Failed to join. Please check the ID and try again.')
      }
      setJoining(false)
      return
    }

    navigate(`/campaign/${campaignId.trim()}`)
  }

  return (
    <div style={styles.container}>
      <h1 style={styles.title}>Join a Campaign</h1>
      <p style={styles.subtitle}>Ask your DM for the campaign ID</p>

      <form onSubmit={handleSubmit} style={styles.form}>
        <label style={styles.label}>
          Campaign ID
          <input
            style={styles.input}
            value={campaignId}
            onChange={e => setCampaignId(e.target.value)}
            placeholder="Paste the campaign ID here"
            autoFocus
          />
        </label>

        {error && <p style={styles.error}>{error}</p>}

        <button style={styles.button} type="submit" disabled={joining}>
          {joining ? 'Joining...' : 'Join Campaign'}
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
    margin: '0 0 0.25rem 0',
  },
  subtitle: {
    fontSize: '1rem',
    color: '#64748b',
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
