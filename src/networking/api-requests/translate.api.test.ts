import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('../apiClient', () => ({ default: { post: vi.fn() } }));

import http from '../apiClient';
import {
  fetchMessageTranslations,
  resetTranslateEndpointAvailabilityForTests,
} from './translate.api';

const postMock = http.post as ReturnType<typeof vi.fn>;

// The pre-translate request is awaited on the SEND path (see
// sendTextMessageWithTranslateTagStanza) - every wasted round trip here is
// latency the user feels on every message they send. On backends without
// the endpoint deployed (404, as on chat-qa) it must give up after the
// first attempt for the rest of the session.
describe('fetchMessageTranslations', () => {
  beforeEach(() => {
    postMock.mockReset();
    resetTranslateEndpointAvailabilityForTests();
  });

  it('returns the translated entries on success', async () => {
    postMock.mockResolvedValue({
      data: {
        translates: [
          { language: 'pt', languageName: 'Portuguese', translatedText: 'olá' },
        ],
      },
    });

    const result = await fetchMessageTranslations('hello', 'en', ['pt']);

    expect(result).toEqual([
      { language: 'pt', languageName: 'Portuguese', translatedText: 'olá' },
    ]);
  });

  it('sends the request with a hard timeout so a slow translator cannot stall sends', async () => {
    postMock.mockResolvedValue({ data: { translates: [] } });

    await fetchMessageTranslations('hello', 'en', ['pt']);

    const config = postMock.mock.calls[0][2];
    expect(config.timeout).toBeGreaterThan(0);
  });

  it('after a 404, never hits the endpoint again this session', async () => {
    postMock.mockRejectedValue({ response: { status: 404 } });

    expect(await fetchMessageTranslations('hello', 'en', ['pt'])).toEqual([]);
    expect(await fetchMessageTranslations('again', 'en', ['pt'])).toEqual([]);
    expect(await fetchMessageTranslations('and again', 'en', ['pt'])).toEqual([]);

    expect(postMock).toHaveBeenCalledTimes(1);
  });

  it('a transient (non-404) failure does NOT disable the endpoint - the next send retries', async () => {
    postMock.mockRejectedValueOnce(new Error('timeout')).mockResolvedValueOnce({
      data: {
        translates: [
          { language: 'pt', languageName: 'Portuguese', translatedText: 'olá' },
        ],
      },
    });

    expect(await fetchMessageTranslations('hello', 'en', ['pt'])).toEqual([]);
    expect(await fetchMessageTranslations('hello', 'en', ['pt'])).toHaveLength(1);

    expect(postMock).toHaveBeenCalledTimes(2);
  });

  it('skips the request entirely for empty input', async () => {
    expect(await fetchMessageTranslations('', 'en', ['pt'])).toEqual([]);
    expect(await fetchMessageTranslations('hello', '', ['pt'])).toEqual([]);
    expect(await fetchMessageTranslations('hello', 'en', [])).toEqual([]);
    expect(postMock).not.toHaveBeenCalled();
  });
});
