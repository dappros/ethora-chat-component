import styled from 'styled-components';

export const InputContainer = styled.div`
  display: flex;
  flex-direction: column;
  border-radius: var(--ethora-radius-lg, 15px) var(--ethora-radius-lg, 15px) 0
    0;
  padding: 16px;
  background-color: var(--ethora-input-bg, #fff);
  border-top: 1px solid var(--ethora-color-border, #e6e8ec);
  z-index: 1;
  box-shadow: var(--ethora-shadow-sm, 0px 0px 24px -4px #12121914);
  max-width: 100%;
  /* Composer sits as a flex sibling after the message list - keep it at
     its natural height instead of letting the column flex layout shrink
     it if content above overflows. */
  flex-shrink: 0;
`;

export const MessageInputContainer = styled.div`
  display: flex;
  align-items: center;
  width: 100%;
  max-height: 72px;
  gap: 16px;
`;

export const MessageInput = styled.input<{ $color?: string, $colorBg?: string }>`
  flex-grow: 1;
  padding: 10px 12px;
  border-radius: var(--ethora-radius-md, 12px);
  border: 1px solid var(--ethora-color-border, #e6e8ec);
  color: var(--ethora-color-text, #141414);
  background-color: ${({$colorBg}) => $colorBg? $colorBg : 'var(--ethora-color-bg-subtle, #f5f7f9)'};
  max-height: 40px;
  transition: border-color var(--ethora-motion-fast, 150ms)
    var(--ethora-motion-ease, ease);

  &:focus {
    border-color: ${(props) => (props.$color ? props.$color : 'var(--ethora-color-primary, #0052CD)')};
    outline: 2px solid ${(props) => (props.$color ? props.$color : 'var(--ethora-color-primary, #0052CD)')};
    outline-offset: 1px;
  }
`;

export const HiddenFileInput = styled.input`
  display: none;
`;

export const Timer = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  font-weight: bold;
  margin-left: 10px;
  color: var(--ethora-color-text, #000);
`;

export const WaveformContainer = styled.canvas`
  width: 100%;
  height: 40px;
  background: var(--ethora-color-bg-subtle, #f1f1f1);
  border-radius: var(--ethora-radius-sm, 8px);
`;

export const RecordContainer = styled.div`
  height: 40px;
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
  width: 100%;
`;

export const FilePreviewContainer = styled.div`
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  gap: var(--ethora-space-2, 8px);
  margin-top: var(--ethora-space-2, 8px);
`;

export const FilePreview = styled.div`
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 100px;
  height: 100px;
  border: 1px solid var(--ethora-color-border, #e6e8ec);
  border-radius: var(--ethora-radius-md, 12px);
  overflow: hidden;
  background-color: var(--ethora-color-bg-subtle, #f9f9f9);
  box-shadow: var(--ethora-shadow-sm, 0 1px 2px rgba(16, 24, 40, 0.06));
`;

export const ImagePreview = styled.img`
  max-width: 80%;
  max-height: 80%;
`;

export const VideoPreview = styled.video`
  max-width: 80%;
  max-height: 80%;
`;

/** First page of a picked PDF, before it is sent. Fills the whole tile. */
export const DocumentPreview = styled.img`
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: top center;
`;

export const FilePreviewName = styled.span`
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 2px 4px;
  font-size: 10px;
  line-height: 1.3;
  color: #fff;
  background: rgba(0, 0, 0, 0.55);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  text-align: center;
`;

/** Why a pick was rejected (too many files, file too large). */
export const AttachmentNotice = styled.div`
  margin-top: var(--ethora-space-2, 8px);
  padding: 6px 10px;
  border-radius: var(--ethora-radius-sm, 8px);
  font-size: 12px;
  color: var(--ethora-color-danger, #9f0000);
  background-color: #fdecec;
`;

export const StyledInput = styled.input<{ $colorBg?: string }>`
  padding: 16px 12px;
  background-color: ${({$colorBg}) => $colorBg? $colorBg : 'var(--ethora-color-bg-subtle, #f5f7f9)'};
  border: 1px solid var(--ethora-color-border, #e6e8ec);
  outline: none;
  font-size: var(--ethora-font-size, 16px);
  color: var(--ethora-color-text, #000);
  transition:
    width 0.7s ease-in-out,
    padding 0.7s ease-in-out,
    border-color var(--ethora-motion-fast, 150ms) var(--ethora-motion-ease, ease);
  opacity: 1;
  z-index: 1;
  border-radius: var(--ethora-radius-md, 16px);
  /* Callers set width:100% expecting to match their container's content
     box (this is how the sibling room-name InputWithLabel is already
     built - see StyledInput.tsx). Without box-sizing:border-box, the
     12px/16px padding + 1px border add ON TOP of that 100%, so the input
     renders ~26px wider than its slot. ModalContainer sets overflow-y:auto
     with overflow-x otherwise 'visible', which the spec computes to 'auto'
     for the other axis too - so that overflow silently became a hidden
     horizontal scroll region instead of an obviously-wrong overflowing box,
     and the right edge (border/focus ring) of this search input got
     clipped inside the modal. */
  box-sizing: border-box;

  &:focus {
    border-color: var(--ethora-color-primary, #0052cd);
    outline: 2px solid var(--ethora-color-primary, #0052cd);
    outline-offset: 1px;
  }

  &::placeholder {
    opacity: 1;
    transition: opacity 0.7s ease-in-out;
  }
`;

export const TextareaWrapper = styled.div<{
  $dynamicHeight?: number;
  $color?: string;
  $isFocused?: boolean;
  $colorBg?: string;
}>`
  flex-grow: 1;
  position: relative;
  border-radius: var(--ethora-radius-md, 12px);
  background-color: ${({$colorBg}) => $colorBg? $colorBg : 'var(--ethora-color-bg-subtle, #f5f7f9)'};
  padding: 2px;
  height: ${(props) => props.$dynamicHeight || 40}px;
  max-height: ${(props) => props.$dynamicHeight || 40}px;
  min-height: 40px;
  box-sizing: border-box;
  transition:
    height 0.2s ease-in-out,
    border-color var(--ethora-motion-fast, 150ms) var(--ethora-motion-ease, ease);
  border: 1px solid
    ${(props) =>
      props.$isFocused
        ? props.$color || 'var(--ethora-color-primary, #0052CD)'
        : 'var(--ethora-color-border, #e6e8ec)'};
  outline: ${(props) =>
    props.$isFocused
      ? `2px solid ${props.$color || 'var(--ethora-color-primary, #0052CD)'}`
      : 'none'};
  outline-offset: 1px;
`;

export const TextareaInput = styled.textarea<{
  $dynamicHeight?: number;
  $color?: string;
  $colorBg?: string;
}>`
  width: 100%;
  height: 100%;
  padding: 8px 10px;
  border-radius: var(--ethora-radius-sm, 10px);
  border: none;
  color: var(--ethora-color-text, #141414);
  background-color: ${({$colorBg}) => $colorBg? $colorBg : 'var(--ethora-color-bg-subtle, #f5f7f9)'};
  line-height: 20px;
  font-size: inherit;
  font-family: inherit;
  /* Never show scrollbar for a single line (<= 40px) */
  overflow-x: hidden;
  overflow-y: ${(props) =>
    props.$dynamicHeight && props.$dynamicHeight > 40 ? 'auto' : 'hidden'};
  resize: none;
  box-sizing: border-box;
  transition: height 0.2s ease-in-out;

  &:focus {
    outline: none;
  }

  /* Custom scrollbar styling for WebKit browsers (Chrome, Safari, Edge) */
  &::-webkit-scrollbar {
    width: ${(props) =>
      props.$dynamicHeight && props.$dynamicHeight > 40 ? '2px' : '0'};
  }

  &::-webkit-scrollbar-track {
    background: transparent;
    border-radius: 0;
  }

  &::-webkit-scrollbar-thumb {
    background-color: ${(props) => (props.$color ? props.$color : 'var(--ethora-color-primary, #0052CD)')};
    border-radius: 2px;
  }

  &::-webkit-scrollbar-thumb:hover {
    background-color: ${(props) => (props.$color ? props.$color : 'var(--ethora-color-primary, #0052CD)')};
  }

  &::-webkit-scrollbar-corner {
    background: transparent;
  }

  /* Firefox scrollbar styling */
  scrollbar-width: ${(props) =>
    props.$dynamicHeight && props.$dynamicHeight > 40 ? 'thin' : 'none'};
  scrollbar-color: ${(props) =>
      props.$dynamicHeight && props.$dynamicHeight > 40
        ? `${props.$color ? props.$color : 'var(--ethora-color-primary, #0052CD)'} transparent`
        : 'transparent transparent'};
`;
