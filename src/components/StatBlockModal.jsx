import { useEffect } from 'react'

const CR_XP = {
  '0': 10, '1/8': 25, '1/4': 50, '1/2': 100,
  '1': 200, '2': 450, '3': 700, '4': 1100, '5': 1800,
  '6': 2300, '7': 2900, '8': 3900, '9': 5000, '10': 5900,
  '11': 7200, '12': 8400, '13': 10000, '14': 11500, '15': 13000,
  '16': 15000, '17': 18000, '18': 20000, '19': 22000, '20': 25000,
  '21': 33000, '22': 41000, '23': 50000, '24': 62000, '25': 75000,
  '26': 90000, '27': 105000, '28': 120000, '29': 135000, '30': 155000,
}

function mod(score) {
  if (typeof score !== 'number') return '+0'
  const m = Math.floor((score - 10) / 2)
  return m >= 0 ? `+${m}` : `${m}`
}

export default function StatBlockModal({ statblock, onClose }) {
  const s = statblock

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const hp = s.hp || {}
  const xp = CR_XP[String(s.cr)] ?? '?'

  const abilities = [
    { label: 'STR', score: s.str },
    { label: 'DEX', score: s.dex },
    { label: 'CON', score: s.con },
    { label: 'INT', score: s.int },
    { label: 'WIS', score: s.wis },
    { label: 'CHA', score: s.cha },
  ]

  return (
    <div style={styles.backdrop} onClick={onClose}>
      <div style={styles.card} onClick={e => e.stopPropagation()}>
        <button style={styles.close} onClick={onClose}>&times;</button>

        {/* Top accent bar */}
        <div style={styles.accentBar} />

        {/* Header */}
        <div style={styles.header}>
          <h2 style={styles.name}>{s.name}</h2>
          <p style={styles.subtitle}>
            {s.size} {s.type}{s.alignment ? `, ${s.alignment}` : ''}
          </p>
        </div>

        <div style={styles.divider} />

        {/* Core stats */}
        <div style={styles.section}>
          <p style={styles.stat}><strong>Armor Class</strong> {s.ac}</p>
          <p style={styles.stat}>
            <strong>Hit Points</strong> {hp.average ?? '?'}
            {hp.formula ? ` (${hp.formula})` : ''}
          </p>
          <p style={styles.stat}><strong>Speed</strong> {s.speed}</p>
        </div>

        <div style={styles.divider} />

        {/* Ability scores */}
        <div style={styles.abilities}>
          {abilities.map(a => (
            <div key={a.label} style={styles.ability}>
              <span style={styles.abilityLabel}>{a.label}</span>
              <span style={styles.abilityScore}>{a.score ?? '?'}</span>
              <span style={styles.abilityMod}>({mod(a.score)})</span>
            </div>
          ))}
        </div>

        <div style={styles.divider} />

        {/* Info */}
        <div style={styles.section}>
          {s.senses && <p style={styles.stat}><strong>Senses</strong> {s.senses}</p>}
          {s.passive && <p style={styles.stat}><strong>Passive Perception</strong> {s.passive}</p>}
          {s.languages && <p style={styles.stat}><strong>Languages</strong> {s.languages}</p>}
          <p style={styles.stat}>
            <strong>Challenge</strong> {s.cr} ({typeof xp === 'number' ? xp.toLocaleString() : xp} XP)
          </p>
        </div>

        {/* Traits */}
        {s.traits?.length > 0 && (
          <>
            <div style={styles.divider} />
            <div style={styles.section}>
              {s.traits.map((t, i) => (
                <p key={i} style={styles.entry}>
                  <strong style={styles.entryName}>{t.name}.</strong> {t.text}
                </p>
              ))}
            </div>
          </>
        )}

        {/* Actions */}
        {s.actions?.length > 0 && (
          <>
            <div style={styles.divider} />
            <div style={styles.section}>
              <h3 style={styles.sectionTitle}>Actions</h3>
              {s.actions.map((a, i) => (
                <p key={i} style={styles.entry}>
                  <strong style={styles.entryName}>{a.name}.</strong> {a.text}
                </p>
              ))}
            </div>
          </>
        )}

        {/* Reactions */}
        {s.reactions?.length > 0 && (
          <>
            <div style={styles.divider} />
            <div style={styles.section}>
              <h3 style={styles.sectionTitle}>Reactions</h3>
              {s.reactions.map((r, i) => (
                <p key={i} style={styles.entry}>
                  <strong style={styles.entryName}>{r.name}.</strong> {r.text}
                </p>
              ))}
            </div>
          </>
        )}

        {/* Legendary Actions */}
        {s.legendary?.length > 0 && (
          <>
            <div style={styles.divider} />
            <div style={styles.section}>
              <h3 style={styles.sectionTitle}>Legendary Actions</h3>
              {s.legendary.map((la, i) => (
                <p key={i} style={styles.entry}>
                  <strong style={styles.entryName}>{la.name}.</strong> {la.text}
                </p>
              ))}
            </div>
          </>
        )}

        {/* Source */}
        {s.source && (
          <p style={styles.source}>{s.source}</p>
        )}

        {/* Bottom accent bar */}
        <div style={styles.accentBar} />
      </div>
    </div>
  )
}

const styles = {
  backdrop: {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    padding: '1rem',
  },
  card: {
    position: 'relative',
    backgroundColor: '#fdf1dc',
    maxWidth: '480px',
    width: '100%',
    maxHeight: '85vh',
    overflowY: 'auto',
    borderRadius: '4px',
    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
    fontFamily: "'Georgia', 'Times New Roman', serif",
    color: '#1a1a1a',
    fontSize: '0.9rem',
    lineHeight: '1.45',
  },
  close: {
    position: 'absolute',
    top: '8px',
    right: '12px',
    background: 'none',
    border: 'none',
    fontSize: '1.5rem',
    color: '#58180d',
    cursor: 'pointer',
    zIndex: 1,
    lineHeight: 1,
  },
  accentBar: {
    height: '5px',
    background: 'linear-gradient(to right, #922610, #e4a63b, #922610)',
  },
  header: {
    padding: '0.75rem 1rem 0.25rem',
  },
  name: {
    margin: 0,
    fontSize: '1.5rem',
    color: '#58180d',
    fontFamily: "'Georgia', 'Times New Roman', serif",
    fontWeight: 'bold',
    lineHeight: 1.2,
  },
  subtitle: {
    margin: '0.15rem 0 0',
    fontStyle: 'italic',
    fontSize: '0.85rem',
    color: '#333',
  },
  divider: {
    margin: '0.35rem 1rem',
    borderTop: '2px solid #922610',
    opacity: 0.6,
  },
  section: {
    padding: '0.25rem 1rem',
  },
  stat: {
    margin: '0.15rem 0',
  },
  abilities: {
    display: 'grid',
    gridTemplateColumns: 'repeat(6, 1fr)',
    textAlign: 'center',
    padding: '0.4rem 1rem',
    gap: '0.25rem',
  },
  ability: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '0.1rem',
  },
  abilityLabel: {
    fontWeight: 'bold',
    fontSize: '0.75rem',
    color: '#58180d',
  },
  abilityScore: {
    fontSize: '0.9rem',
  },
  abilityMod: {
    fontSize: '0.75rem',
    color: '#555',
  },
  sectionTitle: {
    margin: '0.25rem 0 0.15rem',
    fontSize: '1.05rem',
    color: '#58180d',
    borderBottom: '1px solid #922610',
    paddingBottom: '0.15rem',
    fontFamily: "'Georgia', 'Times New Roman', serif",
  },
  entry: {
    margin: '0.35rem 0',
  },
  entryName: {
    fontStyle: 'italic',
  },
  source: {
    padding: '0.25rem 1rem 0.5rem',
    fontSize: '0.75rem',
    color: '#666',
    fontStyle: 'italic',
    textAlign: 'right',
  },
}
