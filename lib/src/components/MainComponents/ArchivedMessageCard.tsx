import React, { useEffect, useRef } from 'react';
import styled from 'styled-components';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '../../roomStore';
import { clearArchivedMessage } from '../../roomStore/roomsSlice';
import { useT } from '../../i18n/useT';
import { fadeInAnimation } from '../../styles/motion';

const Scrim = styled.div`
  position: absolute;
  inset: 0;
  z-index: 5;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--ethora-space-4, 16px);
  background: var(--ethora-color-overlay, rgba(0, 0, 0, 0.5));
  ${fadeInAnimation}
`;

const Card = styled.div`
  display: flex;
  flex-direction: column;
  gap: var(--ethora-space-3, 12px);
  box-sizing: border-box;
  width: 100%;
  max-width: 460px;
  max-height: 100%;
  padding: var(--ethora-space-4, 16px);
  border-radius: var(--ethora-radius-lg, 16px);
  background: var(--ethora-color-bg, #fff);
  color: var(--ethora-color-text, #141414);
  box-shadow: var(--ethora-shadow-md, 0 8px 24px rgba(16, 24, 40, 0.18));
`;

const Head = styled.div`
  display: flex;
  justify-content: space-between;
  gap: var(--ethora-space-3, 12px);

  strong {
    font-size: var(--ethora-font-size-md, 16px);
    font-weight: var(--ethora-font-weight-semibold, 600);
  }
`;

const Meta = styled.div`
  font-size: var(--ethora-font-size-xs, 12px);
  color: var(--ethora-color-text-muted, #6c6c6c);
`;

const Body = styled.div`
  overflow-y: auto;
  padding: var(--ethora-space-3, 12px);
  border-radius: var(--ethora-radius-md, 12px);
  background: var(--ethora-color-bg-subtle, #f5f7fa);
  font-size: var(--ethora-font-size-sm, 14px);
  line-height: 1.5;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  user-select: text;
`;

const Note = styled.p`
  margin: 0;
  font-size: var(--ethora-font-size-xs, 12px);
  color: var(--ethora-color-text-secondary, #5a5f66);
`;

const CloseButton = styled.button`
  align-self: flex-end;
  padding: 6px 16px;
  border: 1px solid var(--ethora-color-border, #e6e8ec);
  border-radius: var(--ethora-radius-full, 999px);
  background: transparent;
  color: var(--ethora-color-text, #141414);
  font: inherit;
  font-size: var(--ethora-font-size-sm, 14px);
  cursor: pointer;
`;

const formatWhen = (iso: string): string => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(date);
  } catch {
    return date.toLocaleString();
  }
};

/**
 * The message a search hit points at, shown when the transcript cannot reach
 * it (the search archive is deeper than the chat's own history). It sits over
 * the conversation of the room it came from, so it needs no navigation and
 * says what the message is instead of reporting that it was not found.
 */
const ArchivedMessageCard: React.FC<{ roomJID: string }> = ({ roomJID }) => {
  const t = useT();
  const dispatch = useDispatch();
  const message = useSelector(
    (state: RootState) => state.rooms.archivedMessage
  );
  const closeRef = useRef<HTMLButtonElement>(null);
  const visible = Boolean(message && message.roomJID === roomJID);

  useEffect(() => {
    if (!visible) return;
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') dispatch(clearArchivedMessage());
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [visible, dispatch]);

  // Gone with the conversation it belongs to.
  useEffect(
    () => () => {
      dispatch(clearArchivedMessage());
    },
    [dispatch]
  );

  if (!visible || !message) return null;

  return (
    <Scrim
      data-testid="archived-message-card"
      onClick={(event) => {
        if (event.target === event.currentTarget)
          dispatch(clearArchivedMessage());
      }}
    >
      <Card role="dialog" aria-label={t('search.messages.archivedTitle')}>
        <Head>
          <div>
            <strong>{message.sender}</strong>
            <Meta>{formatWhen(message.createdAt)}</Meta>
          </div>
        </Head>
        <Body>{message.body}</Body>
        <Note>{t('search.messages.archivedNote')}</Note>
        <CloseButton
          ref={closeRef}
          type="button"
          onClick={() => dispatch(clearArchivedMessage())}
        >
          {t('action.close')}
        </CloseButton>
      </Card>
    </Scrim>
  );
};

export default ArchivedMessageCard;
