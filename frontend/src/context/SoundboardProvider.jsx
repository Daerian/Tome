/**
 * SoundboardProvider — app-root audio state for the DM soundboard.
 *
 * Holds the active Howl instances outside the CampaignView subtree so audio
 * keeps playing while the DM navigates between tabs.
 *
 * Music channel: looping ambient track with crossfades.
 * SFX channel: non-looping one-shot clip; ducks the music by 30% while
 * playing and restores it automatically when the clip ends.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Howl } from 'howler';
import { SoundboardContext } from './soundboardContext';

const CROSSFADE_MS = 1500;
const DEFAULT_VOLUME = 0.6;
const DUCK_RATIO = 0.7;
const DUCK_FADE_MS = 300;
const UNDUCK_FADE_MS = 400;

export function SoundboardProvider({ children }) {
  const [currentTrack, setCurrentTrack] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolumeState] = useState(DEFAULT_VOLUME);
  const [sfxTrack, setSfxTrack] = useState(null);

  const musicHowlRef = useRef(null);
  const sfxHowlRef = useRef(null);
  // Mirrors volume state so callbacks can read the current value without
  // being re-created on every volume change.
  const volumeRef = useRef(DEFAULT_VOLUME);

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

  const playTrack = useCallback((track) => {
    if (!track || !track.url) return;

    const previous = musicHowlRef.current;

    // thisHowl is assigned immediately after construction so the callbacks
    // can check whether this Howl is still the active one. Without this
    // guard, the outgoing track's onstop (fired by the crossfade timeout)
    // would reset isPlaying to false even though the new track is playing.
    let thisHowl;
    const isActive = () => musicHowlRef.current === thisHowl;

    // Target volume accounts for any active SFX ducking.
    const targetVol = sfxHowlRef.current
      ? volumeRef.current * DUCK_RATIO
      : volumeRef.current;

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
    next.fade(0, targetVol, CROSSFADE_MS);

    if (previous) {
      previous.fade(previous.volume(), 0, CROSSFADE_MS);
      setTimeout(() => {
        previous.stop();
        previous.unload();
      }, CROSSFADE_MS + 50);
    }
  }, []);

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
    volumeRef.current = clamped;
    const howl = musicHowlRef.current;
    if (howl) {
      // Respect active ducking when adjusting volume.
      const target = sfxHowlRef.current ? clamped * DUCK_RATIO : clamped;
      howl.volume(target);
    }
  }, []);

  // ---------------------------------------------------------------------------
  // SFX channel
  // ---------------------------------------------------------------------------

  const playSfx = useCallback((track) => {
    if (!track?.url) return;

    // Stop any clip already playing on the SFX channel.
    const existing = sfxHowlRef.current;
    if (existing) {
      existing.stop();
      existing.unload();
      sfxHowlRef.current = null;
    }

    // Duck the music channel while the SFX plays.
    const m = musicHowlRef.current;
    if (m && m.playing()) {
      m.fade(m.volume(), volumeRef.current * DUCK_RATIO, DUCK_FADE_MS);
    }

    setSfxTrack(track);

    const sfx = new Howl({
      src: [track.url],
      html5: true,
      volume: 0.9,
      loop: false,
      onend: () => {
        sfxHowlRef.current = null;
        setSfxTrack(null);
        const mu = musicHowlRef.current;
        if (mu && mu.playing()) {
          mu.fade(mu.volume(), volumeRef.current, UNDUCK_FADE_MS);
        }
      },
      onstop: () => {
        sfxHowlRef.current = null;
        setSfxTrack(null);
        const mu = musicHowlRef.current;
        if (mu && mu.playing()) {
          mu.fade(mu.volume(), volumeRef.current, UNDUCK_FADE_MS);
        }
      },
      onloaderror: (_id, err) => {
        sfxHowlRef.current = null;
        setSfxTrack(null);
        console.error('Soundboard: failed to load SFX', track, err);
      },
    });
    sfxHowlRef.current = sfx;
    sfx.play();
  }, []);

  const stopSfx = useCallback(() => {
    const sfx = sfxHowlRef.current;
    if (sfx) {
      sfx.stop();
      sfx.unload();
      sfxHowlRef.current = null;
    }
    setSfxTrack(null);
    const m = musicHowlRef.current;
    if (m && m.playing()) {
      m.fade(m.volume(), volumeRef.current, UNDUCK_FADE_MS);
    }
  }, []);

  // Cleanup both channels on unmount.
  useEffect(() => {
    return () => {
      const music = musicHowlRef.current;
      if (music) {
        music.stop();
        music.unload();
        musicHowlRef.current = null;
      }
      const sfx = sfxHowlRef.current;
      if (sfx) {
        sfx.stop();
        sfx.unload();
        sfxHowlRef.current = null;
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
    sfxTrack,
    playSfx,
    stopSfx,
  };

  return (
    <SoundboardContext.Provider value={value}>
      {children}
    </SoundboardContext.Provider>
  );
}
