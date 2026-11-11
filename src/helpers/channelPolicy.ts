import type { ChatChannelPolicy } from '../types/models/room.model';

export function canPublishToChannel(policy: ChatChannelPolicy | undefined, roomJid: string | null | undefined, username?: string) {
  if (!policy?.readOnly) return true;
  const appId = roomJid?.split('_')[0];
  const local = username?.split('@')[0] || '';
  if (!appId) return false;
  if (local === 'admin' || local === `${appId}_${appId}` || (local && local === policy.ownerXmppUsername)) return true;
  const prefix = `${appId}_owner-`;
  return local.startsWith(prefix) && /^[a-f0-9]{24}$/.test(local.slice(prefix.length));
}
