// Regional ids (not bare 'en'/'es'/'fr') matching this deployment's actual
// reader regions - Canadian English/French, US Spanish. toBaseLanguage
// still reduces these to 'en'/'es'/'fr' for i18n string-table lookups and
// translation-language comparisons, so nothing downstream needed a change
// to keep resolving correctly.
export const LANGUAGE_OPTIONS = [
  { name: 'English', id: 'en-CA' },
  { name: 'Spanish', id: 'es-US' },
  // { name: 'Portuguese', id: 'pt' },
  { name: 'Français', id: 'fr-CA' },
  // { name: 'Haitian Creole', id: 'ht' },
  // { name: 'Chinese', id: 'zh' },
];
