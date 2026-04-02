import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import MonsterPill from '../MonsterPill';

describe('MonsterPill', () => {
  it('renders the monster name', () => {
    render(<MonsterPill name="Goblin" onClick={() => {}} />);
    expect(screen.getByText(/Goblin/)).toBeInTheDocument();
  });

  it('calls onClick when clicked', async () => {
    const handleClick = vi.fn();
    render(<MonsterPill name="Goblin" onClick={handleClick} />);
    await userEvent.click(screen.getByRole('button'));
    expect(handleClick).toHaveBeenCalledOnce();
  });

  it('has a descriptive title attribute', () => {
    render(<MonsterPill name="Goblin" onClick={() => {}} />);
    expect(screen.getByTitle('View Goblin stat block')).toBeInTheDocument();
  });
});
