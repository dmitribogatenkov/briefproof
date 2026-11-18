The reply of the blind checker: a fresh agent given only `brief.md` and a clean
copy of the project, with the prompt from `skills/build/prompts/acceptance.md`
plus one line asking it to stop its own server by process id. Unedited.

---

RUNS: yes, but there is no README at all. I found `npm start` in package.json and ran `PORT=4793 npm start`; it served the app and wrote `data.json` in the project folder. `npm test`: 16/16 pass. Server stopped by pid afterwards; my test `data.json` and `backups/` are left in the clone.

REQUIREMENTS: (live = curl against the running server; clock = real `createApp` in-process with an injected date, because the live server cannot be moved in time)
✓ Runs on laptop, in browser, no account, no internet, one file — live: binds 127.0.0.1, no login, no external URLs in public/ or lib/, all data in `./data.json`.
✓ Client has name, address, country, optional VAT number, language et/en — POST /api/clients ×4 accepted; a language other than et/en is rejected in code.
✓ Search ignores case and dots/tildes ("polva" finds "Põlva Köök OÜ") — browser: typed "polva" in Clients, got Põlva Köök OÜ (after ticking "Show archived", since I had archived it).
✓ Client with issued invoice can't be deleted, only archived; archived not in picker — DELETE c1 gave "cannot be deleted. Archive it instead"; after archiving, the new-invoice picker listed only Berlin, Paris, US; POST draft for c1 gave "This client is archived."
✓ CSV import, semicolons, dd.mm.yyyy, client, description, h:mm — POST /api/import with 4 rows returned imported:4. Browser file picker itself not clicked; same endpoint.
✓ Any wrong row: nothing imported, list with line numbers — file with 31.02.2026, "Nobody", 1:75 returned errors for lines 2, 3, 4; entries stayed 0.
✓ Same file twice doesn't duplicate — second import returned imported:0, duplicates:4.
✓ Each entry rounded up to next 15 min on its own — 65→75, 16→30, 15→15, 121→135; billed as separate lines.
✓ New invoice is a draft; pick client, pick unbilled entries, add manual lines — draft number null; entry on another draft refused (409), other client's entry refused; manual line 3 × 1234,50 = 3 703,50.
✓ Hourly rate per client — Põlva 0,5 h at 60 = 30,00; Berlin 2,25 h at 100 = 225,00.
✓ Draft editable; deleted draft has 10 s undo — live: undo right away restored it, undo after 12 s gave "The 10 seconds to undo have passed"; browser toast "Undo (7 s)" restored the draft, and disappeared after 10 s.
✓ Issued invoice gets number and can't be changed, not by me and not by a bug — PUT/DELETE/re-issue on i10 all 409; hand-editing a stored document makes state() warn "does not match its seal"; every write is refused if an issued document differs.
✓ Credit note: own document, own number, negative amounts, points back — credit of 2026-003 gave 2026-005, net -225,00, "Credit note for invoice 2026-003 of 17 November 2026"; second credit refused.
✓ Numbers like 2026-001, restart every year — clock: 2026-001, 2026-002, then on 2 Jan 2027: 2027-001, 2027-002.
✓ No gaps, no reuse, drafts have no numbers — live: 22 documents numbered 2026-001…022 with drafts deleted in between.
✓ Prices without VAT; VAT 24% default, changeable, never changes issued — set 25%, issued 2026-002, set back to 24%: 2026-001 kept 2400, 2026-002 kept 2500.
✓ VAT once on total, halves up — 25%, two lines of 0,01: VAT 0,01 (line by line would be 0,00).
✓ Other EU country + VAT number: 0 VAT and the reverse-charge line — Berlin invoice: VAT 0%, exact line present. On Estonian-language invoices the line is the Estonian translation with the English wording in brackets.
✓ Outside EU: 0 VAT, no such line — US Corp invoice: VAT 0%, no line.
✓ Amounts like 1 234,50 € — invoice and overview show "1 234,50 €", "103 327,65 €".
✓ Due 14 days, or client's own days — 17.11 → 01.12; Berlin (30 days) → 17.12.
✓ Saturday/Sunday due date moves to Monday — client days 4 (Sat 21.11) and 5 (Sun 22.11) both gave 2026-11-23.
✓ Overdue with number of days, unless paid — clock: on 20.01.2027 invoice due 11.01 showed overdue:9; after marking paid it showed paid.
✓ Print / save as PDF, looks like an invoice, no buttons on paper — headless Chrome print-to-pdf: PDF has no toolbar or menus.
✓ Everything in client's language, month names, total in words — "17. november 2026 … kakssada kolmkümmend neli eurot ja 50 senti"; "17 November 2026 … two hundred thirty-four euros and 50 cents".
✓ Up to 15 lines on one A4; longer continues with header repeated — PDFs: 15 lines = 1 page, 45 lines = 2 pages with the column header again on page 2.
✓ Overview: this year's invoiced without VAT, unpaid, overdue, same per client, biggest first; credit notes reduce — browser first screen: three totals plus per-client table sorted by invoiced; the credited Berlin invoice counted 0. Note: unpaid and overdue are shown with VAT included and from any year (the page says so).
✓ Backup on every issue/credit note, timestamped, 20 newest kept — after 22 issues/credits `backups/` held exactly 20 files named like `data-2026-11-17_18-12-37-771.json`, oldest pruned.

FILES:
Runs on laptop: server.js, lib/app.js, public/index.html
Client has name: lib/app.js, public/app.js
Search ignores: lib/core.js, public/app.js, test/test.js
Client with issued invoice: lib/app.js, public/app.js, test/test.js
CSV import: lib/core.js, lib/app.js, public/app.js, test/test.js
Any wrong row: lib/core.js, lib/app.js, test/test.js
Same file twice: lib/app.js, test/test.js
Each entry rounded: lib/core.js, lib/app.js, test/test.js
New invoice is a draft: lib/app.js, public/app.js, test/test.js
Hourly rate per client: lib/app.js, lib/core.js
Draft editable; undo: lib/app.js, public/app.js, test/test.js
Issued invoice can't be changed: lib/app.js, test/test.js
Credit note: lib/app.js, lib/invoice-html.js, test/test.js
Numbers like 2026-001: lib/core.js, lib/app.js, test/test.js
No gaps: lib/core.js, lib/app.js, test/test.js
Prices without VAT; rate: lib/app.js, public/app.js, test/test.js
VAT once on total: lib/core.js, test/test.js
Other EU country: lib/core.js, lib/invoice-html.js, test/test.js
Outside EU: lib/core.js, test/test.js
Amounts like 1 234,50 €: lib/core.js, test/test.js
Due 14 days: lib/core.js, lib/app.js, test/test.js
Saturday/Sunday: lib/core.js, test/test.js
Overdue: lib/app.js, public/app.js, test/test.js
Print / save as PDF: lib/invoice-html.js, server.js
Everything in client's language: lib/invoice-html.js, lib/core.js, test/test.js
Up to 15 lines: lib/invoice-html.js
Overview: lib/core.js, public/app.js, test/test.js
Backup: lib/app.js, test/test.js

DOCS:
- No README exists. Nothing tells a newcomer to run `npm start` (or `node server.js`), which URL to open, that Node 18+ is needed, or that there is nothing to install.
- Undocumented: the `PORT` and `INVOICE_DATA_DIR` variables, where `data.json` and `backups/` live, how to restore a backup, and the expected CSV format (only described inside the Time page).
- The only start hint is a comment at the top of server.js and the message the server prints.
