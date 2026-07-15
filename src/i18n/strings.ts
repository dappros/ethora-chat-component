// Static UI i18n for the chat component.
//
// Design: a built-in flat string table per base language (no external i18n
// dependency, so SDK consumers don't have to install/configure anything). The
// host selects a language by passing `config.i18n.locale` (a BCP-47 tag like
// "en", "en-CA", "fr-CA", "es-US"); we resolve it down to the base language
// for UI captions (region only matters for message translation, not labels).
// The host can override or extend any string via `config.i18n.strings`.
//
// Keys use dotted namespaces and `{var}` placeholders. Use the `useT()` hook
// (see ./useT) inside components; call `resolveStringTable()` directly in
// non-React helpers.

export type UiStringTable = Record<string, string>;

const en: UiStringTable = {
  'search.placeholder': 'Search...',
  'input.placeholder': 'Type message',
  'room.created': 'Room created',
  'room.empty': 'This chat is empty',
  'presence.online': 'online',
  'presence.offline': 'offline',
  'presence.onlineCount': '{count} online',
  'call.outgoing': 'Outgoing call',
  'call.incoming': 'Incoming call',
  'call.noAnswer': 'No answer',
  'call.missed': 'Missed call',
  'call.durationSec': '{n} sec',
  'call.durationMin': '{n} min',
  'call.durationMinSec': '{m} min {s} sec',
  'action.send': 'Send',
  'action.cancel': 'Cancel',
  'action.save': 'Save',
  'action.delete': 'Delete',
  'action.leave': 'Leave',
  'action.create': 'Create',
  'action.submit': 'Submit',
  'action.translate': 'Translate',
  'action.showOriginal': 'Show original',
  'action.newChat': 'New chat',
  'status.connecting': 'Connecting…',
  'status.noInternet': 'No internet connection',
  'translation.translating': 'Translating…',
  'translation.failed': 'Could not translate',
  'translation.fromLanguage': 'Translated from {language}',
  'translation.generic': 'Translated',
};

const fr: UiStringTable = {
  'search.placeholder': 'Rechercher...',
  'input.placeholder': 'Écrire un message',
  'room.created': 'Salon créé',
  'room.empty': 'Ce salon est vide',
  'presence.online': 'en ligne',
  'presence.offline': 'hors ligne',
  'presence.onlineCount': '{count} en ligne',
  'call.outgoing': 'Appel sortant',
  'call.incoming': 'Appel entrant',
  'call.noAnswer': 'Pas de réponse',
  'call.missed': 'Appel manqué',
  'call.durationSec': '{n} s',
  'call.durationMin': '{n} min',
  'call.durationMinSec': '{m} min {s} s',
  'action.send': 'Envoyer',
  'action.cancel': 'Annuler',
  'action.save': 'Enregistrer',
  'action.delete': 'Supprimer',
  'action.leave': 'Quitter',
  'action.create': 'Créer',
  'action.submit': 'Soumettre',
  'action.translate': 'Traduire',
  'action.showOriginal': "Afficher l'original",
  'action.newChat': 'Nouvelle discussion',
  'status.connecting': 'Connexion…',
  'status.noInternet': 'Pas de connexion internet',
  'translation.translating': 'Traduction…',
  'translation.failed': 'Traduction impossible',
  'translation.fromLanguage': 'Traduit de {language}',
  'translation.generic': 'Traduit',
};

const es: UiStringTable = {
  'search.placeholder': 'Buscar...',
  'input.placeholder': 'Escribe un mensaje',
  'room.created': 'Sala creada',
  'room.empty': 'Este chat está vacío',
  'presence.online': 'en línea',
  'presence.offline': 'desconectado',
  'presence.onlineCount': '{count} en línea',
  'call.outgoing': 'Llamada saliente',
  'call.incoming': 'Llamada entrante',
  'call.noAnswer': 'Sin respuesta',
  'call.missed': 'Llamada perdida',
  'call.durationSec': '{n} s',
  'call.durationMin': '{n} min',
  'call.durationMinSec': '{m} min {s} s',
  'action.send': 'Enviar',
  'action.cancel': 'Cancelar',
  'action.save': 'Guardar',
  'action.delete': 'Eliminar',
  'action.leave': 'Salir',
  'action.create': 'Crear',
  'action.submit': 'Enviar',
  'action.translate': 'Traducir',
  'action.showOriginal': 'Ver original',
  'action.newChat': 'Nuevo chat',
  'status.connecting': 'Conectando…',
  'status.noInternet': 'Sin conexión a internet',
  'translation.translating': 'Traduciendo…',
  'translation.failed': 'No se pudo traducir',
  'translation.fromLanguage': 'Traducido de {language}',
  'translation.generic': 'Traducido',
};

// Built-in tables keyed by base language. Add a language here (plus the code
// in language.model.ts if it should also be a message-translation target).
export const BUILTIN_STRINGS: Record<string, UiStringTable> = { en, fr, es };

export const DEFAULT_UI_LANGUAGE = 'en';

/** Reduce a BCP-47 locale ("fr-CA") to its base language ("fr"), lowercased. */
export const toBaseLanguage = (locale?: string | null): string =>
  String(locale || DEFAULT_UI_LANGUAGE)
    .split('-')[0]
    .trim()
    .toLowerCase() || DEFAULT_UI_LANGUAGE;

/**
 * Build the effective string table for a locale: the built-in table for that
 * base language (falling back to English for any missing key), with host
 * overrides from `config.i18n.strings` merged on top.
 */
export const resolveStringTable = (
  locale?: string | null,
  overrides?: UiStringTable | null
): UiStringTable => {
  const base = toBaseLanguage(locale);
  const table = BUILTIN_STRINGS[base] || BUILTIN_STRINGS[DEFAULT_UI_LANGUAGE];
  return {
    ...BUILTIN_STRINGS[DEFAULT_UI_LANGUAGE],
    ...table,
    ...(overrides || {}),
  };
};

/** Replace `{name}` placeholders with values from `vars`. */
export const interpolate = (
  template: string,
  vars?: Record<string, string | number>
): string => {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, k) =>
    k in vars ? String(vars[k]) : `{${k}}`
  );
};

/** One-shot translate for non-React code (helpers). */
export const translateKey = (
  key: string,
  locale?: string | null,
  overrides?: UiStringTable | null,
  vars?: Record<string, string | number>
): string => {
  const table = resolveStringTable(locale, overrides);
  return interpolate(table[key] ?? key, vars);
};
