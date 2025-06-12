export function findError(node: Element): {
  hasError: boolean;
  errorText: string | null;
} {
  if (node.tagName === 'error') {
    const text = node.textContent?.trim() || null;
    return { hasError: true, errorText: text };
  }
  for (let i = 0; i < node.children.length; i++) {
    const result = findError(node.children[i]);
    if (result.hasError) return result;
  }
  return { hasError: false, errorText: null };
}
