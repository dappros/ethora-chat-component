import React, { useState, useRef, useCallback } from "react";
import {
  RecordContainer,
  Timer,
} from "../styled/StyledInputComponents/StyledInputComponents";
import { RecordIcon, RemoveIcon, SendIcon } from "../../assets/icons";
import Button from "../styled/Button";
import RecordingIndicator from "./RecordingIndicator";

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
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [timer, setTimer] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);

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

  const resetState = () => {
    setAudioBlob(null);
    setTimer(0);
    setIsRecording(false);
    audioChunksRef.current = [];
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stream.getTracks().forEach((track) => track.stop());
    }
  };

  const startRecording = useCallback(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mediaRecorder = new MediaRecorder(stream);
    mediaRecorderRef.current = mediaRecorder;

    mediaRecorder.ondataavailable = (event) => {
      audioChunksRef.current.push(event.data);
    };

    mediaRecorder.onstop = () => {
      const audioBlob = new Blob(audioChunksRef.current);
      setAudioBlob(audioBlob);
    };

    audioChunksRef.current = [];
    mediaRecorder.start();
    setIsRecording(true);
    startTimer();
  }, [startTimer, setIsRecording]);

  const stopRecording = () => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      stopTimer();
      resetState();  // Fully reset the state without sending audio
    }
  };

  const sendAudio = () => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();  // Stop recording
      stopTimer();

      // On stop, send the audio after it's available
      mediaRecorderRef.current.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current);
        handleSendClick(audioBlob);
        // downloadAudio(audioBlob); // Automatically save the audio
        resetState();  // Reset after sending
      };
    }
  };

  const downloadAudio = (blob: Blob) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "recording.x-m4a"; // Change the file name if needed
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return isRecording || audioBlob ? (
    <RecordContainer>
      <div style={{ display: "flex", alignItems: "center" }}>
        {isRecording && <RecordingIndicator />}
        <Timer>{formatTime(timer)}</Timer>
      </div>

      <div style={{ display: "flex", gap: "8px" }}>
        <Button onClick={stopRecording} EndIcon={<RemoveIcon />} unstyled />
        <Button onClick={sendAudio} EndIcon={<SendIcon />} unstyled />
      </div>
    </RecordContainer>
  ) : (
    <Button onClick={startRecording} EndIcon={<RecordIcon />} />
  );
};

export default AudioRecorder;
