// Board names: 2 to 14 letters, digits, spaces and a little punctuation. Shared by page and server.

export const NAME_MAX = 14;

export function cleanName(v: unknown): string {
  const s = String(v ?? '')
    .replace(/[^A-Za-z0-9 _.\-]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, NAME_MAX)
    .trim();
  return s.length >= 2 ? s : 'Climber';
}
