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
vi.mock('../../roomStore', () => ({
  store: {
    getState: () => ({ chatSettingStore: { user: { token: 'tok' } } }),
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
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

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
