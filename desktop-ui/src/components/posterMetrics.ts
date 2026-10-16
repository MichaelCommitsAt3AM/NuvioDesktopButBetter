/** Home's rendered desktop sizes, shared by every movie-card presentation. */
export function posterMetrics(style?: { widthDp?: number; heightDp?: number; cornerRadiusDp?: number; catalogLandscapeModeEnabled?: boolean }) {
  const width = Math.round((style?.widthDp ?? 126) * 1.4) * 1.08;
  return { width: style?.catalogLandscapeModeEnabled ? width * (180 / 110) : width, radius: (style?.cornerRadiusDp ?? 12) * 1.08, ratio: style?.catalogLandscapeModeEnabled ? '16/9' : `${style?.widthDp ?? 126}/${style?.heightDp ?? 189}` };
}
