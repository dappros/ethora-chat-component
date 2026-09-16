import React, {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useState,
} from 'react';
import styled from 'styled-components';
import { ProfileImagePlaceholder } from '../../MainComponents/ProfileImagePlaceholder';
import InputWithLabel from '../../styled/StyledInput';
import { updateProfile } from '../../../networking/api-requests/user.api';
import { useDispatch } from 'react-redux';
import { updateUser } from '../../../roomStore/chatSettingsSlice';
import { ethoraLogger } from '../../../helpers/ethoraLogger';
import { useT } from '../../../i18n/useT';
import { ProfileHero } from '../SideDrawer/DrawerProfileParts';
import { DrawerSection } from '../SideDrawer/SideDrawer';

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

/** What the parent drawer's header Save button calls. */
export interface EditUserModalHandle {
  save: () => Promise<void>;
}

// Fields stack full-width now that this lives inside the same DrawerSection
// rhythm as the rest of the profile drawer, instead of the old fixed "52% of
// a centred modal" width that only made sense in the standalone-dialog
// presentation this drawer replaced.
const FieldStack = styled.div`
  display: flex;
  flex-direction: column;
  gap: var(--ethora-space-4, 16px);
  width: 100%;
`;

// EditUserModal used to render its own header component ABOVE this content -
// a leftover from when profile editing was its own standalone dialog. Once
// it moved inside SideDrawer, that produced two headers stacked on top of
// each other: the drawer's own "<- Profile" bar, and this component's
// "Cancel ... Save" bar directly under it. The drawer's header is the only
// one now: `save`/`cancel` are exposed to UserProfileModal (which owns the
// drawer's headerActions slot) via this imperative handle instead, so
// there's exactly one header row while editing, same as every other panel.
const EditUserModal = forwardRef<EditUserModalHandle, EditUserModalProps>(
  ({ setIsEditing, modalUser, config }, ref) => {
    const dispatch = useDispatch();
    const t = useT();

    const [firstName, setFirstName] = useState(modalUser?.firstName || '');
    const [lastName, setLastName] = useState(modalUser?.lastName || '');
    const [description, setDescription] = useState(modalUser?.description || '');
    const [profileImage, setProfileImage] = useState<string | File>(
      modalUser?.profileImage
    );

    const onSave = useCallback(async () => {
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

        const { user } = await updateProfile(fd);

        dispatch(
          updateUser({
            updates: {
              firstName,
              lastName,
              description,
              profileImage: user?.profileImage,
            },
          })
        );

        setIsEditing(false);
      } catch (error) {
        ethoraLogger.log('error', error);
      }
    }, [
      dispatch,
      description,
      firstName,
      lastName,
      profileImage,
      setIsEditing,
    ]);

    useImperativeHandle(ref, () => ({ save: onSave }), [onSave]);

    const handleProfileImageChange = (image: File) => {
      setProfileImage(image);
    };

    return (
      <>
        <ProfileHero>
          <ProfileImagePlaceholder
            icon={profileImage}
            name={`${firstName} ${lastName}`}
            size={96}
            upload={{
              onUpload: handleProfileImageChange,
              active: true,
            }}
          />
        </ProfileHero>
        <DrawerSection>
          <FieldStack>
            <InputWithLabel
              color={config?.colors?.primary}
              colorBg={config?.colors?.colorInput}
              placeholder={t('field.firstName')}
              label={t('field.firstName')}
              value={firstName}
              onChange={(e: { target: { value: any } }) =>
                setFirstName(e.target.value)
              }
            />
            <InputWithLabel
              color={config?.colors?.primary}
              colorBg={config?.colors?.colorInput}
              placeholder={t('field.lastName')}
              label={t('field.lastName')}
              value={lastName}
              onChange={(e: { target: { value: any } }) =>
                setLastName(e.target.value)
              }
            />
            <InputWithLabel
              color={config?.colors?.primary}
              colorBg={config?.colors?.colorInput}
              placeholder={t('modal.profile.about')}
              label={t('modal.profile.about')}
              value={description}
              onChange={(e: { target: { value: any } }) =>
                setDescription(e.target.value)
              }
            />
          </FieldStack>
        </DrawerSection>
      </>
    );
  }
);

EditUserModal.displayName = 'EditUserModal';

export default EditUserModal;
