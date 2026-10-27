const applePlatform =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/i.test(navigator.platform);

/** The modifier shown in shortcut hints; the actual handlers accept Ctrl or Meta. */
export const shortcutModifier = applePlatform ? '⌘' : 'Ctrl';
