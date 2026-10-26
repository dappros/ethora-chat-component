import React, { useCallback, useMemo, useState } from 'react';
import styled from 'styled-components';
import { useDispatch, useSelector, useStore } from 'react-redux';
import type { RootState } from '../../roomStore';
import type { IMessage } from '../../types/types';
import type { ScheduledCallMeta } from '../../types/models/scheduledCall.model';
import http from '../../networking/apiClient';
import { useChatSettingState } from '../../hooks/useChatSettingState';
import { useT, useUiLocale } from '../../i18n/useT';
import { useNow } from '../../hooks/useNow';
import { useToast } from '../../context/ToastContext';
import {
  getJoinOpensAtMs,
  displayCallTitle,
  getScheduledCallPhase,
  safeCalendarLink,
} from '../../calls/scheduledCall';
import {
  formatClockTime,
  formatScheduledDay,
  formatScheduledDuration,
  formatScheduledTimeRange,
} from '../../calls/scheduledCallFormat';
import {
  canManageScheduledCall,
  canPlaceCallsInRoom,
  isScheduledCallsEnabled,
} from '../../calls/scheduledCallsConfig';
import { loadScheduledCallDetails } from '../../calls/scheduledCallActions';
import { readStableIdentity } from '../../roomStore/persistEncryption';
import {
  openCancelModal,
  openPreJoin,
  openScheduleModal,
} from '../../roomStore/scheduledCallSlice';
import { CalendarIcon, VideoCallIcon, AudioCallIcon } from '../../assets/icons';
import Button from '../styled/Button';

// The invite card a `<data type="scheduledCall">` message renders as. One card
// per scheduled call: MessageList collapses older messages of the same slug,
// so this always gets the newest announcement (invite, edit or cancel).

const Row = styled.div`
  display: flex;
  justify-content: center;
  padding: 8px 16px;
  box-sizing: border-box;
  width: 100%;
`;

const Card = styled.div<{ $muted: boolean }>`
  width: 100%;
  max-width: 380px;
  box-sizing: border-box;
  border: 1px solid var(--ethora-color-border, #e6e8ec);
  border-radius: var(--ethora-radius-lg, 16px);
  background: var(--ethora-color-bg, #fff);
  color: var(--ethora-color-text, #141414);
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  opacity: ${({ $muted }) => ($muted ? 0.65 : 1)};
`;

const HeaderLine = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--ethora-color-text-secondary, #5a5f66);
  font-size: 13px;
`;

const Badge = styled.span<{ $tone: 'live' | 'neutral' | 'danger' }>`
  margin-inline-start: auto;
  padding: 2px 8px;
  border-radius: var(--ethora-radius-full, 999px);
  font-size: 12px;
  font-weight: 600;
  color: ${({ $tone }) =>
    $tone === 'live'
      ? 'var(--ethora-color-text-on-primary, #fff)'
      : $tone === 'danger'
        ? 'var(--ethora-color-danger, #d92d20)'
        : 'var(--ethora-color-text-secondary, #5a5f66)'};
  background: ${({ $tone }) =>
    $tone === 'live'
      ? 'var(--ethora-color-success, #12b76a)'
      : 'var(--ethora-color-bg-subtle, #f5f7fa)'};
`;

const Title = styled.div<{ $struck: boolean }>`
  font-size: 16px;
  font-weight: 600;
  overflow-wrap: anywhere;
  text-decoration: ${({ $struck }) => ($struck ? 'line-through' : 'none')};
`;

const When = styled.div<{ $struck: boolean }>`
  font-size: 14px;
  line-height: 20px;
  text-decoration: ${({ $struck }) => ($struck ? 'line-through' : 'none')};
`;

const Hint = styled.div`
  font-size: 13px;
  color: var(--ethora-color-text-secondary, #5a5f66);
`;

const CalendarRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px 14px;
  align-items: center;
`;

const CalendarLink = styled.a`
  font-size: 13px;
  color: var(--ethora-color-primary, #0052cd);
  text-decoration: none;
  &:hover {
    text-decoration: underline;
  }
  &:focus-visible {
    outline: 2px solid var(--ethora-color-primary, #0052cd);
    outline-offset: 2px;
    border-radius: 4px;
  }
`;

const Actions = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
`;

// Button's base is a 40x40 icon button; the card wants text buttons.
const textButtonStyle: React.CSSProperties = {
  width: 'auto',
  minWidth: 88,
  padding: '0 16px',
};

interface Props {
  message: IMessage;
}

export const ScheduledCallCard: React.FC<Props> = ({ message }) => {
  const meta = message.scheduledCall as ScheduledCallMeta;
  const dispatch = useDispatch();
  const { getState } = useStore<RootState>();
  const t = useT();
  const locale = useUiLocale();
  const { showToast } = useToast();
  const { config, user } = useChatSettingState();
  const room = useSelector(
    (state: RootState) => state.rooms.rooms?.[message.roomJid]
  );
  const [busy, setBusy] = useState(false);

  // The newest announcement of the call carries everything the card shows,
  // including who scheduled it (no request needed to render or to decide who
  // sees Edit and Cancel).
  const status = meta.status;

  const initialPhase = getScheduledCallPhase({ ...meta, status });
  const live = initialPhase === 'upcoming' || initialPhase === 'joinable';
  const now = useNow(30_000, live);
  const phase = getScheduledCallPhase({ ...meta, status }, now);
  const open = phase === 'upcoming' || phase === 'joinable';

  const apiBase = http.defaults?.baseURL;
  const links = useMemo(() => {
    const context = { slug: meta.slug, apiBaseUrl: apiBase };
    return {
      google: safeCalendarLink('google', meta.googleUrl, context),
      outlook: safeCalendarLink('outlook', meta.outlookUrl, context),
      ics: safeCalendarLink('ics', meta.icsUrl, context),
    };
  }, [meta.slug, meta.googleUrl, meta.outlookUrl, meta.icsUrl, apiBase]);

  const canJoin =
    isScheduledCallsEnabled(config) &&
    canPlaceCallsInRoom(config, room?.type);
  const canManage =
    open &&
    isScheduledCallsEnabled(config) &&
    canManageScheduledCall({
      // Hosts that sign in with xmpp credentials may not pass the Mongo _id;
      // the access token carries it.
      userId: user?._id || readStableIdentity(user)?.userId,
      callCreatedBy: meta.createdBy,
      room,
    });

  const title = displayCallTitle(meta.title, t('scheduledCall.default.title'));
  const struck = phase === 'cancelled';
  const KindIcon = meta.kind === 'audio' ? AudioCallIcon : VideoCallIcon;

  const handleJoin = useCallback(async () => {
    setBusy(true);
    try {
      const data = await loadScheduledCallDetails(dispatch, getState, meta.slug, {
        force: true,
      });
      if (data) dispatch(openPreJoin(data));
      else {
        showToast({
          id: Date.now().toString(),
          title: t('toast.error'),
          message: t('scheduledCall.error.network'),
          type: 'error',
        });
      }
    } finally {
      setBusy(false);
    }
  }, [dispatch, getState, meta.slug, showToast, t]);

  // The form needs the whole call (description, time zone), which the room
  // message does not carry: fetch it now.
  const handleEdit = useCallback(async () => {
    setBusy(true);
    try {
      const data = await loadScheduledCallDetails(dispatch, getState, meta.slug, {
        force: true,
      });
      if (data) {
        dispatch(openScheduleModal({ roomJid: message.roomJid, editing: data }));
      } else {
        showToast({
          id: Date.now().toString(),
          title: t('toast.error'),
          message: t('scheduledCall.error.network'),
          type: 'error',
        });
      }
    } finally {
      setBusy(false);
    }
  }, [dispatch, getState, meta.slug, message.roomJid, showToast, t]);

  const badge =
    phase === 'cancelled'
      ? { tone: 'danger' as const, text: t('scheduledCall.status.cancelled') }
      : phase === 'ended'
        ? { tone: 'neutral' as const, text: t('scheduledCall.status.ended') }
        : phase === 'joinable'
          ? { tone: 'live' as const, text: t('scheduledCall.status.open') }
          : meta.status === 'updated'
            ? { tone: 'neutral' as const, text: t('scheduledCall.status.updated') }
            : null;

  return (
    <Row data-testid="scheduled-call-card" data-phase={phase}>
      <Card
        $muted={phase === 'ended' || phase === 'cancelled'}
        role="group"
        aria-label={`${t('scheduledCall.prejoin.title')}: ${title}`}
      >
        <HeaderLine>
          <CalendarIcon width={16} height={16} aria-hidden="true" />
          <KindIcon
            width={16}
            height={16}
            color="currentColor"
            aria-hidden="true"
          />
          <span>
            {meta.kind === 'audio'
              ? t('scheduledCall.kind.audio')
              : t('scheduledCall.kind.video')}
          </span>
          {badge && <Badge $tone={badge.tone}>{badge.text}</Badge>}
        </HeaderLine>
        <Title $struck={struck}>{title}</Title>
        <When $struck={struck}>
          {formatScheduledDay(meta.startAt, locale)}
          {', '}
          {formatScheduledTimeRange(meta, locale)}
          {' ('}
          {formatScheduledDuration(meta.durationMinutes, t)}
          {')'}
        </When>
        {phase === 'upcoming' && canJoin && (
          <Hint>
            {t('scheduledCall.joinOpensAt', {
              time: formatClockTime(getJoinOpensAtMs(meta), locale),
            })}
          </Hint>
        )}
        {open && (links.google || links.outlook || links.ics) && (
          <CalendarRow>
            {links.google && (
              <CalendarLink
                href={links.google}
                target="_blank"
                rel="noopener noreferrer"
              >
                {t('scheduledCall.calendar.google')}
              </CalendarLink>
            )}
            {links.outlook && (
              <CalendarLink
                href={links.outlook}
                target="_blank"
                rel="noopener noreferrer"
              >
                {t('scheduledCall.calendar.outlook')}
              </CalendarLink>
            )}
            {links.ics && (
              <CalendarLink
                href={links.ics}
                target="_blank"
                rel="noopener noreferrer"
                download="call.ics"
              >
                {t('scheduledCall.calendar.ics')}
              </CalendarLink>
            )}
          </CalendarRow>
        )}
        {open && (canJoin || canManage) && (
          <Actions>
            {canJoin && (
              <Button
                variant="filled"
                text={t('scheduledCall.action.join')}
                style={textButtonStyle}
                disabled={phase !== 'joinable' || busy}
                onClick={() => void handleJoin()}
                data-testid="scheduled-call-join"
              />
            )}
            {canManage && (
              <>
                <Button
                  variant="outlined"
                  text={t('scheduledCall.action.edit')}
                  style={textButtonStyle}
                  disabled={busy}
                  onClick={() => void handleEdit()}
                  data-testid="scheduled-call-edit"
                />
                <Button
                  variant="outlined"
                  tone="danger"
                  text={t('scheduledCall.action.cancel')}
                  style={textButtonStyle}
                  disabled={busy}
                  onClick={() => dispatch(openCancelModal({ slug: meta.slug, title }))}
                  data-testid="scheduled-call-cancel"
                />
              </>
            )}
          </Actions>
        )}
      </Card>
    </Row>
  );
};

export default ScheduledCallCard;
