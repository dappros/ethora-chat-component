import React, { FC } from 'react';
import { EditIcon } from '../../assets/icons';
import { styled } from 'styled-components';

export const EditContainer = styled.div`
  background-color: #0052CD0D;
  padding: 12px 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
`;

export const EditInfoBox = styled.div`
  display: flex;
  align-items: center;
`;

export const EditTitle = styled.div`
  margin: 0px;
  color: rgb(140, 140, 140);
  text-align: start;
  font-size: 12px;
  padding-bottom: 4px;
`;

export const EditText = styled.div`
  margin: 0px;
  font-size: 16px;
  text-align: start;
`;

interface EditWrapperProps {
  text: string;
  onClose: () => void;
}

export const EditWrapper: FC<EditWrapperProps> = ({ text, onClose }) => {
  return (
    <EditContainer>
      <EditInfoBox>
        <div style={{
          padding: '9px 20px 9px 0',
          borderRight: '1px solid #0052CD'
        }}>
          <EditIcon color='#0052CD'/>
        </div>
        <div style={{paddingLeft: 20}}>
          <EditTitle>Edit Message</EditTitle>
          <EditText>{text}</EditText>
        </div>
      </EditInfoBox>
      <button
        style={{
          fontSize: 24,
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: '#888',
          borderRadius: '8px',
        }}
        onClick={onClose}
      >
          &times;
      </button>
    </EditContainer>
  );
};
