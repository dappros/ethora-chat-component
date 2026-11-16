import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';

const api = vi.hoisted(() => ({
  getAppTrustSafety: vi.fn(),
  getMyAge: vi.fn(),
  putMyAge: vi.fn(),
}));

vi.mock('../../networking/api-requests/trustSafety.api', async (importOriginal) => {
  const actual = await importOriginal<
    typeof import('../../networking/api-requests/trustSafety.api')
  >();
  return { ...actual, ...api };
});
// Images never decode in jsdom: here the blurred previews "load" with a 2:3
// portrait size, as in a browser, and the originals never finish.
vi.mock('../../hooks/useMediaProbe', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../hooks/useMediaProbe')>();
  return {
    ...actual,
    useMediaProbe: (url?: string) => {
      const loaded = Boolean(url && url.includes('-thumb'));
      return {
        status: !url ? 'idle' : loaded ? 'loaded' : 'loading',
        width: loaded ? 600 : 0,
        height: loaded ? 900 : 0,
        url: url || '',
        retry: () => undefined,
        fail: () => undefined,
      };
    },
  };
});
vi.mock('../../hooks/usePdfThumbnail', () => ({
  usePdfThumbnail: () => ({ status: 'idle', retry: () => undefined }),
}));

import { renderWithProviders } from '../../test/renderWithProviders';
import MediaMessage from '../MainComponents/MediaMessage';
import { AgeDialog, isValidDateOfBirth } from './AgeDialog';
import { IMessage, IRoom } from '../../types/types';
import { resetFileAccessProbeCache } from '../../helpers/fileAccessProbe';
import { resetMediaProbeCaches } from '../../hooks/useMediaProbe';
import { __resetTrustSafetyRequestsForTests } from '../../roomStore/trustSafetyThunks';

const ROOM = 'room@conference.xmpp.example';
const ORIGINAL = 'https://secure-files.example.com/bucket/a.png';
const PREVIEW = 'https://secure-files.example.com/bucket/a-thumb.png';

const sensitive = (overrides: Partial<IMessage> = {}): IMessage =>
  ({
    id: 'm1',
    body: 'media',
    roomJid: ROOM,
    date: new Date().toISOString(),
    user: { id: 'alice' },
    isMediafile: 'true',
    mimetype: 'image/png',
    location: ORIGINAL,
    locationPreview: PREVIEW,
    originalName: 'a.png',
    isSensitive: 'true',
    sensitiveCategory: 'nudity',
    ...overrides,
  }) as IMessage;

const head = (status: number, block?: string) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name: string) => (name.toLowerCase() === 'x-ethora-block' ? block ?? null : null) },
  }) as unknown as Response;

const render = (message: IMessage, isUser = false) =>
  renderWithProviders(<MediaMessage message={message} isUser={isUser} />, {
    preloadedState: {
      chatSettingStore: {
        appId: 'app1',
        user: { xmppUsername: 'me', fileToken: 'ft1' },
        config: {},
      } as never,
      rooms: {
        rooms: { [ROOM]: { jid: ROOM, name: ROOM, messages: [message] } as unknown as IRoom },
      } as never,
    },
  });

const adult = { birthYear: 1990, isAdult: true, declaredAt: 'x', canDeclareAdult: true };
const unknownAge = { birthYear: null, isAdult: null, declaredAt: null, canDeclareAdult: true };


describe('sensitive media box (preview size known before reveal)', () => {
  const RealFetch = globalThis.fetch;
  beforeEach(() => {
    vi.clearAllMocks();
    resetFileAccessProbeCache();
    __resetTrustSafetyRequestsForTests();
    api.getAppTrustSafety.mockResolvedValue({ enabled: true, ageGate: true });
    api.getMyAge.mockResolvedValue(adult);
    globalThis.fetch = vi.fn(async () => head(200)) as never;
  });
  afterEach(() => {
    globalThis.fetch = RealFetch;
  });

  const frameOf = (root: HTMLElement) => {
    const el = root.querySelector('[data-testid="media-surface"]') as HTMLElement | null;
    return el ? { width: el.style.width, aspectRatio: el.style.aspectRatio } : null;
  };

  it('a picture sized from its preview keeps that box through reveal and hide, before the original decodes', async () => {
    render(sensitive());
    const covered = frameOf(screen.getByTestId('sensitive-in-place'));
    expect(covered?.aspectRatio).toBe('523 / 784');
    await act(async () => {
      fireEvent.click(screen.getByTestId('sensitive-cover'));
    });
    await waitFor(() => screen.getByTestId('sensitive-revealed'));
    expect(frameOf(screen.getByTestId('sensitive-revealed'))).toEqual(covered);
    fireEvent.click(screen.getByRole('button', { name: 'Blur this content again' }));
    expect(frameOf(screen.getByTestId('sensitive-in-place'))).toEqual(covered);
  });

  it('width and height carried on a single-file message size the box', () => {
    render(sensitive({ width: '1200', height: '800' } as unknown as Partial<IMessage>));
    expect(frameOf(screen.getByTestId('sensitive-in-place'))?.aspectRatio).toBe('560 / 373');
  });
});
