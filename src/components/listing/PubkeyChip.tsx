import * as nip19 from 'nostr-tools/nip19';
import { cn } from '@/lib/cn';
import { useProfile } from '@/lib/profile';
import { useReputation } from '@/lib/reputation';

export function truncatedNpub(pubkey: string): string {
  try {
    const npub = nip19.npubEncode(pubkey);
    return `${npub.slice(0, 12)}…${npub.slice(-6)}`;
  } catch {
    return `${pubkey.slice(0, 8)}…${pubkey.slice(-6)}`;
  }
}

export interface PubkeyChipProps {
  pubkey: string;
  className?: string;
}

/**
 * Display chip for a Nostr pubkey: kind-0 display name with reputation
 * star score from the live SPEC-017 hook. Falls back to a truncated npub
 * until the profile event arrives.
 */
export function PubkeyChip({ pubkey, className }: PubkeyChipProps) {
  const profile = useProfile(pubkey);
  const rep = useReputation(pubkey);
  const label = profile.displayName?.trim() || truncatedNpub(pubkey);
  return (
    <span
      className={cn(
        'inline-flex items-center gap-2 text-sm text-soil-800',
        className,
      )}
      data-testid="pubkey-chip"
      data-pubkey={pubkey}
    >
      <span className="font-medium truncate max-w-[14rem]">{label}</span>
      {rep.score !== 0 && (
        <span
          className="font-mono text-xs text-moss-700"
          aria-label={`reputation ${rep.score >= 0 ? '+' : ''}${rep.score}`}
        >
          {`★ ${rep.score >= 0 ? '+' : ''}${rep.score}`}
        </span>
      )}
    </span>
  );
}

export default PubkeyChip;
