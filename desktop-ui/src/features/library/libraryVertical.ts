import type { Media } from '../../generated/contract';

/** Port of `buildLibraryVerticalProjection` in `LibraryDisplaySettings.kt`. */

export type LibrarySection = { type: string; title: string; items: string[] };
export type LibraryExtraItem = { id: string; type: string; category?: string };

export type LibraryVerticalProjection = {
  availableSections: LibrarySection[];
  selectedSection: LibrarySection | null;
  availableTypes: string[];
  selectedType: string | null;
  items: Media[];
};

const keyOf = (item: { id: string; type: string }) => `${item.type}|${item.id}`;
const normalizeType = (value: string) => value.trim().toLowerCase();

export function projectLibraryVertical({ items, extraItems, orderedKeys, sections, source, selectedSectionType, selectedType }: {
  items: Media[];
  extraItems: LibraryExtraItem[];
  orderedKeys: string[];
  sections: LibrarySection[];
  source: string;
  selectedSectionType?: string | null;
  selectedType?: string | null;
}): LibraryVerticalProjection {
  const remote = !!source && source !== 'local';
  const availableSections = remote ? sections : [];
  const selectedSection = remote
    ? (sections.find(section => section.type === selectedSectionType) ?? sections[0] ?? null)
    : null;

  const sectionKeys = sections.flatMap(section => section.items);
  const itemKeys = items.map(keyOf);
  const baseKeys = selectedSection
    ? selectedSection.items
    : (sectionKeys.length ? sectionKeys : (orderedKeys.length ? orderedKeys : itemKeys));
  const dedupedKeys: string[] = [];
  const seen = new Set<string>();
  for (const key of baseKeys) {
    if (!seen.has(key)) { seen.add(key); dedupedKeys.push(key); }
  }

  const categoryByKey = new Map(extraItems.map(item => [`${item.type}|${item.id}`, item.category ?? item.type]));
  const typeFor = (key: string) => normalizeType(categoryByKey.get(key) ?? key.split('|')[0] ?? '');
  const availableTypes = [...new Set(dedupedKeys.map(typeFor).filter(Boolean))].sort();
  const requestedType = selectedType ? normalizeType(selectedType) : '';
  const effectiveType = requestedType && availableTypes.includes(requestedType) ? requestedType : null;
  const filteredKeys = dedupedKeys.filter(key => !effectiveType || typeFor(key) === effectiveType);

  const orderPool = selectedSection
    ? selectedSection.items
    : (orderedKeys.length ? orderedKeys : (sectionKeys.length ? sectionKeys : itemKeys));
  const rank = new Map(orderPool.map((key, index) => [key, index]));
  const orderedFiltered = [...filteredKeys].sort((a, b) => (rank.get(a) ?? Number.MAX_SAFE_INTEGER) - (rank.get(b) ?? Number.MAX_SAFE_INTEGER));

  const byKey = new Map(items.map(item => [keyOf(item), item]));
  return {
    availableSections,
    selectedSection,
    availableTypes,
    selectedType: effectiveType,
    items: orderedFiltered.flatMap(key => { const item = byKey.get(key); return item ? [item] : []; }),
  };
}
