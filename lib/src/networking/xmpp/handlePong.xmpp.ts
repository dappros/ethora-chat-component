export function isPong(stanza: any, pingId: string): boolean {
  return (
    stanza.is('iq') &&
    stanza.attrs.id === pingId &&
    stanza.attrs.type === 'result'
  );
}
