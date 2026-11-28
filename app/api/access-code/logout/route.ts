import { cookies } from 'next/headers';
import { apiSuccess } from '@/lib/server/api-response';
import { cookiesAreSecure } from '@/lib/server/cookie-secure';

/** Clears the active profile / access-code session so another user can sign in. */
export async function POST() {
  const cookieStore = await cookies();
  cookieStore.set('openmaic_access', '', {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
    secure: cookiesAreSecure(),
  });
  return apiSuccess({ loggedOut: true });
}
