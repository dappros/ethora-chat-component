import styled, { keyframes } from "styled-components";

// Keyframes for pulsing animation
const pulse = keyframes`
  0% {
    transform: scale(1);
    opacity: 1;
  }
  50% {
    transform: scale(1.3);
    opacity: 0.6;
  }
  100% {
    transform: scale(1);
    opacity: 1;
  }
`;

// Container for the recording indicator
const RecordingIndicatorWrapper = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  margin-right: 10px;
`;

// Outer circle with animation
const OuterCircle = styled.div`
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background-color: rgba(255, 0, 0, 0.6);
  position: absolute;
  animation: ${pulse} 1.5s infinite ease-in-out;
`;

// Inner circle (red static dot)
const InnerCircle = styled.div`
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background-color: red;
  position: relative;
`;

const RecordingIndicator = () => {
  return (
    <RecordingIndicatorWrapper>
        <OuterCircle />
        <InnerCircle />
      </RecordingIndicatorWrapper>
  )
}

export default RecordingIndicator