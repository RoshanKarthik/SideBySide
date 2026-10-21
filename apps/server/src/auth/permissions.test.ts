import { describe, expect, it } from 'vitest';
import { parseDocumentName } from '../collab/connect';
import { signGuestToken, verifyGuestToken } from './guest-token';
import {
  canClaimSession,
  canConnectToDocument,
  canEndSession,
  canJoinLive,
  canRate,
  canRecordRun,
  canSeeEvent,
  canSwapRoles,
  canViewReplay,
  effectiveRole,
} from './permissions';

describe('permissions', () => {
  it('keeps candidates out of private documents', () => {
    expect(canConnectToDocument('candidate', 'shared')).toBe(true);
    expect(canConnectToDocument('candidate', 'private')).toBe(false);
    expect(canConnectToDocument('owner', 'private')).toBe(true);
    expect(canConnectToDocument('interviewer', 'private')).toBe(true);
  });

  it('lets only interviewers end a session', () => {
    expect(canEndSession('owner')).toBe(true);
    expect(canEndSession('interviewer')).toBe(true);
    expect(canEndSession('candidate')).toBe(false);
  });

  it('shows replays to candidates only when shared, and only after the session', () => {
    const ended = { status: 'ended' as const, shareReplayWithCandidate: false };
    expect(canViewReplay('owner', ended)).toBe(true);
    expect(canViewReplay('candidate', ended)).toBe(false);
    expect(canViewReplay('candidate', { ...ended, shareReplayWithCandidate: true })).toBe(true);
    expect(canViewReplay('owner', { ...ended, status: 'live' })).toBe(false);
  });

  it('lets guest candidates claim an ended interview only when something is shared', () => {
    const guest = { role: 'candidate' as const, userId: null };
    const room = {
      status: 'ended' as const,
      mode: 'interview',
      shareReplayWithCandidate: true,
      shareReportWithCandidate: false,
    };
    expect(canClaimSession(guest, room)).toBe(true);
    expect(
      canClaimSession(guest, {
        ...room,
        shareReplayWithCandidate: false,
        shareReportWithCandidate: true,
      }),
    ).toBe(true);
    expect(canClaimSession(guest, { ...room, shareReplayWithCandidate: false })).toBe(false);
    expect(canClaimSession(guest, { ...room, status: 'live' })).toBe(false);
    expect(canClaimSession(guest, { ...room, mode: 'practice' })).toBe(false);
    expect(canClaimSession({ ...guest, userId: 'u1' }, room)).toBe(false);
    expect(canClaimSession({ role: 'interviewer', userId: null }, room)).toBe(false);
  });

  it('filters interviewer-only events', () => {
    expect(canSeeEvent('candidate', 'all')).toBe(true);
    expect(canSeeEvent('candidate', 'interviewers')).toBe(false);
    expect(canSeeEvent('owner', 'interviewers')).toBe(true);
  });

  it('gives practice peers the role of their side in the current round', () => {
    expect(effectiveRole('peer', 'a', 'a')).toBe('interviewer');
    expect(effectiveRole('peer', 'b', 'a')).toBe('candidate');
    expect(effectiveRole('peer', 'b', null)).toBe('candidate');
    expect(effectiveRole('owner', 'x', 'y')).toBe('owner');
    // So the peer solving this round is kept out of the private document.
    expect(canConnectToDocument(effectiveRole('peer', 'b', 'a'), 'private')).toBe(false);
  });

  it('lets practice peers swap roles while live and rate once ended', () => {
    const live = { status: 'live' as const, mode: 'practice' };
    expect(canSwapRoles('peer', live)).toBe(true);
    expect(canSwapRoles('owner', live)).toBe(false);
    expect(canSwapRoles('peer', { ...live, mode: 'interview' })).toBe(false);
    expect(canRate('peer', live)).toBe(false);
    expect(canRate('peer', { ...live, status: 'ended' })).toBe(true);
  });

  it('closes ended rooms to joins and runs', () => {
    expect(canJoinLive({ status: 'scheduled' })).toBe(true);
    expect(canJoinLive({ status: 'ended' })).toBe(false);
    expect(canRecordRun({ status: 'live' })).toBe(true);
    expect(canRecordRun({ status: 'ended' })).toBe(false);
  });
});

describe('guest tokens', () => {
  const claims = {
    roomId: '00000000-0000-4000-8000-000000000001',
    participantId: '00000000-0000-4000-8000-000000000002',
    role: 'candidate' as const,
    displayName: 'Asha',
  };

  it('round-trips claims', async () => {
    const token = await signGuestToken(claims, 'secret-a');
    expect(await verifyGuestToken(token, 'secret-a')).toEqual(claims);
  });

  it('rejects other secrets, expired tokens and garbage', async () => {
    const token = await signGuestToken(claims, 'secret-a');
    expect(await verifyGuestToken(token, 'secret-b')).toBeNull();
    const old = await signGuestToken(claims, 'secret-a', Math.floor(Date.now() / 1000) - 13 * 3600);
    expect(await verifyGuestToken(old, 'secret-a')).toBeNull();
    expect(await verifyGuestToken('not-a-token', 'secret-a')).toBeNull();
  });
});

describe('document names', () => {
  it('accepts room documents and rejects anything else', () => {
    const id = '00000000-0000-4000-8000-000000000001';
    expect(parseDocumentName(`${id}--shared`)).toEqual({ roomId: id, part: 'shared', round: 1 });
    expect(parseDocumentName(`${id}--private`)).toEqual({ roomId: id, part: 'private', round: 1 });
    expect(parseDocumentName(`${id}--private-r2`)).toEqual({
      roomId: id,
      part: 'private',
      round: 2,
    });
    expect(parseDocumentName(`${id}--shared-r1`)).toBeNull();
    expect(parseDocumentName(`${id}--other`)).toBeNull();
    expect(parseDocumentName('nope--shared')).toBeNull();
    expect(parseDocumentName(`${id}--shared--x`)).toBeNull();
  });
});
