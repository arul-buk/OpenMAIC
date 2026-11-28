import { createHmac, timingSafeEqual } from 'crypto';

import {
  isAccessTokenSignatureFormatValid,
  isAccessTokenTimestampValid,
} from './access-token-shared';
import {
  findAccessProfileById,
  getAccessProfiles,
  type AccessProfile,
} from './access-profiles-shared';

/** Create a legacy HMAC-signed token: `timestamp.signature` */
export function createAccessToken(accessCode: string): string {
  const timestamp = Date.now().toString();
  const signature = createHmac('sha256', accessCode).update(timestamp).digest('hex');
  return `${timestamp}.${signature}`;
}

/** Create a profile-bound HMAC-signed token: `p1.<profileId>.<timestamp>.<signature>` */
export function createProfileAccessToken(profile: AccessProfile): string {
  const timestamp = Date.now().toString();
  const payload = `p1.${profile.id}.${timestamp}`;
  const signature = createHmac('sha256', profile.code).update(payload).digest('hex');
  return `${payload}.${signature}`;
}

/** Verify a legacy HMAC-signed token against the single access code */
export function verifyAccessToken(token: string, accessCode: string): boolean {
  const dotIndex = token.indexOf('.');
  if (dotIndex === -1) return false;

  const timestamp = token.substring(0, dotIndex);
  const signature = token.substring(dotIndex + 1);

  if (!isAccessTokenTimestampValid(timestamp)) return false;
  if (!isAccessTokenSignatureFormatValid(signature)) return false;

  const expected = createHmac('sha256', accessCode).update(timestamp).digest('hex');

  const sigBuf = Buffer.from(signature, 'hex');
  const expBuf = Buffer.from(expected, 'hex');
  if (sigBuf.length !== expBuf.length) return false;

  return timingSafeEqual(sigBuf, expBuf);
}

/** Verify a `p1.<profileId>.<timestamp>.<signature>` token and return the profile. */
export function verifyProfileAccessToken(token: string): AccessProfile | null {
  const parts = token.split('.');
  if (parts.length !== 4 || parts[0] !== 'p1') return null;

  const [, profileId, timestamp, signature] = parts;
  if (!isAccessTokenTimestampValid(timestamp)) return null;
  if (!isAccessTokenSignatureFormatValid(signature)) return null;

  const profile = findAccessProfileById(profileId);
  if (!profile) return null;

  const payload = `p1.${profile.id}.${timestamp}`;
  const expected = createHmac('sha256', profile.code).update(payload).digest('hex');

  const sigBuf = Buffer.from(signature, 'hex');
  const expBuf = Buffer.from(expected, 'hex');
  if (sigBuf.length !== expBuf.length) return null;

  return timingSafeEqual(sigBuf, expBuf) ? profile : null;
}

/** Constant-time lookup of a profile matching a submitted access code. */
export function matchAccessProfileByCode(candidate: string): AccessProfile | null {
  const profiles = getAccessProfiles();
  if (profiles.length === 0) return null;

  const encoder = new TextEncoder();
  const candidateBuf = encoder.encode(candidate);
  let matched: AccessProfile | null = null;

  for (const profile of profiles) {
    const codeBuf = encoder.encode(profile.code);
    if (
      candidateBuf.byteLength === codeBuf.byteLength &&
      timingSafeEqual(candidateBuf, codeBuf)
    ) {
      matched = profile;
    }
  }
  return matched;
}

/**
 * Verifies either a profile-bound token (`p1.*`) or a legacy single-code token.
 * Returns `{ valid, profile }` where `profile` is populated for profile tokens.
 */
export function verifyAnyAccessToken(token: string | undefined): {
  valid: boolean;
  profile: AccessProfile | null;
} {
  if (!token) return { valid: false, profile: null };

  if (token.startsWith('p1.')) {
    const profile = verifyProfileAccessToken(token);
    return { valid: profile !== null, profile };
  }

  const accessCode = process.env.ACCESS_CODE;
  if (accessCode && verifyAccessToken(token, accessCode)) {
    return { valid: true, profile: null };
  }

  return { valid: false, profile: null };
}
