import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import Soundboard from '../Soundboard';
import { useSoundboard } from '../../context/useSoundboard';

vi.mock('../../context/useSoundboard');

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MOCK_TRACKS = [
  {
    id: 'tabletop_audio:1',
    source: 'tabletop_audio',
    title: 'Tavern Music',
    url: '/api/soundboard/proxy?url=https%3A%2F%2Fsounds.tabletopaudio.com%2F1.mp3',
    track_type: 'loop',
    genres: ['Fantasy'],
    tags: ['tavern', 'inn'],
    flavor: 'A warm tavern ambience.',
    image_url: '',
    is_new: false,
  },
  {
    id: 'tabletop_audio:2',
    source: 'tabletop_audio',
    title: 'Dark Forest',
    url: '/api/soundboard/proxy?url=https%3A%2F%2Fsounds.tabletopaudio.com%2F2.mp3',
    track_type: 'loop',
    genres: ['Horror', 'Fantasy'],
    tags: ['forest', 'dark'],
    flavor: 'Ominous sounds of a dark forest.',
    image_url: '',
    is_new: true,
  },
];

const MOCK_CATALOG = {
  source: 'tabletop_audio',
  attribution: {
    name: 'Tabletop Audio',
    url: 'https://tabletopaudio.com/',
    note: 'Please consider donating.',
  },
  count: 2,
  tracks: MOCK_TRACKS,
};

function mockFetchCatalog(catalog = MOCK_CATALOG) {
  global.fetch = vi.fn().mockResolvedValueOnce({
    ok: true,
    json: () => Promise.resolve(catalog),
  });
}

function mockFetchError(message = 'Network error') {
  global.fetch = vi.fn().mockRejectedValueOnce(new Error(message));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Soundboard', () => {
  const mockPlayTrack = vi.fn();

  beforeEach(() => {
    mockPlayTrack.mockReset();
    useSoundboard.mockReturnValue({ currentTrack: null, playTrack: mockPlayTrack });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows loading state before catalog arrives', () => {
    global.fetch = vi.fn().mockReturnValue(new Promise(() => {}));
    render(<Soundboard />);
    expect(screen.getByText(/loading catalog/i)).toBeInTheDocument();
  });

  it('shows error message on fetch failure', async () => {
    mockFetchError('Network error');
    render(<Soundboard />);
    await screen.findByText(/network error/i);
  });

  it('shows error when response is not ok', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({ ok: false, status: 503 });
    render(<Soundboard />);
    await screen.findByText(/503/i);
  });

  it('renders track count after loading', async () => {
    mockFetchCatalog();
    render(<Soundboard />);
    await screen.findByText(/2 of 2 tracks/i);
  });

  it('renders all track titles', async () => {
    mockFetchCatalog();
    render(<Soundboard />);
    await screen.findByText('Tavern Music');
    expect(screen.getByText('Dark Forest')).toBeInTheDocument();
  });

  it('renders track flavor text', async () => {
    mockFetchCatalog();
    render(<Soundboard />);
    await screen.findByText(/warm tavern ambience/i);
  });

  it('renders attribution footer', async () => {
    mockFetchCatalog();
    render(<Soundboard />);
    const link = await screen.findByRole('link', { name: /Tabletop Audio/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', 'https://tabletopaudio.com/');
  });

  it('filters tracks by search query on title', async () => {
    mockFetchCatalog();
    render(<Soundboard />);
    await screen.findByText('Tavern Music');

    fireEvent.change(screen.getByPlaceholderText(/search tracks/i), {
      target: { value: 'tavern' },
    });

    expect(screen.getByText('Tavern Music')).toBeInTheDocument();
    expect(screen.queryByText('Dark Forest')).not.toBeInTheDocument();
    expect(screen.getByText(/1 of 2 tracks/i)).toBeInTheDocument();
  });

  it('filters tracks by search query on flavor text', async () => {
    mockFetchCatalog();
    render(<Soundboard />);
    await screen.findByText('Tavern Music');

    fireEvent.change(screen.getByPlaceholderText(/search tracks/i), {
      target: { value: 'ominous' },
    });

    expect(screen.queryByText('Tavern Music')).not.toBeInTheDocument();
    expect(screen.getByText('Dark Forest')).toBeInTheDocument();
  });

  it('filters tracks by genre tag chip', async () => {
    mockFetchCatalog();
    render(<Soundboard />);
    await screen.findByText('Tavern Music');

    fireEvent.click(screen.getByRole('button', { name: 'Horror' }));

    expect(screen.queryByText('Tavern Music')).not.toBeInTheDocument();
    expect(screen.getByText('Dark Forest')).toBeInTheDocument();
    expect(screen.getByText(/1 of 2 tracks/i)).toBeInTheDocument();
  });

  it('clicking All clears the genre filter', async () => {
    mockFetchCatalog();
    render(<Soundboard />);
    await screen.findByText('Tavern Music');

    fireEvent.click(screen.getByRole('button', { name: 'Horror' }));
    fireEvent.click(screen.getByRole('button', { name: 'All' }));

    expect(screen.getByText('Tavern Music')).toBeInTheDocument();
    expect(screen.getByText('Dark Forest')).toBeInTheDocument();
  });

  it('clicking the active genre tag again deactivates the filter', async () => {
    mockFetchCatalog();
    render(<Soundboard />);
    await screen.findByText('Tavern Music');

    const horrorBtn = screen.getByRole('button', { name: 'Horror' });
    fireEvent.click(horrorBtn);
    fireEvent.click(horrorBtn);

    expect(screen.getByText('Tavern Music')).toBeInTheDocument();
    expect(screen.getByText('Dark Forest')).toBeInTheDocument();
  });

  it('calls playTrack with the track when Play is clicked', async () => {
    mockFetchCatalog();
    render(<Soundboard />);
    await screen.findByText('Tavern Music');

    const playButtons = screen.getAllByRole('button', { name: 'Play' });
    fireEvent.click(playButtons[0]);

    expect(mockPlayTrack).toHaveBeenCalledOnce();
    expect(mockPlayTrack).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Tavern Music' }),
    );
  });

  it('shows Playing label for the active track', async () => {
    useSoundboard.mockReturnValue({
      currentTrack: { id: 'tabletop_audio:1' },
      playTrack: mockPlayTrack,
    });
    mockFetchCatalog();
    render(<Soundboard />);
    await screen.findByText('Tavern Music');

    expect(screen.getByRole('button', { name: 'Playing' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Play' })).toHaveLength(1);
  });

  it('disables Play when the track has no URL', async () => {
    const noUrlCatalog = {
      ...MOCK_CATALOG,
      count: 1,
      tracks: [{ ...MOCK_TRACKS[0], url: '' }],
    };
    mockFetchCatalog(noUrlCatalog);
    render(<Soundboard />);
    await screen.findByText('Tavern Music');

    expect(screen.getByRole('button', { name: 'Play' })).toBeDisabled();
  });
});
