// Modal dialogs based on the native <dialog> element (focus trap and Esc included).

import { PRIORITIES, ValidationError } from './schema.js';
import { cleanWishFields } from './model.js';
import { field, h, nextId } from './dom.js';

/** Opens a modal dialog. `build({ close })` returns the content; resolves with the value passed to close(). */
export function showDialog(title, build, { className = '' } = {}) {
  return new Promise((resolve) => {
    const titleId = nextId('dlg-title');
    const dialog = h('dialog', { class: `modal ${className}`.trim(), 'aria-labelledby': titleId });
    let result;
    const close = (value) => {
      result = value;
      dialog.close();
    };
    dialog.append(h('h2', { id: titleId }, title), build({ close }));
    dialog.addEventListener('close', () => {
      dialog.remove();
      resolve(result);
    });
    // Click on the backdrop closes the dialog.
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) close(undefined);
    });
    document.body.append(dialog);
    dialog.showModal();
  });
}

export const errorBox = () => h('p', { class: 'form-error', role: 'alert', hidden: true });

export function showError(box, message) {
  box.textContent = message;
  box.hidden = !message;
}

/** Yes/no question. Resolves to true or false. */
export async function confirmDialog({ title, text, confirmLabel = 'Ja', danger = false }) {
  const result = await showDialog(title, ({ close }) =>
    h(
      'div',
      { class: 'dialog-body' },
      h('p', {}, text),
      h(
        'div',
        { class: 'dialog-actions' },
        h('button', { type: 'button', class: 'btn', on: { click: () => close(false) } }, 'Abbrechen'),
        h(
          'button',
          { type: 'button', class: `btn ${danger ? 'btn-danger' : 'btn-primary'}`, on: { click: () => close(true) } },
          confirmLabel,
        ),
      ),
    ),
  );
  return result === true;
}

/** Asks for one line of text. Resolves to the text or undefined. */
export function textDialog({ title, label, value = '', submitLabel = 'Speichern', validate }) {
  return showDialog(title, ({ close }) => {
    const input = h('input', { type: 'text', value, required: true, autocomplete: 'off', maxlength: 80 });
    const error = errorBox();
    const form = h(
      'form',
      {
        class: 'dialog-body',
        novalidate: true,
        on: {
          submit: (event) => {
            event.preventDefault();
            try {
              close(validate ? validate(input.value) : input.value);
            } catch (err) {
              if (!(err instanceof ValidationError)) throw err;
              showError(error, err.message);
              input.focus();
            }
          },
        },
      },
      field(label, input).field,
      error,
      h(
        'div',
        { class: 'dialog-actions' },
        h('button', { type: 'button', class: 'btn', on: { click: () => close(undefined) } }, 'Abbrechen'),
        h('button', { type: 'submit', class: 'btn btn-primary' }, submitLabel),
      ),
    );
    return form;
  });
}

/** Form to add or edit a wish. Resolves to validated fields or undefined. */
export function wishDialog({ wish = null, personName }) {
  const title = wish ? 'Wunsch bearbeiten' : `Wunsch für ${personName} hinzufügen`;
  return showDialog(title, ({ close }) => {
    const titleInput = h('input', {
      type: 'text', required: true, maxlength: 120, autocomplete: 'off', value: wish?.title ?? '',
    });
    const noteInput = h('textarea', { rows: 3, maxlength: 500 }, wish?.note ?? '');
    const priceInput = h('input', {
      type: 'text', inputmode: 'decimal', autocomplete: 'off', maxlength: 12,
      value: wish?.price != null ? String(wish.price).replace('.', ',') : '',
    });
    const urlInput = h('input', {
      type: 'text', inputmode: 'url', autocomplete: 'off', autocapitalize: 'none', spellcheck: 'false',
      maxlength: 500, value: wish?.url ?? '',
    });
    const sharedInput = h('input', { type: 'checkbox', id: nextId('shared'), checked: wish?.shared === true });
    const currentPrio = wish?.prio ?? 2;
    const prioRadios = [3, 2, 1].map((prio) => {
      const id = nextId('prio');
      return h(
        'span',
        { class: 'radio' },
        h('input', { type: 'radio', name: 'prio', value: prio, id, checked: prio === currentPrio }),
        h('label', { for: id }, `${PRIORITIES[prio].stars} ${PRIORITIES[prio].label}`),
      );
    });
    const error = errorBox();

    return h(
      'form',
      {
        class: 'dialog-body',
        novalidate: true,
        on: {
          submit: (event) => {
            event.preventDefault();
            try {
              const checked = event.currentTarget.querySelector('input[name="prio"]:checked');
              close(
                cleanWishFields({
                  title: titleInput.value,
                  note: noteInput.value,
                  price: priceInput.value,
                  url: urlInput.value,
                  prio: checked?.value,
                  shared: sharedInput.checked,
                }),
              );
            } catch (err) {
              if (!(err instanceof ValidationError)) throw err;
              showError(error, err.message);
            }
          },
        },
      },
      field('Titel', titleInput).field,
      field('Notiz (z. B. Größe, Farbe)', noteInput).field,
      h(
        'div',
        { class: 'field-row' },
        field('Ungefährer Preis in €', priceInput).field,
        field('Link zum Shop (optional)', urlInput).field,
      ),
      h('fieldset', { class: 'prio-set' }, h('legend', {}, 'Wie wichtig ist der Wunsch?'), prioRadios),
      h(
        'div',
        { class: 'check' },
        sharedInput,
        h('label', { for: sharedInput.id }, 'Sammelgeschenk – mehrere Personen schenken gemeinsam'),
      ),
      error,
      h(
        'div',
        { class: 'dialog-actions' },
        h('button', { type: 'button', class: 'btn', on: { click: () => close(undefined) } }, 'Abbrechen'),
        h('button', { type: 'submit', class: 'btn btn-primary' }, 'Speichern'),
      ),
    );
  });
}
