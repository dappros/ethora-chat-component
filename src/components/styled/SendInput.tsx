import React, { useState, useRef, useCallback, useMemo } from "react";
import attachIcon from "../../assets/attachIcon.svg";
import {
  AttachButton,
  FileIcon,
  FilePreview,
  FilePreviewContainer,
  HiddenFileInput,
  MessageInputContainer,
  RemoveButton,
  VideoPreview,
  SendButton,
  InputContainer,
  MessageInput,
} from "./StyledInputComponents/StyledInputComponents";
import AudioRecorder from "../InputComponents/AudioRecorder";

interface SendInputProps {
  sendMessage: (message: string) => void;
  sendMedia: (data: any) => void;
}

const SendInput: React.FC<SendInputProps> = ({ sendMessage, sendMedia }) => {
  const [message, setMessage] = useState("");
  const [isRecording, setIsRecording] = useState(false);

  const [filePreviews, setFilePreviews] = useState<File[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleAttachClick = useCallback(() => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  }, []);

  const handleFileChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = event.target.files;
      if (files) {
        const newFiles = Array.from(files);
        setFilePreviews((prevFiles) => {
          const fileSet = new Set(prevFiles.map((file) => file.name));

          const uniqueNewFiles = newFiles.filter(
            (newFile) => !fileSet.has(newFile.name)
          );
          let combinedFiles = [...prevFiles, ...uniqueNewFiles];

          if (combinedFiles.length > 5) {
            combinedFiles = combinedFiles.slice(0, 5);
          }

          return combinedFiles;
        });
      }
    },
    []
  );

  const handleRemoveFile = useCallback((file: File) => {
    setFilePreviews((prevFiles) => prevFiles.filter((f) => f !== file));
  }, []);

  const handleInputChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setMessage(event.target.value);
    },
    []
  );

  const handleSendClick = useCallback(
    (audioUrl?: string) => {
      if (filePreviews && filePreviews.length > 0) {
        console.log(filePreviews);
        console.log("Files sent:", filePreviews);
        sendMedia(filePreviews);
        setIsRecording(false);
      }
      if (audioUrl) {
        sendMedia(audioUrl);
        console.log(audioUrl);
        console.log("Audio sent:", audioUrl);
        setIsRecording(false);
      } else {
        console.log("sending default");
        sendMessage(message);
      }
      setMessage("");
      setFilePreviews([]);
    },
    [filePreviews, message, sendMessage, sendMedia]
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter") {
        if (filePreviews.length > 0 || message) {
          handleSendClick();
        }
      }
    },
    [handleSendClick]
  );

  const renderFilePreview = useCallback((file: File) => {
    const fileUrl = URL.createObjectURL(file);
    const fileType = file.type.split("/")[0];

    if (fileType === "image") {
      return <FileIcon src={fileUrl} alt={file.name} />;
    } else if (fileType === "video") {
      return <VideoPreview src={fileUrl} controls />;
    } else {
      return <FileIcon src={attachIcon} alt={file.name} />;
    }
  }, []);

  const memoizedFilePreviews = useMemo(() => {
    return filePreviews.map(
      (file: any, idx: number) =>
        idx < 6 && (
          <FilePreview key={file.name}>
            {renderFilePreview(file)}
            <RemoveButton onClick={() => handleRemoveFile(file)} />
          </FilePreview>
        )
    );
  }, [filePreviews, renderFilePreview, handleRemoveFile]);

  return (
    <InputContainer>
      <MessageInputContainer>
        {!isRecording && (
          <>
            <AttachButton onClick={handleAttachClick} />
            <MessageInput
              placeholder="Message..."
              value={message}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
            />
          </>
        )}
        {message || filePreviews.length > 0 ? (
          <SendButton onClick={() => handleSendClick()} />
        ) : (
          <AudioRecorder
            setIsRecording={setIsRecording}
            isRecording={isRecording}
            handleSendClick={handleSendClick}
          />
        )}
      </MessageInputContainer>

      <HiddenFileInput
        ref={fileInputRef}
        type="file"
        onChange={handleFileChange}
      />
      {filePreviews.length > 0 && (
        <FilePreviewContainer>{memoizedFilePreviews}</FilePreviewContainer>
      )}
    </InputContainer>
  );
};

export default SendInput;
