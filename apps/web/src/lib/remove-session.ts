import type { Room } from '@sidebyside/shared';

/**
 * What "delete" means for the person asking: the owner of an interview deletes it for everyone;
 * anyone else removes it from their own sessions (a practice room is deleted once both peers
 * have removed it). Used by the dashboard and the session page so both say the same thing.
 */
export function sessionRemoval(
  room: Pick<Room, 'id' | 'title' | 'mode' | 'status'>,
  owner: boolean,
) {
  if (owner) {
    return {
      path: `/rooms/${room.id}`,
      menuLabel: 'Delete session',
      action: 'Delete',
      title: 'Delete this session?',
      description:
        `“${room.title}” and its replay, notes, code runs and rubric will be deleted for everyone.` +
        (room.status === 'live' ? ' Anyone still in the room is disconnected.' : '') +
        ' This can’t be undone.',
      done: 'Session deleted',
    };
  }
  return {
    path: `/rooms/${room.id}/me`,
    menuLabel: 'Remove from my sessions',
    action: 'Remove',
    title: 'Remove this session?',
    description:
      room.mode === 'practice'
        ? `“${room.title}” leaves your dashboard and ratings involving you in it are deleted. Your partner keeps their copy until they remove it too; then it’s deleted for good.`
        : `“${room.title}” leaves your dashboard. The interviewer who ran it keeps the session.`,
    done: 'Session removed',
  };
}
