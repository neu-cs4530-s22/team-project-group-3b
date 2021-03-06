import assert from 'assert';
import { useContext } from 'react';
import PlayerSpotifySongContext, { PlayerSpotifySongCallback } from '../contexts/PlayerSpotifySongContext';

export default function usePlayerMovement(): PlayerSpotifySongCallback[] {
  const ctx = useContext(PlayerSpotifySongContext);
  assert(ctx, 'Player spotify song context should be defined.');
  return ctx;
}
