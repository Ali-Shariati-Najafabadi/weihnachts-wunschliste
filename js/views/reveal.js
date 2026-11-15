// Opens a personal Secret Santa link: the giver enters their passphrase and
// sees who they gift, including that person's wish list.

import { DecryptError } from '../crypto.js';
import { PRIORITIES, safeHref } from '../schema.js';
import { sortedWishes } from '../model.js';
import { revealSanta } from '../santa-links.js';
import { displayHost, field, h } from '../dom.js';
import { printSheets } from '../print.js';
import { formatPrice } from '../util.js';

function wishList(wishes) {
  if (wishes.length === 0) return h('p', { class: 'empty' }, 'Diese Person hat noch keine Wünsche eingetragen. Frag am besten kurz nach.');
  return h(
    'ul',
    { class: 'wish-list' },
    sortedWishes({ wishes }).map((wish) => {
      const href = safeHref(wish.url);
      const prio = PRIORITIES[wish.prio];
      const meta = [
        wish.price !== null ? h('span', {}, `ca. ${formatPrice(wish.price)}`) : null,
        href
          ? h('a', { href, target: '_blank', rel: 'noopener noreferrer nofollow' },
              `Zum Angebot (${displayHost(href)})`, h('span', { class: 'sr-only' }, ' – öffnet in neuem Tab'))
          : null,
      ].filter(Boolean);
      return h(
        'li',
        { class: `wish prio-${wish.prio}` },
        h('div', { class: 'wish-head' },
          h('h4', { class: 'wish-title' }, wish.title),
          h('span', { class: 'badge' }, h('span', { 'aria-hidden': 'true' }, prio.stars), ' ', prio.label)),
        meta.length ? h('p', { class: 'wish-meta' }, meta.flatMap((m, i) => (i ? [h('span', { class: 'dot', 'aria-hidden': 'true' }, '·'), m] : [m]))) : null,
        wish.note ? h('p', { class: 'wish-note' }, wish.note) : null,
      );
    }),
  );
}

/**
 * @param {{ groupName: string, budget: number|null, giver: string, drawId: string, cipher: string }} header
 * @param {{ onClose: () => void }} options
 */
export function renderReveal(header, { onClose }) {
  const result = h('div', { 'aria-live': 'polite' });
  const pin = h('input', { type: 'password', autocomplete: 'off', required: true });
  const error = h('p', { class: 'form-error', role: 'alert', hidden: true });
  const submit = h('button', { type: 'submit', class: 'btn btn-primary' }, 'Aufdecken');

  const form = h(
    'form',
    {
      novalidate: true,
      on: {
        submit: async (event) => {
          event.preventDefault();
          error.hidden = true;
          submit.disabled = true;
          try {
            const reveal = await revealSanta(header, pin.value);
            form.hidden = true;
            result.replaceChildren(
              h('p', { class: 'hint' }, `Du beschenkst:`),
              h('p', { class: 'reveal-name' }, reveal.receiver),
              header.budget !== null ? h('p', {}, h('span', { class: 'badge badge-gold' }, `Budget ${formatPrice(header.budget)}`)) : null,
              h('p', { class: 'hint' }, 'Pssst – verrate es niemandem! Die Wunschliste zum Zeitpunkt der Ziehung:'),
              wishList(reveal.wishes),
              h('div', { class: 'row-actions' },
                h('button', {
                  type: 'button', class: 'btn',
                  on: { click: () => printSheets({ name: header.groupName }, [{ name: reveal.receiver, wishes: reveal.wishes }]) },
                }, 'Wunschzettel drucken'),
                h('button', { type: 'button', class: 'btn btn-quiet', on: { click: () => { result.replaceChildren(); form.hidden = false; form.reset(); pin.focus(); } } }, 'Wieder verbergen')),
            );
          } catch (err) {
            submit.disabled = false;
            if (!(err instanceof DecryptError)) {
              error.textContent = err.message || 'Das hat nicht geklappt.';
            } else {
              error.textContent = 'Das Passwort passt nicht. Bitte versuche es noch einmal.';
            }
            error.hidden = false;
            pin.focus();
            return;
          }
          submit.disabled = false;
        },
      },
    },
    field('Dein Passwort / deine PIN', pin).field,
    error,
    submit,
  );

  const card = h(
    'section',
    { class: 'card', 'aria-labelledby': 'reveal-h' },
    h('h2', { id: 'reveal-h' }, `Wichteln: ${header.groupName}`),
    h('p', {}, `Hallo ${header.giver}! Gib das Passwort ein, das du bei der Ziehung gewählt hast, um zu sehen, wen du beschenkst.`),
    h('p', { class: 'hint' }, 'Ziehung ', h('span', { class: 'draw-id' }, `#${header.drawId}`), '. Alles wird nur auf deinem Gerät entschlüsselt.'),
    form,
    result,
  );

  window.setTimeout(() => pin.focus(), 0);
  return h(
    'div',
    { class: 'view-reveal' },
    card,
    h('button', { type: 'button', class: 'btn btn-quiet', on: { click: onClose } }, 'Zur Startseite'),
  );
}
