import React from 'react';
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';

import chatSettingsSlice from '../../roomStore/chatSettingsSlice';
import { ProfileImagePlaceholder } from './ProfileImagePlaceholder';

// Social-login avatars (Google/Facebook profile photos) commonly fail to
// load: the browser then shows the broken-image glyph plus the alt text
// clipped to the circle, very visible across a member list. These tests
// cover the fallback to the same initials rendering used when there is no
// icon at all, the reset of that fallback when the icon prop changes (a
// recycled row must not keep showing a previous user's failure), and that
// the alt text is meaningful instead of the generic "avatar icon" string.
const renderWithStore = (ui: React.ReactElement) => {
  const store = configureStore({
    reducer: { chatSettingStore: chatSettingsSlice },
  });

  return render(<Provider store={store}>{ui}</Provider>);
};

describe('ProfileImagePlaceholder avatar fallback', () => {
  it('falls back to initials when the image fails to load', () => {
    renderWithStore(
      <ProfileImagePlaceholder
        name="Jane Doe"
        icon="https://lh3.googleusercontent.com/a/broken=s96-c"
      />
    );

    const img = screen.getByRole('img');
    expect(img).toBeTruthy();

    fireEvent.error(img);

    // The broken image must be gone and initials shown instead, exactly
    // like a member with no icon set at all.
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.getByText('JD')).toBeTruthy();
  });

  it('resets the failure state when the icon prop changes', () => {
    const { rerender, container } = renderWithStore(
      <ProfileImagePlaceholder
        name="Jane Doe"
        icon="https://lh3.googleusercontent.com/a/broken=s96-c"
      />
    );

    const store = configureStore({
      reducer: { chatSettingStore: chatSettingsSlice },
    });

    const img = screen.getByRole('img');
    fireEvent.error(img);
    expect(screen.getByText('JD')).toBeTruthy();

    // Simulate a virtualized row recycled for a different, working avatar.
    rerender(
      <Provider store={store}>
        <ProfileImagePlaceholder
          name="John Smith"
          icon="https://files.chat.ethora.com/john.jpg"
        />
      </Provider>
    );

    // A member row recycled to a different user must not keep showing the
    // previous user's fallback initials forever.
    expect(screen.queryByText('JD')).toBeNull();
    expect(screen.queryByText('JS')).toBeNull();
    const newImg = container.querySelector('img');
    expect(newImg).toBeTruthy();
    expect(newImg?.getAttribute('src')).toBe(
      'https://files.chat.ethora.com/john.jpg'
    );
  });

  it('gives the image a meaningful alt text derived from the name', () => {
    renderWithStore(
      <ProfileImagePlaceholder
        name="Jane Doe"
        icon="https://files.chat.ethora.com/jane.jpg"
      />
    );

    const img = screen.getByRole('img') as HTMLImageElement;
    expect(img.alt).toContain('Jane Doe');
    expect(img.alt).not.toBe('avatar icon');
  });

  it('sets referrerPolicy, lazy loading and async decoding on the image', () => {
    renderWithStore(
      <ProfileImagePlaceholder
        name="Jane Doe"
        icon="https://files.chat.ethora.com/jane.jpg"
      />
    );

    const img = screen.getByRole('img') as HTMLImageElement;
    expect(img.getAttribute('referrerpolicy')).toBe('no-referrer');
    expect(img.getAttribute('loading')).toBe('lazy');
    expect(img.getAttribute('decoding')).toBe('async');
  });
});
