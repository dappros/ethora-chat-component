import { FC, useRef, useState } from 'react';
import { CloseButton, GroupContainer, ModalBackground, ModalContainer, ModalDescription, ModalTitle } from '../styledModalComponents';
import { TextareaInput } from '../../styled/StyledInputComponents/StyledInputComponents';
import Button from '../../styled/Button';


interface ModalWrapperProps {
  iconTitle?: any;
  title: string;
  description?: string;
  buttonText?: string;
  backgroundColorButton?: string;
  isTextarea?: boolean;
  textarea?: string;
  setTextarea?: (value: string) => void;
  handleCloseModal: () => void;
  handleClick: () => void;
}

export const ModalWrapper: FC<ModalWrapperProps> = ({
  iconTitle: IconTitle,
  title,
  description,
  buttonText,
  backgroundColorButton,
  isTextarea,
  textarea,
  setTextarea,
  handleCloseModal,
  handleClick,
}) => {
  const textareaRef = useRef(null);

  const handleInput = () => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      textarea.style.height = `${textarea.scrollHeight}px`;
    }
  };
  
  return (
    <ModalBackground>
      <ModalContainer style={{maxWidth: '640px'}}>
        <CloseButton onClick={handleCloseModal} style={{ fontSize: 24 }}>
          &times;
        </CloseButton>
        {IconTitle
          ? <IconTitle />
          : <ModalTitle>{title}</ModalTitle>
        }
        {description && <ModalDescription>{description}</ModalDescription>}
        {isTextarea && <GroupContainer style={{ flexDirection: 'column', position: 'relative' }}>
          <TextareaInput
            ref={textareaRef}
            onInput={handleInput}
            id="additionalDetails"
            value={textarea}
            onChange={(e) => setTextarea(e.target.value)}
            placeholder="Additional Details"
          />
        </GroupContainer>}
        {!buttonText && <GroupContainer>
          
        </GroupContainer>}
        <GroupContainer>
          <Button
            onClick={handleCloseModal}
            text={'Cancel'}
            style={{ width: '100%' }}
            unstyled
            variant="outlined"
          />
          {buttonText && <Button
            onClick={handleClick}
            text={buttonText}
            style={{ width: '100%', backgroundColor: backgroundColorButton }}
            unstyled
            variant="filled"
          />}
        </GroupContainer>
      </ModalContainer>
    </ModalBackground>
  );
};
