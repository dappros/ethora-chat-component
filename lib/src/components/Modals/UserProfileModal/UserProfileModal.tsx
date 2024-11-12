import React, { useState } from 'react';
import styled from 'styled-components';

const ModalContainer = styled.div`
  background: white;
  border-radius: 8px;
  padding: 24px;
  box-shadow: 0px 4px 16px rgba(0, 0, 0, 0.2);
  display: flex;
  flex-direction: column;
  gap: 16px;
`;

const ModalTitle = styled.h2`
  font-size: 1.5em;
  margin: 0;
`;

const Label = styled.label`
  font-size: 0.9em;
  color: #333;
  margin-bottom: 4px;
`;

const InputField = styled.input`
  width: 100%;
  padding: 8px;
  font-size: 1em;
  border: 1px solid #ddd;
  border-radius: 4px;
  background-color: #f5f5f5;
  outline: none;

  &:focus {
    border-color: #007bff;
    background-color: #fff;
  }
`;

const TextArea = styled.textarea`
  width: 100%;
  padding: 8px;
  font-size: 1em;
  border: 1px solid #ddd;
  border-radius: 4px;
  background-color: #f5f5f5;
  outline: none;
  resize: none;
  height: 80px;

  &:focus {
    border-color: #007bff;
    background-color: #fff;
  }
`;

const ButtonContainer = styled.div`
  display: flex;
  justify-content: space-between;
  gap: 8px;
`;

const CancelButton = styled.button`
  flex: 1;
  padding: 10px;
  font-size: 1em;
  border: 1px solid #007bff;
  background: white;
  color: #007bff;
  border-radius: 4px;
  cursor: pointer;

  &:hover {
    background: #f0f8ff;
  }
`;

const SaveButton = styled.button`
  flex: 1;
  padding: 10px;
  font-size: 1em;
  border: none;
  background: #007bff;
  color: white;
  border-radius: 4px;
  cursor: pointer;

  &:hover {
    background: #0056b3;
  }
`;

interface UserProfileModalProps {
  handleCloseModal: any;
}

const UserProfileModal: React.FC<UserProfileModalProps> = ({
  handleCloseModal,
}) => {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [bio, setBio] = useState('');

  const handleSaveProfile = () => {
    console.log('Profile Updated:', { username, email, bio });
    handleCloseModal();
  };

  return (
    <ModalContainer>
      <ModalTitle>Edit Profile</ModalTitle>

      <Label htmlFor="username">Username</Label>
      <InputField
        id="username"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        placeholder="Enter your username"
      />

      <Label htmlFor="email">Email</Label>
      <InputField
        id="email"
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Enter your email"
      />

      <Label htmlFor="bio">Bio</Label>
      <TextArea
        id="bio"
        value={bio}
        onChange={(e) => setBio(e.target.value)}
        placeholder="Tell us about yourself"
      />

      <ButtonContainer>
        <CancelButton onClick={handleCloseModal}>Cancel</CancelButton>
        <SaveButton onClick={handleSaveProfile}>Save</SaveButton>
      </ButtonContainer>
    </ModalContainer>
  );
};

export default UserProfileModal;
