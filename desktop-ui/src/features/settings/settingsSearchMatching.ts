export function normalizeSettingsText(value: string) {
  return value.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase()
    .replace(/add[ -]?ons?/g, 'addon').replace(/auto[ -]?play/g, 'autoplay')
    .replace(/sign[ -]?out/g, 'signout')
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

const synonyms = [
  ['subtitle', 'subtitles', 'captions', 'caption', 'subs'],
  ['torrent', 'torrents', 'p2p', 'peer'],
  ['colour', 'color'], ['autoplay', 'automatic'],
  ['size', 'filesize'], ['maximum', 'max'], ['minimum', 'min'],
  ['logout', 'signout'], ['trailer', 'trailers', 'preview', 'previews'],
];
const filler = new Set(['how', 'do', 'i', 'can', 'the', 'a', 'an', 'to', 'my', 'change', 'setting', 'settings']);

function oneEditApart(a: string, b: string) {
  if (a.length < 4 || b.length < 4 || Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (a.length >= b.length) i++;
    if (b.length >= a.length) j++;
  }
  return edits + Number(i < a.length || j < b.length) <= 1;
}

export function settingsMatchScore(query: string, fields: Array<[string, number]>) {
  const normalized = normalizeSettingsText(query);
  const allTerms = normalized.split(' ').filter(Boolean);
  const meaningful = allTerms.filter(term => !filler.has(term));
  const terms = meaningful.length ? meaningful : allTerms;
  if (!terms.length) return 0;
  const indexed = fields.map(([text, weight]) => ({ text: normalizeSettingsText(text), weight }));
  let score = 0;
  for (const term of terms) {
    const alternatives = synonyms.find(group => group.includes(term)) ?? [term];
    let best = 0;
    for (const { text, weight } of indexed) {
      for (const word of text.split(' ')) {
        if (word === term) best = Math.max(best, weight);
        else if (word.startsWith(term)) best = Math.max(best, weight * .8);
        else if (alternatives.includes(word)) best = Math.max(best, weight * .7);
        else if (oneEditApart(word, term)) best = Math.max(best, weight * .4);
      }
    }
    if (!best) return 0;
    score += best;
  }
  const title = indexed[0]?.text;
  return score + (title === normalized ? 200 : title?.includes(normalized) ? 100 : 0);
}
