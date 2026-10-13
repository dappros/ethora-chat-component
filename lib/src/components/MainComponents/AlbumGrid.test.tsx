import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, within } from '@testing-library/react';
import { renderWithProviders } from '../../test/renderWithProviders';
import AlbumGrid, { AlbumGridItem } from './AlbumGrid';
import { IAttachment } from '../../types/types';

// Keep the tiles free of real network images; the grid only cares about
// the element count, the layout and the overlays.
const attachment = (index: number, overrides: Partial<IAttachment> = {}): IAttachment => ({
  location: `https://files.example/${index}.png`,
  mimetype: 'image/png',
  originalName: `photo-${index}.png`,
  fileName: `stored-${index}.png`,
  ...overrides,
});

const itemsFor = (count: number): AlbumGridItem[] =>
  Array.from({ length: count }, (_, index) => ({ attachment: attachment(index + 1), index }));

const setup = (items: AlbumGridItem[], onRetry?: (index: number) => void) => {
  const storeRef: { current: any } = { current: null };
  renderWithProviders(<AlbumGrid items={items} onRetry={onRetry} />, { storeRef });
  return { storeRef };
};

const tiles = () =>
  within(screen.getByTestId('album-grid')).getAllByRole('button');

describe('AlbumGrid layouts', () => {
  const expected: Array<[number, string, number, number]> = [
    // [items, layout kind, tiles drawn, items folded into "+N"]
    [1, 'full', 1, 0],
    [2, 'pair', 2, 0],
    [3, 'hero', 3, 0],
    [4, 'quad', 4, 0],
    [5, 'quad', 4, 1],
    [6, 'quad', 4, 2],
  ];

  it.each(expected)('draws %i item(s) as the %s layout with %i tile(s)', (count, kind, drawn, hidden) => {
    setup(itemsFor(count));

    const grid = screen.getByTestId('album-grid');
    expect(grid).toHaveAttribute('data-layout', kind);
    expect(tiles()).toHaveLength(drawn);

    if (hidden > 0) {
      // The overlay sits on the last visible tile, not on a hidden one.
      expect(within(tiles()[drawn - 1]).getByText(`+${hidden}`)).toBeInTheDocument();
    } else {
      expect(screen.queryByText(/^\+\d+$/)).toBeNull();
    }
  });

  it('opens the tapped item in the file preview', () => {
    const { storeRef } = setup(itemsFor(3));

    fireEvent.click(tiles()[1]);

    const state = storeRef.current.getState().chatSettingStore;
    expect(state.activeModal).toBe('file_preview');
    expect(state.activeFile).toMatchObject({
      fileURL: 'https://files.example/2.png',
      fileName: 'photo-2.png',
    });
  });

  it('shows a spinner-state tile that cannot be opened yet', () => {
    const items = itemsFor(2);
    items[0] = {
      index: 0,
      attachment: attachment(1, { location: '', uploadStatus: 'uploading', uploadProgress: 40 }),
    };
    const { storeRef } = setup(items);

    expect(tiles()[0]).toBeDisabled();
    expect(screen.getByText('40%')).toBeInTheDocument();
    fireEvent.click(tiles()[0]);
    expect(storeRef.current.getState().chatSettingStore.activeModal).toBeUndefined();
  });

  it('asks for a retry of the failed tile by its message index', () => {
    const onRetry = vi.fn();
    const items = itemsFor(3);
    items[1] = {
      index: 1,
      attachment: attachment(2, { location: '', uploadStatus: 'failed' }),
    };
    setup(items, onRetry);

    expect(screen.getByText('Upload failed')).toBeInTheDocument();
    fireEvent.click(tiles()[1]);
    expect(onRetry).toHaveBeenCalledWith(1);
  });
});

describe('AlbumGrid failures hidden behind the +N cell', () => {
  it('shows a retry badge on +N and retries the hidden failed index on tap', () => {
    const onRetry = vi.fn();
    const items = itemsFor(5);
    items[4] = {
      index: 4,
      attachment: attachment(5, { location: '', uploadStatus: 'failed' }),
    };
    const { storeRef } = setup(items, onRetry);

    const more = tiles()[3];
    expect(within(more).getByText('+1')).toBeInTheDocument();
    expect(more).toHaveAccessibleName('1 failed, tap to retry');
    // The hidden failure is not drawn as a tile of its own.
    expect(screen.queryByText('Upload failed')).toBeNull();

    fireEvent.click(more);

    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry).toHaveBeenCalledWith(4);
    expect(storeRef.current.getState().chatSettingStore.activeModal).toBeUndefined();
  });

  it('retries every hidden failed index when several are folded behind +N', () => {
    const onRetry = vi.fn();
    const items = itemsFor(6);
    items[4] = { index: 4, attachment: attachment(5, { location: '', uploadStatus: 'failed' }) };
    items[5] = { index: 5, attachment: attachment(6, { location: '', uploadStatus: 'failed' }) };
    setup(items, onRetry);

    const more = tiles()[3];
    expect(within(more).getByText('+2')).toBeInTheDocument();
    expect(more).toHaveAccessibleName('2 failed, tap to retry');

    fireEvent.click(more);

    expect(onRetry.mock.calls).toEqual([[4], [5]]);
  });

  it('keeps opening the preview when no hidden item failed', () => {
    const onRetry = vi.fn();
    const { storeRef } = setup(itemsFor(5), onRetry);

    const more = tiles()[3];
    expect(within(more).getByText('+1')).toBeInTheDocument();
    expect(more).toHaveAccessibleName('photo-4.png');

    fireEvent.click(more);

    expect(onRetry).not.toHaveBeenCalled();
    expect(storeRef.current.getState().chatSettingStore.activeFile).toMatchObject({
      fileURL: 'https://files.example/4.png',
    });
  });

  it('shows nothing new for a hidden item that is still uploading', () => {
    const onRetry = vi.fn();
    const items = itemsFor(5);
    items[4] = {
      index: 4,
      attachment: attachment(5, { location: '', uploadStatus: 'uploading', uploadProgress: 10 }),
    };
    setup(items, onRetry);

    const more = tiles()[3];
    expect(more).toHaveAccessibleName('photo-4.png');
    expect(screen.queryByText(/failed, tap to retry/)).toBeNull();
    expect(screen.queryByText('Upload failed')).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
  });
});
