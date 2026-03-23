import { useState } from 'react'
import MonsterPill from './MonsterPill'
import StatBlockModal from './StatBlockModal'

const STATBLOCK_RE = /\[STATBLOCK\](.*?)\[\/STATBLOCK\]/gs

function parseMessage(content) {
  const segments = []
  let lastIndex = 0

  for (const match of content.matchAll(STATBLOCK_RE)) {
    // Text before this marker
    if (match.index > lastIndex) {
      segments.push({ type: 'text', content: content.slice(lastIndex, match.index) })
    }
    try {
      const data = JSON.parse(match[1])
      segments.push({ type: 'statblock', data })
    } catch {
      // Malformed JSON — keep as text
      segments.push({ type: 'text', content: match[0] })
    }
    lastIndex = match.index + match[0].length
  }

  // Remaining text
  if (lastIndex < content.length) {
    segments.push({ type: 'text', content: content.slice(lastIndex) })
  }

  return segments
}

export default function MessageContent({ content }) {
  const [activeStatblock, setActiveStatblock] = useState(null)
  const segments = parseMessage(content)

  return (
    <>
      {segments.map((seg, i) =>
        seg.type === 'text' ? (
          <span key={i} style={{ whiteSpace: 'pre-wrap' }}>{seg.content}</span>
        ) : (
          <MonsterPill
            key={i}
            name={seg.data.name}
            onClick={() => setActiveStatblock(seg.data)}
          />
        )
      )}
      {activeStatblock && (
        <StatBlockModal
          statblock={activeStatblock}
          onClose={() => setActiveStatblock(null)}
        />
      )}
    </>
  )
}
