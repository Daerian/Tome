import { vi, describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import SoundboardPlayer from '../SoundboardPlayer';
import { useSoundboard } from '../../context/useSoundboard';

vi.mock('../../context/useSoundboard');

const MOCK_TRACK = {
  id: 'tabletop_audio:1',
  title: 'Tavern Music',
  url: 'http://localhost:8000/api/soundboard/proxy?url=...',
};

const MOCK_SFX = {
  id: 'freesound:123',
  title: 'Thunder Crack',
  url: 'https://cdn.freesound.org/previews/1/123-hq.mp3',
};

describe('SoundboardPlayer', () => {
  const mockPause = vi.fn();
  const mockResume = vi.fn();
  const mockStop = vi.fn();
  const mockSetVolume = vi.fn();
  const mockStopSfx = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ---------------------------------------------------------------------------
  // Phase 1 — music channel
  // ---------------------------------------------------------------------------

  it('renders nothing when no track is active', () => {
    useSoundboard.mockReturnValue({
      currentTrack: null,
      isPlaying: false,
      volume: 0.6,
      pause: mockPause,
      resume: mockResume,
      stop: mockStop,
      setVolume: mockSetVolume,
      sfxTrack: null,
      stopSfx: mockStopSfx,
    });
    const { container } = render(<SoundboardPlayer />);
    expect(container.firstChild).toBeNull();
  });

  it('renders the player region when a track is active', () => {
    useSoundboard.mockReturnValue({
      currentTrack: MOCK_TRACK,
      isPlaying: true,
      volume: 0.6,
      pause: mockPause,
      resume: mockResume,
      stop: mockStop,
      setVolume: mockSetVolume,
      sfxTrack: null,
      stopSfx: mockStopSfx,
    });
    render(<SoundboardPlayer />);
    expect(
      screen.getByRole('region', { name: /soundboard player/i }),
    ).toBeInTheDocument();
  });

  it('displays the current track title', () => {
    useSoundboard.mockReturnValue({
      currentTrack: MOCK_TRACK,
      isPlaying: true,
      volume: 0.6,
      pause: mockPause,
      resume: mockResume,
      stop: mockStop,
      setVolume: mockSetVolume,
      sfxTrack: null,
      stopSfx: mockStopSfx,
    });
    render(<SoundboardPlayer />);
    expect(screen.getByText('Tavern Music')).toBeInTheDocument();
  });

  it('shows Pause button and calls pause when playing', () => {
    useSoundboard.mockReturnValue({
      currentTrack: MOCK_TRACK,
      isPlaying: true,
      volume: 0.6,
      pause: mockPause,
      resume: mockResume,
      stop: mockStop,
      setVolume: mockSetVolume,
      sfxTrack: null,
      stopSfx: mockStopSfx,
    });
    render(<SoundboardPlayer />);
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    expect(mockPause).toHaveBeenCalledOnce();
    expect(mockResume).not.toHaveBeenCalled();
  });

  it('shows Play button and calls resume when paused', () => {
    useSoundboard.mockReturnValue({
      currentTrack: MOCK_TRACK,
      isPlaying: false,
      volume: 0.6,
      pause: mockPause,
      resume: mockResume,
      stop: mockStop,
      setVolume: mockSetVolume,
      sfxTrack: null,
      stopSfx: mockStopSfx,
    });
    render(<SoundboardPlayer />);
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    expect(mockResume).toHaveBeenCalledOnce();
    expect(mockPause).not.toHaveBeenCalled();
  });

  it('calls stop when Stop button is clicked', () => {
    useSoundboard.mockReturnValue({
      currentTrack: MOCK_TRACK,
      isPlaying: true,
      volume: 0.6,
      pause: mockPause,
      resume: mockResume,
      stop: mockStop,
      setVolume: mockSetVolume,
      sfxTrack: null,
      stopSfx: mockStopSfx,
    });
    render(<SoundboardPlayer />);
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
    expect(mockStop).toHaveBeenCalledOnce();
  });

  it('reflects current volume on the slider', () => {
    useSoundboard.mockReturnValue({
      currentTrack: MOCK_TRACK,
      isPlaying: true,
      volume: 0.4,
      pause: mockPause,
      resume: mockResume,
      stop: mockStop,
      setVolume: mockSetVolume,
      sfxTrack: null,
      stopSfx: mockStopSfx,
    });
    render(<SoundboardPlayer />);
    const slider = screen.getByRole('slider', { name: 'Volume' });
    expect(slider).toHaveValue('0.4');
  });

  it('calls setVolume with parsed float when slider changes', () => {
    useSoundboard.mockReturnValue({
      currentTrack: MOCK_TRACK,
      isPlaying: true,
      volume: 0.6,
      pause: mockPause,
      resume: mockResume,
      stop: mockStop,
      setVolume: mockSetVolume,
      sfxTrack: null,
      stopSfx: mockStopSfx,
    });
    render(<SoundboardPlayer />);
    fireEvent.change(screen.getByRole('slider', { name: 'Volume' }), {
      target: { value: '0.3' },
    });
    expect(mockSetVolume).toHaveBeenCalledWith(0.3);
  });

  // ---------------------------------------------------------------------------
  // Phase 3 — SFX channel
  // ---------------------------------------------------------------------------

  it('renders nothing when neither currentTrack nor sfxTrack is set', () => {
    useSoundboard.mockReturnValue({
      currentTrack: null,
      isPlaying: false,
      volume: 0.6,
      pause: mockPause,
      resume: mockResume,
      stop: mockStop,
      setVolume: mockSetVolume,
      sfxTrack: null,
      stopSfx: mockStopSfx,
    });
    const { container } = render(<SoundboardPlayer />);
    expect(container.firstChild).toBeNull();
  });

  it('renders the player when only sfxTrack is active', () => {
    useSoundboard.mockReturnValue({
      currentTrack: null,
      isPlaying: false,
      volume: 0.6,
      pause: mockPause,
      resume: mockResume,
      stop: mockStop,
      setVolume: mockSetVolume,
      sfxTrack: MOCK_SFX,
      stopSfx: mockStopSfx,
    });
    render(<SoundboardPlayer />);
    expect(
      screen.getByRole('region', { name: /soundboard player/i }),
    ).toBeInTheDocument();
  });

  it('shows the SFX clip title in the SFX row', () => {
    useSoundboard.mockReturnValue({
      currentTrack: null,
      isPlaying: false,
      volume: 0.6,
      pause: mockPause,
      resume: mockResume,
      stop: mockStop,
      setVolume: mockSetVolume,
      sfxTrack: MOCK_SFX,
      stopSfx: mockStopSfx,
    });
    render(<SoundboardPlayer />);
    expect(screen.getByText('Thunder Crack')).toBeInTheDocument();
  });

  it('shows both music row and SFX row when both channels are active', () => {
    useSoundboard.mockReturnValue({
      currentTrack: MOCK_TRACK,
      isPlaying: true,
      volume: 0.6,
      pause: mockPause,
      resume: mockResume,
      stop: mockStop,
      setVolume: mockSetVolume,
      sfxTrack: MOCK_SFX,
      stopSfx: mockStopSfx,
    });
    render(<SoundboardPlayer />);
    expect(screen.getByText('Tavern Music')).toBeInTheDocument();
    expect(screen.getByText('Thunder Crack')).toBeInTheDocument();
  });

  it('calls stopSfx when the Stop SFX button is clicked', () => {
    useSoundboard.mockReturnValue({
      currentTrack: null,
      isPlaying: false,
      volume: 0.6,
      pause: mockPause,
      resume: mockResume,
      stop: mockStop,
      setVolume: mockSetVolume,
      sfxTrack: MOCK_SFX,
      stopSfx: mockStopSfx,
    });
    render(<SoundboardPlayer />);
    fireEvent.click(screen.getByRole('button', { name: 'Stop SFX' }));
    expect(mockStopSfx).toHaveBeenCalledOnce();
  });

  it('does not render SFX row when sfxTrack is null', () => {
    useSoundboard.mockReturnValue({
      currentTrack: MOCK_TRACK,
      isPlaying: true,
      volume: 0.6,
      pause: mockPause,
      resume: mockResume,
      stop: mockStop,
      setVolume: mockSetVolume,
      sfxTrack: null,
      stopSfx: mockStopSfx,
    });
    render(<SoundboardPlayer />);
    expect(
      screen.queryByRole('button', { name: 'Stop SFX' }),
    ).not.toBeInTheDocument();
  });
});
