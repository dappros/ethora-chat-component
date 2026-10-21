import React, { useRef } from 'react';
import styled from 'styled-components';
import { useDispatch, useSelector } from 'react-redux';
import type { RootState } from '../../roomStore';
import { closePreJoin } from '../../roomStore/scheduledCallSlice';
import { useChatSettingState } from '../../hooks/useChatSettingState';
import { useT, useUiLocale } from '../../i18n/useT';
import { useNow } from '../../hooks/useNow';
import { useModalDismiss } from '../../hooks/useModalDismiss';
import {
  displayCallTitle,
  getJoinOpensAtMs,
  getScheduledCallPhase,
  httpLinkOrNull,
} from '../../calls/scheduledCall';
import {
  formatClockTime,
  formatScheduledDay,
  formatScheduledDuration,
  formatScheduledTimeRange,
} from '../../calls/scheduledCallFormat';
import {
  canPlaceCallsInRoom,
  isScheduledCallsEnabled,
} from '../../calls/scheduledCallsConfig';
import { placeRoomCall } from '../../calls/placeCall';
import { sanitizeCallName } from '../../calls/callDisplay';
import {
  CloseButton,
  GroupContainer,
  ModalTitle,
} from '../Modals/styledModalComponents';
import {
  PresenceModalBackground,
  PresenceModalContainer,
} from '../Modals/motionVariants';
import Button from '../styled/Button';

// The screen a scheduled call opens on, from the card's Join button or from a
// join link. It deliberately starts nothing: no camera, no microphone, no
// call request until the user taps "Join call" here.

const Body = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 100%;
  text-align: center;
  color: var(--ethora-color-text, #141414);
`;

const Title = styled.div`
  font-size: 20px;
  font-weight: 600;
  overflow-wrap: anywhere;
`;

const Line = styled.div`
  font-size: 14px;
  color: var(--ethora-color-text-secondary, #5a5f66);
`;

const Notice = styled.div<{ $tone: 'info' | 'warn' }>`
  font-size: 14px;
  padding: 8px 12px;
  border-radius: var(--ethora-radius-sm, 8px);
  background: var(--ethora-color-bg-subtle, #f5f7fa);
  color: ${({ $tone }) =>
    $tone === 'warn'
      ? 'var(--ethora-color-danger, #d92d20)'
      : 'var(--ethora-color-text-secondary, #5a5f66)'};
`;

const CalendarRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px 14px;
  justify-content: center;
`;

const CalendarLink = styled.a`
  font-size: 13px;
  color: var(--ethora-color-primary, #0052cd);
  text-decoration: none;
  &:hover {
    text-decoration: underline;
  }
`;

export const ScheduledCallPreJoin: React.FC = () => {
  const dispatch = useDispatch();
  const t = useT();
  const locale = useUiLocale();
  const { config, user } = useChatSettingState();
  const details = useSelector((state: RootState) => state.scheduledCall?.preJoin);
  const callPhase = useSelector((state: RootState) => state.call?.phase);
  const room = useSelector((state: RootState) =>
    details ? state.rooms.rooms?.[details.chat.jid] : undefined
  );
  const containerRef = useRef<HTMLDivElement>(null);
  const close = () => dispatch(closePreJoin());
  useModalDismiss({ onClose: close, containerRef, enabled: Boolean(details) });
  const now = useNow(15_000, Boolean(details));

  if (!details) return null;

  const call = details.scheduledCall;
  const phase = getScheduledCallPhase(call, now);
  const roomType = (room?.type || details.chat.type) as string | undefined;
  const callsAllowed =
    isScheduledCallsEnabled(config) && canPlaceCallsInRoom(config, roomType);
  const busy = callPhase !== undefined && callPhase !== 'idle';
  const canJoinNow = phase === 'joinable' && callsAllowed && !busy;

  const handleJoin = () => {
    if (!canJoinNow) return;
    close();
    void placeRoomCall({
      dispatch,
      room: room ?? {
        jid: details.chat.jid,
        name: details.chat.title || details.chat.name,
        members: [],
        type: roomType as 'private' | 'group' | 'public' | undefined,
      },
      kind: call.kind,
      selfXmppUsername: user?.xmppUsername,
    });
  };

  const notice =
    phase === 'cancelled'
      ? { tone: 'warn' as const, text: t('scheduledCall.prejoin.cancelled') }
      : phase === 'ended'
        ? { tone: 'info' as const, text: t('scheduledCall.prejoin.ended') }
        : !callsAllowed
          ? { tone: 'warn' as const, text: t('scheduledCall.prejoin.unavailable') }
          : busy
            ? { tone: 'warn' as const, text: t('scheduledCall.prejoin.busy') }
            : phase === 'upcoming'
              ? {
                  tone: 'info' as const,
                  // "3:59 p.m." + the sentence's own full stop must not read "p.m.."
                  text: t('scheduledCall.prejoin.notOpen', {
                    time: formatClockTime(getJoinOpensAtMs(call), locale),
                  }).replace(/\.\.$/, '.'),
                }
              : null;

  const open = phase === 'upcoming' || phase === 'joinable';
  const google = httpLinkOrNull(details.links?.google);
  const outlook = httpLinkOrNull(details.links?.outlook);
  const ics = httpLinkOrNull(details.links?.ics);
  // The backend sends no title for 1:1 rooms and the bare name is an id: use the
  // room's display name from the list, never the raw name.
  const chatTitle =
    sanitizeCallName(details.chat.title) || sanitizeCallName(room?.name);
  const title = displayCallTitle(call.title, t('scheduledCall.default.title'));

  return (
    <PresenceModalBackground data-testid="scheduled-call-prejoin">
      <PresenceModalContainer ref={containerRef} style={{ maxWidth: 440 }}>
        <CloseButton
          onClick={close}
          style={{ fontSize: 24 }}
          aria-label={t('action.close')}
        >
          &times;
        </CloseButton>
        <ModalTitle>{t('scheduledCall.prejoin.title')}</ModalTitle>
        <Body>
          <Title>{title}</Title>
          <Line>
            {call.kind === 'audio'
              ? t('scheduledCall.kind.audio')
              : t('scheduledCall.kind.video')}
            {' · '}
            {formatScheduledDuration(call.durationMinutes, t)}
          </Line>
          <Line>
            {formatScheduledDay(call.startAt, locale)}
            {', '}
            {formatScheduledTimeRange(call, locale)}
          </Line>
          {chatTitle && (
            <Line>{t('scheduledCall.prejoin.chat', { chat: chatTitle })}</Line>
          )}
        </Body>
        {notice && <Notice $tone={notice.tone}>{notice.text}</Notice>}
        {open && (google || outlook || ics) && (
          <CalendarRow>
            {google && (
              <CalendarLink href={google} target="_blank" rel="noopener noreferrer">
                {t('scheduledCall.calendar.google')}
              </CalendarLink>
            )}
            {outlook && (
              <CalendarLink href={outlook} target="_blank" rel="noopener noreferrer">
                {t('scheduledCall.calendar.outlook')}
              </CalendarLink>
            )}
            {ics && (
              <CalendarLink
                href={ics}
                target="_blank"
                rel="noopener noreferrer"
                download="call.ics"
              >
                {t('scheduledCall.calendar.ics')}
              </CalendarLink>
            )}
          </CalendarRow>
        )}
        <Line>{t('scheduledCall.prejoin.hint')}</Line>
        <GroupContainer style={{ gap: 12 }}>
          <Button
            onClick={close}
            text={t('action.close')}
            style={{ width: '100%' }}
            variant="outlined"
          />
          <Button
            onClick={handleJoin}
            text={t('scheduledCall.action.joinCall')}
            style={{ width: '100%' }}
            variant="filled"
            disabled={!canJoinNow}
            data-testid="scheduled-call-prejoin-join"
          />
        </GroupContainer>
      </PresenceModalContainer>
    </PresenceModalBackground>
  );
};

export default ScheduledCallPreJoin;
