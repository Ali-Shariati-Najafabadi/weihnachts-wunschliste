// Application shell: header, navigation, view switching and URL hash handling.

import { parseHash } from './codec.js';
import { ValidationError } from './schema.js';
import { field, h, toast } from './dom.js';
import { handleHashPayload } from './importer.js';
import { clearPrintSheet } from './print.js';
import {
  currentGroup, currentMeId, load, safeSet, selectGroup, setMe, setUi, state, subscribe, ui,
} from './store.js';
import { christmasInfo, formatPrice } from './util.js';
import { renderLists } from './views/lists.js';
import { renderShare } from './views/share.js';
import { renderWelcome } from './views/welcome.js';
import { renderReveal } from './views/reveal.js';
import { renderSanta } from './views/santa.js';

const main = document.getElementById('main');

const TABS = [
  { id: 'lists', label: 'Wunschlisten' },
  { id: 'santa', label: 'Wichteln' },
  { id: 'share', label: 'Teilen & Backup' },
];

function renderCountdown() {
  const el = document.getElementById('countdown');
  if (!el) return;
  const info = christmasInfo();
  let text;
  if (info.state === 'eve') text = 'Heute ist Heiligabend 🎄';
  else if (info.state === 'holidays') text = 'Frohe Weihnachten! 🎄';
  else text = `Noch ${info.days} ${info.days === 1 ? 'Tag' : 'Tage'} bis Heiligabend`;
  el.replaceChildren(h('span', { class: 'countdown-main' }, text));
  if (info.nikolausDays) {
    el.append(h('span', { class: 'countdown-sub' }, `Nikolaus (6.12.) in ${info.nikolausDays} ${info.nikolausDays === 1 ? 'Tag' : 'Tagen'}`));
  }
}

function setupThemeToggle() {
  const button = document.getElementById('theme-toggle');
  const effective = () =>
    document.documentElement.dataset.theme ||
    (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  const sync = () => {
    const dark = effective() === 'dark';
    button.textContent = dark ? '☀️ Hell' : '🌙 Dunkel';
    button.setAttribute('aria-label', dark ? 'Zum hellen Design wechseln' : 'Zum dunklen Design wechseln');
  };
  button.addEventListener('click', () => {
    const next = effective() === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    safeSet('wwl:theme', next);
    sync();
  });
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', sync);
  sync();
}

function groupBar(group) {
  const select = h(
    'select',
    { id: 'group-select', on: { change: (e) => selectGroup(e.target.value) } },
    state.groups.map((g) => h('option', { value: g.gid, selected: g.gid === group.gid }, g.name)),
  );
  return h(
    'div',
    { class: 'group-bar' },
    h('div', { class: 'group-title' },
      h('h2', {}, group.name),
      group.budget !== null ? h('span', { class: 'badge badge-gold' }, `Preisrahmen ${formatPrice(group.budget)}`) : null),
    h('div', { class: 'group-switch' },
      state.groups.length > 1 ? field('Gruppe', select).field : null,
      h('button', { type: 'button', class: 'btn btn-small', on: { click: () => setUi({ creating: true }) } }, '＋ Neue Gruppe')),
  );
}

function nav() {
  return h(
    'nav',
    { class: 'tabs', 'aria-label': 'Bereiche' },
    TABS.map((tab) =>
      h('button', {
        type: 'button', class: 'tab', 'aria-current': ui.tab === tab.id ? 'page' : null,
        on: { click: () => setUi({ tab: tab.id }) },
      }, tab.label),
    ),
  );
}

function storageWarning() {
  return ui.storageOk
    ? null
    : h('aside', { class: 'notice warn', role: 'status' },
        h('p', {}, h('strong', {}, 'Speichern im Browser nicht möglich. '),
          'Deine Änderungen gehen beim Schließen der Seite verloren. Lade regelmäßig ein Backup herunter (Teilen & Backup).'));
}

function render() {
  const scrollY = window.scrollY;
  main.replaceChildren();
  if (ui.reveal) {
    main.append(renderReveal(ui.reveal, { onClose: closeReveal }));
  } else if (state.groups.length === 0 || ui.creating) {
    main.append(renderWelcome());
  } else {
    const group = currentGroup();
    const meId = currentMeId();
    let content;
    if (ui.tab === 'share') content = renderShare(group);
    else if (ui.tab === 'santa') content = renderSanta(group);
    else content = renderLists(group, meId, { onMeChange: (id) => setMe(group.gid, id) });
    main.append(...[storageWarning(), groupBar(group), nav(), content].filter(Boolean));
  }
  window.scrollTo(0, scrollY);
  if (ui.focusKey) {
    const target = main.querySelector(`[data-key="${CSS.escape(ui.focusKey)}"]`);
    target?.focus({ preventScroll: true });
    ui.focusKey = null;
  }
}

function closeReveal() {
  ui.reveal = null;
  history.replaceState(null, '', location.pathname + location.search);
  render();
}

/** Opens a group link (#g=...) or a Secret Santa link (#w=...) from the address bar. */
async function processHash() {
  const parsed = parseHash(location.hash);
  if (!parsed) return;
  try {
    await handleHashPayload(parsed);
  } catch (err) {
    if (!(err instanceof ValidationError)) throw err;
    toast(err.message, { error: true });
  }
  // Group links are consumed once, so a reload does not ask again.
  if (parsed.kind === 'group') history.replaceState(null, '', location.pathname + location.search);
}

function init() {
  load();
  setupThemeToggle();
  renderCountdown();
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) renderCountdown();
  });
  window.addEventListener('afterprint', clearPrintSheet);
  window.addEventListener('hashchange', processHash);
  subscribe(render);
  render();
  processHash();
}

init();
