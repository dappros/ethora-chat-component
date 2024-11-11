import React, { useState, useRef, useEffect } from 'react';
import WaveSurfer from 'wavesurfer.js';
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
  const wavesurfer = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);

  useEffect(() => {
    wavesurfer.current = WaveSurfer.create({
      container: waveformRef.current,
      waveColor: '#C4C4C4',
      progressColor: config?.colors?.primary || '#0052CD',
      cursorColor: 'transparent',
      height: 32,
      barWidth: 3,
      barHeight: 6,
      barGap: 2,
      barRadius: 1000,
    });

    wavesurfer.current.load(src);

    wavesurfer.current.on('seek', () => {
      wavesurfer.current.play();
      setIsPlaying(true);
    });

    wavesurfer.current.on('finish', () => {
      setIsPlaying(false);
    });

    return () => {
      wavesurfer.current.destroy();
    };
  }, [src]);

  const togglePlayPause = () => {
    setIsPlaying((prev) => !prev);
    wavesurfer.current.playPause();
  };

  const changeSpeed = () => {
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
      }}
    >
      <Button
        onClick={togglePlayPause}
        style={{
          color: '#141414',
          backgroundColor: config?.colors?.primary || '#0052CD',
          borderRadius: 1000,
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
        style={{ color: '#141414', fontSize: 14 }}
        text={`${playbackRate}X`}
      />
    </div>
  );
};

export default AudioMessage;
