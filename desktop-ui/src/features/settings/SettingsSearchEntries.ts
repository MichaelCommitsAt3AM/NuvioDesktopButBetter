/** Searchable SettingsIndex modeled on the shared Kotlin SettingsSearchIndex.
 * Routes intentionally point at concrete desktop Settings pages; row-level
 * entries share the route of the control they describe.
 */
import { settingsMatchScore } from './settingsSearchMatching';

export type SettingsSearchEntry = {
  key: string;
  title: string;
  description: string;
  page: string;
  section: string;
  category: 'account' | 'general' | 'about' | 'advanced';
  route: string;
  keywords?: string;
  target?: string;
};

/** Require every meaningful query word, then rank specific controls over page matches. */
export function searchSettings(query: string, entries = settingsSearchEntries): SettingsSearchEntry[] {
  return entries.filter(entry => !['account-delete', 'external-player', 'tunneled-playback', 'dv7-hevc', 'libass-render'].includes(entry.key))
    .map((entry, index) => ({ entry, index, score: settingsMatchScore(query, [
      [entry.title, 50], [entry.keywords ?? '', 35], [entry.description, 20],
      [entry.page, 10], [entry.section, 10], [entry.category, 5], [entry.route, 3],
    ]) })).filter(result => result.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index).map(result => result.entry);
}

export function settingsResultRoute(entry: SettingsSearchEntry) {
  return entry.route.startsWith('/settings/') ? `${entry.route}?setting=${encodeURIComponent(entry.key)}` : entry.route;
}

export function settingsResultDescription(entry: SettingsSearchEntry) {
  const path = [...new Set([entry.page, entry.section].filter(Boolean))].join(' › ');
  return entry.description.trim() ? `${path} — ${entry.description}` : path;
}

const page = (key: string, title: string, description: string, route: string, category: SettingsSearchEntry['category'] = 'general') => ({ key, title, description, page: title, section: '', category, route });
const row = (key: string, title: string, description: string, pageTitle: string, section: string, route: string, category: SettingsSearchEntry['category'] = 'general') => ({ key, title, description, page: pageTitle, section, category, route });

/** Entries reflect controls/pages implemented in the desktop Settings UI. */
export const settingsSearchEntries: SettingsSearchEntry[] = [
  { key: 'switch-profile', title: 'Switch Profile', description: 'Change to a different profile.', page: 'Account', section: 'Account', category: 'account', route: '/profiles/choose' },
  page('account', 'Account', 'Account and sync status', '/settings/account', 'account'),
  row('account-status', 'Account status', '', 'Account', 'Account', '/settings/account', 'account'),
  row('account-sign-out', 'Sign out', '', 'Account', 'Account', '/settings/account', 'account'),
  row('account-delete', 'Delete account', 'Permanently delete your account and associated data.', 'Account', 'Account', '/settings/account', 'account'),
  page('tracking', 'Tracking', 'Connect tracking providers and choose which one powers your Library and Continue Watching.', '/settings/integrations/tracking', 'account'),
  row('simkl-authentication', 'Simkl', 'Connect or disconnect your Simkl account.', 'Tracking', 'Tracking providers', '/settings/integrations/tracking', 'account'),
  row('mdblist-authentication', 'MDBList', 'Connect or disconnect your MDBList account.', 'Tracking', 'Tracking providers', '/settings/integrations/tracking', 'account'),
  page('layout', 'Layout', 'Home, streams, collections, and detail pages', '/settings/appearance'),
  row('theme', 'Theme', 'Choose the application color theme.', 'Layout', 'Theme', '/settings/appearance'),
  row('amoled', 'AMOLED black', 'Use a true black background.', 'Layout', 'Display', '/settings/appearance'),
  row('app-language', 'App language', 'Choose the language used by Nuvio.', 'Layout', 'Display', '/settings/appearance'),
  page('content-discovery', 'Content & Discovery', 'Manage addons and discovery sources.', '/settings/content'),
  page('addons', 'Addons', 'Install and manage catalog, metadata, and stream addons.', '/settings/content/addons'),
  page('plugins', 'Plugins', 'Manage scraper plugins and their availability.', '/settings/content/plugins'),
  row('recent-searches', 'Recent searches', 'Clear or manage recent searches.', 'Content & Discovery', 'Search', '/settings/content'),
  page('playback', 'Playback', 'Player, subtitles, and auto-play', '/settings/playback'),
  row('loading-overlay', 'Show loading overlay', 'Show a loading indicator while playback starts.', 'Playback', 'Player', '/settings/playback'),
  row('player-loading-status', 'Show player loading status', 'Display player loading details.', 'Playback', 'Player', '/settings/playback'),
  row('pause-overlay', 'Pause overlay', 'Show playback information while paused.', 'Playback', 'Player', '/settings/playback'),
  row('parental-guide', 'Parental guide', 'Show parental guidance information.', 'Playback', 'Player', '/settings/playback'),
  row('external-player', 'External player', 'Choose whether to open playback in an external player.', 'Playback', 'Player', '/settings/playback'),
  row('audio-language', 'Preferred audio language', 'Set the preferred audio track language.', 'Playback', 'Subtitle & Audio', '/settings/playback'),
  row('secondary-audio', 'Secondary preferred audio language', 'Set a fallback audio track language.', 'Playback', 'Subtitle & Audio', '/settings/playback'),
  row('subtitle-language', 'Preferred subtitle language', 'Set the preferred subtitle language.', 'Playback', 'Subtitle & Audio', '/settings/playback'),
  row('secondary-subtitles', 'Secondary preferred subtitle language', 'Set a fallback subtitle language.', 'Playback', 'Subtitle & Audio', '/settings/playback'),
  row('subtitle-auto-sync', 'Subtitle auto sync', 'Align external subtitles with the playing video.', 'Playback', 'Subtitle auto sync', '/settings/playback'),
  row('subtitle-sync-mode', 'Thorough subtitle search', 'Continue searching subtitle references for a stronger match.', 'Playback', 'Subtitle auto sync', '/settings/playback'),
  row('subtitle-sync-tolerance', 'Sync tolerance', 'Keep original timing for corrections within the selected tolerance.', 'Playback', 'Subtitle auto sync', '/settings/playback'),
  row('chapters', 'Show chapters', 'Navigate embedded video chapters.', 'Playback', 'Player', '/settings/playback'),
  row('subtitle-style', 'Subtitle style', 'Adjust subtitle color, background, outline, size, and position.', 'Playback', 'Subtitle & Audio', '/settings/playback'),
  row('reuse-last-link', 'Reuse last stream link', 'Reuse a recently selected stream when possible.', 'Playback', 'Stream Selection', '/settings/playback'),
  row('last-link-cache', 'Last link cache duration', 'Choose how long the last stream link is kept.', 'Playback', 'Stream Selection', '/settings/playback'),
  row('stream-mode', 'Stream selection mode', 'Choose how Nuvio selects a stream automatically.', 'Playback', 'Stream Auto-play', '/settings/playback'),
  row('regex-pattern', 'Regex pattern', 'Match streams using a regular expression.', 'Playback', 'Stream Auto-play', '/settings/playback'),
  row('stream-timeout', 'Stream timeout', 'Set how long automatic stream selection waits.', 'Playback', 'Stream Auto-play', '/settings/playback'),
  row('source-scope', 'Source scope', 'Choose which sources automatic selection can use.', 'Playback', 'Stream Auto-play', '/settings/playback'),
  row('allowed-addons', 'Allowed addons', 'Choose addons used for automatic selection.', 'Playback', 'Stream Auto-play', '/settings/playback'),
  row('allowed-plugins', 'Allowed plugins', 'Choose plugins used for automatic selection.', 'Playback', 'Stream Auto-play', '/settings/playback'),
  row('decoder-priority', 'Decoder priority', 'Choose the preferred video decoder.', 'Playback', 'Decoder', '/settings/playback'),
  row('dv7-hevc', 'Map Dolby Vision 7 to HEVC', 'Use HEVC compatibility mapping for Dolby Vision profile 7.', 'Playback', 'Decoder', '/settings/playback'),
  row('tunneled-playback', 'Tunneled playback', 'Use tunneled playback where supported.', 'Playback', 'Decoder', '/settings/playback'),
  row('libass', 'Enable libass', 'Use libass for subtitle rendering.', 'Playback', 'Subtitle Rendering', '/settings/playback'),
  row('libass-render', 'Subtitle render type', 'Choose the subtitle render type.', 'Playback', 'Subtitle Rendering', '/settings/playback'),
  row('skip-intro', 'Skip intro', 'Automatically skip detected intro segments.', 'Playback', 'Skip Segments', '/settings/playback'),
  row('anime-skip', 'Anime skip segments', 'Use Anime Skip to detect opening and ending segments.', 'Playback', 'Skip Segments', '/settings/playback'),
  row('anime-skip-client', 'Anime Skip client ID', 'Configure the Anime Skip client identifier.', 'Playback', 'Skip Segments', '/settings/playback'),
  row('intro-submit', 'Submit intro segments', 'Allow submitting segment timestamps.', 'Playback', 'Skip Segments', '/settings/playback'),
  row('introdb-key', 'IntroDB API key', 'Configure an IntroDB API key.', 'Playback', 'Skip Segments', '/settings/playback'),
  row('next-episode', 'Auto-play next episode', 'Automatically play the next episode.', 'Playback', 'Next Episode', '/settings/playback'),
  row('prefer-binge', 'Prefer binge group', 'Prefer streams from the same binge group.', 'Playback', 'Next Episode', '/settings/playback'),
  row('threshold-mode', 'Next episode threshold mode', 'Choose when the next episode prompt appears.', 'Playback', 'Next Episode', '/settings/playback'),
  row('threshold-percent', 'Next episode threshold percentage', 'Set the percentage point for the next episode prompt.', 'Playback', 'Next Episode', '/settings/playback'),
  row('threshold-minutes', 'Minutes before end', 'Set how many minutes before the end to show next episode.', 'Playback', 'Next Episode', '/settings/playback'),
  page('streams', 'Streams', 'Choose stream details and badges shown in stream results.', '/settings/appearance/streams'),
  row('stream-prefer-matching-titles', 'Prefer matching titles', 'Prefer stream results that match the title.', 'Streams', 'Stream Selection', '/settings/appearance/streams'),
  row('stream-addon-logo', 'Show addon logo', 'Show the source addon logo on stream rows.', 'Streams', 'Stream Display', '/settings/appearance/streams'),
  row('stream-size-badges', 'Stream size badges', 'Show file size labels on stream results.', 'Streams', 'Badges', '/settings/appearance/streams'),
  page('integrations', 'Integrations', 'Manage available integrations', '/settings/integrations'),
  page('connected-services', 'Connected Services', 'Debrid providers, playable links, cloud library and result management.', '/settings/integrations/debrid'),
  row('result-management', 'Result management', 'Filter and sort stream results by file size, resolution, quality, language and release group.', 'Connected Services', 'Result management', '/settings/integrations/debrid'),
  { ...row('size-range', 'Size range', 'Choose the minimum and maximum file size in MB or GB, including custom sizes.', 'Connected Services', 'Result management', '/settings/integrations/debrid'), keywords: 'file size filter limit minimum maximum filesize' },
  ...[
    ['max-results', 'Max results', 'Limit how many stream results appear.'],
    ['per-resolution-limit', 'Per resolution limit', 'Cap repeated 2160p 1080p 720p stream results.'],
    ['per-quality-limit', 'Per quality limit', 'Cap repeated BluRay WEB-DL REMUX results.'],
    ...['Preferred', 'Required', 'Excluded'].flatMap(mode => ['resolutions', 'qualities', 'visual tags', 'audio tags', 'languages', 'release groups'].map(kind => [
      `${mode}-${kind}`.toLowerCase().replaceAll(' ', '-'), `${mode} ${kind}`,
      `Filter stream results: ${mode.toLowerCase()} ${kind}. ${kind === 'visual tags' ? 'HDR Dolby Vision IMAX 10bit.' : kind === 'audio tags' ? 'Atmos TrueHD DTS AAC.' : kind === 'resolutions' ? '4K 2160p 1080p 720p.' : kind === 'qualities' ? 'BluRay WEB-DL REMUX.' : ''}`,
    ])),
  ].map(([key, title, description]) => row(`results-${key}`, title, description, 'Connected Services', 'Result management', '/settings/integrations/debrid')),
  ...[
    ['resolve-links', 'Resolve playable links', 'Enable debrid link resolution for Real Debrid AllDebrid TorBox Premiumize.'],
    ['resolver-provider', 'Resolve with', 'Choose your resolver provider account.'],
    ['prepare-links', 'Prepare links', 'Prepare instant playback links in advance.'],
    ['links-to-prepare', 'Links to prepare', 'Choose how many links are prepared.'],
    ['cloud-library', 'Cloud library', 'Browse your cloud files and downloads.'],
    ['name-template', 'Name template', 'Customize stream result name formatting.'],
    ['description-template', 'Description template', 'Customize stream result description formatting.'],
  ].map(([key, title, description]) => row(key, title, description, 'Connected Services', 'Integrations', '/settings/integrations/debrid')),
  page('media-servers', 'Media servers', 'Connect Jellyfin and Emby server libraries.', '/settings/integrations/servers'),
  page('downloads', 'Downloads', 'Download filters, automatic download rules, data saver and allowed sources.', '/settings/downloads'),
  page('peer-to-peer', 'Peer-to-peer', 'P2P torrent streaming, uploads, cache size and streaming profile.', '/settings/peer-to-peer'),
  ...['Enable peer-to-peer streaming', 'Allow uploads', 'Hide torrent stats', 'Streaming profile', 'Cache size', 'Peer cache'].map(title => row(`p2p-${title.toLowerCase().replaceAll(' ', '-')}`, title, 'Torrent peer-to-peer streaming settings.', 'Peer-to-peer', 'Peer-to-peer streaming', '/settings/peer-to-peer')),
  ...[
    ['navigation', 'Desktop navigation', '/settings/appearance', 'Choose sidebar or top bar layout.'],
    ['navigation-style', 'Navigation style', '/settings/appearance/navigation', 'Choose navigation appearance.'],
    ['accent-glow', 'Accent glow', '/settings/appearance/navigation', 'Glow around the navigation selection.'],
    ['custom-theme', 'Custom theme', '/settings/appearance', 'Customize accent colors and gradients.'],
    ['app-icon', 'App Icon', '/settings/appearance', 'Choose application icon branding.'],
    // Hover Preview settings are intentionally hidden from navigation and search.
    // ['hover-enabled', 'Enable hover preview', '/settings/appearance/hover-preview', 'Show movie details on mouse hover.'],
    // ['hover-delay', 'Preview delay', '/settings/appearance/hover-preview', 'Wait before showing a poster preview.'],
    // ['hover-trailers', 'Play trailer previews', '/settings/appearance/hover-preview', 'Autoplay video previews on hover.'],
    // ['hover-sound', 'Trailer preview sound', '/settings/appearance/hover-preview', 'Mute or enable preview audio.'],
    // ['hover-start', 'Trailer start time', '/settings/appearance/hover-preview', 'Skip the beginning of trailer previews.'],
  ].map(([key, title, route, description]) => row(key, title, description, 'Layout', 'Appearance', route)),
  ...[
    ['hold-to-speed', 'Hold to speed', 'Press and hold to temporarily speed up playback.'],
    ['hold-speed', 'Hold playback speed', 'Choose fast forward speed while holding.'],
    ['subtitle-size', 'Subtitle size', 'Change subtitle font text size.'],
    ['subtitle-color', 'Text color', 'Change subtitle color.'],
    ['subtitle-offset', 'Vertical offset', 'Move subtitle position up or down.'],
    ['subtitle-bold', 'Bold subtitles', 'Use bold subtitle text.'],
    ['forced-subtitles', 'Use Forced Subtitles', 'Display forced foreign language dialogue.'],
    ['strip-sdh', 'Strip SDH Subtitles', 'Remove hearing impaired closed caption annotations.'],
    ['rtx-super-resolution', 'RTX Video Super Resolution', 'NVIDIA AI video upscaling.'],
    ['preload-next', 'Preload Next Episode Sources', 'Search for next episode streams in the background.'],
  ].map(([key, title, description]) => row(key, title, description, 'Playback', 'Player', '/settings/playback')),
  row('discord-presence', 'Discord Rich Presence', 'Show what you are watching in Discord activity.', 'Advanced', 'Integrations', '/settings/advanced', 'advanced'),
  page('tmdb', 'TMDB Enrichment', 'Configure metadata enrichment and your personal API key.', '/settings/integrations/tmdb'),
  row('tmdb-enable', 'Enable TMDB enrichment', 'Use TMDB to add artwork and information to supported pages.', 'TMDB Enrichment', 'TMDB Enrichment', '/settings/integrations/tmdb'),
  row('tmdb-api-key', 'Personal API key', 'Use your own TMDB API key, or leave blank to use the default.', 'TMDB Enrichment', 'TMDB Enrichment', '/settings/integrations/tmdb'),
  row('tmdb-language', 'Preferred language', 'Set the language used for TMDB metadata.', 'TMDB Enrichment', 'Localization', '/settings/integrations/tmdb'),
  ...['Trailers','Artwork','Basic Info','Details','Credits','Productions','Networks','Episodes','Season posters','More Like This','Collections'].map((name) => row(`tmdb-${name.toLowerCase().replaceAll(' ', '-')}`, name, `Choose whether TMDB ${name.toLowerCase()} are included.`, 'TMDB Enrichment', 'Metadata modules', '/settings/integrations/tmdb')),
  page('mdblist', 'MDBList Ratings', 'Manage external rating providers.', '/settings/integrations/mdblist'),
  row('mdb-enable', 'Enable MDBList Ratings', 'Fetch ratings from external providers in metadata detail screen.', 'MDBList Ratings', 'MDBList Ratings', '/settings/integrations/mdblist'),
  row('mdb-api-key', 'MDBList API key', 'Configure your MDBList API key.', 'MDBList Ratings', 'MDBList Ratings', '/settings/integrations/mdblist'),
  ...['IMDb','TMDB','Rotten Tomatoes','Metacritic','Trakt','Letterboxd','Audience score'].map((name) => row(`mdb-${name.toLowerCase().replaceAll(' ', '-')}`, name, `Show ${name} ratings from MDBList.`, 'MDBList Ratings', 'Rating providers', '/settings/integrations/mdblist')),
  page('continue-watching', 'Continue Watching', 'Configure Continue Watching behavior.', '/settings/appearance/continue-watching'),
  row('show-continue-watching', 'Show Continue Watching', 'Show or hide the Continue Watching shelf.', 'Continue Watching', 'Visibility', '/settings/appearance/continue-watching'),
  row('episode-thumbnails', 'Use episode thumbnails', 'Use episode artwork for Continue Watching items.', 'Continue Watching', 'Up Next Behavior', '/settings/appearance/continue-watching'),
  row('up-next', 'Up Next', 'Configure the Up Next row.', 'Continue Watching', 'Up Next Behavior', '/settings/appearance/continue-watching'),
  row('unaired-next-up', 'Show unaired next up', 'Include unaired episodes in Up Next.', 'Continue Watching', 'Up Next Behavior', '/settings/appearance/continue-watching'),
  row('blur-next-up', 'Blur next up', 'Blur artwork for next-up episodes.', 'Continue Watching', 'Up Next Behavior', '/settings/appearance/continue-watching'),
  row('resume-prompt', 'Resume prompt', 'Configure the resume playback prompt.', 'Continue Watching', 'On Launch', '/settings/appearance/continue-watching'),
  page('poster-card-style', 'Poster Customization', 'Customize poster cards and labels.', '/settings/appearance/posters'),
  row('poster-width', 'Poster width', 'Adjust poster card width.', 'Poster Customization', 'Poster Card Style', '/settings/appearance/posters'),
  row('poster-radius', 'Poster radius', 'Adjust poster corner radius.', 'Poster Customization', 'Poster Card Style', '/settings/appearance/posters'),
  row('poster-landscape', 'Landscape posters', 'Choose the poster card orientation.', 'Poster Customization', 'Poster Card Style', '/settings/appearance/posters'),
  row('poster-hide-labels', 'Hide poster labels', 'Hide labels displayed over posters.', 'Poster Customization', 'Poster Card Style', '/settings/appearance/posters'),
  row('poster-card-depth', 'Card depth effect', 'Adjust the poster card depth effect.', 'Poster Customization', 'Card Depth', '/settings/appearance/posters'),
  // page('hover-preview', 'Hover Preview', 'Configure desktop hover previews.', '/settings/appearance/hover-preview'),
  page('home-layout', 'Home Layout', 'Configure home screen shelves and ordering.', '/settings/appearance/home'),
  row('home-hero', 'Show home hero', 'Show the featured hero on the home screen.', 'Home Layout', 'Hero', '/settings/appearance/home'),
  row('home-catalog-type', 'Home catalog type', 'Choose which catalog type appears on the home screen.', 'Home Layout', 'Hero', '/settings/appearance/home'),
  row('home-hide-unreleased', 'Hide unreleased titles', 'Hide titles that have not been released.', 'Home Layout', 'Hero', '/settings/appearance/home'),
  row('home-hero-sources', 'Hero sources', 'Choose which sources can supply hero items.', 'Home Layout', 'Hero', '/settings/appearance/home'),
  row('home-catalogs', 'Home catalogs', 'Choose and order home catalogs.', 'Home Layout', 'Catalogs', '/settings/appearance/home'),
  page('detail-page', 'Details Page', 'Configure the metadata details page.', '/settings/details'),
  row('meta-poster-transition', 'Poster transition', 'Configure the transition used when opening details.', 'Details Page', 'Layout', '/settings/details'),
  row('meta-background-mode', 'Details background mode', 'Choose the details page background style.', 'Details Page', 'Appearance', '/settings/details'),
  row('meta-tabs', 'Details tab layout', 'Choose how detail page sections are organized.', 'Details Page', 'Appearance', '/settings/details'),
  row('meta-overall-ratings', 'Overall ratings', 'Show or hide overall ratings.', 'Details Page', 'Appearance', '/settings/details'),
  row('meta-episode-ratings', 'Episode ratings', 'Choose episode rating visibility.', 'Details Page', 'Appearance', '/settings/details'),
  row('meta-episode-cards', 'Episode cards', 'Choose the episode card layout.', 'Details Page', 'Appearance', '/settings/details'),
  row('meta-shuffle', 'Random episode', 'Show the random episode action.', 'Details Page', 'Appearance', '/settings/details'),
  row('meta-blur-episodes', 'Blur unwatched episodes', 'Blur artwork for unwatched episodes.', 'Details Page', 'Appearance', '/settings/details'),
  ...['overview','actions','details','trailers','cast','episodes','production','more-like-this','collection','comments'].map((item) => row(`meta-${item}`, item.replaceAll('-', ' '), `Show or hide the ${item.replaceAll('-', ' ')} section.`, 'Details Page', 'Sections', '/settings/details')),
  page('collections', 'Collections', 'Organize items into custom collections.', '/collections'),
  page('supporters', 'Supporters & Contributors', 'Open recognition and project credits', '/settings/community', 'about'),
  page('licenses-attributions', 'Licenses & Attributions', 'Data sources, acknowledgements, and platform licenses', '/settings/licenses', 'about'),
  { key: 'privacy-policy', title: 'Privacy Policy', description: 'Learn how Nuvio handles your data.', page: 'About', section: 'About', category: 'about', route: 'privacy' },
  { key: 'check-updates', title: 'Check for Updates', description: 'Check for and download the latest release.', page: 'About', section: 'About', category: 'about', route: 'updates' },
  row('nuvio-license', 'Nuvio license', 'Application license and source code.', 'Licenses & Attributions', 'About', '/settings/licenses', 'about'),
  row('tmdb-attribution', 'TMDB', 'Movie and television metadata attribution.', 'Licenses & Attributions', 'About', '/settings/licenses', 'about'),
  row('trakt-attribution', 'Trakt', 'Tracking integration attribution.', 'Licenses & Attributions', 'About', '/settings/licenses', 'about'),
  row('simkl-attribution', 'Simkl', 'Tracking integration attribution.', 'Licenses & Attributions', 'About', '/settings/licenses', 'about'),
  row('premiumize-attribution', 'Premiumize', 'Playback integration attribution.', 'Licenses & Attributions', 'About', '/settings/licenses', 'about'),
  row('torbox-attribution', 'TorBox', 'Playback integration attribution.', 'Licenses & Attributions', 'About', '/settings/licenses', 'about'),
  row('mdblist-attribution', 'MDBList', 'Ratings and lists attribution.', 'Licenses & Attributions', 'About', '/settings/licenses', 'about'),
  row('introdb-attribution', 'IntroDB', 'Skip segment data attribution.', 'Licenses & Attributions', 'About', '/settings/licenses', 'about'),
  row('imdb-datasets', 'IMDb datasets', 'IMDb data attribution.', 'Licenses & Attributions', 'About', '/settings/licenses', 'about'),
  row('player-license', 'Playback license', 'Third-party playback component licenses.', 'Licenses & Attributions', 'About', '/settings/licenses', 'about'),
  page('advanced', 'Advanced', 'Startup and profile behavior.', '/settings/advanced', 'advanced'),
  row('remember-last-profile', 'Remember Last Profile', 'Remember last selected profile at startup.', 'Advanced', 'Startup', '/settings/advanced', 'advanced'),
  row('desktop-opengl-renderer', 'Use OpenGL renderer', 'May fix interface stutter or flicker with NVIDIA G-SYNC and some high-refresh-rate displays.', 'Advanced', 'Windows Graphics', '/settings/advanced', 'advanced'),
  row('sentry-crash-reports', 'Sentry Crash Reports', 'Choose whether to send safe diagnostic crash reports.', 'Advanced', 'Diagnostics', '/settings/advanced', 'advanced'),
  row('clear-cw-cache', 'Clear Continue Watching Cache', 'Remove cached Continue Watching data and refresh watch progress.', 'Advanced', 'Cache', '/settings/advanced', 'advanced'),
];
