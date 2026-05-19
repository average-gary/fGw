/**
 * Tiny class-name helper — no clsx dependency.
 *
 * Accepts strings, falsy values, arrays, or objects whose keys are class
 * names and values are booleans. Returns a single space-separated string.
 *
 * Examples:
 *   cn('a', cond && 'b')                  // 'a b' or 'a'
 *   cn('a', { b: true, c: false })        // 'a b'
 *   cn(['a', null, 'b'])                  // 'a b'
 */
export type ClassValue =
  | string
  | number
  | null
  | undefined
  | false
  | ClassValue[]
  | { [key: string]: boolean | null | undefined };

export function cn(...inputs: ClassValue[]): string {
  const out: string[] = [];
  const walk = (v: ClassValue): void => {
    if (!v) return;
    if (typeof v === 'string' || typeof v === 'number') {
      out.push(String(v));
      return;
    }
    if (Array.isArray(v)) {
      for (const item of v) walk(item);
      return;
    }
    if (typeof v === 'object') {
      for (const key of Object.keys(v)) {
        if (v[key]) out.push(key);
      }
    }
  };
  for (const input of inputs) walk(input);
  return out.join(' ');
}

export default cn;
