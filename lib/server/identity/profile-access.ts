import { cookies } from 'next/headers';

import {
  findAccessProfileByOwnerId,
  hasProfileAccessConfigured,
  type AccessProfile,
} from '@/lib/server/access-profiles-shared';
import { verifyProfileAccessToken } from '@/lib/server/access-token';
import type { OwnerAuthMethod, OwnerAuthMethodResult, OwnerPrincipal } from './types';
import { OWNER_ROLES } from './types';

function readCookieFromHeader(cookieHeader: string | null, name: string): string | undefined {
  if (!cookieHeader) return undefined;
  const parts = cookieHeader.split(';');
  for (const part of parts) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    const key = part.slice(0, eq).trim();
    if (key === name) {
      const val = part.slice(eq + 1).trim();
      try {
        return decodeURIComponent(val);
      } catch {
        return val;
      }
    }
  }
  return undefined;
}

function rolesForProfile(profile: AccessProfile): ReadonlySet<string> {
  return profile.role === 'admin'
    ? new Set<string>([OWNER_ROLES.coursePublish, OWNER_ROLES.admin])
    : new Set<string>([OWNER_ROLES.coursePublish]);
}

function principalForProfile(profile: AccessProfile): OwnerPrincipal {
  return {
    ownerId: profile.ownerId,
    kind: 'user',
    roles: rolesForProfile(profile),
    assurance: 'verified',
    channel: 'profile-access',
  };
}

/**
 * Helper for route handlers (e.g. `/api/ncert/*`, `/api/help-me-learn/plan`)
 * that want the active logged-in profile from the request cookie.
 */
export function resolveAccessProfileFromRequest(req: Request): AccessProfile | null {
  if (!hasProfileAccessConfigured()) return null;
  const token = readCookieFromHeader(req.headers.get('cookie'), 'openmaic_access');
  if (!token) return null;
  return verifyProfileAccessToken(token);
}

/** Helper for Server Components / Server Actions reading `next/headers` cookies. */
export async function resolveAccessProfileFromCookies(): Promise<AccessProfile | null> {
  if (!hasProfileAccessConfigured()) return null;
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('openmaic_access')?.value;
    if (!token) return null;
    return verifyProfileAccessToken(token);
  } catch {
    return null;
  }
}

/**
 * Multi-profile owner auth method.
 *
 * When `ACCESS_PROFILES` is configured, reads the signed `openmaic_access`
 * cookie (`p1.<profileId>.<timestamp>.<hmac>`) and resolves the request's
 * OpenMAIC `ownerId` directly to that profile's isolated `ownerId`.
 * Every classroom, folder, material, agent, and setting is therefore scoped to
 * the logged-in child/user automatically.
 */
export function profileAccessAuthMethod(): OwnerAuthMethod {
  return {
    name: 'profileAccess',
    authenticate: async (req): Promise<OwnerAuthMethodResult> => {
      if (!hasProfileAccessConfigured()) return { status: 'not-applicable' };
      const token = readCookieFromHeader(req.headers.get('cookie'), 'openmaic_access');
      if (!token) return { status: 'not-applicable' };
      if (!token.startsWith('p1.')) return { status: 'not-applicable' };

      const profile = verifyProfileAccessToken(token);
      if (!profile) return { status: 'invalid' };
      return { status: 'authenticated', principal: principalForProfile(profile) };
    },
    authenticateFromContext: async (): Promise<OwnerAuthMethodResult> => {
      if (!hasProfileAccessConfigured()) return { status: 'not-applicable' };
      const profile = await resolveAccessProfileFromCookies();
      if (!profile) return { status: 'not-applicable' };
      return { status: 'authenticated', principal: principalForProfile(profile) };
    },
    describeStoredOwner: (storedId) => {
      const profile = findAccessProfileByOwnerId(storedId);
      if (!profile) return undefined;
      return { kind: 'user', roles: rolesForProfile(profile) };
    },
  };
}
