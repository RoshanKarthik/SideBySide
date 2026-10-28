/**
 * Guest claim flow: a guest candidate attaches their seat in an ended interview to an account,
 * but only when the interviewer shared the replay or report, and only once.
 */
import { eq, participants, rooms } from '@sidebyside/db';
import type {
  ClaimSessionResponse,
  ClaimTokenResponse,
  CreateRoomResponse,
  JoinRoomResponse,
  RoomListItem,
  SessionReports,
} from '@sidebyside/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sampleProvider } from '../ai/provider';
import { runReportJob } from '../ai/summary';
import { createHarness } from '../testing/harness';

let h: Awaited<ReturnType<typeof createHarness>>;
let owner: string;

beforeAll(async () => {
  h = await createHarness({ AI_SUMMARY_PROVIDER: 'sample' });
  owner = await h.signUp('claim-owner@example.test', 'Priya');
});
afterAll(async () => {
  await h.close();
});

async function interview(share: { replay?: boolean; report?: boolean }) {
  const { room } = await h.json<CreateRoomResponse>(
    '/api/rooms',
    {
      method: 'POST',
      cookie: owner,
      body: JSON.stringify({
        title: 'Backend round',
        defaultLanguage: 'python',
        shareReplayWithCandidate: share.replay ?? false,
        shareReportWithCandidate: share.report ?? false,
      }),
    },
    201,
  );
  const guest = await h.json<JoinRoomResponse>(`/api/rooms/${room.slug}/join`, {
    method: 'POST',
    body: JSON.stringify({ displayName: 'Asha', consent: true }),
  });
  return { room, guest, token: guest.collabToken! };
}

const endRoom = (roomId: string) =>
  h.json(`/api/rooms/${roomId}/end`, { method: 'POST', cookie: owner });

const requestClaimToken = (roomId: string, token: string) =>
  h.call(`/api/rooms/${roomId}/claim-token`, { method: 'POST', token });

const claim = (claimToken: string, cookie?: string) =>
  h.call('/api/claim', { method: 'POST', cookie, body: JSON.stringify({ claimToken }) });

describe('guest claim flow', () => {
  let room: CreateRoomResponse['room'];
  let guestToken: string;
  let guestParticipantId: string;
  let claimToken: string;

  it('offers no claim while the session is still running', async () => {
    ({ room, token: guestToken } = await interview({ replay: true }));
    const res = await requestClaimToken(room.id, guestToken);
    expect(res.status).toBe(403);
  });

  it('gives the guest the same claim token every time once the session ends', async () => {
    await endRoom(room.id);
    const first = await h.json<ClaimTokenResponse>(`/api/rooms/${room.id}/claim-token`, {
      method: 'POST',
      token: guestToken,
    });
    const second = await h.json<ClaimTokenResponse>(`/api/rooms/${room.id}/claim-token`, {
      method: 'POST',
      token: guestToken,
    });
    expect(first.claimToken).toMatch(/^[A-Za-z0-9_-]{40,}$/);
    expect(second.claimToken).toBe(first.claimToken);
    claimToken = first.claimToken;

    // Only a hash of the token is stored.
    const [row] = await h.db
      .select()
      .from(participants)
      .where(eq(participants.roomId, room.id))
      .then((rows) => rows.filter((p) => p.role === 'candidate'));
    guestParticipantId = row!.id;
    expect(row!.claimToken).toMatch(/^[0-9a-f]{64}$/);
    expect(row!.claimToken).not.toBe(claimToken);
  });

  it('does not give claim tokens to interviewers or strangers', async () => {
    const asOwner = await h.call(`/api/rooms/${room.id}/claim-token`, {
      method: 'POST',
      cookie: owner,
    });
    expect(asOwner.status).toBe(403);
    const stranger = await h.signUp('claim-stranger@example.test', 'Stranger');
    const asStranger = await h.call(`/api/rooms/${room.id}/claim-token`, {
      method: 'POST',
      cookie: stranger,
    });
    expect(asStranger.status).toBe(404);
  });

  it('requires an account to claim', async () => {
    const res = await claim(claimToken);
    expect(res.status).toBe(401);
  });

  it('rejects unknown tokens', async () => {
    const someone = await h.signUp('claim-someone@example.test', 'Someone');
    const res = await claim('not-a-real-claim-token', someone);
    expect(res.status).toBe(404);
  });

  it('does not let someone already in the room take the guest seat', async () => {
    const res = await claim(claimToken, owner);
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: { code: 'already_member' } });
  });

  it("attaches the guest's seat to the account that claims it", async () => {
    const asha = await h.signUp('asha@example.test', 'Asha Rao');
    const res = await claim(claimToken, asha);
    expect(res.status).toBe(200);
    expect(((await res.json()) as ClaimSessionResponse).room.id).toBe(room.id);

    const [row] = await h.db
      .select()
      .from(participants)
      .where(eq(participants.id, guestParticipantId));
    expect(row!.userId).not.toBeNull();
    expect(row!.claimToken).toBeNull();
    // The interviewer still knows them by the name they joined with.
    expect(row!.displayName).toBe('Asha');

    // The session is now on their dashboard, and the shared replay opens with their account.
    const list = await h.json<RoomListItem[]>('/api/rooms', { cookie: asha });
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: room.id, myRole: 'candidate', candidateName: 'Asha' });
    const replay = await h.call(`/api/rooms/${room.id}/replay/manifest`, { cookie: asha });
    expect(replay.status).toBe(200);
    // They still can't see the interviewer's summary.
    const summary = await h.call(`/api/rooms/${room.id}/summary`, { cookie: asha });
    expect(summary.status).toBe(403);
  });

  it('works only once', async () => {
    const other = await h.signUp('claim-other@example.test', 'Other');
    const again = await claim(claimToken, other);
    expect(again.status).toBe(404);
    // The old guest token can't mint a new claim token for a seat that has an owner now.
    const reissue = await requestClaimToken(room.id, guestToken);
    expect(reissue.status).toBe(403);
  });

  it('offers no claim when nothing is shared with the candidate', async () => {
    const quiet = await interview({});
    await endRoom(quiet.room.id);
    const res = await requestClaimToken(quiet.room.id, quiet.token);
    expect(res.status).toBe(403);
  });

  it('lets the account read the shared feedback once it claims a report-only session', async () => {
    const reportOnly = await interview({ report: true });
    await endRoom(reportOnly.room.id);
    await runReportJob({
      db: h.db,
      provider: sampleProvider(),
      roomId: reportOnly.room.id,
      round: 1,
      docs: { sharedNotes: 'shared', privateNotes: 'private', code: { python: 'print(1)' } },
    });
    const { claimToken: token } = await h.json<ClaimTokenResponse>(
      `/api/rooms/${reportOnly.room.id}/claim-token`,
      { method: 'POST', token: reportOnly.token },
    );
    const user = await h.signUp('claim-report@example.test', 'Report Reader');
    expect((await claim(token, user)).status).toBe(200);

    // The feedback page finds the seat through the account, then loads the candidate report.
    const me = await h.json<JoinRoomResponse>(`/api/rooms/${reportOnly.room.slug}/me`, {
      cookie: user,
    });
    expect(me.participant.role).toBe('candidate');
    const reports = await h.json<SessionReports>(`/api/rooms/${reportOnly.room.id}/reports`, {
      cookie: user,
    });
    expect(reports.candidate?.status).toBe('ready');
    expect(reports.interviewer).toBeNull();
    // Nothing else was shared, so the replay stays closed.
    const replay = await h.call(`/api/rooms/${reportOnly.room.id}/replay/manifest`, {
      cookie: user,
    });
    expect(replay.status).toBe(403);
  });

  it('refuses a claim if sharing was turned off after the token was issued', async () => {
    const later = await interview({ replay: true });
    await endRoom(later.room.id);
    const { claimToken: token } = await h.json<ClaimTokenResponse>(
      `/api/rooms/${later.room.id}/claim-token`,
      { method: 'POST', token: later.token },
    );
    await h.db
      .update(rooms)
      .set({ shareReplayWithCandidate: false })
      .where(eq(rooms.id, later.room.id));
    const user = await h.signUp('claim-late@example.test', 'Late');
    const res = await claim(token, user);
    expect(res.status).toBe(403);
  });
});

describe('when the server writes no AI reports', () => {
  let off: Awaited<ReturnType<typeof createHarness>>;
  let interviewer: string;

  beforeAll(async () => {
    off = await createHarness({ AI_SUMMARY_PROVIDER: 'off' });
    interviewer = await off.signUp('claim-off-owner@example.test', 'Priya');
  });
  afterAll(async () => {
    await off.close();
  });

  const endedWith = async (share: { replay?: boolean; report?: boolean }) => {
    const { room } = await off.json<CreateRoomResponse>(
      '/api/rooms',
      {
        method: 'POST',
        cookie: interviewer,
        body: JSON.stringify({
          title: 'Backend round',
          defaultLanguage: 'python',
          shareReplayWithCandidate: share.replay ?? false,
          shareReportWithCandidate: share.report ?? false,
        }),
      },
      201,
    );
    const guest = await off.json<JoinRoomResponse>(`/api/rooms/${room.slug}/join`, {
      method: 'POST',
      body: JSON.stringify({ displayName: 'Asha', consent: true }),
    });
    await off.json(`/api/rooms/${room.id}/end`, { method: 'POST', cookie: interviewer });
    return { roomId: room.id, token: guest.collabToken! };
  };

  it('offers no claim when only the report is shared, since there is no report', async () => {
    const { roomId, token } = await endedWith({ report: true });
    const res = await off.call(`/api/rooms/${roomId}/claim-token`, { method: 'POST', token });
    expect(res.status).toBe(403);
  });

  it('still offers a claim when the replay is shared', async () => {
    const { roomId, token } = await endedWith({ replay: true, report: true });
    const res = await off.call(`/api/rooms/${roomId}/claim-token`, { method: 'POST', token });
    expect(res.status).toBe(200);
  });
});
