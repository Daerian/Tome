/**
 * Wiki — Campaign knowledge base with sidebar navigation
 *
 * Hub page containing: NPCs, Locations, Missions, and Treasury.
 * Left sidebar with page buttons, main content area renders active page.
 * Replaces the old separate NPC/Location tabs with a unified wiki interface.
 */

import { useState } from 'react';
import NPCs from './NPCs';
import Locations from './Locations';
import Missions from './Missions';
import Treasury from './Treasury';

const pages = [
  { key: 'npcs', label: 'NPCs' },
  { key: 'locations', label: 'Locations' },
  { key: 'missions', label: 'Missions' },
  { key: 'treasury', label: 'Treasury' },
];

export default function Wiki({ campaignId, session, role }) {
  const [activePage, setActivePage] = useState('npcs');

  return (
    <div style={s.wrapper}>
      {/* Sidebar nav */}
      <div style={s.sidebar}>
        {pages.map((p) => (
          <button
            key={p.key}
            style={activePage === p.key ? s.navActive : s.nav}
            onClick={() => setActivePage(p.key)}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Page content */}
      <div style={s.content}>
        {activePage === 'npcs' && (
          <NPCs campaignId={campaignId} session={session} role={role} />
        )}
        {activePage === 'locations' && (
          <Locations campaignId={campaignId} session={session} role={role} />
        )}
        {activePage === 'missions' && (
          <Missions campaignId={campaignId} session={session} role={role} />
        )}
        {activePage === 'treasury' && (
          <Treasury campaignId={campaignId} session={session} role={role} />
        )}
      </div>
    </div>
  );
}

const s = {
  wrapper: {
    display: 'flex',
    flex: 1,
    overflow: 'hidden',
  },
  sidebar: {
    width: '120px',
    flexShrink: 0,
    borderRight: '1px solid #e2e8f0',
    backgroundColor: '#f8fafc',
    display: 'flex',
    flexDirection: 'column',
    padding: '0.5rem 0',
    overflowY: 'auto',
  },
  nav: {
    padding: '0.5rem 0.75rem',
    background: 'none',
    border: 'none',
    borderLeft: '3px solid transparent',
    textAlign: 'left',
    fontSize: '0.8rem',
    color: '#64748b',
    cursor: 'pointer',
    fontFamily: 'inherit',
    transition: 'color 0.15s',
  },
  navActive: {
    padding: '0.5rem 0.75rem',
    background: 'none',
    border: 'none',
    borderLeft: '3px solid #2563eb',
    textAlign: 'left',
    fontSize: '0.8rem',
    color: '#2563eb',
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  content: {
    flex: 1,
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
  },
};
