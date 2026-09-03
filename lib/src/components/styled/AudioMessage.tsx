import React, { useState, useRef, useEffect } from 'react';
import type WaveSurfer from 'wavesurfer.js';
import Button from './Button';
import { PauseIcon, PlayIcon } from '../../assets/icons';
import { useSelector } from 'react-redux';
import { RootState } from '../../roomStore';

interface AudioMessageProps {
  src: string;
}

const AudioMessage: React.FC<AudioMessageProps> = ({ src }) => {
  const config = useSelector(
    (state: RootState) => state.chatSettingStore.config
  );

  const waveformRef = useRef(null);
  const wavesurfer = useRef<WaveSurfer | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);

  useEffect(() => {
    // wavesurfer.js is loaded on demand: audio messages are rare enough
    // that the library shouldn't sit in the initial bundle.
    let disposed = false;

    import('wavesurfer.js').then(({ default: WaveSurferLib }) => {
      if (disposed || !waveformRef.current) return;

      // Reads the resolved colour off the DOM rather than hardcoding a hex:
      // wavesurfer's canvas can't consume a CSS var string directly, so this
      // is the one place a literal fallback still needs to match the
      // `--ethora-color-*` tokens' own defaults.
      const rootStyle =
        typeof window !== 'undefined'
          ? getComputedStyle(document.documentElement)
          : null;
      const waveColor =
        rootStyle?.getPropertyValue('--ethora-color-border')?.trim() ||
        '#C4C4C4';

      const instance = WaveSurferLib.create({
        container: waveformRef.current,
        waveColor,
        progressColor: config?.colors?.primary || '#0052CD',
        cursorColor: 'transparent',
        height: 32,
        barWidth: 3,
        barHeight: 7,
        barGap: 2,
        barRadius: 1000,
      });
      wavesurfer.current = instance;

      instance.load(src);

      instance.on('seek' as any, () => {
        instance.play();
        setIsPlaying(true);
      });

      instance.on('finish', () => {
        setIsPlaying(false);
      });
    });

    return () => {
      disposed = true;
      wavesurfer.current?.destroy();
      wavesurfer.current = null;
    };
  }, [src]);

  const togglePlayPause = () => {
    if (!wavesurfer.current) return;
    setIsPlaying((prev) => !prev);
    wavesurfer.current.playPause();
  };

  const changeSpeed = () => {
    if (!wavesurfer.current) return;
    const newRate = playbackRate === 1 ? 1.5 : playbackRate === 1.5 ? 2 : 1;
    setPlaybackRate(newRate);
    wavesurfer.current.setPlaybackRate(newRate);
  };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        width: '100%',
        zIndex: 1,
      }}
    >
      <Button
        onClick={togglePlayPause}
        style={{
          color: 'var(--ethora-color-text-on-primary, #ffffff)',
          backgroundColor: config?.colors?.primary || '#0052CD',
          borderRadius: 'var(--ethora-radius-full, 999px)',
        }}
        EndIcon={isPlaying ? <PauseIcon /> : <PlayIcon />}
      />
      <div
        ref={waveformRef}
        style={{
          flex: 1,
          width: '150px',
        }}
      />
      <Button
        onClick={changeSpeed}
        style={{
          color: 'var(--ethora-color-text-secondary, #141414)',
          fontSize: 14,
          zIndex: 0,
        }}
        text={`${playbackRate}X`}
      />
    </div>
  );
};

export default AudioMessage;
