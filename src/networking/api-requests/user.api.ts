import http from '../apiClient';
import { store } from '../../roomStore';

export function getDocuments(walletAddress: string) {
  const token = store.getState().chatSettingStore.user.token || '';
  return http.get(`/docs/${walletAddress}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

export function getExportMyData() {
  const token = store.getState().chatSettingStore.user.token || '';
  return http.get('/users/exportData', {
    headers: {
      Authorization: token,
      responseType: 'arraybuffer',
    },
  });
}

export function deleteMe() {
  return http.delete('/users');
}

export function updateMe(data: any) {
  return http.put('/users', data);
}
