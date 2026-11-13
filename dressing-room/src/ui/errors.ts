import { isQuotaError } from '../db/schema';
import { he } from '../i18n/he';
import { ImageError } from '../imaging/load';
import { ImportError } from '../import/sources';

/** Friendly Hebrew message for anything thrown by file / network / storage code. */
export function errorText(e: unknown, fallback: string = he.errors.generic): string {
  if (e instanceof ImportError) return he.errors[e.code];
  if (e instanceof ImageError) return he.errors[e.code];
  if (isQuotaError(e)) return he.errors.quota;
  return fallback;
}
