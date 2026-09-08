import React, { useRef, useState } from 'react';
import {
  ModalBackground,
  ModalContainer,
  CloseButton,
} from '../Modals/styledModalComponents';
import UsersList from '../UsersList/UsersList';
import { RoomMember } from '../../types/types';
import { MentionCandidate, memberFullName, memberJid } from '../../helpers/mentions';
import { useModalDismiss } from '../../hooks/useModalDismiss';
import { useT } from '../../i18n/useT';

interface MentionPickerModalProps {
  members: RoomMember[];
  selfId?: string;
  onSelect: (candidate: MentionCandidate) => void;
  onClose: () => void;
}

/**
 * Overflow picker for @-mentions, shown from the inline dropdown's
 * "Show all N..." row when a room has more members than the inline list can
 * display. Deliberately reuses UsersList - the same windowed member list the
 * New Chat / add-members flows already use - in its single-select mode
 * (see UsersList's `singleSelect`/`onSingleSelect` props) instead of
 * building a second member list with its own windowing/search/empty-state.
 */
export const MentionPickerModal: React.FC<MentionPickerModalProps> = ({
  members,
  selfId,
  onSelect,
  onClose,
}) => {
  const t = useT();
  const containerRef = useRef<HTMLDivElement>(null);
  // UsersList's own selectedUsers/setSelectedUsers pair is unused in
  // singleSelect mode (no checkboxes render, nothing toggles it), but the
  // prop is required - passing a stable empty array + no-op setter keeps
  // the child a plain single-select list without forking its API.
  const [unusedSelection] = useState<RoomMember[]>([]);

  useModalDismiss({ enabled: true, onClose, containerRef });

  const handleSingleSelect = (user: RoomMember) => {
    const jid = memberJid(user);
    const name = memberFullName(user);
    if (!jid || !name) return;
    onSelect({ jid, name });
  };

  return (
    <ModalBackground
      $anchorTop
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <ModalContainer
        ref={containerRef}
        aria-label={t('mention.pickerTitle')}
        style={{ width: '90%', maxWidth: 420, maxHeight: '70vh' }}
      >
        <CloseButton onClick={onClose} aria-label={t('action.close')}>
          &times;
        </CloseButton>
        <UsersList
          selectedUsers={unusedSelection}
          setSelectedUsers={() => {}}
          members={members}
          excludeUserId={selfId}
          singleSelect
          onSingleSelect={handleSingleSelect}
          titleOverride={t('mention.pickerTitle')}
          style={{ minWidth: '100%', width: '100%', maxHeight: '50vh' }}
          headerElement={false}
        />
      </ModalContainer>
    </ModalBackground>
  );
};

export default MentionPickerModal;
