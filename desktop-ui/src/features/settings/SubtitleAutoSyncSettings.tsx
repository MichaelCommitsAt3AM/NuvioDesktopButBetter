import type { SubtitleAutoSyncPreferences } from '../../generated/contract';

export function SubtitleAutoSyncSettings({ preferences, preferredLanguage, onChange }: {
  preferences: SubtitleAutoSyncPreferences;
  preferredLanguage: string;
  onChange: (key: string, value: unknown) => void;
}) {
  const available = Boolean(preferredLanguage) && !['none', 'forced'].includes(preferredLanguage);
  return <>
    <div className="settings-control-row"><span className="settings-control-copy"><strong>Subtitle auto sync</strong><span>Align external subtitles to the video. Choose a preferred subtitle language to enable this.</span></span>
      <label className="switch"><input aria-label="Subtitle auto sync" type="checkbox" checked={preferences.enabled} disabled={!available} onChange={event => onChange('subtitleAutoSyncEnabled', event.target.checked)} /><span /></label>
    </div>
    {preferences.enabled && <>
      <div className="settings-control-row"><span className="settings-control-copy"><strong>Thorough subtitle search</strong><span>Keep searching for a stronger match. Turn off to stop at the first reliable match.</span></span>
        <label className="switch"><input aria-label="Thorough subtitle search" type="checkbox" checked={preferences.aggressiveMode} onChange={event => onChange('subtitleAutoSyncAggressiveMode', event.target.checked)} /><span /></label>
      </div>
      <div className="settings-control-row"><label className="settings-control-copy" htmlFor="subtitle-sync-tolerance"><strong>Sync tolerance</strong><span>Keep original timing when the correction is within this tolerance.</span></label>
        <select id="subtitle-sync-tolerance" aria-label="Sync tolerance" value={preferences.toleranceMs} onChange={event => onChange('subtitleAutoSyncToleranceMs', Number(event.target.value))}>
          {[0, 100, 200, 300, 400, 500].map(value => <option key={value} value={value}>{value ? `${value} ms` : 'Off'}</option>)}
        </select>
      </div>
    </>}
  </>;
}
