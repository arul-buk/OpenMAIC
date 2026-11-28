import { cookies } from 'next/headers';
import { apiSuccess } from '@/lib/server/api-response';
import { verifyAnyAccessToken } from '@/lib/server/access-token';
import {
  hasAnyAccessGateConfigured,
  hasProfileAccessConfigured,
  toPublicAccessProfile,
} from '@/lib/server/access-profiles-shared';

export async function GET() {
  const enabled = hasAnyAccessGateConfigured();
  const profilesEnabled = hasProfileAccessConfigured();

  let authenticated = false;
  let profile = null;

  if (enabled) {
    const cookieStore = await cookies();
    const token = cookieStore.get('openmaic_access')?.value;
    const verified = verifyAnyAccessToken(token);
    authenticated = verified.valid;
    profile = verified.profile ? toPublicAccessProfile(verified.profile) : null;
  }

  return apiSuccess({ enabled, authenticated, profilesEnabled, profile });
}
