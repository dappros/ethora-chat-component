import React, { Dispatch, SetStateAction, useState } from 'react';
import { ModalTitle, LabelData } from '../Modals/styledModalComponents';
import {
  ScrollableContainer,
  UserItem,
  Checkbox,
  Label,
} from './StyledComponents';
import { useSelector } from 'react-redux';
import { RootState } from '../../roomStore';
import { RoomMember } from '../../types/types';

interface UsersListProps {
  selectedUsers: RoomMember[];
  setSelectedUsers: Dispatch<SetStateAction<RoomMember[]>>;
  headerElement?: boolean;
  style?: any;
}

const UsersList: React.FC<UsersListProps> = ({
  style,
  selectedUsers,
  setSelectedUsers,
  headerElement,
}) => {
  const usersSet = useSelector((state: RootState) => state.rooms.usersSet);

  const handleUserSelect = (user: RoomMember) => {
    setSelectedUsers((prev: any[]) => {
      const isSelected = prev.some((u: { _id: string }) => u._id === user._id);
      if (isSelected) {
        return prev.filter((u: { _id: string }) => u._id !== user._id);
      } else {
        return [...prev, user];
      }
    });
  };

  return (
    <div
      style={{
        maxHeight: '100px',
        ...style,
      }}
    >
      {headerElement ? (
        <ModalTitle>Select Users (max 20)</ModalTitle>
      ) : (
        <div style={{ fontSize: '10px', fontWeight: 600 }}>
          Select Users (max 20)
        </div>
      )}

      <ScrollableContainer style={{ ...style }}>
        {Object.values(usersSet).map((user) => (
          <UserItem key={user._id}>
            <Checkbox
              type="checkbox"
              checked={selectedUsers.some(
                (u: { _id: string }) => u._id === user._id
              )}
              onChange={() => handleUserSelect(user)}
              disabled={selectedUsers.length === 20}
            />
            <div>
              <Label>{`${user.firstName} ${user.lastName}`}</Label>
              {/* <LabelData>{user.xmppUsername}</LabelData> */}
            </div>
          </UserItem>
        ))}
      </ScrollableContainer>
    </div>
  );
};

export default UsersList;
