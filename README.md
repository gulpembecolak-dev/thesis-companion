# thesis-companion

Een persoonlijke web-app die twee dingen samenbrengt:

1. **Woorden** — een SM-2 spaced-repetition trainer voor Nederlands (gebaseerd op het bestaande `woorden`-project).
2. **Plan** — een 60-daagse leesroutine (15 mei → 13 juli 2026) met dagelijkse leesopdracht, schrijfprompt, en plaats om antwoorden op te slaan.

Alle data leeft in `localStorage` in de browser. Geen backend, geen accounts.

## Tabs

- **vandaag** — dagdashboard voor vandaag: lezen + schrijven + due woorden in één scherm
- **herhalen** — flashcard review (SM-2 lite)
- **lijst** — alle woorden, zoekbaar, bewerkbaar
- **nieuw** — woord toevoegen / bewerken
- **plan** — de 60 dagen, gegroepeerd per week, uitklapbaar; elke dag heeft lezen-/schrijven-checkbox + tekstveld
- **stats** — gecombineerde statistieken (woorden + plan) + import/export/reset

## Data

LocalStorage-keys (gedeeld met `woorden` als ze op dezelfde host draaien):

- `woorden_v1` — array van woord-kaarten
- `woorden_streak_v1` — streak object
- `tc_plan_progress_v1` — `{ "1": { read: true, write: false }, ... }`
- `tc_plan_writing_v1` — `{ "1": "geschreven antwoord", ... }`

Bij export wordt alles meegenomen. Bij import worden bestaande woorden niet overschreven (op basis van NL-woord).

## Stack

Geen build step. Pure HTML/CSS/JS. Werkt door `index.html` te openen, en wordt automatisch gepubliceerd via GitHub Pages.

## Sneltoetsen

- **Spatie** — kaart omdraaien (in herhalen)
- **1 / 2 / 3 / 4** — opnieuw / moeilijk / goed / makkelijk
- **N** — nieuw woord
