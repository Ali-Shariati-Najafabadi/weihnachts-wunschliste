// Wish lists: "Ich bin ..." selection, one card per person, wishes and reservations.

import { PRIORITIES, ValidationError, safeHref } from '../schema.js';
import {
  addPerson, addWish, countReserved, removePerson, removeWish, renamePerson,
  reserve, sortedWishes, unreserve, updateWish,
} from '../model.js';
import { displayHost, field, h, toast } from '../dom.js';
import { confirmDialog, textDialog, wishDialog } from '../dialogs.js';
import { mutateGroup, ui } from '../store.js';
import { printSheets } from '../print.js';
import { formatPrice } from '../util.js';
import { syncNotice } from './notice.js';

/** Runs an action and shows validation errors as a toast. */
function guard(action) {
  try {
    return action();
  } catch (err) {
    if (err instanceof ValidationError) {
      toast(err.message, { error: true });
      return undefined;
    }
    throw err;
  }
}

function plural(n, one, many) {
  return `${n} ${n === 1 ? one : many}`;
}

async function addWishFlow(group, person) {
  const fields = await wishDialog({ personName: person.name });
  if (!fields) return;
  ui.open.add(person.id);
  ui.focusKey = `add-${person.id}`;
  guard(() => mutateGroup((g) => addWish(g, person.id, fields)));
}

async function editWishFlow(person, wish) {
  const fields = await wishDialog({ wish, personName: person.name });
  if (!fields) return;
  ui.focusKey = `edit-${wish.id}`;
  guard(() => mutateGroup((g) => updateWish(g, wish.id, fields)));
}

async function deleteWishFlow(person, wish) {
  const ok = await confirmDialog({
    title: 'Wunsch löschen?',
    text: `„${wish.title}“ von ${person.name} wird gelöscht.`,
    confirmLabel: 'Löschen',
    danger: true,
  });
  if (!ok) return;
  ui.focusKey = `add-${person.id}`;
  guard(() => mutateGroup((g) => removeWish(g, wish.id)));
}

function renderReservation(group, person, wish, meId) {
  const names = wish.reservedBy.map((id) => group.people.find((p) => p.id === id)?.name).filter(Boolean);
  const mine = wish.reservedBy.includes(meId);
  const toggle = (label, action) =>
    h(
      'button',
      { type: 'button', class: 'btn btn-small', 'aria-label': `${label}: ${wish.title}`,
        on: { click: () => { ui.focusKey = `res-${wish.id}`; guard(() => mutateGroup((g) => action(g))); } },
        dataset: { key: `res-${wish.id}` } },
      label,
    );

  let status = null;
  let button = null;
  if (mine) {
    const others = names.filter((n) => n !== group.people.find((p) => p.id === meId)?.name);
    status = others.length ? `Du schenkst das – gemeinsam mit ${others.join(', ')}` : 'Du schenkst das';
    button = toggle('Doch nicht', (g) => unreserve(g, wish.id, meId));
  } else if (wish.shared) {
    status = names.length ? `Sammelgeschenk – dabei: ${names.join(', ')}` : 'Sammelgeschenk – noch niemand dabei';
    button = toggle('Ich beteilige mich', (g) => reserve(g, wish.id, meId));
  } else if (names.length) {
    status = `Reserviert von ${names.join(', ')}`;
  } else {
    button = toggle('Ich schenke das', (g) => reserve(g, wish.id, meId));
  }
  return h(
    'div',
    { class: `reservation${mine ? ' mine' : ''}${names.length ? ' taken' : ''}` },
    status ? h('p', { class: 'reservation-status' }, h('span', { 'aria-hidden': 'true' }, '🎁 '), status) : null,
    button,
  );
}

function renderWish(group, person, wish, meId) {
  const href = safeHref(wish.url);
  const prio = PRIORITIES[wish.prio];
  // The owner never sees reservations; without "Ich bin ..." nobody does.
  const canSeeReservations = meId !== null && meId !== person.id;
  const meta = [
    wish.price !== null ? h('span', {}, `ca. ${formatPrice(wish.price)}`) : null,
    wish.shared ? h('span', {}, 'Sammelgeschenk') : null,
    href
      ? h(
          'a',
          { href, target: '_blank', rel: 'noopener noreferrer nofollow' },
          `Zum Angebot (${displayHost(href)})`,
          h('span', { class: 'sr-only' }, ' – öffnet in neuem Tab'),
        )
      : null,
  ].filter(Boolean);

  return h(
    'li',
    { class: `wish prio-${wish.prio}` },
    h(
      'div',
      { class: 'wish-head' },
      h('h4', { class: 'wish-title' }, wish.title),
      h('span', { class: 'badge' }, h('span', { 'aria-hidden': 'true' }, prio.stars), ' ', prio.label),
    ),
    meta.length
      ? h('p', { class: 'wish-meta' }, meta.flatMap((m, i) => (i ? [h('span', { class: 'dot', 'aria-hidden': 'true' }, '·'), m] : [m])))
      : null,
    wish.note ? h('p', { class: 'wish-note' }, wish.note) : null,
    canSeeReservations ? renderReservation(group, person, wish, meId) : null,
    h(
      'div',
      { class: 'wish-actions' },
      h('button', {
        type: 'button', class: 'btn btn-quiet btn-small', 'aria-label': `Bearbeiten: ${wish.title}`,
        dataset: { key: `edit-${wish.id}` }, on: { click: () => editWishFlow(person, wish) },
      }, 'Bearbeiten'),
      h('button', {
        type: 'button', class: 'btn btn-quiet btn-small', 'aria-label': `Löschen: ${wish.title}`,
        on: { click: () => deleteWishFlow(person, wish) },
      }, 'Löschen'),
    ),
  );
}

function renderPerson(group, person, meId) {
  const isMe = person.id === meId;
  const wishes = sortedWishes(person);
  const reserved = countReserved(person);
  const open = ui.open.has(person.id) || (isMe && !ui.open.has(`closed-${person.id}`));

  const summaryInfo = [plural(person.wishes.length, 'Wunsch', 'Wünsche')];
  if (meId && !isMe && person.wishes.length) summaryInfo.push(`${reserved} reserviert`);

  const details = h(
    'details',
    { class: `card person${isMe ? ' is-me' : ''}`, open },
    h(
      'summary',
      {},
      h('h3', {}, person.name, isMe ? h('span', { class: 'badge badge-me' }, 'Du') : null),
      h('span', { class: 'summary-info' }, summaryInfo.join(' · ')),
    ),
    isMe
      ? h('p', { class: 'hint own-note' }, 'Das ist deine Liste. Was schon besorgt wurde, siehst du hier nicht – das bleibt eine Überraschung.')
      : null,
    wishes.length
      ? h('ul', { class: 'wish-list' }, wishes.map((w) => renderWish(group, person, w, meId)))
      : h('p', { class: 'empty' }, 'Noch keine Wünsche.'),
    h(
      'div',
      { class: 'person-actions' },
      h('button', {
        type: 'button', class: 'btn btn-primary btn-small', dataset: { key: `add-${person.id}` },
        'aria-label': `Wunsch hinzufügen für ${person.name}`, on: { click: () => addWishFlow(group, person) },
      }, '＋ Wunsch hinzufügen'),
      h('button', {
        type: 'button', class: 'btn btn-small', 'aria-label': `Wunschzettel von ${person.name} drucken`,
        on: { click: () => printSheets(group, [person]) },
      }, 'Drucken'),
      h('button', {
        type: 'button', class: 'btn btn-quiet btn-small', 'aria-label': `${person.name} umbenennen`,
        on: { click: () => renameFlow(person) },
      }, 'Umbenennen'),
      h('button', {
        type: 'button', class: 'btn btn-quiet btn-small', 'aria-label': `${person.name} entfernen`,
        on: { click: () => removeFlow(person) },
      }, 'Entfernen'),
    ),
  );
  details.addEventListener('toggle', () => {
    if (isMe) {
      if (details.open) ui.open.delete(`closed-${person.id}`);
      else ui.open.add(`closed-${person.id}`);
    }
    if (details.open) ui.open.add(person.id);
    else ui.open.delete(person.id);
  });
  return details;
}

async function renameFlow(person) {
  const name = await textDialog({
    title: 'Person umbenennen',
    label: 'Name',
    value: person.name,
    validate: (value) => value,
  });
  if (name === undefined) return;
  guard(() => mutateGroup((g) => renamePerson(g, person.id, name)));
}

async function removeFlow(person) {
  const ok = await confirmDialog({
    title: 'Person entfernen?',
    text: `${person.name} wird samt Wunschliste aus der Gruppe entfernt. Das lässt sich nur über ein Backup rückgängig machen.`,
    confirmLabel: 'Entfernen',
    danger: true,
  });
  if (!ok) return;
  guard(() => mutateGroup((g) => removePerson(g, person.id)));
}

export function renderLists(group, meId, { onMeChange }) {
  const select = h(
    'select',
    { id: 'me-select', on: { change: (e) => onMeChange(e.target.value || null) } },
    h('option', { value: '' }, '– bitte wählen –'),
    group.people.map((p) => h('option', { value: p.id, selected: p.id === meId }, p.name)),
  );

  const nameInput = h('input', {
    type: 'text', maxlength: 40, autocomplete: 'off', dataset: { key: 'add-person' },
  });
  const addForm = h(
    'form',
    {
      class: 'card add-person', novalidate: true,
      on: {
        submit: (event) => {
          event.preventDefault();
          ui.focusKey = 'add-person';
          guard(() => mutateGroup((g) => addPerson(g, nameInput.value)));
        },
      },
    },
    h('h3', {}, 'Person hinzufügen'),
    h('div', { class: 'inline-form' }, field('Name', nameInput).field, h('button', { type: 'submit', class: 'btn' }, 'Hinzufügen')),
  );

  return h(
    'div',
    { class: 'view-lists' },
    syncNotice({ dismissible: true }),
    h(
      'section',
      { class: 'card me-card', 'aria-labelledby': 'me-heading' },
      h('h3', { id: 'me-heading' }, 'Ich bin …'),
      field('Dein Name', select).field,
      meId
        ? null
        : h('p', { class: 'hint warn' }, 'Wähle deinen Namen, damit Reservierungen vor dir verborgen bleiben. Solange das fehlt, siehst du keine Reservierungen.'),
    ),
    group.people.length === 0
      ? h('p', { class: 'empty' }, 'Noch keine Personen. Füge unten die erste hinzu.')
      : h('div', { class: 'people' }, group.people.map((p) => renderPerson(group, p, meId))),
    addForm,
  );
}
