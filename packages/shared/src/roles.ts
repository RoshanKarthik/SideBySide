import { z } from 'zod';

export const ROOM_ROLES = ['owner', 'interviewer', 'candidate', 'peer'] as const;
export const roomRoleSchema = z.enum(ROOM_ROLES);
export type RoomRole = z.infer<typeof roomRoleSchema>;

export const ROOM_MODES = ['interview', 'practice'] as const;
export const roomModeSchema = z.enum(ROOM_MODES);
export type RoomMode = z.infer<typeof roomModeSchema>;

export const ROOM_STATUSES = ['scheduled', 'live', 'ended'] as const;
export const roomStatusSchema = z.enum(ROOM_STATUSES);
export type RoomStatus = z.infer<typeof roomStatusSchema>;

export const VISIBILITIES = ['all', 'interviewers'] as const;
export const visibilitySchema = z.enum(VISIBILITIES);
export type Visibility = z.infer<typeof visibilitySchema>;

/** Roles that see interviewer-only data. Practice peers are resolved per round. */
export function isInterviewerRole(role: RoomRole): boolean {
  return role === 'owner' || role === 'interviewer';
}
