import { describe, expect, it, vi, beforeEach } from 'vitest';

// Covers the temporary /v2/files/secure -> /v1/files shim in auth.api:
// not every backend serves the secure, chat-scoped upload route, so a
// failed attempt has to retry against the legacy one (which must NOT see
// the `chatName` field the secure route requires).

const postMock = vi.fn();

vi.mock('../apiClient', () => ({
  default: { post: (...args: any[]) => postMock(...args), get: vi.fn() },
  appToken: 'app-token',
}));
// Mutable so each test can pick a `config.uploads.endpoint` mode.
const storeState = vi.hoisted(() => ({ config: undefined as unknown }));
vi.mock('../../roomStore', () => ({
  store: {
    getState: () => ({
      chatSettingStore: { user: { token: 'tok' }, config: storeState.config },
    }),
  },
}));
vi.mock('./user.api', () => ({ getMyUser: vi.fn() }));
// auth.api pulls in the firebase SDK at module scope purely for the Google
// sign-in helper; none of that is involved in an upload.
vi.mock('../../firebase-config', () => ({ app: null }));
vi.mock('firebase/auth', () => ({
  getAuth: vi.fn(),
  GoogleAuthProvider: class {
    addScope() {}
  },
  signInWithPopup: vi.fn(),
}));

const ROOM_JID = 'room-id@conference.xmpp.example.com';

// `secureUploadUnavailable` is module state that survives the first
// failure by design, so every test needs a fresh copy of the module.
const loadUploadFile = async () => {
  vi.resetModules();
  return (await import('./auth.api')).uploadFile;
};

const makeFormData = () => {
  const formData = new FormData();
  formData.append('files', new Blob(['x']), 'photo.png');
  return formData;
};

const httpError = (status: number) => ({ response: { status } });

beforeEach(() => {
  postMock.mockReset();
  storeState.config = undefined;
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

const useEndpoint = (endpoint: 'auto' | 'secure' | 'legacy') => {
  storeState.config = { uploads: { endpoint } };
};

describe('uploadFile - secure/legacy endpoint fallback', () => {
  it('uses /v2/files/secure with the chat name derived from the JID', async () => {
    const uploadFile = await loadUploadFile();
    postMock.mockResolvedValue({ data: { results: [{ location: 'u' }] } });

    await uploadFile(makeFormData(), ROOM_JID);

    expect(postMock).toHaveBeenCalledTimes(1);
    const [endpoint, body] = postMock.mock.calls[0];
    expect(endpoint).toBe('/v2/files/secure');
    expect((body as FormData).get('chatName')).toBe('room-id');
    expect((body as FormData).get('files')).toBeTruthy();
  });

  it('retries against /v1/files without chatName when the secure route 404s', async () => {
    const uploadFile = await loadUploadFile();
    const legacyResponse = { data: { results: [{ location: 'legacy' }] } };
    postMock
      .mockRejectedValueOnce(httpError(404))
      .mockResolvedValueOnce(legacyResponse);

    const result = await uploadFile(makeFormData(), ROOM_JID);

    expect(result).toBe(legacyResponse);
    expect(postMock).toHaveBeenCalledTimes(2);
    const [endpoint, body] = postMock.mock.calls[1];
    expect(endpoint).toBe('/v1/files/');
    expect((body as FormData).get('chatName')).toBeNull();
    // The file itself must survive into the retry.
    expect((body as FormData).get('files')).toBeTruthy();
  });

  it('falls back when the secure route fails with no response at all (CORS/network)', async () => {
    const uploadFile = await loadUploadFile();
    postMock
      .mockRejectedValueOnce(new Error('Network Error'))
      .mockResolvedValueOnce({ data: { results: [] } });

    await uploadFile(makeFormData(), ROOM_JID);

    expect(postMock.mock.calls[1][0]).toBe('/v1/files/');
  });

  it('stops probing the secure route after the first failure', async () => {
    const uploadFile = await loadUploadFile();
    postMock
      .mockRejectedValueOnce(httpError(404))
      .mockResolvedValue({ data: { results: [] } });

    await uploadFile(makeFormData(), ROOM_JID);
    postMock.mockClear();
    await uploadFile(makeFormData(), ROOM_JID);

    expect(postMock).toHaveBeenCalledTimes(1);
    expect(postMock.mock.calls[0][0]).toBe('/v1/files/');
  });

  it('rethrows a 401 instead of retrying - that is the refresh interceptor s job', async () => {
    const uploadFile = await loadUploadFile();
    postMock.mockRejectedValueOnce(httpError(401));

    await expect(uploadFile(makeFormData(), ROOM_JID)).rejects.toMatchObject({
      response: { status: 401 },
    });
    expect(postMock).toHaveBeenCalledTimes(1);
  });

  it('rethrows a 413 - an oversized file fails the same way on either route', async () => {
    const uploadFile = await loadUploadFile();
    postMock.mockRejectedValueOnce(httpError(413));

    await expect(uploadFile(makeFormData(), ROOM_JID)).rejects.toMatchObject({
      response: { status: 413 },
    });
    expect(postMock).toHaveBeenCalledTimes(1);
  });
});

describe('uploadFile - clientEncrypted flag', () => {
  it('flags the secure route so the backend stores the ciphertext verbatim', async () => {
    const uploadFile = await loadUploadFile();
    postMock.mockResolvedValue({ data: { results: [{ location: 'u' }] } });

    await uploadFile(makeFormData(), ROOM_JID, { clientEncrypted: true });

    const [endpoint, body] = postMock.mock.calls[0];
    expect(endpoint).toBe('/v2/files/secure');
    expect((body as FormData).get('clientEncrypted')).toBe('true');
  });

  it('carries the flag onto the legacy route too', async () => {
    // The flag is appended before the secure/legacy split, so a backend old
    // enough to lack /v2/files/secure still gets told not to build a preview
    // from bytes it cannot read.
    const uploadFile = await loadUploadFile();
    postMock
      .mockRejectedValueOnce(httpError(404))
      .mockResolvedValueOnce({ data: { results: [{ location: 'legacy' }] } });

    await uploadFile(makeFormData(), ROOM_JID, { clientEncrypted: true });

    expect(postMock).toHaveBeenCalledTimes(2);
    const [endpoint, body] = postMock.mock.calls[1];
    expect(endpoint).toBe('/v1/files/');
    expect((body as FormData).get('clientEncrypted')).toBe('true');
    expect((body as FormData).get('chatName')).toBeNull();
  });

  it('sends no flag at all for an ordinary upload', async () => {
    const uploadFile = await loadUploadFile();
    postMock.mockResolvedValue({ data: { results: [{ location: 'u' }] } });

    await uploadFile(makeFormData(), ROOM_JID, { clientEncrypted: false });

    const [, body] = postMock.mock.calls[0];
    expect((body as FormData).get('clientEncrypted')).toBeNull();
  });
});

describe('uploadFile - config.uploads.endpoint', () => {
  it("'legacy' posts straight to /v1/files/ without chatName and never calls the secure route", async () => {
    useEndpoint('legacy');
    const uploadFile = await loadUploadFile();
    const legacyResponse = { data: { results: [{ location: 'legacy' }] } };
    postMock.mockResolvedValue(legacyResponse);

    const result = await uploadFile(makeFormData(), ROOM_JID);

    expect(result).toBe(legacyResponse);
    expect(postMock).toHaveBeenCalledTimes(1);
    const [endpoint, body] = postMock.mock.calls[0];
    expect(endpoint).toBe('/v1/files/');
    expect((body as FormData).get('chatName')).toBeNull();
    expect((body as FormData).get('files')).toBeTruthy();
  });

  it("'legacy' does not retry or touch the secure route when the legacy upload fails", async () => {
    useEndpoint('legacy');
    const uploadFile = await loadUploadFile();
    postMock.mockRejectedValueOnce(httpError(500));

    await expect(uploadFile(makeFormData(), ROOM_JID)).rejects.toMatchObject({
      response: { status: 500 },
    });
    expect(postMock).toHaveBeenCalledTimes(1);
    expect(postMock.mock.calls[0][0]).toBe('/v1/files/');
  });

  it("'legacy' keeps the clientEncrypted flag", async () => {
    useEndpoint('legacy');
    const uploadFile = await loadUploadFile();
    postMock.mockResolvedValue({ data: { results: [{ location: 'l' }] } });

    await uploadFile(makeFormData(), ROOM_JID, { clientEncrypted: true });

    const [, body] = postMock.mock.calls[0];
    expect((body as FormData).get('clientEncrypted')).toBe('true');
  });

  it("'secure' uses the secure route with chatName and returns its result", async () => {
    useEndpoint('secure');
    const uploadFile = await loadUploadFile();
    const secureResponse = { data: { results: [{ location: 'secure' }] } };
    postMock.mockResolvedValue(secureResponse);

    const result = await uploadFile(makeFormData(), ROOM_JID);

    expect(result).toBe(secureResponse);
    expect(postMock).toHaveBeenCalledTimes(1);
    const [endpoint, body] = postMock.mock.calls[0];
    expect(endpoint).toBe('/v2/files/secure');
    expect((body as FormData).get('chatName')).toBe('room-id');
  });

  it("'secure' rethrows a 404 instead of falling back to /v1/files/", async () => {
    useEndpoint('secure');
    const uploadFile = await loadUploadFile();
    postMock.mockRejectedValue(httpError(404));

    await expect(uploadFile(makeFormData(), ROOM_JID)).rejects.toMatchObject({
      response: { status: 404 },
    });
    expect(postMock).toHaveBeenCalledTimes(1);
    expect(postMock.mock.calls[0][0]).toBe('/v2/files/secure');
  });

  it("'secure' keeps probing the secure route on every upload (no session latch)", async () => {
    useEndpoint('secure');
    const uploadFile = await loadUploadFile();
    postMock.mockRejectedValue(httpError(404));

    await expect(uploadFile(makeFormData(), ROOM_JID)).rejects.toBeTruthy();
    await expect(uploadFile(makeFormData(), ROOM_JID)).rejects.toBeTruthy();

    expect(postMock).toHaveBeenCalledTimes(2);
    expect(postMock.mock.calls.every(([endpoint]) => endpoint === '/v2/files/secure')).toBe(true);
  });

  it("an unknown value behaves like 'auto' and still falls back", async () => {
    storeState.config = { uploads: { endpoint: 'bogus' } };
    const uploadFile = await loadUploadFile();
    postMock
      .mockRejectedValueOnce(httpError(404))
      .mockResolvedValueOnce({ data: { results: [] } });

    await uploadFile(makeFormData(), ROOM_JID);

    expect(postMock.mock.calls[1][0]).toBe('/v1/files/');
  });
});
