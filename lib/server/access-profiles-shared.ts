/**
 * Edge-compatible multi-profile access control configuration.
 *
 * Reads `ACCESS_PROFILES` (JSON array) so multiple children/users can each sign
 * in with their own access code and get their own isolated OpenMAIC owner
 * workspace (classrooms, folders, history, settings) and per-profile KB access
 * (e.g. `kb: ["ncert"]`).
 *
 * Zero Node-only imports so `middleware.ts` (Edge) and Node routes share the
 * exact same parser and profile rules.
 */

export type AccessProfileRole = 'student' | 'admin';

export interface AccessProfile {
  readonly id: string;
  readonly name: string;
  readonly code: string;
  readonly ownerId: string;
  readonly role: AccessProfileRole;
  readonly kb: readonly string[];
  readonly grade?: string;
  readonly curriculum?: string;
}

export interface PublicAccessProfile {
  readonly id: string;
  readonly name: string;
  readonly role: AccessProfileRole;
  readonly kb: readonly string[];
  readonly grade?: string;
  readonly curriculum?: string;
}

const PROFILE_ID_PATTERN = /^[A-Za-z0-9._-]{1,64}$/;
const OWNER_ID_PATTERN = /^[A-Za-z0-9._-]{1,128}$/;

let cachedRaw: string | undefined;
let cachedSingleOwner: string | undefined;
let cachedProfiles: readonly AccessProfile[] = [];

function normalizeKb(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .map((item) => item.trim().toLowerCase());
}

/**
 * Parses `ACCESS_PROFILES` JSON from the environment. Returns an empty array
 * when unset or empty. Invalid entries are skipped safely so a typo does not
 * crash middleware.
 */
export function getAccessProfiles(): readonly AccessProfile[] {
  const raw = process.env.ACCESS_PROFILES?.trim() ?? '';
  const defaultSingleOwner = process.env.OWNER_SINGLE_USER_ID?.trim() ?? '';
  if (raw === cachedRaw && defaultSingleOwner === cachedSingleOwner) {
    return cachedProfiles;
  }

  cachedRaw = raw;
  cachedSingleOwner = defaultSingleOwner;

  if (!raw) {
    cachedProfiles = [];
    return cachedProfiles;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    console.error('[AccessProfiles] Failed to parse ACCESS_PROFILES JSON');
    cachedProfiles = [];
    return cachedProfiles;
  }

  if (!Array.isArray(parsed)) {
    console.error('[AccessProfiles] ACCESS_PROFILES must be a JSON array');
    cachedProfiles = [];
    return cachedProfiles;
  }

  const seenIds = new Set<string>();
  const profiles: AccessProfile[] = [];

  for (const item of parsed) {
    if (!item || typeof item !== 'object') continue;
    const rec = item as Record<string, unknown>;
    const id = typeof rec.id === 'string' ? rec.id.trim().toLowerCase() : '';
    const name = typeof rec.name === 'string' ? rec.name.trim() : '';
    const code = typeof rec.code === 'string' ? rec.code : '';
    if (!PROFILE_ID_PATTERN.test(id) || !name || !code) continue;
    if (seenIds.has(id)) continue;
    seenIds.add(id);

    const inheritDefaultOwner = rec.inheritDefaultOwner === true;
    const explicitOwnerId =
      typeof rec.ownerId === 'string' && OWNER_ID_PATTERN.test(rec.ownerId.trim())
        ? rec.ownerId.trim()
        : undefined;
    const ownerId =
      explicitOwnerId ??
      (inheritDefaultOwner && defaultSingleOwner && OWNER_ID_PATTERN.test(defaultSingleOwner)
        ? defaultSingleOwner
        : `profile-${id}`);

    const role: AccessProfileRole = rec.role === 'admin' ? 'admin' : 'student';
    const kb = normalizeKb(rec.kb);
    const grade = typeof rec.grade === 'string' && rec.grade.trim() ? rec.grade.trim() : undefined;
    const curriculum =
      typeof rec.curriculum === 'string' && rec.curriculum.trim()
        ? rec.curriculum.trim()
        : undefined;

    profiles.push({
      id,
      name,
      code,
      ownerId,
      role,
      kb,
      grade,
      curriculum,
    });
  }

  cachedProfiles = profiles;
  return cachedProfiles;
}

export function hasProfileAccessConfigured(): boolean {
  return getAccessProfiles().length > 0;
}

export function hasAnyAccessGateConfigured(): boolean {
  return hasProfileAccessConfigured() || Boolean(process.env.ACCESS_CODE);
}

export function findAccessProfileById(profileId: string): AccessProfile | undefined {
  const target = profileId.trim().toLowerCase();
  return getAccessProfiles().find((p) => p.id === target);
}

export function findAccessProfileByOwnerId(ownerId: string): AccessProfile | undefined {
  const target = ownerId.trim();
  return getAccessProfiles().find((p) => p.ownerId === target);
}

export function toPublicAccessProfile(profile: AccessProfile): PublicAccessProfile {
  return {
    id: profile.id,
    name: profile.name,
    role: profile.role,
    kb: profile.kb,
    ...(profile.grade ? { grade: profile.grade } : {}),
    ...(profile.curriculum ? { curriculum: profile.curriculum } : {}),
  };
}

/**
 * Checks whether a given profile has access to a named Knowledge Base (e.g. "ncert").
 * When multi-profile mode is NOT configured at all, defaults to `true` for
 * backward compatibility with single-user deployments.
 */
export function profileHasKbAccess(
  profile: AccessProfile | PublicAccessProfile | null | undefined,
  kbName: string,
): boolean {
  if (!hasProfileAccessConfigured()) return true;
  if (!profile) return false;
  if (profile.role === 'admin') return true;
  return profile.kb.includes(kbName.trim().toLowerCase());
}
