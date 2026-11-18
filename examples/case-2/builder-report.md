The closing message of a plain Claude Code agent (no Briefproof) that was given
an empty folder with `brief.md` and the single instruction "Build what brief.md
describes." Unedited, apart from the folder path in the first sentence being
shortened.

---

The invoicing tool from brief.md is built and working in the project folder. Start it with `node server.js` in that folder and open http://localhost:4780. It needs only Node (no packages, no internet, no account), listens on 127.0.0.1 only, and keeps everything in `data.json` plus the `backups/` folder beside it.

**How it was checked**
- The 16 automated tests pass (`npm test`). They cover search, CSV import, 15-minute rounding, numbering, VAT, due dates, amounts in words, undo, delete vs archive, the overview and backups.
- I clicked through the app in the browser against a scratch data folder: draft editing, delete and undo, issue, credit note, client search ("polva" finds "Põlva Köök OÜ"), and CSV import with its error list.
- I printed invoices to PDF with headless Chrome: a 15-line invoice is one A4 page, a 40-line one is two pages with the table header on both, and the print button is not on paper. I could not view the PDFs as images (no PDF renderer on this machine), so the paper look was judged from the on-screen sheet and from text extracted from the PDFs.
- Only Chrome was tested for printing.

**Files**
- `server.js` — HTTP server and routes
- `lib/core.js` — money, dates, CSV, VAT, words and overview rules
- `lib/app.js` — the data file, all operations, backups and the write guard
- `lib/invoice-html.js` — the printable A4 invoice in Estonian or English
- `public/index.html`, `public/app.js`, `public/style.css` — the browser app
- `test/test.js` — the tests

**How "can't be changed" is enforced**
Issued documents hold their own copy of client, seller, lines, VAT rate and totals. Every write to the data file is refused if any issued document would differ or a new number is out of sequence. Each document also carries a checksum, and the app shows a warning if the data file was edited by hand.

**Choices I made where the brief was silent**
- **Numbering:** invoices and credit notes share one sequence per year (2026-001, 2026-002, …).
- **Issue date:** always today; it cannot be backdated.
- **Credit notes:** a credit note cancels the whole invoice, is issued immediately after a confirmation, and there can be only one per invoice. The hours on the credited invoice become unbilled again so they can go on a corrected invoice.
- **Overview:** "invoiced" is this year, without VAT. "Unpaid" and "overdue" are what clients owe, with VAT, from any year. A credited invoice counts as owing nothing.
- **VAT:** "another EU country" is judged against your own country in Settings (default Estonia). An EU client without a VAT number gets the normal rate.
- **Reverse-charge line:** on Estonian-language invoices it is printed in Estonian followed by the exact English sentence in brackets; on English invoices it is the exact sentence from the brief.
- **Words:** cents are always two digits ("ja 00 senti"); thousands and hundreds read "üks tuhat ükssada …".
- **CSV import:**
  - A first line with no digits in the date and time columns is treated as a header.
  - Client names match ignoring case, and client names must be unique.
  - Identical rows inside one file are kept as separate entries.
  - Non-UTF-8 files are read as Windows-1257.
- **Deleting a client:** a client with no issued documents can be deleted, and its drafts and time entries go with it after a confirmation.
- **Paid:** invoices have a "Mark as paid" / "Mark as unpaid" button, stored outside the immutable document.

**One thing to know**
While restarting my test server I ran `pkill -f "node server.js"`, which would also have stopped any other process started with exactly that command on this machine at that moment. Everything else stayed inside the project folder, and the test data and test server are removed.
