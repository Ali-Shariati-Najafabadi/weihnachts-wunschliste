// Wichteln (Secret Santa): draw in memory, then hand out one encrypted link per person.
// The organiser never sees who drew whom: the result only exists in memory and
// each person's link is encrypted with a passphrase chosen by that person.

import { ValidationError } from '../schema.js';
import { DrawError, drawSecretSanta } from '../secretsanta.js';
import { assertPassphrase } from '../crypto.js';
import { createSantaHash, newDrawId } from '../santa-links.js';
import { parseBudget } from '../schema.js';
import { copyText, field, h, toast } from '../dom.js';
import { confirmDialog } from '../dialogs.js';
import { setUi, ui } from '../store.js';
import { QR_MAX_BYTES, qrSvg } from '../qr.js';
import { formatPrice } from '../util.js';

const rerender = (focusKey = null) => {
  ui.focusKey = focusKey;
  setUi({});
};

/** Setup state and the running draw live in memory only (never in storage or in a link). */
let setup = { gid: null, selected: new Set(), budget: '', exclusions: [], error: '' };
/** { gid, drawId, budget, assignments: Map(giverId -> receiverId), queue: string[], index, link, done } */
let session = null;

function resetSetup(group) {
  setup = { gid: group.gid, selected: new Set(group.people.map((p) => p.id)), budget: '', exclusions: [], error: '' };
}

function nameOf(group, id) {
  return group.people.find((p) => p.id === id)?.name ?? '?';
}

function renderSetup(group) {
  const people = group.people;
  const budgetInput = h('input', {
    type: 'text', inputmode: 'decimal', maxlength: 8, autocomplete: 'off', value: setup.budget,
    on: { input: (e) => { setup.budget = e.target.value; } },
  });

  const participants = h(
    'fieldset',
    {},
    h('legend', {}, 'Wer wichtelt mit?'),
    h(
      'ul',
      { class: 'check-list' },
      people.map((p) => {
        const id = `santa-p-${p.id}`;
        return h(
          'li',
          { class: 'check' },
          h('input', {
            type: 'checkbox', id, checked: setup.selected.has(p.id), dataset: { key: `santa-cb-${p.id}` },
            on: {
              change: (e) => {
                if (e.target.checked) setup.selected.add(p.id);
                else {
                  setup.selected.delete(p.id);
                  setup.exclusions = setup.exclusions.filter(([a, b]) => a !== p.id && b !== p.id);
                }
                rerender(`santa-cb-${p.id}`);
              },
            },
          }),
          h('label', { for: id }, p.name),
        );
      }),
    ),
  );

  const chosen = people.filter((p) => setup.selected.has(p.id));
  const selA = h('select', {}, chosen.map((p) => h('option', { value: p.id }, p.name)));
  const selB = h('select', {}, chosen.map((p, i) => h('option', { value: p.id, selected: i === 1 }, p.name)));
  const exclusionError = h('p', { class: 'form-error', role: 'alert', hidden: true });

  const exclusionList = setup.exclusions.length
    ? h(
        'ul',
        { class: 'pair-list', 'aria-label': 'Ausschlüsse' },
        setup.exclusions.map(([a, b], index) =>
          h(
            'li',
            {},
            h('span', {}, `${nameOf(group, a)} ↔ ${nameOf(group, b)}`),
            h('button', {
              type: 'button', class: 'btn btn-quiet btn-small',
              'aria-label': `Ausschluss ${nameOf(group, a)} und ${nameOf(group, b)} entfernen`,
              on: { click: () => { setup.exclusions.splice(index, 1); rerender('santa-excl-add'); } },
            }, 'Entfernen'),
          ),
        ),
      )
    : h('p', { class: 'hint' }, 'Noch keine Ausschlüsse.');

  const addExclusion = () => {
    const a = selA.value;
    const b = selB.value;
    if (!a || !b || a === b) {
      exclusionError.textContent = 'Bitte wähle zwei verschiedene Personen.';
      exclusionError.hidden = false;
      return;
    }
    if (setup.exclusions.some(([x, y]) => (x === a && y === b) || (x === b && y === a))) {
      exclusionError.textContent = 'Dieses Paar ist schon ausgeschlossen.';
      exclusionError.hidden = false;
      return;
    }
    setup.exclusions.push([a, b]);
    rerender('santa-excl-add');
  };

  const errorBox = h('p', { class: 'form-error', role: 'alert', hidden: !setup.error }, setup.error);

  return h(
    'div',
    { class: 'view-santa' },
    h(
      'section',
      { class: 'card', 'aria-labelledby': 'santa-how' },
      h('h3', { id: 'santa-how' }, 'So funktioniert das Wichteln'),
      h(
        'ol',
        { class: 'santa-steps' },
        h('li', {}, 'Teilnehmer, Budget und Ausschlüsse (z. B. Paare) festlegen.'),
        h('li', {}, 'Auslosen: Jede Person beschenkt genau eine andere. Das Ergebnis erscheint nirgends.'),
        h('li', {}, 'Das Gerät geht reihum. Jede Person wählt ihr eigenes Passwort und bekommt ihren persönlichen Link.'),
        h('li', {}, 'Mit dem Link und dem Passwort sieht jede Person, wen sie beschenkt – samt Wunschliste.'),
      ),
      h('p', { class: 'hint' }, 'Beim Schrottwichteln läuft die Ziehung genauso; legt dann einfach lustige Geschenke und ein kleines Budget fest.'),
    ),
    h(
      'form',
      {
        class: 'card', novalidate: true,
        on: {
          submit: (event) => {
            event.preventDefault();
            startDraw(group, budgetInput.value);
          },
        },
      },
      h('h3', {}, 'Neue Ziehung'),
      participants,
      field('Budget pro Geschenk in € (optional)', budgetInput, 'Üblich sind 10–25 €.').field,
      h('h4', {}, 'Ausschlüsse'),
      h('p', { class: 'hint' }, 'Diese beiden ziehen sich gegenseitig nicht, z. B. Paare.'),
      exclusionList,
      chosen.length >= 3
        ? h(
            'div',
            { class: 'inline-form' },
            field('Person 1', selA).field,
            field('Person 2', selB).field,
            h('button', { type: 'button', class: 'btn', dataset: { key: 'santa-excl-add' }, on: { click: addExclusion } }, 'Ausschließen'),
          )
        : null,
      exclusionError,
      errorBox,
      h('button', { type: 'submit', class: 'btn btn-primary', disabled: chosen.length < 2 }, 'Auslosen'),
      chosen.length < 2 ? h('p', { class: 'hint' }, 'Wähle mindestens 2 Personen aus.') : null,
    ),
  );
}

function startDraw(group, budgetText) {
  try {
    const budget = parseBudget(budgetText);
    const participants = group.people.filter((p) => setup.selected.has(p.id)).map((p) => ({ id: p.id, name: p.name }));
    const assignments = drawSecretSanta(participants, setup.exclusions);
    session = {
      gid: group.gid,
      drawId: newDrawId(),
      budget,
      assignments,
      queue: participants.map((p) => p.id),
      index: 0,
      link: null,
      done: false,
    };
    setup.error = '';
  } catch (err) {
    if (!(err instanceof ValidationError || err instanceof DrawError)) throw err;
    setup.error = err.message;
  }
  rerender();
}

function renderLinkResult(group, giverName) {
  const link = session.link;
  const box = h('textarea', { class: 'link-box', readonly: true, rows: 4, 'aria-label': `Persönlicher Link für ${giverName}` }, link);
  const isLast = session.index === session.queue.length - 1;
  const qr = link.length <= QR_MAX_BYTES
    ? h('div', { class: 'qr-box' }, qrSvg(link, { label: `QR-Code mit dem persönlichen Link für ${giverName}` }))
    : h('p', { class: 'hint' }, 'Der Link ist für einen QR-Code zu lang. Kopiere ihn stattdessen.');
  return h(
    'section',
    { class: 'card', 'aria-labelledby': 'santa-link-h' },
    h('h3', { id: 'santa-link-h' }, `Persönlicher Link für ${giverName}`),
    h('p', {}, `${giverName}: Kopiere den Link oder scanne den QR-Code und merke dir dein Passwort. Der Link wird danach nicht noch einmal angezeigt.`),
    box,
    h('div', { class: 'row-actions' },
      h('button', {
        type: 'button', class: 'btn btn-primary',
        on: { click: async () => { if (await copyText(link)) toast('Link kopiert.'); else { box.focus(); box.select(); toast('Bitte kopiere den Link von Hand.', { error: true }); } } },
      }, 'Link kopieren')),
    qr,
    h('button', {
      type: 'button', class: 'btn btn-primary',
      on: {
        click: () => {
          session.link = null;
          if (isLast) session.done = true;
          else session.index += 1;
          rerender();
        },
      },
    }, isLast ? 'Fertig' : 'Weiter zur nächsten Person'),
  );
}

function renderStep(group) {
  const giverId = session.queue[session.index];
  const giverName = nameOf(group, giverId);
  const total = session.queue.length;

  if (session.link) return renderLinkResult(group, giverName);

  const pass1 = h('input', { type: 'password', autocomplete: 'new-password', minlength: 6, required: true });
  const pass2 = h('input', { type: 'password', autocomplete: 'new-password', minlength: 6, required: true });
  const error = h('p', { class: 'form-error', role: 'alert', hidden: true });
  const submit = h('button', { type: 'submit', class: 'btn btn-primary' }, 'Link erzeugen');

  return h(
    'section',
    { class: 'card', 'aria-labelledby': 'santa-step-h' },
    h('p', { class: 'progress' }, `Person ${session.index + 1} von ${total}`),
    h('h3', { id: 'santa-step-h' }, `Gib das Gerät jetzt an ${giverName}`),
    h('p', {}, `${giverName} wählt ein eigenes Passwort bzw. eine PIN (mindestens 6 Zeichen) und merkt es sich. Niemand sonst muss es kennen. Wer sich nur 4 Ziffern ausdenkt, macht es Neugierigen leicht – ein kurzes Wort oder eine längere Zahl ist besser.`),
    h(
      'form',
      {
        novalidate: true,
        on: {
          submit: async (event) => {
            event.preventDefault();
            error.hidden = true;
            try {
              if (pass1.value !== pass2.value) throw new ValidationError('Die beiden Eingaben stimmen nicht überein.');
              assertPassphrase(pass1.value);
              submit.disabled = true;
              const receiver = group.people.find((p) => p.id === session.assignments.get(giverId));
              const giver = group.people.find((p) => p.id === giverId);
              const hash = await createSantaHash({
                group, drawId: session.drawId, giver, receiver, passphrase: pass1.value, budget: session.budget,
              });
              session.link = `${location.origin}${location.pathname}${hash}`;
              rerender();
            } catch (err) {
              submit.disabled = false;
              if (!(err instanceof ValidationError)) throw err;
              error.textContent = err.message;
              error.hidden = false;
            }
          },
        },
      },
      field('Passwort / PIN', pass1).field,
      field('Noch einmal eingeben', pass2).field,
      error,
      submit,
    ),
  );
}

function renderDone() {
  return h(
    'section',
    { class: 'card', 'aria-labelledby': 'santa-done-h' },
    h('h3', { id: 'santa-done-h' }, 'Alle Links sind erzeugt 🎁'),
    h('p', {}, 'Die Ziehung wurde aus dem Speicher gelöscht. Auch du als Organisator kannst nicht mehr nachsehen, wer wen gezogen hat.'),
    h('p', { class: 'hint' }, 'Die Wunschlisten wurden zum Zeitpunkt der Ziehung in die Links übernommen. Wünsche, die später dazukommen, sieht man dort nicht.'),
    h('button', { type: 'button', class: 'btn', on: { click: () => { session = null; rerender(); } } }, 'Zurück'),
  );
}

export function renderSanta(group) {
  if (setup.gid !== group.gid) resetSetup(group);
  if (session && session.gid !== group.gid) session = null;
  // Participants that were removed from the group meanwhile invalidate a running draw.
  if (session && !session.done && session.queue.some((id) => !group.people.some((p) => p.id === id))) session = null;

  if (!session) return renderSetup(group);

  const header = h(
    'p',
    { class: 'hint' },
    'Ziehung ',
    h('span', { class: 'draw-id' }, `#${session.drawId}`),
    session.budget !== null ? ` · Budget ${formatPrice(session.budget)}` : '',
  );
  const body = session.done ? renderDone() : renderStep(group);
  const cancel = session.done
    ? null
    : h('button', {
        type: 'button', class: 'btn btn-quiet',
        on: {
          click: async () => {
            const ok = await confirmDialog({
              title: 'Ziehung abbrechen?',
              text: 'Die Ziehung wird verworfen. Schon erzeugte Links gehören dann zu einer unvollständigen Ziehung – lost am besten neu aus und verteilt alle Links noch einmal.',
              confirmLabel: 'Abbrechen und verwerfen', danger: true,
            });
            if (ok) { session = null; rerender(); }
          },
        },
      }, 'Ziehung abbrechen');
  return h('div', { class: 'view-santa' }, header, body, cancel);
}
