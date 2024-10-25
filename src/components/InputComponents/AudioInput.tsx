import React from "react";
import AudioRecorder from "../InputComponents/AudioRecorder";

interface AudioInputProps {
  isRecording: boolean;
  setIsRecording: (value: boolean) => void;
  handleSendClick: (audioUrl?: string) => void;
}

const AudioInput: React.FC<AudioInputProps> = ({
  isRecording,
  setIsRecording,
  handleSendClick,
}) => {
  return (
    <AudioRecorder
      setIsRecording={setIsRecording}
      isRecording={isRecording}
      handleSendClick={handleSendClick}
    />
  );
};

export default AudioInput;
