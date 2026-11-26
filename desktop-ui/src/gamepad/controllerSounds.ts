/**
 * Upstream's controller feedback sounds (composeApp desktopMain resources,
 * served from /sounds/controller). Kotlin plays them at -15 dB, about 0.18.
 */
export type ControllerSound = 'navigate' | 'select' | 'back';

const VOLUME = 0.18;
const clips = new Map<ControllerSound, HTMLAudioElement>();

export function playControllerSound(sound: ControllerSound) {
  if (typeof Audio === 'undefined') return;
  try {
    let clip = clips.get(sound);
    if (!clip) { clip = new Audio(`/sounds/controller/${sound}.wav`); clip.volume = VOLUME; clips.set(sound, clip); }
    clip.currentTime = 0;
    void clip.play()?.catch(() => {});
  } catch { /* Sound is optional feedback. */ }
}
