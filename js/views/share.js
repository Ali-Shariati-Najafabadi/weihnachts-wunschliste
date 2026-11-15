// "Teilen & Backup": link, backup export/import, printing and deleting data.

import { buildHash } from '../codec.js';
import { ValidationError } from '../schema.js';
import { downloadText, copyText, field, h, toast } from '../dom.js';
import { confirmDialog } from '../dialogs.js';
import { importFile, importText } from '../importer.js';
import { deleteGroup, wipeAll } from '../store.js';
import { printSheets } from '../print.js';
import { slugify } from '../util.js';
import { syncNotice } from './notice.js';
import { qrSvg, QR_MAX_BYTES } from '../qr.js';

/** Links longer than this are often cut off by messengers. */
const LONG_LINK = 6000;

async function run(action) {
  try {
    await action();
  } catch (err) {
    if (err instanceof ValidationError) toast(err.message, { error: true });
    else throw err;
  }
}

/** File picker and paste field for links and backups. Used on the start page and in "Teilen". */
export function importControls() {
  const fileInput = h('input', { type: 'file', accept: '.json,application/json' });
  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (file) run(() => importFile(file));
  });
  const pasteInput = h('textarea', { rows: 3, spellcheck: 'false', autocomplete: 'off' });
  return h(
    'div',
    { class: 'import-controls' },
    field('Backup-Datei (.json) auswählen', fileInput).field,
    field('… oder Link bzw. Backup-Text einfügen', pasteInput).field,
    h('button', {
      type: 'button', class: 'btn',
      on: { click: () => run(async () => { await importText(pasteInput.value); pasteInput.value = ''; }) },
    }, 'Einfügen und importieren'),
  );
}

function linkCard(group) {
  const output = h('textarea', {
    class: 'link-box', readonly: true, rows: 4, 'aria-label': 'Link zur Gruppe', spellcheck: 'false',
  }, 'Link wird erstellt …');
  const info = h('p', { class: 'hint', 'aria-live': 'polite' });
  const qrBox = h('div', { class: 'qr-box' });
  const copyBtn = h('button', { type: 'button', class: 'btn btn-primary', disabled: true }, 'Link kopieren');
  const shareBtn = navigator.share
    ? h('button', { type: 'button', class: 'btn', disabled: true }, 'Teilen …')
    : null;
  let link = '';

  buildHash('group', group).then((hash) => {
    link = `${location.origin}${location.pathname}${hash}`;
    output.value = link;
    copyBtn.disabled = false;
    if (shareBtn) shareBtn.disabled = false;
    info.textContent = `Länge: ${link.length.toLocaleString('de-DE')} Zeichen.${
      link.length > LONG_LINK ? ' Das ist lang – manche Messenger kürzen so etwas. Nutze dann besser das Backup (JSON).' : ''
    }`;
    if (link.length <= QR_MAX_BYTES) {
      qrBox.append(
        qrSvg(link, { label: `QR-Code für den Link zur Gruppe ${group.name}` }),
        h('p', { class: 'hint' }, 'QR-Code zum Abscannen mit dem Handy.'),
      );
    } else {
      qrBox.append(h('p', { class: 'hint' }, 'Für diesen Link ist der QR-Code zu groß. Nutze Link oder Backup.'));
    }
  }, () => {
    output.value = '';
    info.textContent = 'Der Link konnte nicht erstellt werden.';
  });

  copyBtn.addEventListener('click', async () => {
    if (await copyText(link)) toast('Link kopiert.');
    else {
      output.focus();
      output.select();
      toast('Bitte kopiere den markierten Link von Hand.', { error: true });
    }
  });
  shareBtn?.addEventListener('click', () => {
    navigator.share({ title: group.name, text: `Wunschlisten: ${group.name}`, url: link }).catch(() => {});
  });

  return h(
    'section',
    { class: 'card', 'aria-labelledby': 'share-link-h' },
    h('h3', { id: 'share-link-h' }, 'Link teilen'),
    h('p', {}, 'Der Link enthält alle Personen, Wünsche und Reservierungen. Die Daten stehen nur im Link, nicht auf einem Server.'),
    output,
    h('div', { class: 'row-actions' }, copyBtn, shareBtn),
    info,
    qrBox,
    h('p', { class: 'hint' }, 'Der Link ist nur kodiert, nicht verschlüsselt. Gib ihn nur an Leute weiter, die ihn sehen dürfen. Der Überraschungsschutz beruht auf Fairness: Wer bei „Ich bin …“ einen anderen Namen wählt, sieht dessen Reservierungen.'),
  );
}

function backupCard(group) {
  return h(
    'section',
    { class: 'card', 'aria-labelledby': 'backup-h' },
    h('h3', { id: 'backup-h' }, 'Backup'),
    h('p', {}, 'Sichere die Gruppe als Datei oder spiele ein Backup oder einen Link ein.'),
    h('div', { class: 'row-actions' },
      h('button', {
        type: 'button', class: 'btn',
        on: {
          click: () => {
            const date = new Date().toISOString().slice(0, 10);
            downloadText(`wunschliste-${slugify(group.name)}-${date}.json`, JSON.stringify(group, null, 2));
          },
        },
      }, 'Backup herunterladen (JSON)')),
    importControls(),
  );
}

function printCard(group) {
  return h(
    'section',
    { class: 'card', 'aria-labelledby': 'print-h' },
    h('h3', { id: 'print-h' }, 'Drucken'),
    h('p', {}, 'Jede Person bekommt einen eigenen Wunschzettel auf einer Seite – ohne Reservierungen. Im Druckdialog kannst du auch „Als PDF speichern“ wählen.'),
    h('button', {
      type: 'button', class: 'btn', disabled: group.people.length === 0,
      on: { click: () => printSheets(group, group.people) },
    }, 'Alle Wunschzettel drucken'),
  );
}

function dangerCard(group) {
  return h(
    'section',
    { class: 'card danger-zone', 'aria-labelledby': 'danger-h' },
    h('h3', { id: 'danger-h' }, 'Löschen'),
    h('p', {}, 'Alle Daten liegen nur in diesem Browser. Erstelle vorher ein Backup, wenn du sie noch brauchst.'),
    h('div', { class: 'row-actions' },
      h('button', {
        type: 'button', class: 'btn btn-danger',
        on: {
          click: async () => {
            const ok = await confirmDialog({
              title: 'Gruppe löschen?',
              text: `„${group.name}“ wird von diesem Gerät gelöscht. Andere behalten ihre Kopie.`,
              confirmLabel: 'Löschen', danger: true,
            });
            if (ok) deleteGroup(group.gid);
          },
        },
      }, 'Diese Gruppe löschen'),
      h('button', {
        type: 'button', class: 'btn btn-quiet',
        on: {
          click: async () => {
            const ok = await confirmDialog({
              title: 'Alles löschen?',
              text: 'Alle Gruppen und Einstellungen werden aus diesem Browser entfernt.',
              confirmLabel: 'Alles löschen', danger: true,
            });
            if (ok) wipeAll();
          },
        },
      }, 'Alle Daten auf diesem Gerät löschen')),
  );
}

export function renderShare(group) {
  return h('div', { class: 'view-share' }, syncNotice(), linkCard(group), backupCard(group), printCard(group), dangerCard(group));
}
