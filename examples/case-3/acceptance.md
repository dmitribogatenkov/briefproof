The reply of the blind checker: a fresh agent given only `brief.md` and a clean
copy of the project, with the prompt from `skills/build/prompts/acceptance.md`
plus one line asking it to stop its own server by process id. Unedited.

---

RUNS: yes. There is no README, so I guessed from package.json and a comment in server.js: `npm test`, then `PORT=8791 npm start` (Node 24, no install needed). Server stopped by its pid when done.
TESTS: `npm test` gave 35 pass, 0 fail.
"Live" = HTTP against the running server; "clock" = the app's own core functions run with a controlled clock (my script `acc_clock.js`).

REQUIREMENTS:
- ✓ One computer, no outside services, one database file — live: zero dependencies, listens on the LAN address, creates `studio.db` in the project folder.
- ✓ Three therapists, two rooms, at most two at once — live: third booking at 10:00 returned 409; front desk third booking returned 422.
- ✓ Own weekly hours, only some services — live: set Terapeut 3 to Wed 12–15 without sports massage; slots became 12:00–14:00 and she left that service's list.
- ✓ Blocked time can't be booked — live: Katrin blocked 19.11 09–17; only 17:00 was offered and a desk booking at 10:00 returned 422.
- ✓ Pregnancy massage only Katrin, only room 2 — live: desk attempts with Terapeut 3 or room 1 returned 422; online lists only Katrin.
- ✓ Service names in et/en/ru, length, price — live: all three language pages and the settings form.
- ✓ 15 min room changeover, therapist needs no break — live: after 10:00–11:00 the next start in that room was 11:15; Katrin booked 11:00 in the other room.
- ✓ Hot stone 30 min after, 20 min heating before with therapist free — clock: therapist worked 10:00–11:00 before her 11:00 hot stone; the room was held 10:40–12:45.
- ✓ Existing bookings keep their price — live: price 50→60; old bookings stayed 50,00, new ones 60,00.
- ✓ Service → therapist or "anyone" → day → free times every 15 min, whole thing must fit — live: last classic slot 17:00, last hot stone 16:45; clock: 10:07 refused.
- ✓ Not under 2 hours or over 60 days ahead — clock: 1h45 refused, 2h00 accepted, past 60 days refused; live day list ends 16.01.2027.
- ✓ "Anyone" picks fewest bookings, then alphabet — clock: Anu, Katrin, Mari, Anu; live: Katrin, then Omanik.
- ✓ Phone with or without +372 and spaces, stored the same — six spellings all stored as +37251234567; bad phone or email returned 422 with a message.
- ✓ Same slot at the same moment: one wins, other sees nearest free times — live: three parallel requests gave one 303 and two 409; the 409 page lists nearest times, or the waiting-list form when the day is full.
- ✓ Estonian default, English/Russian switch that sticks — live: `lang` cookie set for a year; next visit rendered in English.
- ✓ 360 px wide without sideways scroll — browser at 360 px: page width 360, nothing overflowing.
- ✓ Whole booking by keyboard — browser: Tab, Enter and arrow keys only produced booking #22; no JavaScript on the page, visible focus outline.
- ✓ Dates as 17.11.2026, 24-hour times, Tallinn time — live pages and emails.
- ✓ Clock-change nights — live desk: 28.03.2027 03:30 refused as not existing; 31.10.2027 03:30 booked once, second attempt refused.
- ✓ Emails as .eml in an outbox folder, nothing sent — live: files in `outbox/`; parsed cleanly with Python's email library.
- ✓ Confirmation in the client's language with cancel and move links — live: English and Russian emails, both links present.
- ✓ Reminder 24 h before, not for bookings made under 24 h ahead — clock: sent exactly at 24 h, once; none for a booking made 7 h ahead.
- ✓ Every email has an .ics with the right start and end — parsed: 10:00–11:00 Tallinn is 08:00–09:00Z, lines folded correctly. Not opened in an actual calendar program.
- ✓ Cancel or move free up to 12 h before, by link, no login; later shows the phone number — live: early booking moved and another cancelled; a booking 11.5 h ahead showed the phone number and POST returned 403.
- ✓ Links not guessable and dead once the booking is past — 32-character random token; past booking and wrong token both returned 404.
- ✓ Moving keeps the same booking and price — live: booking #1 moved to 20.11, same id, token and 50,00.
- ✓ Freed slot offered to first on the waiting list for 30 min, then the next — live: offer email to the first waiter, slot hidden from others, claim succeeded; clock: at +30 min the offer passed to the second and the first got "offer gone".
- ✓ Join the waiting list only when nothing is free — live: 409 while a slot existed, 303 once the day was full.
- ✓ Pass: 10 for the price of 9, valid 12 months from first use — live: 540,00 for a 60,00 service; clock: valid 14 months after purchase, expired 12 months after first use.
- ✓ Pass visit used, returned on timely cancel, kept on late cancel or no-show — live: 10/10 after a timely cancel, 8/10 after one late cancel and one no-show.
- ✓ Gift cards: code and amount, used in parts, expire 12 months after sale — live: 80,00 card paid 60 then 20; clock: accepted at 364 days, refused after 12 months.
- ✓ Gift code 10 characters, no look-alikes — 300 generated: all 10 long, none with 0 O 1 I L.
- ✓ Never overspent, even at the same moment — live: two parallel bookings on 20,00 left: one took 20, the other got 422; balance 0.
- ✓ Front desk behind a password — live: unauthenticated redirects to login; wrong password 401.
- ✓ Day grid per room with therapist names, switchable to per therapist — live: both views show the right columns and labels.
- ✓ Make, move, cancel by hand, breaking the 2 h and 12 h rules but never double-booking — live: booking 1 h ahead outside hours created; same therapist in two rooms, room inside changeover, and third parallel booking all returned 422.
- ✓ Mark done or no-show — live, including cash/card split; a wrong sum is refused.
- ✓ Two no-shows in 6 months blocks online booking with a call-us message — live: 403 with the phone number; clock: unblocked after 6 months.
- ✓ Sell a pass or gift card, see what is left and where used — live: any therapist can sell; pages list each booking and the remaining balance.
- ✓ Monthly CSV — live: semicolons, decimal comma, payment split with "mix", sales as own rows, pass-paid booking 0 in cash and card, totals per therapist. The grand "Total" price column adds sales and pass-paid bookings together (785,00); cash and card are not double-counted.
- ✓ Delete personal data — live: name, phone, email blanked; that client's outbox emails removed; booking stays as "deleted client". Caveat: `strings studio.db` still finds "Anna Tamm+37251234567" in freed space of the raw file.
- ✓ Front desk log that can't be edited — live: entries with who/what/when; no edit route (404); a direct SQL UPDATE or DELETE fails with "audit log cannot be changed".
- ✓ Own passwords; only the owner sees reports, prices, client deletion — live: Katrin got 403 on reports, CSV, settings, clients, log and price change. Did not try the change-password form.
- ✓ Private calendar link per therapist: service, room, first name only — live: feed shows "Klassikaline massaaž 60 min – Anna", location "Ruum 1", no surname or phone.

FILES:
- One computer: server.js, src/db.js, setup.json
- Three therapists, two rooms: src/core.js, src/db.js, test/rules.test.js
- Own weekly hours: src/core.js, src/desk.js, test/rules.test.js
- Blocked time: src/core.js, src/desk.js, test/rules.test.js
- Pregnancy massage: src/core.js, setup.json, test/rules.test.js
- Service names: src/i18n.js, src/desk.js, setup.json
- 15 min room changeover: src/core.js, test/rules.test.js
- Hot stone: src/core.js, test/rules.test.js
- Existing bookings keep their price: src/core.js, src/desk.js, test/rules.test.js
- Service → therapist → day → times: src/public.js, src/core.js, test/rules.test.js
- Not under 2 hours: src/core.js, test/rules.test.js
- "Anyone": src/core.js, test/rules.test.js
- Phone: src/core.js, test/rules.test.js
- Same slot at the same moment: src/core.js, src/db.js, src/public.js, test/web.test.js
- Estonian default: src/http.js, src/i18n.js, src/public.js, test/web.test.js
- 360 px: static/style.css, src/public.js
- Whole booking by keyboard: src/public.js, static/style.css
- Dates and times: src/time.js, test/web.test.js
- Clock-change nights: src/time.js, src/core.js, test/rules.test.js
- Emails as .eml: src/mail.js, test/flows.test.js
- Confirmation: src/mail.js, src/i18n.js, test/flows.test.js
- Reminder: src/core.js, src/mail.js, test/flows.test.js
- Every email has an .ics: src/mail.js, test/flows.test.js
- Cancel or move free: src/public.js, src/core.js, test/flows.test.js, test/web.test.js
- Links not guessable: src/auth.js, src/public.js, test/web.test.js
- Moving keeps the same booking: src/core.js, test/flows.test.js
- Freed slot offered: src/core.js, src/mail.js, test/flows.test.js
- Join the waiting list: src/core.js, src/public.js, test/web.test.js
- Pass 10 for 9: src/core.js, src/desk.js, test/flows.test.js
- Pass visit used: src/core.js, test/flows.test.js
- Gift cards: src/core.js, src/desk.js, test/flows.test.js
- Gift code: src/auth.js, test/flows.test.js
- Never overspent: src/core.js, test/web.test.js
- Front desk behind a password: src/desk.js, src/auth.js, test/web.test.js
- Day grid: src/desk.js, static/style.css
- Make, move, cancel by hand: src/desk.js, src/core.js, test/flows.test.js
- Mark done or no-show: src/desk.js, src/core.js, test/flows.test.js
- Two no-shows: src/core.js, src/public.js, test/flows.test.js, test/web.test.js
- Sell a pass or gift card: src/desk.js, src/core.js
- Monthly CSV: src/report.js, src/desk.js, test/flows.test.js
- Delete personal data: src/core.js, src/desk.js, src/mail.js, test/flows.test.js
- Front desk log: src/db.js, src/desk.js, test/flows.test.js
- Own passwords: src/auth.js, src/desk.js, test/web.test.js
- Private calendar link: src/mail.js, src/public.js, src/desk.js, test/flows.test.js

DOCS:
- No README at all. Start command, Node version (>=22.13), `PORT`/`DATA_DIR`, and how to run tests are only discoverable from package.json and server.js.
- Nothing says the first start writes `first-passwords.txt`, or that `setup.json` (placeholder names, phone, hours) is read only once and must be edited before first start.
- Nothing says where the outbox is, how clients on wifi reach the page (the printed LAN URL, `base_url` in settings), or that the server must stay running for reminders and offer expiry.
- The CSV download URL takes `y` and `m`; only the form shows this.

Left in the clone from my run: `studio.db`, `outbox/`, `first-passwords.txt`, `server.log`, cookie jars, `acc.sh`, `acc_clock.js`, `report.csv`, a few `.html` response dumps. Nothing in the project's own files was changed.
