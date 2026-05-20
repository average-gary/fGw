/**
 * SPEC-018 — Pubkey chip.
 *
 * Avatar (kind-0 picture, or a colored fallback derived from the first 6
 * hex chars of the pubkey) plus display name or truncated npub. Used in
 * feed cards and reused later (claims, RSVPs, threads).
 */
import { useProfile } from '@/lib/profile';
import { cn } from '@/lib/cn';

export interface PubkeyChipProps {
  pubkey: string;
  className?: string;
}

function truncatePubkey(pubkey: string): string {
  if (pubkey.length <= 14) return pubkey;
  return `npub1${pubkey.slice(0, 6)}…${pubkey.slice(-4)}`;
}

export function PubkeyChip({ pubkey, className }: PubkeyChipProps) {
  const profile = useProfile(pubkey);
  const fallbackHex = pubkey.slice(0, 6) || '888888';
  const displayName = profile.displayName ?? truncatePubkey(pubkey);
  const initials = (profile.displayName ?? pubkey)
    .replace(/[^A-Za-z0-9]/g, '')
    .slice(0, 2)
    .toUpperCase();

  return (
    <span
      className={cn('inline-flex items-center gap-2 min-w-0', className)}
      aria-label={`Posted by ${displayName}`}
    >
      {profile.picture ? (
        <img
          src={profile.picture}
          alt=""
          className="h-6 w-6 rounded-full object-cover ring-1 ring-soil-200 shrink-0"
          loading="lazy"
        />
      ) : (
        <span
          aria-hidden="true"
          className="h-6 w-6 rounded-full ring-1 ring-soil-200 shrink-0 inline-flex items-center justify-center text-[10px] font-mono font-medium text-bloom-50"
          style={{ backgroundColor: `#${fallbackHex}` }}
        >
          {initials || '·'}
        </span>
      )}
      <span className="truncate text-sm text-soil-700">{displayName}</span>
    </span>
  );
}

export default PubkeyChip;
