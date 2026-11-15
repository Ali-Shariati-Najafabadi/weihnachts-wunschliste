// Start page: create a group or import one.

import { ValidationError } from '../schema.js';
import { createGroup } from '../model.js';
import { field, h } from '../dom.js';
import { putGroup, state, setUi } from '../store.js';
import { importControls } from './share.js';

function splitNames(text) {
  return text.split(/[,;\n]+/).map((s) => s.trim()).filter(Boolean);
}

export function renderWelcome() {
  const names = [];
  const nameInput = h('input', { type: 'text', required: true, maxlength: 80, autocomplete: 'off' });
  const budgetInput = h('input', { type: 'text', inputmode: 'decimal', maxlength: 8, autocomplete: 'off' });
  const personInput = h('input', { type: 'text', maxlength: 120, autocomplete: 'off', enterkeyhint: 'done' });
  const chips = h('ul', { class: 'chips', 'aria-label': 'Teilnehmer' });
  const error = h('p', { class: 'form-error', role: 'alert', hidden: true });

  function drawChips() {
    chips.replaceChildren(
      ...names.map((name, index) =>
        h('li', { class: 'chip' }, name,
          h('button', {
            type: 'button', class: 'chip-remove', 'aria-label': `${name} entfernen`,
            on: { click: () => { names.splice(index, 1); drawChips(); personInput.focus(); } },
          }, '×')),
      ),
    );
  }
  function addNames() {
    for (const name of splitNames(personInput.value)) {
      if (!names.some((n) => n.toLocaleLowerCase('de') === name.toLocaleLowerCase('de'))) names.push(name);
    }
    personInput.value = '';
    drawChips();
  }
  personInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      addNames();
    }
  });

  const form = h(
    'form',
    {
      class: 'card', novalidate: true,
      on: {
        submit: (event) => {
          event.preventDefault();
          addNames();
          try {
            putGroup(createGroup({ name: nameInput.value, budget: budgetInput.value, people: names }));
          } catch (err) {
            if (!(err instanceof ValidationError)) throw err;
            error.textContent = err.message;
            error.hidden = false;
          }
        },
      },
    },
    h('h3', {}, 'Neue Gruppe anlegen'),
    field('Name der Gruppe', nameInput, 'z. B. „Familie Shariati 2026“').field,
    field('Preisrahmen pro Person in € (optional)', budgetInput, 'Viele Familien einigen sich auf ein Limit, z. B. 30 €.').field,
    h('div', { class: 'field' },
      h('label', { for: 'person-input' }, 'Teilnehmer'),
      h('div', { class: 'inline-form' },
        Object.assign(personInput, { id: 'person-input' }),
        h('button', { type: 'button', class: 'btn', on: { click: () => { addNames(); personInput.focus(); } } }, 'Hinzufügen')),
      h('p', { class: 'hint' }, 'Ein Name pro Eingabe, oder mehrere mit Komma getrennt. Du kannst später jederzeit Personen ergänzen.')),
    chips,
    error,
    h('button', { type: 'submit', class: 'btn btn-primary' }, 'Gruppe anlegen'),
  );

  return h(
    'div',
    { class: 'view-welcome' },
    h('section', { class: 'hero' },
      h('h2', {}, 'Wunschlisten für die ganze Familie'),
      h('ul', { class: 'checklist' },
        h('li', {}, 'Jede Person schreibt ihre Wünsche auf – mit Preis, Link und Priorität.'),
        h('li', {}, 'Die anderen reservieren heimlich: Wer sich etwas wünscht, sieht nicht, was schon besorgt ist.'),
        h('li', {}, 'Geteilt wird per Link. Keine Konten, keine Cookies, kein Tracking.'))),
    form,
    h('section', { class: 'card', 'aria-labelledby': 'import-h' },
      h('h3', { id: 'import-h' }, 'Link oder Backup erhalten?'),
      importControls()),
    state.groups.length
      ? h('button', { type: 'button', class: 'btn btn-quiet', on: { click: () => setUi({ creating: false }) } }, 'Zurück zu meinen Gruppen')
      : null,
  );
}

