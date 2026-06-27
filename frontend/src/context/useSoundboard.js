import { useContext } from 'react';
import { SoundboardContext } from './soundboardContext';

export function useSoundboard() {
  const ctx = useContext(SoundboardContext);
  if (!ctx) {
    throw new Error('useSoundboard must be used inside a SoundboardProvider');
  }
  return ctx;
}
