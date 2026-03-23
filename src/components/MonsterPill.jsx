import { useState } from 'react'

export default function MonsterPill({ name, onClick }) {
  const [hovered, setHovered] = useState(false)

  return (
    <button
      style={{
        ...styles.pill,
        ...(hovered ? styles.hovered : {}),
      }}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title={`View ${name} stat block`}
    >
      &#9670; {name}
    </button>
  )
}

const styles = {
  pill: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.3rem',
    padding: '0.3rem 0.75rem',
    margin: '0.25rem 0.25rem 0.25rem 0',
    borderRadius: '14px',
    backgroundColor: '#7c3aed',
    color: '#fff',
    border: 'none',
    fontSize: '0.85rem',
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'inherit',
    lineHeight: 1.3,
    transition: 'filter 0.15s',
  },
  hovered: {
    filter: 'brightness(1.2)',
  },
}
