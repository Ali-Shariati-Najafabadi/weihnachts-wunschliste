import { h } from '../dom.js';
import { safeGet, safeSet } from '../store.js';

const HINT_KEY = 'wwl:hint-dismissed';

/** Explains the missing live sync (no backend). */
export function syncNotice({ dismissible = false } = {}) {
  if (dismissible && safeGet(HINT_KEY) === '1') return null;
  const box = h(
    'aside',
    { class: 'notice', 'aria-label': 'Hinweis zur Synchronisierung' },
    h('p', {},
      h('strong', {}, 'Gut zu wissen: '),
      'Diese Seite hat keinen Server. Reservierungen erscheinen bei anderen erst, wenn du den Link erneut teilst. ',
      'Wer ihn öffnet, kann die Stände zusammenführen. Teile den Link also nach jeder größeren Änderung neu.'),
    dismissible
      ? h('button', { type: 'button', class: 'btn btn-quiet btn-small', on: { click: () => { safeSet(HINT_KEY, '1'); box.remove(); } } }, 'Verstanden')
      : null,
  );
  return box;
}
