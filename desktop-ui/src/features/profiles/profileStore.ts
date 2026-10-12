import { useCallback, useEffect, useState } from 'react';
import { call, refreshFeature, useFeatureSnapshot } from '../../bridge';

export type ProfileRecord = {
  id: number;
  name: string;
  avatarColorHex: string;
  avatarId: string | null;
  avatarUrl: string | null;
  backgroundId: string | null;
  backgroundUrl: string | null;
  locked: boolean;
  pinLockedUntil: string | null;
  usesPrimaryAddons: boolean;
  addonSyncProfileId?: number | null;
  usesPrimaryPlugins: boolean;
  primaryAddonsAllowlist: string[] | null;
};
export type AvatarChoice = { id: string; name: string; category: string; color: string | null; url: string | null; memberOnly: boolean };
export type BackgroundChoice = { id: string; name: string; url?: string | null };
export type ProfilesSnapshot = { items: ProfileRecord[]; activeProfile: number | null; rememberLastProfileEnabled: boolean; avatars: AvatarChoice[]; backgrounds: BackgroundChoice[] };

export async function loadProfiles(): Promise<ProfilesSnapshot> {
  return call<ProfilesSnapshot>('profiles.snapshot');
}

export async function mutateProfile(method: string, params: Record<string, unknown>) {
  await call(method, params);
  return loadProfiles();
}

export function useProfiles() {
  const snapshot = useFeatureSnapshot<ProfilesSnapshot>('profiles') ?? null;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const refresh = useCallback(async () => {
    setLoading(true);
    try { await refreshFeature<ProfilesSnapshot>('profiles'); setError(''); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not load profiles.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  const run = useCallback(async (method: string, params: Record<string, unknown>) => {
    await call(method, params);
    const next = await refreshFeature<ProfilesSnapshot>('profiles');
    setError('');
    return next;
  }, []);
  return { snapshot, loading, error, refresh, run, setError };
}
