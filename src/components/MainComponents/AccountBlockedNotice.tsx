import React from 'react';
import styled from 'styled-components';
import { useT, useUiLocale } from '../../i18n/useT';
import {
  AccountBlockedInfo,
  formatSuspensionUntil,
  supportContactHref,
  supportContactLabel,
  suspensionReasonKey,
} from '../../helpers/accountBlocked';

/** Stable test ids for the suspended / archived account notice. */
export const AccountBlockedNoticeTestIds = {
  screen: 'account_blocked_notice',
  title: 'account_blocked_title',
  description: 'account_blocked_description',
  reason: 'account_blocked_reason',
  message: 'account_blocked_message',
  support: 'account_blocked_support',
  signOutButton: 'account_blocked_sign_out',
} as const;

const Screen = styled.div`
  height: 100%;
  width: 100%;
  min-height: 240px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--ethora-space-6, 24px);
  box-sizing: border-box;
  background: var(--ethora-color-bg, #ffffff);
  color: var(--ethora-color-text, #141414);
  font-family: var(--ethora-font-family, Inter, Arial, sans-serif);
  font-size: var(--ethora-font-size, 16px);
`;

const Card = styled.div`
  max-width: 420px;
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--ethora-space-3, 12px);
  text-align: center;
`;

const IconBadge = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 56px;
  height: 56px;
  border-radius: var(--ethora-radius-full, 9999px);
  background: var(--ethora-color-bg-subtle, #f3f6fc);
  color: var(--ethora-color-danger, #d92d20);
`;

const Title = styled.h2`
  margin: 0;
  font-size: var(--ethora-font-size-lg, 18px);
  font-weight: var(--ethora-font-weight-semibold, 600);
  line-height: var(--ethora-line-height-tight, 1.25);
  color: var(--ethora-color-text, #141414);
`;

const Description = styled.p`
  margin: 0;
  font-size: var(--ethora-font-size-sm, 14px);
  line-height: var(--ethora-line-height-normal, 1.5);
  color: var(--ethora-color-text-secondary, #5a5f66);
`;

const Details = styled.dl`
  margin: var(--ethora-space-1, 4px) 0 0;
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: var(--ethora-space-3, 12px);
  padding: var(--ethora-space-4, 16px);
  box-sizing: border-box;
  border: 1px solid var(--ethora-color-border, #e4e7ec);
  border-radius: var(--ethora-radius-md, 12px);
  background: var(--ethora-color-bg-subtle, #f3f6fc);
  text-align: left;
`;

const DetailRow = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
`;

const DetailLabel = styled.dt`
  font-size: var(--ethora-font-size-xs, 12px);
  font-weight: var(--ethora-font-weight-medium, 500);
  color: var(--ethora-color-text-muted, #8a8f98);
`;

const DetailValue = styled.dd`
  margin: 0;
  font-size: var(--ethora-font-size-sm, 14px);
  line-height: var(--ethora-line-height-normal, 1.5);
  color: var(--ethora-color-text, #141414);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
`;

const SupportLink = styled.a`
  color: var(--ethora-color-primary-text, var(--ethora-color-primary, #0052cd));
  text-decoration: underline;
  overflow-wrap: anywhere;

  &:focus-visible {
    outline: var(--ethora-focus-ring-width, 2px) solid
      var(--ethora-color-primary, #0052cd);
    outline-offset: 2px;
    border-radius: 2px;
  }
`;

const SignOutButton = styled.button`
  margin-top: var(--ethora-space-1, 4px);
  border: 1px solid var(--ethora-color-primary, #0052cd);
  border-radius: var(--ethora-radius-full, 9999px);
  background: transparent;
  color: var(--ethora-color-primary-text, var(--ethora-color-primary, #0052cd));
  cursor: pointer;
  padding: var(--ethora-space-2, 8px) var(--ethora-space-5, 20px);
  font-family: inherit;
  font-size: var(--ethora-font-size-sm, 14px);

  &:hover {
    background: var(--ethora-color-primary-soft, rgba(0, 82, 205, 0.08));
  }

  &:focus-visible {
    outline: var(--ethora-focus-ring-width, 2px) solid
      var(--ethora-color-primary, #0052cd);
    outline-offset: 2px;
  }
`;

const LockIcon: React.FC = () => (
  <svg
    width="26"
    height="26"
    viewBox="0 0 24 24"
    fill="none"
    aria-hidden="true"
    focusable="false"
  >
    <rect
      x="5"
      y="10.5"
      width="14"
      height="10"
      rx="2.5"
      stroke="currentColor"
      strokeWidth="1.8"
    />
    <path
      d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
    />
    <circle cx="12" cy="15.5" r="1.4" fill="currentColor" />
  </svg>
);

interface AccountBlockedNoticeProps {
  info: AccountBlockedInfo;
  /**
   * Shown as a "Sign out" button when given. Only for the chat's own
   * sign-in flow: a host that signs the user in owns signing out too.
   */
  onSignOut?: () => void;
  style?: React.CSSProperties;
}

/**
 * Blocking notice shown instead of the whole chat when the API reports the
 * signed-in account as suspended (reason, optional administrator message,
 * end date, support contact) or archived (a short generic text only).
 * There is no retry control: the server would refuse again, and a reload
 * already asks it afresh.
 */
const AccountBlockedNotice: React.FC<AccountBlockedNoticeProps> = ({
  info,
  onSignOut,
  style,
}) => {
  const t = useT();
  const locale = useUiLocale();
  const suspended = info.blocked === 'suspended';
  const suspension = suspended ? info.suspension : undefined;

  const until = formatSuspensionUntil(suspension?.until, locale);
  const contact = suspension?.supportContact || null;
  const contactHref = supportContactHref(contact);
  const contactLabel = supportContactLabel(contact);

  const title = suspended
    ? t('account.suspended.title')
    : t('account.archived.title');
  const description = suspended
    ? until
      ? t('account.suspended.descriptionUntil', { date: until })
      : t('account.suspended.description')
    : t('account.archived.description');

  return (
    <Screen
      role="alert"
      aria-live="assertive"
      data-testid={AccountBlockedNoticeTestIds.screen}
      data-account-blocked={info.blocked}
      style={style}
    >
      <Card>
        <IconBadge>
          <LockIcon />
        </IconBadge>
        <Title data-testid={AccountBlockedNoticeTestIds.title}>{title}</Title>
        <Description data-testid={AccountBlockedNoticeTestIds.description}>
          {description}
        </Description>

        {suspension && (
          <Details>
            <DetailRow>
              <DetailLabel>{t('account.suspended.reasonLabel')}</DetailLabel>
              <DetailValue data-testid={AccountBlockedNoticeTestIds.reason}>
                {t(suspensionReasonKey(suspension.reasonCode))}
              </DetailValue>
            </DetailRow>

            {suspension.message && (
              <DetailRow>
                <DetailLabel>{t('account.suspended.messageLabel')}</DetailLabel>
                <DetailValue data-testid={AccountBlockedNoticeTestIds.message}>
                  {suspension.message}
                </DetailValue>
              </DetailRow>
            )}

            {contact && (
              <DetailRow>
                <DetailLabel>{t('account.suspended.supportLabel')}</DetailLabel>
                <DetailValue data-testid={AccountBlockedNoticeTestIds.support}>
                  {contactHref ? (
                    <SupportLink
                      href={contactHref}
                      {...(contactHref.startsWith('mailto:')
                        ? {}
                        : { target: '_blank', rel: 'noopener noreferrer' })}
                    >
                      {contactLabel}
                    </SupportLink>
                  ) : (
                    contactLabel
                  )}
                </DetailValue>
              </DetailRow>
            )}
          </Details>
        )}

        {onSignOut && (
          <SignOutButton
            type="button"
            onClick={onSignOut}
            data-testid={AccountBlockedNoticeTestIds.signOutButton}
          >
            {t('account.blocked.signOut')}
          </SignOutButton>
        )}
      </Card>
    </Screen>
  );
};

export default AccountBlockedNotice;
