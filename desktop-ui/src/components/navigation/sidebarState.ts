/**
 * Sidebar expansion predicate mirroring Kotlin `MainTabsDestination.kt`:
 * EXPANDED/classic always expanded; COMPACT expands only while the profile
 * stack is open; ADAPTIVE expands on hover/focus or while the profile stack
 * is open. Touch users get the collapsed icon rail (tappable without hover)
 * plus the existing hold-to-open profile gesture.
 */
export type NavBarStyle = 'adaptive' | 'expanded' | 'compact' | 'classic';

export function sidebarExpanded(style: string, hover: boolean, profileOpen: boolean): boolean {
  switch (style) {
    case 'expanded':
    case 'classic':
      return true;
    case 'compact':
      return profileOpen;
    default:
      return hover || profileOpen;
  }
}
