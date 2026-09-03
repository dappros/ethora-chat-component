import { useSyncExternalStore } from 'react';
import { useSelector } from 'react-redux';
import { RootState } from '../roomStore';
import {
  FilesEndpointSupport,
  getFilesEndpointSupport,
  subscribeFilesEndpointSupport,
} from '../networking/api-requests/files.api';

/**
 * Whether the current user's backend actually has /v2/files. Starts
 * 'unknown' and flips to 'supported'/'unsupported' the first time a real
 * files list request resolves (see files.api.ts) - there's no separate probe
 * request, this just observes the outcome of whatever the Files panel itself
 * already does.
 */
export function useFilesEndpointSupport(): FilesEndpointSupport {
  const token = useSelector(
    (state: RootState) => state.chatSettingStore.user?.token || ''
  );

  return useSyncExternalStore(
    subscribeFilesEndpointSupport,
    () => getFilesEndpointSupport(token),
    () => 'unknown'
  );
}
