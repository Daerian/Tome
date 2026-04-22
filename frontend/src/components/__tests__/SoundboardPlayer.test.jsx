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

describe('SoundboardPlayer', () => {
  const mockPause = vi.fn();
  const mockResume = vi.fn();
  const mockStop = vi.fn();
  const mockSetVolume = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when no track is active', () => {
    useSoundboard.mockReturnValue({
      currentTrack: null,
      isPlaying: false,
      volume: 0.6,
      pause: mockPause,
      resume: mockResume,
      stop: mockStop,
      setVolume: mockSetVolume,
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
    });
    render(<SoundboardPlayer />);
    expect(screen.getByRole('region', { name: /soundboard player/i })).toBeInTheDocument();
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
    });
    render(<SoundboardPlayer />);
    fireEvent.change(screen.getByRole('slider', { name: 'Volume' }), {
      target: { value: '0.3' },
    });
    expect(mockSetVolume).toHaveBeenCalledWith(0.3);
  });
});
