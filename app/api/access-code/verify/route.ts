import { cookies } from 'next/headers';
import { timingSafeEqual } from 'crypto';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { ACCESS_TOKEN_MAX_AGE_SECONDS } from '@/lib/server/access-token-shared';
import {
  createAccessToken,
  createProfileAccessToken,
  matchAccessProfileByCode,
} from '@/lib/server/access-token';
import {
  hasAnyAccessGateConfigured,
  toPublicAccessProfile,
} from '@/lib/server/access-profiles-shared';
import { accessCodeAttemptLimiter } from '@/lib/server/attempt-limiter';
import { clientIdentity, isTrustedProxyIdentity } from '@/lib/server/client-identity';
import { warnIfAccessCodeIsShort } from '@/lib/server/access-code-warning';
import { cookiesAreSecure } from '@/lib/server/cookie-secure';

function readCandidateCode(body: unknown): string | null {
  if (typeof body !== 'object' || body === null) return null;
  const candidate = (body as { code?: unknown }).code;
  return typeof candidate === 'string' && candidate.length > 0 ? candidate : null;
}

export async function POST(request: Request) {
  if (!hasAnyAccessGateConfigured()) {
    return apiSuccess({ valid: true });
  }

  const accessCode = process.env.ACCESS_CODE;
  if (accessCode) {
    warnIfAccessCodeIsShort(accessCode);
  }

  const trusted = isTrustedProxyIdentity();
  const identity = clientIdentity(request);
  const limit = accessCodeAttemptLimiter.consume(identity, trusted);
  if (limit.limited) {
    const response = apiError('RATE_LIMITED', 429, 'Too many access-code attempts');
    response.headers.set('Retry-After', String(limit.retryAfterSeconds));
    return response;
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError('INVALID_REQUEST', 400, 'Invalid JSON body');
  }

  const candidate = readCandidateCode(body);
  if (candidate === null) {
    return apiError('INVALID_REQUEST', 401, 'Invalid access code');
  }

  // 1. Check profile-specific access codes first
  const matchedProfile = matchAccessProfileByCode(candidate);
  if (matchedProfile) {
    accessCodeAttemptLimiter.recordSuccess(identity, trusted);
    const token = createProfileAccessToken(matchedProfile);
    const cookieStore = await cookies();
    cookieStore.set('openmaic_access', token, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: ACCESS_TOKEN_MAX_AGE_SECONDS,
      secure: cookiesAreSecure(),
    });
    return apiSuccess({
      valid: true,
      profile: toPublicAccessProfile(matchedProfile),
    });
  }

  // 2. Fallback to legacy single ACCESS_CODE if configured
  if (accessCode) {
    const encoder = new TextEncoder();
    const a = encoder.encode(candidate);
    const b = encoder.encode(accessCode);
    if (a.byteLength === b.byteLength && timingSafeEqual(a, b)) {
      accessCodeAttemptLimiter.recordSuccess(identity, trusted);
      const token = createAccessToken(accessCode);
      const cookieStore = await cookies();
      cookieStore.set('openmaic_access', token, {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        maxAge: ACCESS_TOKEN_MAX_AGE_SECONDS,
        secure: cookiesAreSecure(),
      });
      return apiSuccess({ valid: true, profile: null });
    }
  }

  return apiError('INVALID_REQUEST', 401, 'Invalid access code');
}
