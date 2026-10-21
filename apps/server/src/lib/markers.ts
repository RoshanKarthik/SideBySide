import type { ReplayMarker } from '@sidebyside/shared';

export interface MarkerEvent {
  type: string;
  participantId: string | null;
  payload: Record<string, unknown>;
  serverTs: number;
}

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const str = (v: unknown) => (typeof v === 'string' ? v : '');
const secs = (ms: number) => `${Math.max(1, Math.round(ms / 1000))}s`;

/**
 * Timeline markers for the replay scrubber, built from the event log. Interviewer-only
 * markers (timestamped private notes) are included only when `seesPrivate` is true.
 */
export function buildMarkers(
  events: readonly MarkerEvent[],
  people: Record<string, string>,
  seesPrivate: boolean,
): ReplayMarker[] {
  const who = (e: MarkerEvent) => (e.participantId && people[e.participantId]) || 'Someone';
  const out: ReplayMarker[] = [];
  // Durations arrive on the "back" event; attach them to the matching "away" marker.
  const openHidden = new Map<string, ReplayMarker>();
  const openBlur = new Map<string, ReplayMarker>();

  for (const e of events) {
    const ts = e.serverTs;
    const p = e.payload;
    const key = e.participantId ?? '';
    switch (e.type) {
      case 'code_run': {
        const ok = p.status === 'ok';
        out.push({
          ts,
          kind: 'code_run',
          tone: ok ? 'ok' : 'error',
          label: `${who(e)} ran ${str(p.language)} (${str(p.status)})`,
        });
        break;
      }
      case 'tests_run': {
        const passed = num(p.passed);
        const total = num(p.total);
        out.push({
          ts,
          kind: 'tests_run',
          tone: total > 0 && passed === total ? 'ok' : 'error',
          label: `Tests: ${passed} / ${total} passed`,
        });
        break;
      }
      case 'question_shown':
        out.push({ ts, kind: 'question_shown', tone: 'info', label: `Question: ${str(p.title)}` });
        break;
      case 'hint_revealed':
        out.push({
          ts,
          kind: 'hint_revealed',
          tone: 'info',
          label: `Hint ${num(p.hintIndex) + 1} revealed`,
        });
        break;
      case 'paste':
        out.push({
          ts,
          kind: 'paste',
          tone: 'signal',
          label: `${who(e)} pasted ${num(p.chars)} characters`,
        });
        break;
      case 'tab_hidden': {
        const m: ReplayMarker = {
          ts,
          kind: 'tab_hidden',
          tone: 'signal',
          label: `${who(e)}'s tab was hidden`,
        };
        out.push(m);
        openHidden.set(key, m);
        break;
      }
      case 'tab_visible': {
        const m = openHidden.get(key);
        if (m) m.label = `${who(e)}'s tab was hidden for ${secs(num(p.hiddenMs))}`;
        openHidden.delete(key);
        break;
      }
      case 'window_blur': {
        const m: ReplayMarker = {
          ts,
          kind: 'window_blur',
          tone: 'signal',
          label: `${who(e)} left the window`,
        };
        out.push(m);
        openBlur.set(key, m);
        break;
      }
      case 'window_focus': {
        const m = openBlur.get(key);
        if (m) m.label = `${who(e)} left the window for ${secs(num(p.awayMs))}`;
        openBlur.delete(key);
        break;
      }
      case 'note_timestamp':
        if (seesPrivate) {
          const text = str(p.text).trim();
          out.push({
            ts,
            kind: 'note_timestamp',
            tone: 'info',
            label: text ? `Note: ${text}` : 'Timestamped note',
          });
        }
        break;
    }
  }
  return out;
}
