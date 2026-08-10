# Ethora chat: i18n + message translation

Two independent features, configured entirely through the chat config object.

1. **Static UI i18n** - interface captions ("Search...", "Type message", "Translate", etc.) in the user's language.
2. **Dynamic message translation** - an on-demand "Translate" link under a message, wired to *your* translation service.

Both are driven by the locale you already know on the client (the device language, e.g. `en-CA`, `fr-CA`, `es-US`).

---

## 1. Static UI i18n

Pass the device/user locale. Captions resolve to the base language (`fr-CA` -> `fr`). Built-in languages: **en, fr, es**.

```ts
const config = {
  // ...existing config...
  i18n: {
    locale: navigator.language, // "en-CA" | "fr-CA" | "es-US" | ...
  },
};
```

### Override or add strings

Any caption can be overridden by key. This is also how you localize a language we don't ship yet (pass `locale` + a full `strings` map).

```ts
i18n: {
  locale: 'fr-CA',
  strings: {
    'input.placeholder': 'Écrire à votre praticien…',
    'action.translate': 'Traduire',
  },
},
```

Common keys: `search.placeholder`, `input.placeholder`, `room.created`, `room.empty`, `presence.online`, `presence.offline`, `action.translate`, `action.showOriginal`, `action.send`, `action.cancel`, `action.submit`, `status.connecting`, `status.noInternet`. Full list in `src/i18n/strings.ts`.

---

## 2. Dynamic message translation (your endpoint)

The reader sees a **Translate** link under an incoming message in a different language. On click, the component calls your `onTranslate` function and renders the result inline with a **Show original** toggle.

```ts
translates: {
  enabled: true,
  mode: 'on-demand',            // 'auto' = translate inline automatically instead
  readerLocale: navigator.language, // full locale, e.g. "fr-CA" (region matters below)

  // Your service. Called only when the user clicks Translate.
  onTranslate: async (text, { sourceLocale, targetLocale }) => {
    const res = await fetch('https://your-api.example.com/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        q: text,
        source: sourceLocale, // message language, may be undefined
        target: targetLocale, // e.g. "fr-CA" vs "fr-FR" — your service decides the variant
      }),
    });
    const data = await res.json();
    return data.translatedText;
  },
},
```

- `sourceLocale` comes from the message (its stored source language).
- `targetLocale` is the reader's **full** locale, so your service can pick **fr-CA vs fr-FR**.
- Return the translated string. Throw to show a retry ("Could not translate").

### When to show the Translate link

By default the component shows it when the message's **base** language differs from the reader's base language, so **en-US vs en-CA does NOT show it** (region ignored for the decision). The full locale is still forwarded to `onTranslate`.

If you prefer to keep that logic on your side and just tell us yes/no, provide a predicate:

```ts
translates: {
  enabled: true,
  mode: 'on-demand',
  readerLocale: navigator.language,
  onTranslate,                              // as above
  showTranslateForMessage: (message) => shouldTranslate(message), // your call
},
```

The predicate wins over the built-in comparison, so you fully control visibility (e.g. compare stored message locale vs device locale with your own rules).

---

## Storing the message language

For the Translate decision and target selection to work, each stored message should carry its source language. The component reads it from the message's `langSource` field (base language or full locale). Make sure your send path / backend stamps the sender's language onto the message.

---

## Swapping Google / OpenAI / your service

`onTranslate` is just a function - point it at anything. Examples:

```ts
// Google Cloud Translation v2
onTranslate: async (text, { targetLocale }) => {
  const r = await fetch(
    `https://translation.googleapis.com/language/translate/v2?key=${KEY}`,
    { method: 'POST', body: JSON.stringify({ q: text, target: targetLocale.split('-')[0] }) }
  );
  return (await r.json()).data.translations[0].translatedText;
},

// OpenAI
onTranslate: async (text, { targetLocale }) => {
  const r = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: `Translate to ${targetLocale}. Return only the translation.` },
      { role: 'user', content: text },
    ],
  });
  return r.choices[0].message.content ?? '';
},
```

If you omit `onTranslate`, the component falls back to translations the backend already attached to the message (`message.translations`).
