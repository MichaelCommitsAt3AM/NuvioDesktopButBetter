/** Library labels resolved from the generated Kotlin string catalog (`library_*`, `media_*`). */

export type Translate = (key: string, params?: ReadonlyArray<string | number>) => string;

const MEDIA_TYPE_KEYS: Record<string, string> = {
  movie: 'media_movies',
  series: 'media_series',
  anime: 'media_anime',
  channel: 'media_channels',
  tv: 'media_tv',
};

/** Mirrors `localizedMediaTypeLabel`: known types use the shared label, others are title-cased. */
export function mediaTypeLabel(t: Translate, type: string): string {
  const normalized = type.trim().toLowerCase();
  const key = MEDIA_TYPE_KEYS[normalized];
  if (key) return t(key);
  return type ? type.charAt(0).toUpperCase() + type.slice(1) : type;
}

const SORT_OPTION_KEYS: Record<string, string> = {
  default: 'library_sort_provider_order',
  added_desc: 'library_sort_added_desc',
  added_asc: 'library_sort_added_asc',
  released_desc: 'library_sort_released_desc',
  released_asc: 'library_sort_released_asc',
  title_asc: 'library_sort_title_asc',
  title_desc: 'library_sort_title_desc',
};

/** Mirrors `librarySortOptionLabel`. */
export function sortOptionLabel(t: Translate, option: string): string {
  const key = SORT_OPTION_KEYS[option];
  return key ? t(key) : option;
}
