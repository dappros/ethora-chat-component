import { FC } from 'react';
import styled from 'styled-components';
import { ChatContainerHeader, ChatContainerHeaderLabel } from '../styled/StyledComponents';
import Button from '../styled/Button';
import { CloseIcon } from '../../assets/icons';
import { useDispatch } from 'react-redux';
import { setCloseActiveMessage } from '../../roomStore/roomsSlice';
import { useT } from '../../i18n/useT';

interface ThreadHeaderProps {
  chatJID: string;
}

// Local override on top of the shared ChatContainerHeader: swaps its heavy
// drop-shadow for a flat bottom border and a fixed height, matching
// ChatHeader's 56-64px target look, without touching the shared primitive
// other surfaces still render with the old shadow.
const ThreadHeaderBar = styled(ChatContainerHeader)`
  min-height: 60px;
  align-items: center;
  box-shadow: none;
  border-radius: 0;
  border-bottom: 1px solid var(--ethora-color-border, #e6e8ec);
`;

const ThreadHeader: FC<ThreadHeaderProps> = ({ chatJID }) => {
  const dispatch = useDispatch();
  const t = useT();

  const handleCloseThread = () => {
    dispatch(setCloseActiveMessage({ chatJID: chatJID}));
  }

  return (
    <ThreadHeaderBar>
      <div style={{ display: 'flex', gap: '8px' }}>
        <ChatContainerHeaderLabel>
          {t('thread.title')}
        </ChatContainerHeaderLabel>
      </div>

      <div style={{ display: 'flex', gap: 16 }}>
        <Button
          style={{ padding: 8 }}
          EndIcon={<CloseIcon />}
          unstyled
          onClick={handleCloseThread}
          aria-label={t('action.close')}
        />
      </div>

    </ThreadHeaderBar>
  );
};

export default ThreadHeader;
