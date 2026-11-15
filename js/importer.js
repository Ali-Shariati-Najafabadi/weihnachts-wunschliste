// Everything that brings data in from outside: links, pasted text, backup files.

import { decodePayload, parseHash } from './codec.js';
import { ValidationError, parseGroup, parseSantaLink } from './schema.js';
import { mergeGroups } from './model.js';
import { putGroup, selectGroup, setUi, state } from './store.js';
import { showDialog } from './dialogs.js';
import { h, toast } from './dom.js';

const MAX_FILE_BYTES = 1_500_000;

/** Offers merge / replace / cancel for a group that exists already. */
function askConflict(existing, incoming) {
  return showDialog('Diese Gruppe hast du schon', ({ close }) =>
    h(
      'div',
      { class: 'dialog-body' },
      h('p', {}, `„${incoming.name}“ ist schon auf diesem Gerät gespeichert, aber der neue Stand ist anders. Was soll passieren?`),
      h(
        'div',
        { class: 'choice-list' },
        h(
          'button', { type: 'button', class: 'btn btn-primary', on: { click: () => close('merge') } },
          'Zusammenführen (empfohlen)',
        ),
        h('p', { class: 'hint' }, 'Behält deine Änderungen und übernimmt die neuen. Bei Konflikten gewinnt die jüngere Änderung.'),
        h(
          'button', { type: 'button', class: 'btn', on: { click: () => close('replace') } },
          'Durch den neuen Stand ersetzen',
        ),
        h('p', { class: 'hint' }, 'Deine lokalen Änderungen gehen dabei verloren.'),
        h('button', { type: 'button', class: 'btn btn-quiet', on: { click: () => close(undefined) } }, 'Abbrechen'),
      ),
    ),
  );
}

/** Adds a validated group, or asks what to do if it exists already. */
export async function acceptGroup(incoming) {
  const existing = state.groups.find((g) => g.gid === incoming.gid);
  if (!existing) {
    putGroup(incoming);
    toast(`Gruppe „${incoming.name}“ wurde übernommen.`);
    return;
  }
  if (JSON.stringify(existing) === JSON.stringify(incoming)) {
    selectGroup(existing.gid);
    toast('Du hast schon genau diesen Stand.');
    return;
  }
  const choice = await askConflict(existing, incoming);
  if (choice === 'merge') {
    putGroup(parseGroup(mergeGroups(existing, incoming)));
    toast('Die Stände wurden zusammengeführt.');
  } else if (choice === 'replace') {
    putGroup(incoming);
    toast('Der neue Stand wurde übernommen.');
  }
}

/** Handles a decoded hash payload ("g" or "w"). Throws ValidationError for bad data. */
export async function handleHashPayload({ kind, payload }) {
  const data = await decodePayload(payload);
  if (kind === 'santa') {
    setUi({ reveal: parseSantaLink(data) });
    return;
  }
  await acceptGroup(parseGroup(data));
}

/** Handles pasted text: a backup (JSON) or a complete link. */
export async function importText(text) {
  const trimmed = String(text ?? '').trim();
  if (trimmed === '') throw new ValidationError('Bitte füge einen Link oder ein Backup ein.');
  if (trimmed.startsWith('{')) {
    let data;
    try {
      data = JSON.parse(trimmed);
    } catch {
      throw new ValidationError('Das Backup ist keine gültige JSON-Datei.');
    }
    await acceptGroup(parseGroup(data));
    return;
  }
  const parsed = parseHash(trimmed);
  if (!parsed) throw new ValidationError('Das sieht weder nach einem Link noch nach einem Backup aus.');
  await handleHashPayload(parsed);
}

export async function importFile(file) {
  if (file.size > MAX_FILE_BYTES) throw new ValidationError('Die Datei ist zu groß.');
  await importText(await file.text());
}
