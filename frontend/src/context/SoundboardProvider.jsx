/**
 * SoundboardProvider — app-root audio state for the DM soundboard.
 *
 * Holds the active Howl instance outside the CampaignView subtree so audio
 * keeps playing while the DM navigates between tabs. Phase 1 is a single
 * music channel with crossfades; a second SFX channel with ducking will be
 * added in Phase 3 without breaking this API.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Howl } from 'howler';
import { SoundboardContext } from './soundboardContext';

const CROSSFADE_MS = 1500;
const DEFAULT_VOLUME = 0.6;

export function SoundboardProvider({ children }) {
  const [currentTrack, setCurrentTrack] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolumeState] = useState(DEFAULT_VOLUME);

  const musicHowlRef = useRef(null);

  const stopMusic = useCallback(() => {
    const howl = musicHowlRef.current;
    if (howl) {
      howl.stop();
      howl.unload();
      musicHowlRef.current = null;
    }
    setCurrentTrack(null);
    setIsPlaying(false);
  }, []);

  const playTrack = useCallback(
    (track) => {
      if (!track || !track.url) return;

      const previous = musicHowlRef.current;

      // thisHowl is assigned immediately after construction so the callbacks
      // can check whether this Howl is still the active one. Without this
      // guard, the outgoing track's onstop (fired by the crossfade timeout)
      // would reset isPlaying to false even though the new track is playing.
      let thisHowl;
      const isActive = () => musicHowlRef.current === thisHowl;

      const next = new Howl({
        src: [track.url],
        html5: true,
        volume: 0,
        loop: true,
        onplay: () => {
          if (isActive()) setIsPlaying(true);
        },
        onpause: () => {
          if (isActive()) setIsPlaying(false);
        },
        onstop: () => {
          if (isActive()) setIsPlaying(false);
        },
        onloaderror: (_id, err) => {
          if (isActive()) setIsPlaying(false);
          console.error('Soundboard: failed to load track', track, err);
        },
        onplayerror: (_id, err) => {
          if (isActive()) setIsPlaying(false);
          console.error('Soundboard: playback error', track, err);
        },
      });
      thisHowl = next;

      musicHowlRef.current = next;
      setCurrentTrack(track);

      next.play();
      next.fade(0, volume, CROSSFADE_MS);

      if (previous) {
        previous.fade(previous.volume(), 0, CROSSFADE_MS);
        setTimeout(() => {
          previous.stop();
          previous.unload();
        }, CROSSFADE_MS + 50);
      }
    },
    [volume],
  );

  const pause = useCallback(() => {
    const howl = musicHowlRef.current;
    if (howl && howl.playing()) howl.pause();
  }, []);

  const resume = useCallback(() => {
    const howl = musicHowlRef.current;
    if (howl && !howl.playing()) howl.play();
  }, []);

  const setVolume = useCallback((v) => {
    const clamped = Math.max(0, Math.min(1, v));
    setVolumeState(clamped);
    const howl = musicHowlRef.current;
    if (howl) howl.volume(clamped);
  }, []);

  useEffect(() => {
    return () => {
      const howl = musicHowlRef.current;
      if (howl) {
        howl.stop();
        howl.unload();
        musicHowlRef.current = null;
      }
    };
  }, []);

  const value = {
    currentTrack,
    isPlaying,
    volume,
    playTrack,
    pause,
    resume,
    stop: stopMusic,
    setVolume,
  };

  return (
    <SoundboardContext.Provider value={value}>
      {children}
    </SoundboardContext.Provider>
  );
}
