/** Also accepts older updater feeds containing commit hashes and attribution. */
export function releaseNoteItems(notes: string): string[] {
  return notes.split(/\r?\n/).map(line => line.trim())
    .filter(line => line && !/^#{1,6}\s/.test(line))
    .map(line => line
      .replace(/^[-*•]\s+/, '')
      .replace(/\[([^\]]+)\]\(https?:\/\/[^)]+\)/g, '$1')
      .replace(/`/g, '')
      .replace(/^[a-f\d]{7,40}\s+/i, '')
      .replace(/\s+(?:by\s+)?@[\w-]+\s*$/, '')
      .trim())
    .filter(Boolean);
}
