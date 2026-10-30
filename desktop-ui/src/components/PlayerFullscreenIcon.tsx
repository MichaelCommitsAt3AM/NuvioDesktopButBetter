// Match the native player icons in player-ui/controls.html.
export function PlayerFullscreenIcon({ fullscreen }: { fullscreen: boolean }) {
  return fullscreen ? (<svg aria-hidden="true" viewBox="0 0 385.331 385.331" fill="currentColor"><path d="M264.943 156.665h108.273c6.833 0 11.934-5.39 11.934-12.211 0-6.833-5.101-11.85-11.934-11.838h-96.242V36.181c0-6.833-5.197-12.03-12.03-12.03s-12.03 5.197-12.03 12.03v108.273c0 .036.012.06.012.084 0 .036-.012.06-.012.096-.001 6.713 5.316 12.043 12.029 12.031z"/>
      <path d="M120.291 24.247c-6.821 0-11.838 5.113-11.838 11.934v96.242H12.03c-6.833 0-12.03 5.197-12.03 12.03 0 6.833 5.197 12.03 12.03 12.03h108.273c.036 0 .06-.012.084-.012.036 0 .06.012.096.012 6.713 0 12.03-5.317 12.03-12.03V36.181c.001-6.821-5.389-11.922-12.222-11.934z"/>
      <path d="M120.387 228.666H12.115C5.282 228.678.181 234.056.181 240.889s5.101 11.85 11.934 11.838h96.242v96.423c0 6.833 5.197 12.03 12.03 12.03s12.03-5.197 12.03-12.03V240.877c0-.036-.012-.06-.012-.084 0-.036.012-.06.012-.096.001-6.714-5.317-12.031-12.03-12.031z"/>
      <path d="M373.3 228.666H265.028c-.036 0-.06.012-.084.012-.036 0-.06-.012-.096-.012-6.713 0-12.03 5.317-12.03 12.03v108.273c0 6.833 5.39 11.922 12.223 11.934 6.821.012 11.838-5.101 11.838-11.922v-96.242H373.3c6.833 0 12.03-5.197 12.03-12.03s-5.196-12.031-12.03-12.043z"/></svg>) : (<svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor"><path d="M8 2H4C2.89543 2 2 2.89543 2 4V8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M22 8L22 4C22 2.89543 21.1046 2 20 2H16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M16 22L20 22C21.1046 22 22 21.1046 22 20L22 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M8 22L4 22C2.89543 22 2 21.1046 2 20V16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>);
}
