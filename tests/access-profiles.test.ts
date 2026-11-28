import { afterEach, describe, expect, it } from 'vitest';
import {
  getAccessProfiles,
  profileHasKbAccess,
} from '@/lib/server/access-profiles-shared';
import {
  createProfileAccessToken,
  matchAccessProfileByCode,
  verifyAnyAccessToken,
  verifyProfileAccessToken,
} from '@/lib/server/access-token';
import { verifyAnyAccessTokenEdge } from '@/lib/server/access-token-edge';
import { profileAccessAuthMethod } from '@/lib/server/identity/profile-access';

const ORIGINAL_PROFILES = process.env.ACCESS_PROFILES;
const ORIGINAL_SINGLE_OWNER = process.env.OWNER_SINGLE_USER_ID;

afterEach(() => {
  if (ORIGINAL_PROFILES === undefined) delete process.env.ACCESS_PROFILES;
  else process.env.ACCESS_PROFILES = ORIGINAL_PROFILES;

  if (ORIGINAL_SINGLE_OWNER === undefined) delete process.env.OWNER_SINGLE_USER_ID;
  else process.env.OWNER_SINGLE_USER_ID = ORIGINAL_SINGLE_OWNER;
});

describe('Multi-Profile Access Control', () => {
  it('isolates each child into their own ownerId and KB permissions', async () => {
    process.env.OWNER_SINGLE_USER_ID = 'family-default-owner';
    process.env.ACCESS_PROFILES = JSON.stringify([
      {
        id: 'nila',
        name: 'Nila',
        code: 'nila-secret-code-1234',
        inheritDefaultOwner: true,
        kb: ['ncert'],
        grade: '8',
      },
      {
        id: 'sibling',
        name: 'Sibling',
        code: 'sibling-secret-code-5678',
        kb: [],
        grade: '5',
      },
      {
        id: 'parent',
        name: 'Arul',
        code: 'parent-admin-code-9999',
        role: 'admin',
        kb: [],
      },
    ]);

    const profiles = getAccessProfiles();
    expect(profiles).toHaveLength(3);

    const nila = matchAccessProfileByCode('nila-secret-code-1234');
    const sibling = matchAccessProfileByCode('sibling-secret-code-5678');
    const parent = matchAccessProfileByCode('parent-admin-code-9999');

    expect(nila?.ownerId).toBe('family-default-owner');
    expect(sibling?.ownerId).toBe('profile-sibling');
    expect(parent?.ownerId).toBe('profile-parent');
    expect(matchAccessProfileByCode('wrong-code')).toBeNull();

    // KB scoping
    expect(profileHasKbAccess(nila, 'ncert')).toBe(true);
    expect(profileHasKbAccess(sibling, 'ncert')).toBe(false);
    expect(profileHasKbAccess(parent, 'ncert')).toBe(true);

    // Token creation + verification in both Node and Edge
    const nilaToken = createProfileAccessToken(nila!);
    const siblingToken = createProfileAccessToken(sibling!);

    expect(verifyProfileAccessToken(nilaToken)?.id).toBe('nila');
    expect(verifyAnyAccessToken(siblingToken).profile?.id).toBe('sibling');
    expect(await verifyAnyAccessTokenEdge(nilaToken)).toBe(true);
    expect(await verifyAnyAccessTokenEdge(siblingToken)).toBe(true);
    expect(await verifyAnyAccessTokenEdge(`${nilaToken}tampered`)).toBe(false);

    // OwnerAuthMethod resolves each child's cookie to their own isolated ownerId
    const method = profileAccessAuthMethod();
    const nilaAuth = await method.authenticate({
      headers: new Headers({ cookie: `openmaic_access=${encodeURIComponent(nilaToken)}` }),
    });
    const siblingAuth = await method.authenticate({
      headers: new Headers({ cookie: `openmaic_access=${encodeURIComponent(siblingToken)}` }),
    });

    expect(nilaAuth.status).toBe('authenticated');
    expect(siblingAuth.status).toBe('authenticated');
    if (nilaAuth.status === 'authenticated' && siblingAuth.status === 'authenticated') {
      expect(nilaAuth.principal.ownerId).toBe('family-default-owner');
      expect(siblingAuth.principal.ownerId).toBe('profile-sibling');
      expect(nilaAuth.principal.ownerId).not.toBe(siblingAuth.principal.ownerId);
    }
  });
});
