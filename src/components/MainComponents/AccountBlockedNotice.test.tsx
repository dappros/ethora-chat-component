import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { renderWithProviders } from '../../test/renderWithProviders';
import AccountBlockedNotice, {
  AccountBlockedNoticeTestIds,
} from './AccountBlockedNotice';
import type { AccountBlockedInfo } from '../../helpers/accountBlocked';

const suspended = (
  overrides: Partial<NonNullable<AccountBlockedInfo['suspension']>> = {}
): AccountBlockedInfo => ({
  blocked: 'suspended',
  code: 'USER_SUSPENDED',
  suspension: {
    reasonCode: 'terms_violation',
    message: null,
    suspendedAt: '2026-11-01T10:00:00.000Z',
    until: null,
    supportContact: null,
    ...overrides,
  },
});

const renderNotice = (
  info: AccountBlockedInfo,
  props: { onSignOut?: () => void } = {},
  config: Record<string, unknown> = {}
) =>
  renderWithProviders(<AccountBlockedNotice info={info} {...props} />, {
    preloadedState: { chatSettingStore: { config } } as any,
  });

describe('AccountBlockedNotice', () => {
  it('shows the title, the localised reason and nothing optional', () => {
    renderNotice(suspended());

    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.getByTestId(AccountBlockedNoticeTestIds.title).textContent).toBe(
      'Account suspended'
    );
    expect(
      screen.getByTestId(AccountBlockedNoticeTestIds.description).textContent
    ).toBe('This account has been suspended.');
    expect(screen.getByTestId(AccountBlockedNoticeTestIds.reason).textContent).toBe(
      'Violation of the Terms of Service'
    );
    expect(screen.queryByTestId(AccountBlockedNoticeTestIds.message)).toBeNull();
    expect(screen.queryByTestId(AccountBlockedNoticeTestIds.support)).toBeNull();
    expect(screen.queryByTestId(AccountBlockedNoticeTestIds.signOutButton)).toBeNull();
  });

  it('shows the end date, the administrator message and an e-mail contact', () => {
    renderNotice(
      suspended({
        reasonCode: 'spam',
        message: 'Please stop posting links.',
        until: '2026-12-01T10:00:00.000Z',
        supportContact: 'support@example.com',
      }),
      {},
      { i18n: { locale: 'en' } }
    );

    const description = screen.getByTestId(
      AccountBlockedNoticeTestIds.description
    ).textContent;
    expect(description).toMatch(/^This account has been suspended until .*2026.*\.$/);
    expect(screen.getByTestId(AccountBlockedNoticeTestIds.reason).textContent).toBe(
      'Spam or abuse'
    );
    expect(screen.getByTestId(AccountBlockedNoticeTestIds.message).textContent).toBe(
      'Please stop posting links.'
    );
    const link = screen.getByRole('link', { name: 'support@example.com' });
    expect(link.getAttribute('href')).toBe('mailto:support@example.com');
    expect(link.getAttribute('target')).toBeNull();
  });

  it('links a URL contact in a new tab', () => {
    renderNotice(suspended({ supportContact: 'https://example.com/appeal' }));

    const link = screen.getByRole('link', { name: 'https://example.com/appeal' });
    expect(link.getAttribute('href')).toBe('https://example.com/appeal');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toContain('noopener');
  });

  it('shows an unsafe contact as text, never as a link', () => {
    renderNotice(suspended({ supportContact: 'javascript:alert(1)' }));

    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByTestId(AccountBlockedNoticeTestIds.support).textContent).toBe(
      'javascript:alert(1)'
    );
  });

  it.each([
    ['child_safety', 'Child safety'],
    ['security', 'Security reasons'],
    ['other', 'Other'],
    ['not_a_known_code', 'Other'],
  ])('labels reason %s as "%s"', (reasonCode, label) => {
    renderNotice(suspended({ reasonCode }));
    expect(screen.getByTestId(AccountBlockedNoticeTestIds.reason).textContent).toBe(
      label
    );
  });

  it('shows a generic text and no reason for an archived account', () => {
    renderNotice({ blocked: 'archived', code: 'USER_ARCHIVED' });

    expect(screen.getByTestId(AccountBlockedNoticeTestIds.screen).dataset.accountBlocked).toBe(
      'archived'
    );
    expect(
      screen.getByTestId(AccountBlockedNoticeTestIds.description).textContent
    ).toBe('This account is no longer active.');
    expect(screen.queryByTestId(AccountBlockedNoticeTestIds.reason)).toBeNull();
  });

  it('follows the UI language', () => {
    renderNotice(suspended({ reasonCode: 'spam' }), {}, { i18n: { locale: 'fr-CA' } });

    expect(screen.getByTestId(AccountBlockedNoticeTestIds.title).textContent).toBe(
      'Compte suspendu'
    );
    expect(screen.getByTestId(AccountBlockedNoticeTestIds.reason).textContent).toBe(
      'Spam ou abus'
    );
  });

  it('offers sign-out only when a handler is given', () => {
    const onSignOut = vi.fn();
    renderNotice(suspended(), { onSignOut });

    fireEvent.click(screen.getByTestId(AccountBlockedNoticeTestIds.signOutButton));
    expect(onSignOut).toHaveBeenCalledTimes(1);
  });
});
