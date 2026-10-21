import { CONSENT_NOTICE, type RatingInput } from '@sidebyside/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { CheckCircle2, ShieldCheck, Star, X } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ErrorNote, Spinner } from '@/components/ui/card';
import { Textarea } from '@/components/ui/form';
import { toast } from '@/components/ui/toaster';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

/** One-line reminder for candidates of what the room records; dismissible per room. */
export function JoinNotice({ slug }: { slug: string }) {
  const key = `sbs-notice-${slug}`;
  const [hidden, setHidden] = useState(() => {
    try {
      return sessionStorage.getItem(key) === '1';
    } catch {
      return false;
    }
  });
  if (hidden) return null;
  return (
    <div className="flex items-center gap-2 border-b bg-primary/[0.06] px-3 py-1.5 text-xs text-muted-foreground">
      <ShieldCheck className="size-3.5 shrink-0 text-primary" />
      <span className="min-w-0 flex-1">{CONSENT_NOTICE}</span>
      <button
        type="button"
        aria-label="Dismiss"
        className="rounded p-0.5 hover:bg-muted hover:text-foreground"
        onClick={() => {
          setHidden(true);
          try {
            sessionStorage.setItem(key, '1');
          } catch {
            // Not remembered; fine.
          }
        }}
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}

const CRITERIA: { key: keyof Omit<RatingInput, 'comment'>; label: string }[] = [
  { key: 'problemSolving', label: 'Problem solving' },
  { key: 'communication', label: 'Communication' },
  { key: 'interviewing', label: 'As an interviewer' },
];

/** Practice: rate your partner once the session is over. */
export function RateYourPartner({ roomId, slug }: { roomId: string; slug: string }) {
  const existing = useQuery({
    queryKey: ['my-rating', roomId],
    queryFn: () =>
      api.json<{ rating: RatingInput | null }>(`/rooms/${roomId}/ratings/mine`, { roomKey: slug }),
  });
  const [scores, setScores] = useState<Partial<Record<(typeof CRITERIA)[number]['key'], number>>>(
    {},
  );
  const [comment, setComment] = useState('');
  const save = useMutation({
    mutationFn: (input: RatingInput) =>
      api.json(`/rooms/${roomId}/ratings`, { method: 'POST', body: input, roomKey: slug }),
    onSuccess: () => toast.success('Thanks — your rating was saved'),
  });

  if (existing.isPending) return <Spinner className="mt-6" />;
  if (existing.data?.rating || save.isSuccess) {
    return (
      <p className="mt-6 flex items-center gap-2 text-sm text-success">
        <CheckCircle2 className="size-4" /> You rated your partner. Thanks!
      </p>
    );
  }
  const complete = CRITERIA.every((c) => scores[c.key]);

  return (
    <div className="mt-8 w-full max-w-md rounded-2xl border bg-card p-5 text-left shadow-lg">
      <h2 className="font-semibold">Rate your partner</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Only they see the averages, on their practice page.
      </p>
      <div className="mt-4 space-y-3">
        {CRITERIA.map((c) => (
          <div key={c.key} className="flex items-center justify-between gap-3">
            <span className="text-sm">{c.label}</span>
            <div className="flex gap-0.5" role="radiogroup" aria-label={c.label}>
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={scores[c.key] === n}
                  aria-label={`${n} of 5`}
                  onClick={() => setScores((s) => ({ ...s, [c.key]: n }))}
                  className="rounded p-0.5 hover:bg-muted"
                >
                  <Star
                    className={cn(
                      'size-5 transition-colors',
                      (scores[c.key] ?? 0) >= n
                        ? 'fill-warning text-warning'
                        : 'text-muted-foreground/40',
                    )}
                  />
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
      <Textarea
        aria-label="Comment for your partner"
        placeholder="Something that went well, something to try next time (optional)"
        className="mt-4 font-sans"
        rows={3}
        maxLength={1000}
        value={comment}
        onChange={(e) => setComment(e.target.value)}
      />
      {save.error && (
        <div className="mt-3">
          <ErrorNote>{save.error.message}</ErrorNote>
        </div>
      )}
      <Button
        className="mt-4 w-full"
        disabled={!complete || save.isPending}
        onClick={() =>
          save.mutate({
            problemSolving: scores.problemSolving!,
            communication: scores.communication!,
            interviewing: scores.interviewing!,
            comment,
          })
        }
      >
        {save.isPending && <Spinner />} Submit rating
      </Button>
    </div>
  );
}
