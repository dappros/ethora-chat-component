import React, { useState } from 'react';
import { ProfileImagePlaceholder } from '../../MainComponents/ProfileImagePlaceholder';
import Button from '../../styled/Button';
import InputWithLabel from '../../styled/StyledInput';
import ModalHeaderComponent from '../ModalHeaderComponent';
import { CenterContainer } from '../styledModalComponents';
import { updateProfile } from '../../../networking/api-requests/user.api';
import { useDispatch } from 'react-redux';
import { updateUser } from '../../../roomStore/chatSettingsSlice';
// import { actionUpdateUser } from '../actions';

const base64ToFile = (base64String: string, fileName: string) => {
  const byteString = atob(base64String.split(',')[1]);
  const arrayBuffer = new ArrayBuffer(byteString.length);
  const uintArray = new Uint8Array(arrayBuffer);
  for (let i = 0; i < byteString.length; i++) {
    uintArray[i] = byteString.charCodeAt(i);
  }
  const blob = new Blob([uintArray], { type: 'image/jpeg' });
  return new File([blob], fileName, { type: 'image/jpeg' });
};

interface EditUserModalProps {
  setIsEditing: React.Dispatch<React.SetStateAction<boolean>>;
  modalUser: any;
  config: any;
}

const EditUserModal: React.FC<EditUserModalProps> = ({
  setIsEditing,
  modalUser,
  config,
}) => {
  const dispatch = useDispatch();

  const [firstName, setFirstName] = useState(modalUser?.firstName || '');
  const [lastName, setLastName] = useState(modalUser?.lastName || '');
  const [description, setDescription] = useState(modalUser?.description || '');
  const [profileImage, setProfileImage] = useState<string | File>();

  const onSave = async () => {
    try {
      let fd = new FormData();

      if (
        typeof profileImage === 'string' &&
        profileImage.startsWith('data:image/')
      ) {
        const file = base64ToFile(profileImage, 'profileImage.jpg');
        fd.append('file', file);
      } else if (profileImage instanceof File) {
        fd.append('file', profileImage);
      }

      fd.append('firstName', firstName);
      fd.append('lastName', lastName);
      fd.append('description', description);

      const newProfileIcon = await updateProfile(fd);
      console.log(fd);
      dispatch(
        updateUser({
          updates: {
            firstName,
            lastName,
            description,
            profileImage: newProfileIcon,
          },
        })
      );

      setIsEditing(false);
    } catch (error) {
      console.log('error', error);
    }
  };

  const handleProfileImageChange = (image: string) => {
    setProfileImage(image);
  };

  return (
    <>
      <ModalHeaderComponent
        leftMenu={
          <Button
            onClick={() => setIsEditing(false)}
            style={{ padding: '13px 8px', width: '100%' }}
          >
            Cancel
          </Button>
        }
        rightMenu={
          <Button
            onClick={onSave}
            variant="outlined"
            style={{ width: '128px' }}
          >
            Save
          </Button>
        }
      />
      <CenterContainer>
        <ProfileImagePlaceholder
          icon={modalUser?.profileImage}
          name={`${firstName} ${lastName}`}
          size={120}
          upload={{
            onUpload: handleProfileImageChange,
            active: true,
          }}
        />
      </CenterContainer>
      <div
        style={{
          boxSizing: 'border-box',
          display: 'flex',
          flexDirection: 'column',
          gap: '32px',
          width: '52%',
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <InputWithLabel
          color={config?.colors?.primary}
          placeholder="First Name"
          label="First Name"
          value={firstName}
          onChange={(e: { target: { value: any } }) =>
            setFirstName(e.target.value)
          }
        />
        <InputWithLabel
          color={config?.colors?.primary}
          placeholder="Last Name"
          label="Last Name"
          value={lastName}
          onChange={(e: { target: { value: any } }) =>
            setLastName(e.target.value)
          }
        />
        <InputWithLabel
          color={config?.colors?.primary}
          placeholder="About"
          label="About"
          value={description}
          onChange={(e: { target: { value: any } }) =>
            setDescription(e.target.value)
          }
        />
      </div>
    </>
  );
};

export default EditUserModal;
