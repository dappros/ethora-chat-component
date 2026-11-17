import type { Element } from 'ltx';
import { store } from '../roomStore';
import { applyTranslationUpdate } from '../roomStore/roomsSlice';
import {
  parseTranslationsValue,
  TRANSLATE_NS,
} from '../helpers/transformTranslatations';

export const onTranslationUpdate = (stanza: Element): boolean => {
  if (stanza?.name !== 'message' || stanza.attrs?.type !== 'headline') {
    return false;
  }
  const update = stanza.getChild?.('translation-update', TRANSLATE_NS);
  if (!update) return false;

  const roomJID = String(stanza.attrs?.from || '');
  if (!roomJID || roomJID.includes('/')) return true;
  if (!store.getState().rooms?.rooms?.[roomJID]) return true;

  const ids = [update.attrs?.id, update.attrs?.xmppId].filter(
    (value): value is string => typeof value === 'string' && value !== ''
  );
  if (!ids.length) return true;

  const translations =
    update.attrs?.status === 'done'
      ? parseTranslationsValue(update.attrs?.value)
      : undefined;

  store.dispatch(applyTranslationUpdate({ roomJID, ids, translations }));
  return true;
};
