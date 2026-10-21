import { eq, users, type Database, type RoomRow } from '@sidebyside/db';
import { brandOrNull, type Brand, type Room } from '@sidebyside/shared';

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

interface BrandColumns {
  companyName: string | null;
  brandLogo: string | null;
  brandColor: string | null;
}

export function toBrand(row: BrandColumns): Brand {
  return { companyName: row.companyName, logo: row.brandLogo, color: row.brandColor };
}

/** The room owner's company branding, or null when they haven't set any. */
export async function roomBrand(db: Database, ownerId: string): Promise<Brand | null> {
  const [owner] = await db
    .select({
      companyName: users.companyName,
      brandLogo: users.brandLogo,
      brandColor: users.brandColor,
    })
    .from(users)
    .where(eq(users.id, ownerId));
  return owner ? brandOrNull(toBrand(owner)) : null;
}
