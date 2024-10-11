import React, { useState, useRef, useEffect, useCallback } from "react";

import {
  RecordContainer,
  Timer,
} from "../styled/StyledInputComponents/StyledInputComponents";
import { RecordIcon, RemoveIcon, SendIcon } from "../../assets/icons";
import Button from "../styled/Button";

interface AudioRecorderProps {
  setIsRecording: (state: boolean) => void;
  isRecording: boolean;
  handleSendClick: (audioBlob?: any) => void;
}

const AudioRecorder: React.FC<AudioRecorderProps> = ({
  setIsRecording,
  isRecording,
  handleSendClick,
}) => {
  const [audioURL, setAudioURL] = useState<string | null>(null);
  const [timer, setTimer] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
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
      const audioBlob = new Blob(audioChunksRef.current, {
        type: "audio/webm",
      });
      const audioUrl = URL.createObjectURL(audioBlob);
      setAudioURL(audioUrl);
      handleSendClick(audioBlob); // Pass the audio blob to the parent component
      console.log(audioBlob); // Log the audio object
    };

    audioChunksRef.current = [];
    mediaRecorder.start();
    setIsRecording(true);
    startTimer();
  }, [startTimer, setIsRecording, handleSendClick]);

  const stopRecording = () => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      stopTimer();
      setTimer(0);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
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
        ctx.clearRect(0, 0, canvas.width, canvas.height); // Clear the canvas

        ctx.fillStyle = "rgba(255, 255, 255, 0.1)"; // Transparent background
        ctx.fillRect(0, 0, canvas.width, canvas.height); // Fill with transparent color

        ctx.lineWidth = 2;
        ctx.strokeStyle = "rgb(0, 0, 255)"; // Line color

        const sliceWidth = (canvas.width * 1.0) / dataArray.length;

        for (let i = 0; i < dataArray.length; i++) {
          const v = dataArray[i] / 128.0; // Normalize
          const height = (v * canvas.height) / 2; // Get height based on sensitivity
          const x = i * sliceWidth; // X position

          ctx.beginPath();
          ctx.moveTo(x, canvas.height / 2 - height);
          ctx.lineTo(x, canvas.height / 2 + height); // Draw vertical line
          ctx.stroke();
        }
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

  const sendAudio = () => {
    console.log("sent audio", audioURL);
  };

  return isRecording ? (
    <RecordContainer>
      <Button
        onClick={stopRecording}
        disabled={!isRecording}
        EndIcon={<RemoveIcon />}
      />
      <canvas ref={canvasRef} width="600" height="70" />
      <Timer>{formatTime(timer)}</Timer>
      <Button onClick={sendAudio} disabled={!audioURL} EndIcon={<SendIcon />} />
    </RecordContainer>
  ) : (
    <Button onClick={startRecording} EndIcon={<RecordIcon />} />
  );
};

export default AudioRecorder;
