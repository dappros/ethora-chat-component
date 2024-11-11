import React, { useState } from 'react';
import styled from 'styled-components';

const ModalBackground = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
`;

const ModalContainer = styled.div`
  background: white;
  border-radius: 8px;
  width: 400px;
  padding: 24px;
  box-shadow: 0px 4px 16px rgba(0, 0, 0, 0.2);
  display: flex;
  flex-direction: column;
  gap: 16px;
  position: relative;
`;

const ModalTitle = styled.h2`
  font-size: 1.5em;
  margin: 0;
`;

const CloseButton = styled.button`
  position: absolute;
  top: 16px;
  right: 16px;
  background: none;
  border: none;
  font-size: 1.25em;
  cursor: pointer;
  color: #888;

  &:hover {
    color: #555;
  }
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

const OpenModalButton = styled.button`
  padding: 10px 20px;
  font-size: 1em;
  border: none;
  background-color: #007bff;
  color: white;
  border-radius: 4px;
  cursor: pointer;

  &:hover {
    background-color: #0056b3;
  }
`;

const UserProfileModal: React.FC = () => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [bio, setBio] = useState('');

  const handleOpenModal = () => setIsModalOpen(true);
  const handleCloseModal = () => setIsModalOpen(false);

  const handleSaveProfile = () => {
    console.log('Profile Updated:', { username, email, bio });
    setIsModalOpen(false);
  };

  return (
    <>
      <OpenModalButton onClick={handleOpenModal}>Edit Profile</OpenModalButton>

      {isModalOpen && (
        <ModalBackground>
          <ModalContainer>
            <CloseButton onClick={handleCloseModal}>&times;</CloseButton>
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
        </ModalBackground>
      )}
    </>
  );
};

export default UserProfileModal;
