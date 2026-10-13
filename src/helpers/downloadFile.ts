import { isSecureFileUrl, requestFileTokenRecovery } from './secureFileUrl';

export type DownloadResult =
  | 'blob'
  | 'direct'
  | 'http-error';

export interface DownloadDeps {
  fetchImpl?: typeof fetch;
  /** Hands a blob to the browser as a download. */
  saveBlob?: (blob: Blob, fileName: string) => void;
  /** Hands a plain URL to the browser as a download / new tab. */
  saveUrl?: (url: string, fileName: string) => void;
}

const clickAnchor = (href: string, fileName: string, newTab: boolean) => {
  const anchor = document.createElement('a');
  anchor.href = href;
  anchor.setAttribute('download', fileName);
  if (newTab) {
    anchor.target = '_blank';
    anchor.rel = 'noopener';
  }
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
};

const defaultSaveBlob = (blob: Blob, fileName: string) => {
  const objectUrl = URL.createObjectURL(blob);
  try {
    clickAnchor(objectUrl, fileName, false);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
};

// A cross-origin anchor ignores `download` and navigates, so open it in a
// new tab rather than replacing the chat.
const defaultSaveUrl = (url: string, fileName: string) =>
  clickAnchor(url, fileName, true);

/**
 * Saves a media file. The blob route is preferred (it keeps the user's file
 * name), but it needs CORS: <img>/<video>/<a> to a host such as
 * secure-files.* never did, so a host without Access-Control-Allow-Origin
 * makes fetch() reject with a bare TypeError. That says nothing about the
 * file, so fall back to handing the URL to the browser directly.
 *
 * A reachable server that answers with an error status is different: its
 * body is an error page, not the file, so nothing is saved.
 */
export async function downloadFile(
  url: string,
  fileName: string,
  deps: DownloadDeps = {}
): Promise<DownloadResult> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const saveBlob = deps.saveBlob ?? defaultSaveBlob;
  const saveUrl = deps.saveUrl ?? defaultSaveUrl;

  let response: Response;
  try {
    response = await fetchImpl(url, { method: 'GET' });
  } catch {
    saveUrl(url, fileName);
    return 'direct';
  }

  if (!response.ok) {
    if (isSecureFileUrl(url) && (response.status === 401 || response.status === 403)) {
      void requestFileTokenRecovery();
    }
    return 'http-error';
  }

  saveBlob(new Blob([await response.arrayBuffer()]), fileName);
  return 'blob';
}
