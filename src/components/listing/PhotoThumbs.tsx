/**
 * SPEC-019 — photo thumbnail grid for the New Listing form.
 *
 * Renders attached photos as a 3-col aspect-square grid with a small remove
 * button overlay. Disabled mode hides the remove button (read-only views).
 */
import { cn } from '@/lib/cn';
import type { PhotoRef } from '@/lib/listings/types';

export interface PhotoThumbsProps {
  photos: PhotoRef[];
  onRemove: (sha256: string) => void;
  disabled?: boolean;
}

export function PhotoThumbs({ photos, onRemove, disabled }: PhotoThumbsProps) {
  if (photos.length === 0) return null;
  return (
    <ul className="mt-2 grid grid-cols-3 gap-2" aria-label="Attached photos">
      {photos.map((p) => (
        <li
          key={p.sha256}
          className="relative aspect-square overflow-hidden rounded-card border border-soil-200 bg-soil-100"
        >
          <img
            src={p.url}
            alt=""
            className="h-full w-full object-cover"
            loading="lazy"
          />
          {!disabled && (
            <button
              type="button"
              aria-label="Remove photo"
              onClick={() => onRemove(p.sha256)}
              className={cn(
                'absolute right-1 top-1 inline-flex h-6 w-6 items-center justify-center',
                'rounded-full bg-soil-900/70 text-bloom-50 hover:bg-soil-900',
              )}
            >
              <svg width="12" height="12" viewBox="0 0 14 14" aria-hidden="true">
                <path
                  d="M3 3l8 8M11 3l-8 8"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

export default PhotoThumbs;
