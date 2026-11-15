# Weihnachts-Wunschliste

Eine kleine, private Website, auf der Familie und Freunde Weihnachts-Wunschlisten
erstellen, teilen und heimlich Geschenke reservieren können – plus Wichteln mit
verschlüsselten, persönlichen Links.

- Kein Server, keine Konten, keine Cookies, kein Tracking, keine Analyse-Dienste
- Keine externen Schriften, Skripte oder CDNs: alles liegt in diesem Repository
- Reine HTML/CSS/JavaScript-Seite (ES-Module), kein Build-Schritt nötig
- Läuft auf GitHub Pages, auch unter einem Unterpfad wie `/weihnachts-wunschliste/`
- Auf dem Handy bedienbar, mit hellem und dunklem Design und einer Druckansicht

Autor: Ali Shariati Najafabadi · Lizenz: [MIT](LICENSE)

## Was kann die Seite?

| Funktion | Kurzbeschreibung |
| --- | --- |
| Gruppen | Gruppe mit Namen, optionalem Preisrahmen und beliebig vielen Personen anlegen. Mehrere Gruppen sind möglich. |
| Wunschlisten | Pro Person Wünsche mit Titel, Notiz (z. B. Größe, Farbe), ungefährem Preis, Link und Priorität (Großer Wunsch / Schön / Nice-to-have). |
| „Ich bin …“ | Wer sich etwas wünscht, sieht auf der eigenen Liste **nicht**, was reserviert wurde. Alle anderen sehen es und kaufen nichts doppelt. |
| Sammelgeschenk | Große Wünsche können als Sammelgeschenk markiert werden. Dann dürfen mehrere Personen „Ich beteilige mich“ wählen. |
| Teilen | Die ganze Gruppe steckt komprimiert im Link (URL-Hash). Dazu QR-Code, JSON-Backup und Import. |
| Zusammenführen | Wer einen neuen Link zu einer bekannten Gruppe öffnet, kann die Stände zusammenführen. |
| Druckansicht | Pro Person ein Wunschzettel auf einer Seite (ohne Reservierungen), auch als PDF. |
| Countdown | Tage bis Heiligabend (und bis Nikolaus), danach bis zum nächsten Jahr. |
| Wichteln | Zufällige Ziehung mit Budget und Ausschlüssen (z. B. Paare). Jede Person bekommt einen persönlichen, verschlüsselten Link. |

## Lokal ausprobieren

Du brauchst nur [Node.js](https://nodejs.org) ab Version 22.

```bash
npm start
```

Dann öffnest du <http://localhost:8080/>. Den GitHub-Pages-Unterpfad kannst du so simulieren:

```bash
node scripts/serve.mjs --base /weihnachts-wunschliste/
```

Die Tests laufen mit dem in Node eingebauten Test-Runner:

```bash
npm test
```

## Auf GitHub Pages veröffentlichen (Schritt für Schritt)

### 1. Repository anlegen und Code hochladen

**Variante A: mit der GitHub CLI** (`gh`, einmalig mit `gh auth login` anmelden)

```bash
gh repo create weihnachts-wunschliste --public --source=. --remote=origin --push
```

**Variante B: im Browser**

1. Auf <https://github.com/new> ein neues Repository `weihnachts-wunschliste` anlegen. Wähle **Public** und füge **keine** README, `.gitignore` oder Lizenz hinzu.
2. Im Projektordner ausführen (ersetze `<benutzername>`):

```bash
git remote add origin https://github.com/<benutzername>/weihnachts-wunschliste.git
git push -u origin main
```

Das Repository muss öffentlich sein, weil GitHub Pages bei privaten Repositories nur mit bezahlten Plänen funktioniert. Im Repository liegen keine persönlichen Daten. Die Wunschlisten stecken ausschließlich in den Links, die ihr verschickt.

### 2. GitHub Pages einschalten

1. Öffne dein Repository auf GitHub.
2. Gehe zu **Settings → Pages**.
3. Wähle unter **Build and deployment → Source** den Eintrag **GitHub Actions**.

Alternativ per CLI:

```bash
gh api -X POST repos/<benutzername>/weihnachts-wunschliste/pages -f build_type=workflow
```

### 3. Deployment abwarten und URL finden

1. Jeder Push auf `main` startet den Workflow *Deploy to GitHub Pages* (Reiter **Actions**). Du kannst ihn dort auch von Hand über **Run workflow** starten.
2. Der Workflow führt zuerst die Tests aus und veröffentlicht dann die Seite.
3. Nach ca. einer Minute steht die Adresse im Workflow-Lauf beim Schritt *deploy* und unter **Settings → Pages**:

```
https://<benutzername>.github.io/weihnachts-wunschliste/
```

Wenn der erste Lauf mit einer Meldung zu „Pages“ oder „Environment“ fehlschlägt, hast du Schritt 2 noch nicht erledigt. Hole ihn nach und starte den Workflow erneut.

Für Pull Requests läuft zusätzlich der Workflow *CI*, der nur die Tests ausführt.

## So benutzt ihr die Seite

1. **Gruppe anlegen:** Name, optional Preisrahmen, Teilnehmer eintragen.
2. **Wünsche eintragen:** Jede Person wählt unter *Ich bin …* ihren Namen und trägt Wünsche ein. Eltern können auch die Listen ihrer Kinder pflegen.
3. **Link teilen:** Unter *Teilen & Backup* den Link kopieren oder den QR-Code zeigen und an Familie und Freunde schicken.
4. **Reservieren:** Wer den Link öffnet, wählt *Ich bin …* und klickt bei den Wünschen anderer auf *Ich schenke das*.
5. **Stand weitergeben:** Nach Änderungen den Link erneut teilen. Wer ihn öffnet, wählt *Zusammenführen* und behält so die eigenen Änderungen.
6. **Backup:** Unter *Teilen & Backup* lässt sich die Gruppe als JSON-Datei sichern und wieder einspielen.

### Wichteln

1. Reiter *Wichteln*: Teilnehmer, Budget und Ausschlüsse wählen, dann *Auslosen*.
2. Das Ergebnis wird nirgends angezeigt. Das Gerät geht reihum: Jede Person wählt ein eigenes Passwort (mindestens 6 Zeichen) und bekommt ihren persönlichen Link bzw. QR-Code.
3. Mit Link und Passwort sieht die Person, wen sie beschenkt, samt Wunschliste der gezogenen Person.

Die Ziehung ist ein gültiges Derangement: Niemand zieht sich selbst, Ausschlüsse werden beachtet und gibt es keine Lösung, erscheint eine Fehlermeldung. Das Ergebnis jeder Person ist im Link mit AES-256-GCM verschlüsselt. Der Schlüssel wird mit PBKDF2 (SHA-256, 600 000 Runden) aus dem gewählten Passwort abgeleitet. Die Wunschlisten werden zum Zeitpunkt der Ziehung in die Links übernommen.

## Bekannte Einschränkungen (bitte lesen)

- **Kein Live-Abgleich.** GitHub Pages ist statisch und hat kein Backend. Reservierungen sind nicht automatisch für alle sichtbar, sondern nur über neu geteilte Links oder Backups. Zwei Personen, die gleichzeitig dasselbe reservieren, merken es erst beim Zusammenführen. Dann gewinnt die jüngere Änderung.
- **Überraschungsschutz beruht auf Fairness.** Der Link enthält alle Reservierungen (nur kodiert, nicht verschlüsselt). Wer bei *Ich bin …* einen anderen Namen wählt oder in die Entwicklertools schaut, sieht sie.
- **Links können lang werden.** Bei vielen Wünschen kürzen manche Messenger den Link, und der QR-Code passt nur bis ca. 2 900 Zeichen. Nutze dann das JSON-Backup.
- **Daten liegen im Browser.** Wer den Browserspeicher löscht, verliert die lokale Kopie. Erstelle ein Backup oder hebe den Link auf.
- **Gelöschtes kommt nicht zurück.** Beim Zusammenführen gewinnt das Löschen. Gelöschte Wünsche tauchen nicht wieder auf.
- **Kurze PINs sind schwach.** Wer einen Wichtel-Link hat, kann ein kurzes Passwort offline durchprobieren. Wähle ein Wort oder eine lange Zahl statt 4 Ziffern.
- **Wichteln-Organisator.** Die Ziehung existiert nur im Arbeitsspeicher des Organisator-Geräts, bis alle Links erzeugt sind. Mit Entwicklertools könnte man sie dort theoretisch einsehen. Das ist wie beim Losen aus einem Hut: Es geht um Vertrauen innerhalb der Gruppe.

## Optional später: Backend für Live-Abgleich (v2)

Wer echte Live-Synchronisierung möchte, könnte ein kostenloses Backend anbinden. Das ist bewusst nicht Teil dieses Projekts.

| | Supabase | Firebase |
| --- | --- | --- |
| Vorteile | Relationale Datenbank (Postgres), Open Source, Region in der EU (Frankfurt) wählbar, Zeilen-Zugriffsregeln (RLS) | Sehr einfache Echtzeit-Synchronisierung, großzügiges Gratis-Kontingent |
| Nachteile | Eigene Tabellen und Regeln müssen sauber aufgesetzt werden, Gratis-Projekte pausieren bei Inaktivität | Google als Anbieter (Drittlandtransfer im Blick behalten), Sicherheitsregeln leicht falsch konfiguriert |
| Datenschutz (DSGVO) | Jeweils nötig: Auftragsverarbeitungsvertrag, Datenschutzerklärung, Löschkonzept, EU-Region. Wunschlisten und Namen sind personenbezogene Daten. | |

Außerdem verliert die Seite dann ihren größten Vorteil: Heute landen keine Daten bei Dritten. Die Zugangsdaten (Projekt-URL, öffentlicher Schlüssel) dürften nie geheime Schlüssel enthalten, und es müssten Konten oder Zugriffs-Codes eingeführt werden.

## Tipps für die Weihnachtszeit

- **Termine:** Nikolaus ist am 6.12., der Adventskalender läuft vom 1. bis 24.12. Die Bescherung ist meist am Abend des 24.12., in manchen Familien am 25. oder 26.12. Klärt das früh.
- **Preisrahmen** gleich beim Anlegen der Gruppe eintragen, damit alle dasselbe Limit im Kopf haben.
- **Online bestellen:** Rechnet mit Lieferzeiten. Gegen Mitte Dezember wird es knapp.
- **Kinder:** Eltern können die Wunschzettel ihrer Kinder eintragen und ausdrucken.
- **Kleine Wünsche** (Nikolaus, Adventskalender) kannst du als „Nice-to-have“ eintragen und in der Notiz vermerken.

## Projektstruktur

```
index.html            Einstiegsseite
css/                  style.css (Bildschirm), print.css (Druckansicht)
js/                   ES-Module: Schema, Codec, Modell, Speicher, Ansichten,
                      Wichteln, Krypto, QR-Code
tests/                Tests für Kernlogik (node --test)
scripts/serve.mjs     Kleiner Entwicklungsserver
.github/workflows/    deploy.yml (Pages) und ci.yml (Tests bei Pull Requests)
```

## Sicherheit und Datenschutz in Kürze

- Nutzerdaten werden nie als HTML eingefügt, sondern als Text. Links sind nur mit `http` oder `https` erlaubt.
- Daten aus Links, Importen und dem Browserspeicher werden als nicht vertrauenswürdig behandelt: Schema-Prüfung, Längenlimits und Schutz vor Dekomprimierungsbomben.
- Eine Content-Security-Policy erlaubt nur eigene Skripte und Styles und verbietet jede Netzwerkverbindung (`connect-src 'none'`).
- `<meta name="robots" content="noindex">` hält die Seite aus Suchmaschinen heraus.
