import {
  isAccessTokenSignatureFormatValid,
  isAccessTokenTimestampValid,
} from './access-token-shared';
import { findAccessProfileById } from './access-profiles-shared';

/**
 * Edge-compatible verifier for HMAC-signed access tokens.
 *
 * Supports both legacy single-code tokens (`timestamp.signature`) and
 * profile-bound tokens (`p1.<profileId>.<timestamp>.<signature>`).
 * Deliberately uses only the Web Crypto API so Edge middleware can import it.
 */

function encode(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}

function bufToHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function verifyHmacHexEdge(
  secret: string,
  payload: string,
  signature: string,
): Promise<boolean> {
  const keyData = encode(secret);
  const key = await crypto.subtle.importKey(
    'raw',
    keyData.buffer as ArrayBuffer,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const data = encode(payload);
  const expected = bufToHex(await crypto.subtle.sign('HMAC', key, data.buffer as ArrayBuffer));

  if (signature.length !== expected.length) return false;
  let mismatch = 0;
  for (let i = 0; i < signature.length; i++) {
    mismatch |= signature.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return mismatch === 0;
}

/** Verify a legacy HMAC-signed token using Web Crypto API (Edge-compatible) */
export async function verifyAccessTokenEdge(token: string, accessCode: string): Promise<boolean> {
  const dotIndex = token.indexOf('.');
  if (dotIndex === -1) return false;

  const timestamp = token.substring(0, dotIndex);
  const signature = token.substring(dotIndex + 1);

  if (!isAccessTokenTimestampValid(timestamp)) return false;
  if (!isAccessTokenSignatureFormatValid(signature)) return false;

  return verifyHmacHexEdge(accessCode, timestamp, signature);
}

/** Verify a profile-bound `p1.<profileId>.<timestamp>.<signature>` token in Edge middleware. */
export async function verifyProfileAccessTokenEdge(token: string): Promise<boolean> {
  const parts = token.split('.');
  if (parts.length !== 4 || parts[0] !== 'p1') return false;

  const [, profileId, timestamp, signature] = parts;
  if (!isAccessTokenTimestampValid(timestamp)) return false;
  if (!isAccessTokenSignatureFormatValid(signature)) return false;

  const profile = findAccessProfileById(profileId);
  if (!profile) return false;

  return verifyHmacHexEdge(profile.code, `p1.${profile.id}.${timestamp}`, signature);
}

/** Verify either a profile token (`p1.*`) or legacy single-code token in Edge middleware. */
export async function verifyAnyAccessTokenEdge(
  token: string,
  legacyAccessCode?: string,
): Promise<boolean> {
  if (token.startsWith('p1.')) {
    return verifyProfileAccessTokenEdge(token);
  }
  if (legacyAccessCode) {
    return verifyAccessTokenEdge(token, legacyAccessCode);
  }
  return false;
}
