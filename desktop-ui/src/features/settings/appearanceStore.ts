import { useCallback, useEffect, useState } from 'react';
import { call, refreshFeature, useFeatureSnapshot } from '../../bridge';

export type AppearanceSnapshot = {
  theme: string;
  themes?: Array<{ id: string; label: string; background: string; accent: string; surface: string }>;
  customThemeColors: string[];
  customThemeGradientEnabled: boolean;
  trailerPlaybackMode?: string;
  amoledEnabled: boolean;
  navigationLayout: 'sidebar' | 'topbar';
  navBarStyle: 'adaptive' | 'expanded' | 'compact' | 'classic';
  navBarGlowEnabled: boolean;
  posters: { pattern: string; enabledScreens: string[]; activeScreens: string[] };
  home: { heroEnabled: boolean; showCatalogType: boolean; hideUnreleasedContent: boolean; heroSourceSelectionLimit?: number; isCatalogLoading?: boolean; catalogErrorMessage?: string | null; items: HomeSetting[] };
  continueWatching: { visible: boolean; style: 'card' | 'wide' | 'poster'; upNextFromFurthestEpisode: boolean; useEpisodeThumbnails: boolean; showUnairedNextUp: boolean; blurNextUp: boolean; showResumePromptOnLaunch: boolean; sortMode: 'default' | 'streaming_style' | 'split_upcoming'; dismissedNextUpKeys: string[] };
  cardStyle: { widthDp: number; heightDp: number; cornerRadiusDp: number; catalogLandscapeModeEnabled: boolean; hideLabelsEnabled: boolean; hoverPreviewEnabled: boolean; hoverPreviewOpenDelayMillis: number; hoverPreviewTrailerEnabled: boolean; hoverPreviewTrailerSoundEnabled: boolean; hoverPreviewTrailerStartSeconds: number; alwaysShowLandscapeClearlogo: boolean };
  cardDepth: { enabled: boolean; edgeStrength: number; sheenStrength: number; edgeCoverage: number; postersEnabled: boolean; continueWatchingEnabled: boolean; episodeCardsEnabled: boolean; castEnabled: boolean; trailersEnabled: boolean };
  appIcon?: { selected: string; changeFailed: boolean; options: string[] };
};
export type HomeSetting = { key: string; title: string; addonName: string; isPinnedToTop: boolean; defaultTitle: string; customTitle: string | null; enabled: boolean; heroSourceEnabled: boolean; order: number; isCollection: boolean; collectionId: string | null };

export function useAppearance() {
  const snapshot = useFeatureSnapshot<AppearanceSnapshot>('appearance') ?? null;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const refresh = useCallback(async () => {
    setLoading(true);
    try { await refreshFeature<AppearanceSnapshot>('appearance'); setError(''); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not load appearance settings.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  const update = useCallback(async (method: string, params: Record<string, unknown> = {}) => {
    setError('');
    try {
      await call(method, params);
      const next = await refreshFeature<AppearanceSnapshot>('appearance');
      return next;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save this setting.');
      throw cause;
    }
  }, []);
  return { snapshot, loading, error, refresh, update, setError };
}
