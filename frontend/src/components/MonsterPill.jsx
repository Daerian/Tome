import { useState } from 'react';

export default function MonsterPill({ name, onClick }) {
  const [hovered, setHovered] = useState(false);

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
  );
}

const styles = {
  pill: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.3rem',
    padding: '0.2rem 0',
    margin: '0.25rem 0.5rem 0.25rem 0',
    borderRadius: 0,
    backgroundColor: 'transparent',
    color: 'var(--accent)',
    border: 'none',
    borderBottom: '1px solid var(--accent)',
    fontSize: '0.85rem',
    fontWeight: 600,
    fontFamily: 'var(--font-body)',
    cursor: 'pointer',
    lineHeight: 1.3,
    transition: 'color 0.15s',
  },
  hovered: {
    color: 'var(--accent-deep)',
  },
};
