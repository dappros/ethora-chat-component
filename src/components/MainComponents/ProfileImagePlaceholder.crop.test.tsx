import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import chatSettingsSlice from '../../roomStore/chatSettingsSlice';
import { ProfileImagePlaceholder } from './ProfileImagePlaceholder';
import { useModalDismiss } from '../../hooks/useModalDismiss';

function setup(onUpload = vi.fn()) {
  const store = configureStore({ reducer: { chatSettingStore: chatSettingsSlice } });
  const view = render(<Provider store={store}><ProfileImagePlaceholder name="Test User" upload={{ active: true, onUpload }} /></Provider>);
  return { ...view, onUpload, input: view.container.querySelector('input[type=file]') as HTMLInputElement };
}
function pick(input: HTMLInputElement, file = new File(['image'], 'test.png', { type: 'image/png' })) {
  fireEvent.change(input, { target: { files: [file] } });
  const image = screen.getByRole('img', { name: 'Crop image' }) as HTMLImageElement;
  Object.defineProperties(image, { width: { value: 400 }, height: { value: 200 }, naturalWidth: { value: 800 }, naturalHeight: { value: 400 } });
  fireEvent.load(image);
  return file;
}
afterEach(() => vi.restoreAllMocks());

describe('avatar cropping', () => {
  it('cancels without uploading and permits choosing the same file again', () => {
    const { input, onUpload } = setup();
    const file = pick(input);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onUpload).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog', { name: 'Crop image' })).toBeNull();
    pick(input, file);
    expect(screen.getByRole('dialog', { name: 'Crop image' })).toBeTruthy();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Crop image' })).toBeNull();
    expect(onUpload).not.toHaveBeenCalled();
  });

  it('Escape closes the crop dialog before its parent dialog', () => {
    const closeParent = vi.fn();
    function Parent() {
      const parentRef = React.useRef<HTMLDivElement>(null);
      useModalDismiss({ onClose: closeParent, containerRef: parentRef });
      return <div ref={parentRef} role="dialog" aria-label="Profile"><ProfileImagePlaceholder name="Test" upload={{ active: true, onUpload: vi.fn() }} /></div>;
    }
    const store = configureStore({ reducer: { chatSettingStore: chatSettingsSlice } });
    const view = render(<Provider store={store}><Parent /></Provider>);
    pick(view.container.querySelector('input[type=file]') as HTMLInputElement);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Crop image' })).toBeNull();
    expect(closeParent).not.toHaveBeenCalled();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(closeParent).toHaveBeenCalledOnce();
  });

  it('saves the selected region at source resolution as a PNG file', async () => {
    const drawImage = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (callback) { callback(new Blob(['cropped'], { type: 'image/png' })); });
    const { input, onUpload } = setup();
    pick(input);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onUpload).toHaveBeenCalledOnce());
    expect(drawImage).toHaveBeenCalledWith(expect.any(HTMLImageElement), 200, 0, 400, 400, 0, 0, 400, 400);
    expect(onUpload.mock.calls[0][0]).toMatchObject({ name: 'avatar.png', type: 'image/png' });
    expect(screen.queryByRole('dialog', { name: 'Crop image' })).toBeNull();
  });
});
