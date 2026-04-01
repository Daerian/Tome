import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import StatBlockModal from '../StatBlockModal'

const goblin = {
  name: 'Goblin',
  size: 'Small',
  type: 'humanoid (goblinoid)',
  alignment: 'neutral evil',
  ac: 15,
  hp: { average: 7, formula: '2d6' },
  speed: '30 ft.',
  str: 8,
  dex: 14,
  con: 10,
  int: 10,
  wis: 8,
  cha: 8,
  senses: 'darkvision 60 ft.',
  passive: 9,
  languages: 'Common, Goblin',
  cr: '1/4',
  traits: [{ name: 'Nimble Escape', text: 'The goblin can take the Disengage or Hide action as a bonus action.' }],
  actions: [{ name: 'Scimitar', text: 'Melee Weapon Attack: +4 to hit, reach 5 ft., one target.' }],
  source: 'SRD 5.1',
}

describe('StatBlockModal', () => {
  it('renders the monster name', () => {
    render(<StatBlockModal statblock={goblin} onClose={() => {}} />)
    expect(screen.getByText('Goblin')).toBeInTheDocument()
  })

  it('displays core stats', () => {
    render(<StatBlockModal statblock={goblin} onClose={() => {}} />)
    expect(screen.getByText(/15/)).toBeInTheDocument()   // AC
    expect(screen.getByText(/2d6/)).toBeInTheDocument()  // HP formula
    expect(screen.getByText(/30 ft\./)).toBeInTheDocument()
  })

  it('shows correct ability score modifiers', () => {
    render(<StatBlockModal statblock={goblin} onClose={() => {}} />)
    // STR 8, WIS 8, CHA 8 → all -1 (3 instances)
    expect(screen.getAllByText('(-1)')).toHaveLength(3)
    // DEX 14 → +2 (1 instance)
    expect(screen.getAllByText('(+2)')).toHaveLength(1)
  })

  it('shows XP for CR 1/4', () => {
    render(<StatBlockModal statblock={goblin} onClose={() => {}} />)
    expect(screen.getByText(/50 XP/)).toBeInTheDocument()
  })

  it('renders traits and actions', () => {
    render(<StatBlockModal statblock={goblin} onClose={() => {}} />)
    expect(screen.getByText('Nimble Escape.')).toBeInTheDocument()
    expect(screen.getByText('Scimitar.')).toBeInTheDocument()
  })

  it('calls onClose when the × button is clicked', async () => {
    const onClose = vi.fn()
    render(<StatBlockModal statblock={goblin} onClose={onClose} />)
    await userEvent.click(screen.getByRole('button'))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('calls onClose when backdrop is clicked', () => {
    const onClose = vi.fn()
    const { container } = render(<StatBlockModal statblock={goblin} onClose={onClose} />)
    fireEvent.click(container.firstChild) // backdrop div
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('calls onClose when Escape is pressed', () => {
    const onClose = vi.fn()
    render(<StatBlockModal statblock={goblin} onClose={onClose} />)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledOnce()
  })
})
