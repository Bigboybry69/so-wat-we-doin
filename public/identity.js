export function parseSignInCode(value) {
  const token = String(value || '').trim().replace(/^GRID-/i, '');
  if (!/^[A-Za-z0-9_-]{32,128}$/.test(token)) throw new Error('Paste the complete private sign-in code from your original device.');
  return token;
}
export const signInCode = token => 'GRID-' + token;
