import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect } from 'vitest';
import MessageContent from '../MessageContent';

const statblockJson = JSON.stringify({
  name: 'Goblin',
  size: 'Small',
  type: 'humanoid',
  ac: 15,
  hp: { average: 7, formula: '2d6' },
  speed: '30 ft.',
  str: 8,
  dex: 14,
  con: 10,
  int: 10,
  wis: 8,
  cha: 8,
  cr: '1/4',
});

describe('MessageContent', () => {
  it('renders plain text as-is', () => {
    render(<MessageContent content="Hello adventurer" />);
    expect(screen.getByText('Hello adventurer')).toBeInTheDocument();
  });

  it('renders a MonsterPill when a STATBLOCK tag is present', () => {
    render(
      <MessageContent
        content={`You encounter a [STATBLOCK]${statblockJson}[/STATBLOCK]`}
      />,
    );
    expect(screen.getByRole('button', { name: /Goblin/ })).toBeInTheDocument();
  });

  it('renders surrounding text alongside a MonsterPill', () => {
    render(
      <MessageContent
        content={`Before [STATBLOCK]${statblockJson}[/STATBLOCK] After`}
      />,
    );
    expect(screen.getByText(/Before/)).toBeInTheDocument();
    expect(screen.getByText(/After/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Goblin/ })).toBeInTheDocument();
  });

  it('opens the StatBlockModal when a MonsterPill is clicked', async () => {
    render(
      <MessageContent content={`[STATBLOCK]${statblockJson}[/STATBLOCK]`} />,
    );
    await userEvent.click(screen.getByRole('button', { name: /Goblin/ }));
    expect(screen.getByText('Small humanoid')).toBeInTheDocument();
  });

  it('renders malformed STATBLOCK tags as plain text', () => {
    render(<MessageContent content="[STATBLOCK]not-valid-json[/STATBLOCK]" />);
    expect(screen.getByText(/STATBLOCK/)).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('handles multiple STATBLOCK tags in one message', () => {
    const second = JSON.stringify({
      ...JSON.parse(statblockJson),
      name: 'Orc',
    });
    render(
      <MessageContent
        content={`[STATBLOCK]${statblockJson}[/STATBLOCK] and [STATBLOCK]${second}[/STATBLOCK]`}
      />,
    );
    expect(screen.getByRole('button', { name: /Goblin/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Orc/ })).toBeInTheDocument();
  });
});
