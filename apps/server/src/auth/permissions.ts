/**
 * Every server-side permission decision lives here, shared by REST routes and the realtime
 * room, so the UI hiding something is never the only protection.
 */
import {
  isInterviewerRole,
  type RoomRole,
  type RoomStatus,
  type Visibility,
} from '@sidebyside/shared';

/** The parts of a room's collaborative state, each its own Yjs document. */
export type DocumentPart = 'shared' | 'private';

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

export function canDeleteRoom(role: RoomRole): boolean {
  return role === 'owner';
}

export function canUpdateRoomSettings(role: RoomRole): boolean {
  return role === 'owner';
}

export function canViewReplay(role: RoomRole, room: RoomAccessFacts): boolean {
  if (room.status !== 'ended') return false;
  if (isInterviewerRole(role)) return true;
  return role === 'candidate' && room.shareReplayWithCandidate;
}

export function canSeeEvent(role: RoomRole, visibility: Visibility): boolean {
  return visibility === 'all' || isInterviewerRole(role);
}

/** Code runs are recorded only while the room is live. */
export function canRecordRun(room: Pick<RoomAccessFacts, 'status'>): boolean {
  return room.status === 'live';
}
