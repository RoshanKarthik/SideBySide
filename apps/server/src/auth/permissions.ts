/**
 * Every server-side permission decision lives here, shared by REST routes and the realtime
 * room, so the UI hiding something is never the only protection.
 */
import {
  isInterviewerRole,
  type DocumentPart,
  type RoomRole,
  type RoomStatus,
  type Visibility,
} from '@sidebyside/shared';

export type { DocumentPart };

/**
 * The role someone acts in right now. Practice peers interview in one round and solve in the
 * other, so every permission check uses this rather than the stored `peer` role: the peer
 * interviewing this round is an interviewer, the other is a candidate.
 */
export function effectiveRole(
  storedRole: RoomRole,
  participantId: string,
  roundInterviewerId: string | null | undefined,
): RoomRole {
  if (storedRole !== 'peer') return storedRole;
  return participantId === roundInterviewerId ? 'interviewer' : 'candidate';
}

/** Practice peers can start the next round (swap roles) while the room is live. */
export function canSwapRoles(storedRole: RoomRole, room: { status: RoomStatus; mode: string }) {
  return storedRole === 'peer' && room.mode === 'practice' && room.status === 'live';
}

/** Practice peers rate each other once the session has ended. */
export function canRate(storedRole: RoomRole, room: { status: RoomStatus; mode: string }) {
  return storedRole === 'peer' && room.mode === 'practice' && room.status === 'ended';
}

export interface RoomAccessFacts {
  status: RoomStatus;
  shareReplayWithCandidate: boolean;
}

export function canConnectToDocument(role: RoomRole, part: DocumentPart): boolean {
  if (part === 'shared') return true;
  return isInterviewerRole(role);
}

/** Whether the realtime room accepts a new connection at all. */
export function canJoinLive(room: Pick<RoomAccessFacts, 'status'>): boolean {
  return room.status !== 'ended';
}

export function canEndSession(role: RoomRole): boolean {
  return isInterviewerRole(role);
}

/** The owner deletes an interview for everyone, at any time (anyone connected is disconnected). */
export function canDeleteRoom(role: RoomRole): boolean {
  return role === 'owner';
}

/**
 * Everyone else with an account in a room (practice peers, co-interviewers, candidates who saved
 * the session) can remove it from their own sessions; the others keep their copy.
 */
export function canRemoveFromMySessions(participant: {
  role: RoomRole;
  userId: string | null;
}): boolean {
  return participant.userId !== null && participant.role !== 'owner';
}

export function canUpdateRoomSettings(role: RoomRole): boolean {
  return role === 'owner';
}

/** `storedRole` matters here: practice peers always see both rounds' replays. */
export function canViewReplay(storedRole: RoomRole, room: RoomAccessFacts): boolean {
  if (room.status !== 'ended') return false;
  if (isInterviewerRole(storedRole) || storedRole === 'peer') return true;
  return storedRole === 'candidate' && room.shareReplayWithCandidate;
}

export interface ClaimFacts {
  status: RoomStatus;
  mode: string;
  shareReplayWithCandidate: boolean;
  shareReportWithCandidate: boolean;
}

/**
 * A guest candidate can attach an ended interview to an account, to keep its replay or report,
 * when the interviewer shared one of them. Seats that already belong to an account can't be.
 */
export function canClaimSession(
  participant: { role: RoomRole; userId: string | null },
  room: ClaimFacts,
): boolean {
  return (
    participant.role === 'candidate' &&
    participant.userId === null &&
    room.mode === 'interview' &&
    room.status === 'ended' &&
    (room.shareReplayWithCandidate || room.shareReportWithCandidate)
  );
}

/** The session summary page: interviewers, and practice peers (each sees only their own rubric). */
export function canViewSummary(storedRole: RoomRole): boolean {
  return isInterviewerRole(storedRole) || storedRole === 'peer';
}

export function canSeeEvent(role: RoomRole, visibility: Visibility): boolean {
  return visibility === 'all' || isInterviewerRole(role);
}

/** Code runs are recorded only while the room is live. */
export function canRecordRun(room: Pick<RoomAccessFacts, 'status'>): boolean {
  return room.status === 'live';
}

/** Loading questions, revealing hints, locking the editor, seeing hidden tests. */
export function canManageInterview(role: RoomRole): boolean {
  return isInterviewerRole(role);
}

export function canInviteInterviewers(role: RoomRole): boolean {
  return role === 'owner';
}
