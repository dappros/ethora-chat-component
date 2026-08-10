import http from '../apiClient';
import { store } from '../../roomStore';
import { User } from '../../types/types';

interface GetMyUserOptions {
  token?: string;
  endpoint?: string;
}

export function getDocuments(walletAddress: string) {
  const token = store.getState().chatSettingStore.user.token || '';
  return http.get(`/v1/docs/${walletAddress}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

export function getExportMyData() {
  const token = store.getState().chatSettingStore.user.token || '';
  return http.get('/v1/users/exportData', {
    headers: {
      Authorization: token,
      responseType: 'arraybuffer',
    },
  });
}

export function deleteMe() {
  return http.delete('/v1/users');
}

export function updateMe(data: any) {
  return http.put('/v1/users', data);
}

export async function updateProfile(fd: FormData): Promise<{ user: User }> {
  const token = store.getState().chatSettingStore.user.token || '';

  try {
    const response = await http.put('/v1/users', fd, {
      headers: {
        Authorization: token,
      },
    });
    return response.data;
  } catch (error) {
    throw new Error('Error updating profile');
  }
}

export async function getMyUser(
  options?: GetMyUserOptions
): Promise<User> {
  const token = options?.token || store.getState().chatSettingStore.user.token || '';
  const endpoint = options?.endpoint || '/v1/users/my';

  const response = await http.get(endpoint, {
    headers: {
      Authorization: token,
    },
  });

  if (response?.data?.user) {
    return response.data.user as User;
  }

  return response.data as User;
}
