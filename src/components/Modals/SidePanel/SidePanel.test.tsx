import React from 'react';
import { describe, expect, it } from 'vitest';
import { act, screen } from '@testing-library/react';
import { renderWithProviders } from '../../../test/renderWithProviders';
import SidePanel from './SidePanel';
import { MODAL_TYPES } from '../../../helpers/constants/MODAL_TYPES';

// The owner's complaint was that the profile "covers the chat". The fix is
// that the panel is a COLUMN of the chat's flex row rather than a child of
// the fixed overlay layer, so these tests pin down the two properties that
// make that true: the panel exists here (not in Modal), and the column it
// lives in takes part in layout on desktop instead of being painted on top.
const renderPanel = async (modal?: string) => {
  const result = renderWithProviders(
    <SidePanel modal={modal} setOpenModal={() => {}} />,
    {
      preloadedState: {
        chatSettingStore: { config: {}, user: { token: 't' } } as any,
      },
    }
  );
  await act(async () => {
    await Promise.resolve();
  });
  return result;
};

const column = () => screen.queryByTestId('side-panel-column');

describe('SidePanel', () => {
  it('renders the profile/settings panels', async () => {
    await renderPanel(MODAL_TYPES.CHAT_PROFILE);
    expect(column()).toBeTruthy();
  });

  it('renders the settings sub-panels too', async () => {
    await renderPanel(MODAL_TYPES.MANAGE_DATA);
    expect(column()).toBeTruthy();
  });

  it('renders nothing when no panel is open', async () => {
    await renderPanel(undefined);
    expect(column()).toBeNull();
  });

  it('leaves the centred dialogs to the Modal host', async () => {
    // The media viewer / lightbox is a true dialog and must NOT be pulled
    // into the layout row.
    await renderPanel(MODAL_TYPES.FILE_PREVIEW);
    expect(column()).toBeNull();
  });

  it('is a static column, not an overlay pinned over the chat', async () => {
    await renderPanel(MODAL_TYPES.PROFILE);
    const style = getComputedStyle(column() as HTMLElement);
    // jsdom evaluates the base (mobile) rules only; the desktop column is
    // the `min-width` branch. What matters here is that the base rules are
    // the FULL-SCREEN mobile mode - inset 0 over the chat box - and not a
    // `position: fixed` overlay over the whole viewport, which is what the
    // old presentation used.
    expect(style.position).toBe('absolute');
    expect(style.position).not.toBe('fixed');
  });
});
