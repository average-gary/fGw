import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Textarea } from '@/components/ui/Textarea';
import { useToast } from '@/components/ui/Toast';
import { cn } from '@/lib/cn';
import type { AddressableRef } from '@/lib/listings/types';
import { postReview, type ReviewScore } from '@/lib/reputation';
import { truncatedNpub } from './PubkeyChip';

export interface ReviewFormProps {
  target: string;
  reference: AddressableRef;
  onSubmitted?: () => void;
}

const CHOICES: Array<{ score: ReviewScore; label: string }> = [
  { score: '+1', label: '+1' },
  { score: '-1', label: '-1' },
  { score: 'no-show', label: 'no-show' },
];

/**
 * Score chips + optional notes textarea for a NIP-32 review (kind 1985).
 * Goes read-only after a successful publish.
 */
export function ReviewForm({ target, reference, onSubmitted }: ReviewFormProps) {
  const [score, setScore] = useState<ReviewScore | null>(null);
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const toast = useToast();

  const submit = async (): Promise<void> => {
    if (!score || submitting) return;
    setSubmitting(true);
    try {
      await postReview({
        target,
        listingOrEvent: reference,
        score,
        ...(text.trim() ? { text: text.trim() } : {}),
      });
      setDone(true);
      toast.success('Review posted');
      onSubmitted?.();
    } catch (err) {
      toast.danger(
        'Could not post review',
        err instanceof Error ? err.message : String(err),
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <Card variant="inset">
        <p className="text-sm text-soil-700">
          Thanks — your review of {truncatedNpub(target)} is posted.
        </p>
      </Card>
    );
  }

  return (
    <Card variant="inset">
      <h3 className="font-serif text-lg text-soil-900 mb-2">Leave a review</h3>
      <div className="flex gap-2 mb-3" role="radiogroup" aria-label="Score">
        {CHOICES.map((c) => (
          <button
            key={c.score}
            type="button"
            role="radio"
            aria-checked={score === c.score}
            onClick={() => setScore(c.score)}
            className={cn(
              'rounded-pill px-3 py-1.5 text-sm font-mono uppercase tracking-wide ring-1',
              score === c.score
                ? 'bg-moss-600 text-bloom-50 ring-moss-700'
                : 'bg-bloom-50 text-soil-700 ring-soil-200 hover:bg-soil-50',
            )}
          >
            {c.label}
          </button>
        ))}
      </div>
      <Textarea
        aria-label="Review text"
        placeholder="Optional notes (visible to everyone)"
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
      />
      <div className="flex justify-end mt-3">
        <Button onClick={submit} disabled={!score} loading={submitting}>
          Submit review
        </Button>
      </div>
    </Card>
  );
}

export default ReviewForm;
