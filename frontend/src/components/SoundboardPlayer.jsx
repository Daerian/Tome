/**
 * SoundboardPlayer — fixed mini-player for the active soundboard track.
 *
 * Rendered at app root (inside SoundboardProvider) so it's visible across
 * all routes while the DM is playing audio. Hides itself when neither a
 * music track nor an SFX clip is active.
 *
 * Music channel: play/pause, stop, volume slider.
 * SFX channel: shown as a secondary row with a stop button while a clip
 * is playing; disappears automatically when the clip ends.
 */

import { useSoundboard } from '../context/useSoundboard';

export default function SoundboardPlayer() {
  const {
    currentTrack,
    isPlaying,
    volume,
    pause,
    resume,
    stop,
    setVolume,
    sfxTrack,
    stopSfx,
  } = useSoundboard();

  if (!currentTrack && !sfxTrack) return null;

  return (
    <div style={styles.wrap} role="region" aria-label="Soundboard player">
      {currentTrack && (
        <div style={styles.musicRow}>
          <div style={styles.titleBlock}>
            <span style={styles.label}>Now Playing</span>
            <span style={styles.title} title={currentTrack.title}>
              {currentTrack.title}
            </span>
          </div>
          <div style={styles.controls}>
            <button
              style={styles.btn}
              onClick={isPlaying ? pause : resume}
              aria-label={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? '❙❙' : '▶'}
            </button>
            <button style={styles.btn} onClick={stop} aria-label="Stop">
              ■
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={volume}
              onChange={(e) => setVolume(parseFloat(e.target.value))}
              style={styles.volume}
              aria-label="Volume"
            />
          </div>
        </div>
      )}

      {sfxTrack && (
        <div style={styles.sfxRow}>
          <div style={styles.titleBlock}>
            <span style={styles.label}>SFX</span>
            <span style={styles.title} title={sfxTrack.title}>
              {sfxTrack.title}
            </span>
          </div>
          <button style={styles.btn} onClick={stopSfx} aria-label="Stop SFX">
            ■
          </button>
        </div>
      )}
    </div>
  );
}

const styles = {
  wrap: {
    position: 'fixed',
    bottom: '0.75rem',
    right: '0.75rem',
    zIndex: 1000,
    display: 'flex',
    flexDirection: 'column',
    gap: '0.35rem',
    padding: '0.5rem 0.75rem',
    backgroundColor: 'var(--sidebar-bg)',
    border: '2px solid var(--border-medium)',
    boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
    fontFamily: 'var(--font-body)',
    maxWidth: '420px',
  },
  musicRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
  },
  sfxRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    paddingTop: '0.3rem',
    borderTop: '1px solid var(--border-light)',
  },
  titleBlock: {
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0,
  },
  label: {
    fontSize: '0.65rem',
    fontVariant: 'small-caps',
    letterSpacing: '0.08em',
    color: 'var(--ink-faint)',
  },
  title: {
    fontSize: '0.85rem',
    color: 'var(--ink-dark)',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    maxWidth: '220px',
  },
  controls: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.4rem',
  },
  btn: {
    padding: '0.25rem 0.5rem',
    minWidth: '2rem',
    background: 'none',
    border: '1px solid var(--border-medium)',
    color: 'var(--ink-dark)',
    cursor: 'pointer',
    fontSize: '0.8rem',
    fontFamily: 'var(--font-body)',
  },
  volume: {
    width: '90px',
  },
};
