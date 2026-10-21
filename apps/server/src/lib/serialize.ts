import type { RoomRow } from '@sidebyside/db';
import type { Room } from '@sidebyside/shared';

const iso = (d: Date | null) => (d ? d.toISOString() : null);

export function toRoomDto(row: RoomRow): Room {
  return {
    id: row.id,
    slug: row.slug,
    mode: row.mode,
    title: row.title,
    status: row.status,
    defaultLanguage: row.defaultLanguage,
    shareReplayWithCandidate: row.shareReplayWithCandidate,
    shareReportWithCandidate: row.shareReportWithCandidate,
    retentionDays: row.retentionDays,
    createdAt: row.createdAt.toISOString(),
    startedAt: iso(row.startedAt),
    endedAt: iso(row.endedAt),
    currentRound: row.currentRound,
  };
}

export function roomLink(publicAppUrl: string, slug: string): string {
  return `${publicAppUrl.replace(/\/$/, '')}/r/${slug}`;
}
