import React from 'react';
import { describe, expect, test, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';

import CustomMessageImage from './MessageImage';
import { renderWithProviders } from '../../test/renderWithProviders';
import { MessageBubbleTestIds } from '../../testIds';

/**
 * Component test for the inline image renderer within a chat bubble.
 *
 * The `chat_message_image` `data-testid` matches Android's
 * `MessageBubbleTestTags.MEDIA_CONTENT` and iOS's
 * `MessageBubbleAccessibilityID.mediaContent`, so a Maestro / Playwright
 * flow that scrolls until it sees a media bubble works the same on
 * every platform.
 */
describe('<CustomMessageImage />', () => {
  test('renders the image with the cross-platform mediaContent testId', () => {
    renderWithProviders(
      <CustomMessageImage
        fileURL="https://example.com/photo.jpg"
        fileName="photo.jpg"
        mimetype="image/jpeg"
        locationPreview="https://example.com/photo-thumb.jpg"
      />
    );
    const img = screen.getByTestId(MessageBubbleTestIds.mediaContent);
    expect(img.tagName).toBe('IMG');
    expect(img).toHaveAttribute('src', 'https://example.com/photo-thumb.jpg');
  });

  test('still renders an image (with the same testId) when no fileURL is provided — guards the no-content fallback', () => {
    // The component has a branch for "no fileURL" that renders a
    // placeholder image. Same testid lands on both branches so a
    // cross-platform flow doesn't need to know which one rendered.
    renderWithProviders(
      <CustomMessageImage
        fileURL=""
        fileName="missing.jpg"
        mimetype="image/jpeg"
      />
    );
    const img = screen.getByTestId(MessageBubbleTestIds.mediaContent);
    expect(img.tagName).toBe('IMG');
  });

  test('clicking the image dispatches the file-preview modal — guards the open-in-modal contract', () => {
    // The bubble's image is the only opener for the full-screen
    // preview modal. If the click handler regresses, the user can
    // see thumbnails but can't open them.
    const storeRef: { current: import('@reduxjs/toolkit').EnhancedStore | null } = {
      current: null,
    };
    renderWithProviders(
      <CustomMessageImage
        fileURL="https://example.com/photo.jpg"
        fileName="photo.jpg"
        mimetype="image/jpeg"
        locationPreview="https://example.com/photo-thumb.jpg"
      />,
      { storeRef }
    );
    const img = screen.getByTestId(MessageBubbleTestIds.mediaContent);
    fireEvent.click(img);

    // The store's chatSettingStore.activeFile + activeModal should both
    // be populated after the click.
    const state = storeRef.current!.getState() as {
      chatSettingStore: { activeFile: unknown; activeModal: unknown };
    };
    expect(state.chatSettingStore.activeFile).toMatchObject({
      fileName: 'photo.jpg',
      fileURL: 'https://example.com/photo.jpg',
      mimetype: 'image/jpeg',
    });
    expect(state.chatSettingStore.activeModal).toBeTruthy();
  });
});
