// Print view: fills #print-sheet and opens the print dialog. Reservations are
// never part of the printout, so the sheet can be handed to the wish owner.

import { PRIORITIES } from './schema.js';
import { sortedWishes } from './model.js';
import { h } from './dom.js';
import { formatPrice } from './util.js';

function christmasYear(now = new Date()) {
  return now.getMonth() === 11 && now.getDate() > 26 ? now.getFullYear() + 1 : now.getFullYear();
}

function sheetFor(group, person) {
  const wishes = sortedWishes(person);
  return h(
    'article',
    { class: 'sheet' },
    h(
      'header',
      { class: 'sheet-head' },
      h('p', { class: 'sheet-eyebrow' }, `Wunschzettel · Weihnachten ${christmasYear()}`),
      h('h1', {}, person.name),
      h('p', { class: 'sheet-group' }, group.name),
    ),
    wishes.length === 0
      ? h('p', { class: 'sheet-empty' }, 'Noch keine Wünsche eingetragen.')
      : h(
          'ol',
          { class: 'sheet-wishes' },
          wishes.map((wish) =>
            h(
              'li',
              {},
              h('span', { class: 'sheet-box', 'aria-hidden': 'true' }),
              h(
                'div',
                { class: 'sheet-wish' },
                h(
                  'p',
                  { class: 'sheet-title' },
                  h('strong', {}, wish.title),
                  ' ',
                  h('span', { class: 'sheet-prio' }, `${PRIORITIES[wish.prio].stars} ${PRIORITIES[wish.prio].label}`),
                  wish.price !== null ? h('span', { class: 'sheet-price' }, ` · ca. ${formatPrice(wish.price)}`) : null,
                  wish.shared ? h('span', { class: 'sheet-price' }, ' · Sammelgeschenk') : null,
                ),
                wish.note ? h('p', { class: 'sheet-note' }, wish.note) : null,
                wish.url ? h('p', { class: 'sheet-url' }, wish.url) : null,
              ),
            ),
          ),
        ),
    h('footer', { class: 'sheet-foot' }, 'Frohe Weihnachten!'),
  );
}

export function printSheets(group, people) {
  const target = document.getElementById('print-sheet');
  if (!target) return;
  target.replaceChildren(...people.map((person) => sheetFor(group, person)));
  window.print();
}

export function clearPrintSheet() {
  document.getElementById('print-sheet')?.replaceChildren();
}
