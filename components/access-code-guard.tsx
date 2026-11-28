'use client';

import {
  Fragment,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { AccessCodeModal } from '@/components/access-code-modal';
import { importLegacyModelSettings } from '@/components/model-settings-init';
import { modelSettingsClient } from '@/lib/model-settings/client';
import { reloadAgentRegistry } from '@/lib/orchestration/registry/store';
import type { PublicAccessProfile } from '@/lib/server/access-profiles-shared';

const AccessCodeGateContext = createContext(true);

export interface ActiveProfileContextValue {
  profile: PublicAccessProfile | null;
  profilesEnabled: boolean;
  hasNcertKb: boolean;
  switchProfile: () => Promise<void>;
}

const ActiveProfileContext = createContext<ActiveProfileContextValue>({
  profile: null,
  profilesEnabled: false,
  hasNcertKb: true,
  switchProfile: async () => {},
});

export function useAccessCodeGateOpen(): boolean {
  return useContext(AccessCodeGateContext);
}

export function useActiveProfile(): ActiveProfileContextValue {
  return useContext(ActiveProfileContext);
}

export function AccessCodeGuard({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<{
    enabled: boolean;
    authenticated: boolean;
    profilesEnabled: boolean;
    profile: PublicAccessProfile | null;
    loading: boolean;
  }>({
    enabled: false,
    authenticated: false,
    profilesEnabled: false,
    profile: null,
    loading: true,
  });
  const [grantedCount, setGrantedCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/access-code/status')
      .then((res) => res.json())
      .then((raw) => {
        const data = raw?.data ?? raw;
        if (!cancelled) {
          setStatus({
            enabled: Boolean(data?.enabled),
            authenticated: Boolean(data?.authenticated),
            profilesEnabled: Boolean(data?.profilesEnabled),
            profile: (data?.profile as PublicAccessProfile | null) ?? null,
            loading: false,
          });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setStatus({
            enabled: true,
            authenticated: false,
            profilesEnabled: false,
            profile: null,
            loading: false,
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const switchProfile = useCallback(async () => {
    try {
      await fetch('/api/access-code/logout', { method: 'POST' });
    } catch {
      /* ignore network errors */
    }
    if (typeof window !== 'undefined') {
      window.location.href = '/';
    }
  }, []);

  const hasNcertKb = useMemo(() => {
    if (!status.profilesEnabled) return true;
    if (!status.profile) return false;
    if (status.profile.role === 'admin') return true;
    return status.profile.kb.includes('ncert');
  }, [status.profilesEnabled, status.profile]);

  const profileValue = useMemo<ActiveProfileContextValue>(
    () => ({
      profile: status.profile,
      profilesEnabled: status.profilesEnabled,
      hasNcertKb,
      switchProfile,
    }),
    [status.profile, status.profilesEnabled, hasNcertKb, switchProfile],
  );

  const needsAuth = !status.loading && status.enabled && !status.authenticated;
  const gateOpen = !status.loading && !needsAuth;

  return (
    <AccessCodeGateContext.Provider value={gateOpen}>
      <ActiveProfileContext.Provider value={profileValue}>
        {needsAuth && (
          <AccessCodeModal
            open={true}
            onSuccess={(nextProfile) => {
              setStatus((s) => ({
                ...s,
                authenticated: true,
                profile: nextProfile ?? s.profile,
              }));
              setGrantedCount((n) => n + 1);
              void modelSettingsClient.load();
              void importLegacyModelSettings();
              void reloadAgentRegistry();
              void import('@/lib/legacy-browser-import')
                .then(({ resumeLegacyBrowserImportAfterAccess }) =>
                  resumeLegacyBrowserImportAfterAccess(),
                )
                .catch((error: unknown) =>
                  console.warn('[legacy-browser-import] Could not load:', error),
                );
            }}
          />
        )}
        <Fragment key={grantedCount}>{children}</Fragment>
      </ActiveProfileContext.Provider>
    </AccessCodeGateContext.Provider>
  );
}
