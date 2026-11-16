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

describe('sensitive media in a message', () => {
  const RealFetch = globalThis.fetch;
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    resetFileAccessProbeCache();
    resetMediaProbeCaches();
    __resetTrustSafetyRequestsForTests();
    api.getAppTrustSafety.mockResolvedValue({ enabled: true, ageGate: true });
    fetchSpy = vi.fn(async () => head(200));
    globalThis.fetch = fetchSpy as never;
  });
  afterEach(() => {
    globalThis.fetch = RealFetch;
  });

  it('is covered with the blurred preview and never loads the original', () => {
    render(sensitive());
    const cover = screen.getByTestId('sensitive-cover');
    expect(cover).toHaveTextContent('Sensitive content. Tap to view');
    const images = Array.from(document.querySelectorAll('img')).map((img) => img.getAttribute('src'));
    expect(images.some((src) => src?.includes('a-thumb.png'))).toBe(true);
    expect(images.some((src) => src?.includes('/a.png'))).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('asks for the age when it is unknown, then reveals an adult', async () => {
    api.getMyAge.mockResolvedValue(unknownAge);
    api.putMyAge.mockResolvedValue(adult);
    render(sensitive());

    fireEvent.click(screen.getByTestId('sensitive-cover'));
    expect(await screen.findByRole('dialog')).toHaveTextContent('Confirm your age');

    fireEvent.change(screen.getByLabelText('Date of birth'), { target: { value: '1990-05-01' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    });

    expect(api.putMyAge).toHaveBeenCalledWith('1990-05-01');
    await waitFor(() => expect(screen.getByTestId('sensitive-revealed')).toBeInTheDocument());
    expect(screen.queryByRole('dialog')).toBeNull();
    // One HEAD for the original, with the viewer's token.
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(String(fetchSpy.mock.calls[0][0])).toContain('ft=ft1');
  });

  it('can be blurred again after revealing', async () => {
    api.getMyAge.mockResolvedValue(adult);
    render(sensitive());
    await act(async () => {
      fireEvent.click(screen.getByTestId('sensitive-cover'));
    });
    await waitFor(() => screen.getByTestId('sensitive-revealed'));
    fireEvent.click(screen.getByRole('button', { name: 'Blur this content again' }));
    expect(screen.getByTestId('sensitive-cover')).toBeInTheDocument();
  });

  it('a minor sees "not available" and nothing is fetched', async () => {
    api.getMyAge.mockResolvedValue({ ...unknownAge, birthYear: 2013, isAdult: false });
    render(sensitive());
    await act(async () => {
      fireEvent.click(screen.getByTestId('sensitive-cover'));
    });
    await waitFor(() =>
      expect(screen.getByTestId('sensitive-cover')).toHaveTextContent(
        'This content is not available for your account.'
      )
    );
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('cancelling the age dialog leaves the media covered', async () => {
    api.getMyAge.mockResolvedValue(unknownAge);
    render(sensitive());
    fireEvent.click(screen.getByTestId('sensitive-cover'));
    await screen.findByRole('dialog');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByTestId('sensitive-cover')).toHaveAttribute('data-state', 'covered');
    expect(api.putMyAge).not.toHaveBeenCalled();
  });

  it('a 403 moderation answer shows "Removed by moderators"', async () => {
    api.getMyAge.mockResolvedValue(adult);
    fetchSpy.mockResolvedValue(head(403, 'moderation'));
    render(sensitive());
    await act(async () => {
      fireEvent.click(screen.getByTestId('sensitive-cover'));
    });
    expect(await screen.findByTestId('media-removed')).toHaveTextContent('Removed by moderators');
  });

  it('a 403 age-required for an adult shows "not available", without looping', async () => {
    api.getMyAge.mockResolvedValue(adult);
    fetchSpy.mockResolvedValue(head(403, 'age-required'));
    render(sensitive());
    await act(async () => {
      fireEvent.click(screen.getByTestId('sensitive-cover'));
    });
    await waitFor(() =>
      expect(screen.getByTestId('sensitive-cover')).toHaveAttribute('data-state', 'unavailable')
    );
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('skips the age when the App has no age gate', async () => {
    api.getAppTrustSafety.mockResolvedValue({ enabled: true, ageGate: false });
    render(sensitive());
    await act(async () => {
      fireEvent.click(screen.getByTestId('sensitive-cover'));
    });
    await waitFor(() => screen.getByTestId('sensitive-revealed'));
    expect(api.getMyAge).not.toHaveBeenCalled();
  });

  it("covers the sender's own message too, and reveals it on tap without an age check", async () => {
    render(sensitive(), true);
    expect(screen.getByTestId('sensitive-cover')).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByTestId('sensitive-cover'));
    });
    await waitFor(() => screen.getByTestId('sensitive-revealed'));
    expect(api.getMyAge).not.toHaveBeenCalled();
  });
});

describe('an unflagged file the server refuses', () => {
  const RealImage = globalThis.Image;
  const RealFetch = globalThis.fetch;
  beforeEach(() => {
    resetFileAccessProbeCache();
    resetMediaProbeCaches();
    class FailingImage {
      onload: null | (() => void) = null;
      onerror: null | (() => void) = null;
      set src(_value: string) {
        setTimeout(() => this.onerror?.(), 0);
      }
    }
    globalThis.Image = FailingImage as unknown as typeof Image;
  });
  afterEach(() => {
    globalThis.Image = RealImage;
    globalThis.fetch = RealFetch;
  });

  // The media takes the same box covered and revealed (no jump in the chat).
  // jsdom does no layout, so the box is the frame's own sizing styles.
  const frameOf = (root: HTMLElement) => {
    const el = root.querySelector('[data-testid="media-surface"]') as HTMLElement | null;
    return el ? { width: el.style.width, aspectRatio: el.style.aspectRatio, minHeight: el.style.minHeight } : null;
  };
  const albumOf = (root: HTMLElement) => {
    const el = root.querySelector('[data-testid="album-grid"]') as HTMLElement | null;
    return el ? { layout: el.getAttribute('data-layout'), aspectRatio: getComputedStyle(el).aspectRatio } : null;
  };
  const revealThenHide = async () => {
    const covered = frameOf(screen.getByTestId('sensitive-in-place'));
    await act(async () => {
      fireEvent.click(screen.getByTestId('sensitive-cover'));
    });
    await waitFor(() => screen.getByTestId('sensitive-revealed'));
    const revealed = frameOf(screen.getByTestId('sensitive-revealed'));
    fireEvent.click(screen.getByRole('button', { name: 'Blur this content again' }));
    const coveredAgain = frameOf(screen.getByTestId('sensitive-in-place'));
    return { covered, revealed, coveredAgain };
  };

  it('keeps the box of a picture with known dimensions when revealed and hidden again', async () => {
    api.getMyAge.mockResolvedValue(adult);
    render(sensitive({ attachments: [{ location: ORIGINAL, locationPreview: PREVIEW, mimetype: 'image/png', originalName: 'a.png', width: 1200, height: 800 }] } as unknown as Partial<IMessage>));
    const { covered, revealed, coveredAgain } = await revealThenHide();
    expect(covered).not.toBeNull();
    expect(covered?.aspectRatio).toBe('560 / 373');
    expect(revealed).toEqual(covered);
    expect(coveredAgain).toEqual(covered);
  });

  it('a picture of unknown size is fitted into the box the cover had, not the other way round', async () => {
    api.getMyAge.mockResolvedValue(adult);
    render(sensitive());
    const { covered, revealed, coveredAgain } = await revealThenHide();
    expect(covered?.aspectRatio).toBe('560 / 420');
    expect(revealed).toEqual(covered);
    expect(coveredAgain).toEqual(covered);
  });

  it('keeps the box of a video', async () => {
    api.getMyAge.mockResolvedValue(adult);
    render(sensitive({ mimetype: 'video/mp4', location: 'https://secure-files.example.com/bucket/v.mp4', originalName: 'v.mp4' }));
    const { covered, revealed } = await revealThenHide();
    expect(covered?.aspectRatio).toBe('560 / 315');
    expect(revealed).toEqual(covered);
  });

  it('keeps the album layout', async () => {
    api.getMyAge.mockResolvedValue(adult);
    const album = [1, 2, 3].map((n) => ({
      location: `https://secure-files.example.com/bucket/p${n}.png`,
      locationPreview: `https://secure-files.example.com/bucket/p${n}-thumb.png`,
      mimetype: 'image/png',
      originalName: `p${n}.png`,
    }));
    render(sensitive({ attachments: album } as unknown as Partial<IMessage>));
    const covered = albumOf(screen.getByTestId('sensitive-in-place'));
    await act(async () => {
      fireEvent.click(screen.getByTestId('sensitive-cover'));
    });
    await waitFor(() => screen.getByTestId('sensitive-revealed'));
    expect(covered).not.toBeNull();
    expect(albumOf(screen.getByTestId('sensitive-revealed'))).toEqual(covered);
  });

  it('the covered layout never asks for the originals', () => {
    render(sensitive({ attachments: [{ location: ORIGINAL, locationPreview: PREVIEW, mimetype: 'image/png', originalName: 'a.png', width: 1200, height: 800 }] } as unknown as Partial<IMessage>));
    const srcs = Array.from(document.querySelectorAll('img, video, source')).map((el) => el.getAttribute('src') || '');
    expect(srcs.some((src) => src.includes('/a.png'))).toBe(false);
  });

  it('turns into the sensitive cover after one probe answers age-required', async () => {
    const fetchSpy = vi.fn(async () => head(403, 'age-required'));
    globalThis.fetch = fetchSpy as never;
    render(sensitive({ isSensitive: undefined }));
    expect(await screen.findByTestId('sensitive-cover')).toBeInTheDocument();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('shows "Removed by moderators" after one probe answers moderation', async () => {
    const fetchSpy = vi.fn(async () => head(403, 'moderation'));
    globalThis.fetch = fetchSpy as never;
    render(sensitive({ isSensitive: undefined }));
    expect(await screen.findByTestId('media-removed')).toBeInTheDocument();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});

describe('AgeDialog', () => {
  beforeEach(() => vi.clearAllMocks());

  it('validates the date of birth', () => {
    const now = new Date('2026-11-14T12:00:00Z');
    expect(isValidDateOfBirth('1990-02-28', now)).toBe(true);
    expect(isValidDateOfBirth('1990-02-30', now)).toBe(false);
    expect(isValidDateOfBirth('2030-01-01', now)).toBe(false);
    expect(isValidDateOfBirth('1850-01-01', now)).toBe(false);
    expect(isValidDateOfBirth('01/02/1990', now)).toBe(false);
  });

  it('explains a locked age (409 AGE_LOCKED)', async () => {
    api.putMyAge.mockRejectedValue({ response: { status: 409, data: { code: 'AGE_LOCKED' } } });
    const onDeclared = vi.fn();
    renderWithProviders(<AgeDialog onCancel={vi.fn()} onDeclared={onDeclared} />);
    fireEvent.change(screen.getByLabelText('Date of birth'), { target: { value: '1990-05-01' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    });
    expect(await screen.findByRole('alert')).toHaveTextContent('cannot be changed here');
    expect(onDeclared).not.toHaveBeenCalled();
  });

  it('shows the generic error for another failure', async () => {
    api.putMyAge.mockRejectedValue(new Error('network'));
    renderWithProviders(<AgeDialog onCancel={vi.fn()} onDeclared={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Date of birth'), { target: { value: '1990-05-01' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    });
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not save your date of birth');
  });

  it('is localised', () => {
    renderWithProviders(<AgeDialog onCancel={vi.fn()} onDeclared={vi.fn()} />, {
      preloadedState: { chatSettingStore: { config: { i18n: { locale: 'fr' } } } as never },
    });
    expect(screen.getByRole('dialog')).toHaveTextContent('Confirmez votre âge');
  });
});
