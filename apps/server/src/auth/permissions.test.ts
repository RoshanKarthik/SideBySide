import { describe, expect, it } from 'vitest';
import { parseDocumentName } from '../collab/connect';
import { signGuestToken, verifyGuestToken } from './guest-token';
import {
  canConnectToDocument,
  canEndSession,
  canJoinLive,
  canRecordRun,
  canSeeEvent,
  canViewReplay,
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

  it('filters interviewer-only events', () => {
    expect(canSeeEvent('candidate', 'all')).toBe(true);
    expect(canSeeEvent('candidate', 'interviewers')).toBe(false);
    expect(canSeeEvent('owner', 'interviewers')).toBe(true);
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
    expect(parseDocumentName(`${id}--shared`)).toEqual({ roomId: id, part: 'shared' });
    expect(parseDocumentName(`${id}--private`)).toEqual({ roomId: id, part: 'private' });
    expect(parseDocumentName(`${id}--other`)).toBeNull();
    expect(parseDocumentName('nope--shared')).toBeNull();
    expect(parseDocumentName(`${id}--shared--x`)).toBeNull();
  });
});
