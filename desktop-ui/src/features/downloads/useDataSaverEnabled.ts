import { useFeatureSnapshot } from '../../bridge';

/** Whether Data Saver is on. While it is, trailers don't play on their own (as on mobile). */
export function useDataSaverEnabled(): boolean {
  return useFeatureSnapshot<{ enabled?: boolean }>('dataSaver')?.enabled ?? false;
}
