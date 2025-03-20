import { store } from '../../roomStore';
import { ApiRoom, PostRoom } from '../../types/types';
import http from '../apiClient';

export async function getRooms(): Promise<{ items: ApiRoom[] }> {
  const token = store.getState().chatSettingStore.user.token || '';

  try {
    const response = await http.get('/chats/my', {
      headers: {
        Authorization: token,
      },
    });
    return response.data;
  } catch (error) {
    throw new Error('Error updating profile');
  }
}

export async function postRoom(data: PostRoom) {
  const token = store.getState().chatSettingStore.user.token || '';

  try {
    const response = await http.post('/chats', data, {
      headers: {
        Authorization: token,
      },
    });
    return response.data.result;
  } catch (error) {
    throw new Error('Error updating profile');
  }
}

//{
//   "result": {
//     "name": "67d3cc45b5018b9872c16a0b_67dc3cbf30bbb44f97eed004",
//     "isAppChat": false,
//     "title": "New room, cc",
//     "description": "No description",
//     "type": "public",
//     "picture": "https://dev.files.platform.atomwcapps.com/files/9a1f8037c37f8ccabc7ccfaca16f9332.jpg",
//     "createdBy": "67d3cde6b5018b9872c16ac4",
//     "appId": "67d3cc45b5018b9872c16a0b",
//     "_id": "67dc3cbf30bbb44f97eed006",
//     "createdAt": "2025-03-20T16:05:19.920Z",
//     "updatedAt": "2025-03-20T16:05:19.920Z",
//     "__v": 0
// }
// }
