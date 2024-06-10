import React, { useState, useRef, useEffect, useCallback } from "react";

import {
  CancelButton,
  PauseButton,
  RecordContainer,
  Timer,
  SendButton,
  RecordButton,
} from "./StyledInputComponents";

interface AudioRecorderProps {
  setIsRecording: (state: boolean) => void;
  isRecording: boolean;
  handleSendClick: (audioBlob?: string) => void;
}

const AudioRecorder: React.FC<AudioRecorderProps> = ({
  setIsRecording,
  isRecording,
  handleSendClick,
}) => {
  const [isPaused, setIsPaused] = useState(false);
  const [audioURL, setAudioURL] = useState<string | null>(null);
  const [timer, setTimer] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const dataArrayRef = useRef<Uint8Array | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = time % 60;
    return `${minutes.toString().padStart(2, "0")}:${seconds
      .toString()
      .padStart(2, "0")}`;
  };

  const startTimer = useCallback(() => {
    timerIntervalRef.current = setInterval(() => {
      setTimer((prev) => prev + 1);
    }, 1000);
  }, []);

  const stopTimer = useCallback(() => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
    }
  }, []);

  const startRecording = useCallback(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mediaRecorder = new MediaRecorder(stream);
    mediaRecorderRef.current = mediaRecorder;
    audioContextRef.current = new AudioContext();
    const source = audioContextRef.current.createMediaStreamSource(stream);
    const analyser = audioContextRef.current.createAnalyser();
    source.connect(analyser);
    analyser.fftSize = 256;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    analyserRef.current = analyser;
    dataArrayRef.current = dataArray;

    mediaRecorder.ondataavailable = (event) => {
      audioChunksRef.current.push(event.data);
    };

    mediaRecorder.onstop = () => {
      const audioBlob = new Blob(audioChunksRef.current, { type: "audio/wav" });
      const audioUrl = URL.createObjectURL(audioBlob);
      setAudioURL(audioUrl);
    };

    audioChunksRef.current = [];
    mediaRecorder.start();
    setIsRecording(true);
    setIsPaused(false);
    startTimer();
  }, [startTimer]);

  const pauseRecording = () => {
    if (mediaRecorderRef.current) {
      if (isPaused) {
        mediaRecorderRef.current.resume();
        startTimer();
      } else {
        mediaRecorderRef.current.pause();
        stopTimer();
      }
      setIsPaused(!isPaused);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setIsPaused(false);
      stopTimer();
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    }
    setIsRecording(false);
    stopTimer();
    setTimer(0);
  };

  const sendAudio = () => {
    if (audioURL) {
      console.log(audioURL);
      stopTimer();
      setTimer(0);
      handleSendClick(audioURL);
      setAudioURL(null);
      setIsRecording(false);
    }
  };

  const drawWaveform = useCallback(() => {
    if (!canvasRef.current || !analyserRef.current || !dataArrayRef.current) {
      return;
    }
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const analyser = analyserRef.current;
    const dataArray = dataArrayRef.current;

    const draw = () => {
      if (!isRecording) return;

      analyser.getByteTimeDomainData(dataArray);
      if (ctx) {
        ctx.fillStyle = "rgb(200, 200, 200)";
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.lineWidth = 2;
        ctx.strokeStyle = "rgb(0, 0, 255)";

        ctx.beginPath();
        const sliceWidth = (canvas.width * 1.0) / dataArray.length;
        let x = 0;

        for (let i = 0; i < dataArray.length; i++) {
          const v = dataArray[i] / 128.0;
          const y = (v * canvas.height) / 2;

          if (i === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }

          x += sliceWidth;
        }

        ctx.lineTo(canvas.width, canvas.height / 2);
        ctx.stroke();
      }
      animationFrameRef.current = requestAnimationFrame(draw);
    };

    draw();
  }, [isRecording]);

  useEffect(() => {
    if (isRecording) {
      drawWaveform();
    }
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isRecording, drawWaveform]);

  return isRecording ? (
    <RecordContainer>
      <CancelButton onClick={stopRecording} disabled={!isRecording} />
      <canvas ref={canvasRef} width="600" height="70" />
      <Timer>{formatTime(timer)}</Timer>
      {/* <RecordButton onClick={startRecording} disabled={isRecording} /> */}
      <PauseButton onClick={pauseRecording} disabled={!isRecording} />
      <SendButton onClick={sendAudio} disabled={!audioURL} />
    </RecordContainer>
  ) : (
    <RecordButton onClick={startRecording} />
  );
};

export default AudioRecorder;
