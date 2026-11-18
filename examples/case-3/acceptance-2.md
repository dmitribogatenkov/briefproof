The second reply of the blind checker on the same, untouched build: a fresh
agent given only `brief.md` and a clean copy of the project, with the prompt from
`skills/build/prompts/acceptance.md` after the strict-verdict rule was added
("Give ✓ only when you tried the requirement and saw everything its words
say..."), plus one line asking it to stop its own server by process id. Unedited.

---

RUNS: yes, but there is no README, so nothing could be "followed". I guessed `npm start` from package.json (ran `PORT=8791 npm start`, Node 24); it created studio.db, outbox/ and first-passwords.txt and served on localhost and the LAN IP. `npm test`: 35 pass, 0 fail. Server stopped by pid.
Method: live server driven with curl and a browser. Rules that depend on time (12 h, 24 h, 30 min, 12 months, 6 months, clock-change nights) were run against the real code and HTTP server with a simulated clock.

REQUIREMENTS:
1. ✓ "one computer… no hosting, no accounts with outside services, no internet… one database file in the project folder": zero dependencies, no external URLs in src/static, CSP `default-src 'none'`; LAN URL returned 200; all data in ./studio.db.
2. ✓ "three therapists, two rooms… own weekly hours… only some services… block out time… pregnancy only in room 2": third therapist at 10:00 refused while two massages run (slots resume 11:15); hours set to Wed 12–16 gave slots 12:00–15:00 only; pregnancy lists only Katrin and always got room 2; a 09–13 block removed those slots and the desk was refused inside it.
3. ✓ "name in Estonian, English and Russian, length, price… 15 minutes… hot stone 30 and 20 before… existing bookings keep the price": same therapist booked 10:00 room 1 then 11:00 room 2; hot stone at 12:00 held the room 11:40–13:45 while its therapist took a 10:45–11:45 massage in the other room; after 50→60 €, booking 1 stayed 50,00 and a new one was 60,00.
4. ✓ "service, therapist or anyone, day, free times every 15 min… 2 hours… 60 days… fewest bookings then alphabet… phone… second one is told… nearest free times": last slots 17:00 (60 min) and 16:45 (75 min); 09:45 at 08:00 and day 61+ refused; "anyone" picked Anu, Katrin, Mari, Anu; "+372 5123 4567" and "5123 4561" both stored as +3725123456x; two parallel POSTs gave 303 and 409 "See aeg võeti just ära" with 09:00, 12:00… offered.
5. ✓ "Estonian by default, switch… sticks… 360 pixels… keyboard alone… 17.11.2026… 24 hours… clocks change": lang cookie Max-Age 1 year, next visit in Russian; at a 360 px viewport scrollWidth was 360 on every step; full booking made with Tab/arrows/Enter only; 28.03.2027 offered no 03:xx, 31.10.2027 offered each time once and a second booking at the same instant was refused.
6. ~partial "each email as an .eml file into an outbox… confirmation in the client's language with cancel and move links… reminder 24 hours before, not for bookings made less than 24 hours ahead… .ics that opens in a normal calendar program": .eml files appeared in RU/ET/EN with both links; reminder written exactly at 24 h for the 46 h booking, none for the 22 h one; .ics has correct DTSTART/DTEND (10:00 Tallinn = 08:00Z). Not tried: opening the .ics in a real calendar program.
7. ✓ "cancel or move free up to 12 hours… later the link shows our phone number… not guessable… stop working in the past… moving keeps the same booking and price… waiting list… 30 minutes… next person": 12h01 before showed the cancel button, 11h59 showed the phone and POST gave 403; after start 404; 32-char random tokens; move kept id 1 and 50,00; first waiter got the offer mail, at +31 min it passed to the second, who took it; joining refused while a time was free.
8. ✓ "pass of 10 for the price of 9, valid 12 months from first use… cancelling in time gives the visit back, late or no-show doesn't… gift cards… in parts… expire 12 months after sold… 10 characters… never overspent": pass 450,00 for a 50,00 service; unused 6 months then valid to 03.06.2028 from first use on 03.06.2027; visit returned only on in-time cancel; 11th use refused; gift 80 € paid 55 + 25; two parallel 50 € bookings on a 60 € card took 50 + 10; code alphabet has no 0 O 1 I L.
9. ✓ "behind a password… grid with a column per room and the therapist's name… column per therapist… make, move and cancel by hand, including ones that break the 2 hour and 12 hour rules, but never… done or no-show… two no-shows in the last 6 months… sell a pass or gift card, see what is left and where used": /desk redirects to login, wrong password 401; both grid views seen; desk booked 35 min ahead, moved and cancelled inside 12 h; overlapping therapist, third room and changeover overlap all refused; after the second no-show online booking gave 403 "Palun helista meile" and was allowed again once one was older than 6 months; card page listed bookings #10 and #11 with amounts.
10. ~partial "CSV… one row per finished booking… semicolons and a comma as the decimal separator so it opens correctly in my Excel… totals per therapist… sale is its own row… counts as 0 in cash and card": downloaded report-2026-11.csv; all of that is present (pass/gift bookings show 0,00 cash and card, mixes split). Not tried: opening it in Excel.
11. ~partial "delete their personal data: name, phone and email removed everywhere including the emails already in the outbox… bookings stay… 'deleted client'": client row nulled, their .eml files deleted, desk shows "deleted client", booking and price kept. But `strings studio.db` still printed "Anna Ivanova+37251234567anna…" after deletion (freed database pages are not wiped).
12. ✓ "every change made at the front desk, who did what to which booking and when, kept in a log that can't be edited from the app": 23 rows with time, name, action and booking number; log page has no forms; direct UPDATE and DELETE abort with "audit log cannot be changed".
13. ✓ "each of us has our own password… only I can see the reports, change prices or delete client data": Katrin changed hers (old 401, new 303); Katrin got 403 on reports, CSV, settings, clients, log, price POST and delete POST; owner got 200.
14. ~partial "private calendar link to subscribe to from their phone… own bookings with the service and the room but only the client's first name": /cal/<token>.ics returned only Katrin's bookings with "service – Racer", "LOCATION:Ruum 2", no surname, phone or email. Not tried: subscribing from a phone calendar.

FILES:
1. one computer: server.js, src/db.js, src/http.js, package.json
2. three therapists: src/core.js, src/db.js, src/desk.js, setup.json, test/rules.test.js
3. name in Estonian: src/core.js, src/db.js, src/i18n.js, test/rules.test.js
4. service, therapist or anyone: src/public.js, src/core.js, test/rules.test.js, test/web.test.js
5. Estonian by default: src/public.js, src/http.js, src/i18n.js, src/time.js, static/style.css
6. each email as .eml: src/mail.js, src/core.js, test/flows.test.js
7. cancel or move: src/public.js, src/core.js, src/auth.js, test/flows.test.js
8. pass of 10: src/core.js, src/auth.js, src/desk.js, test/flows.test.js
9. behind a password: src/desk.js, src/auth.js, src/core.js, test/flows.test.js, test/web.test.js
10. CSV: src/report.js, src/desk.js, test/flows.test.js
11. delete their personal data: src/core.js, src/desk.js, test/flows.test.js
12. every change made: src/db.js, src/desk.js, test/flows.test.js
13. each of us has our own password: src/auth.js, src/desk.js, test/web.test.js
14. private calendar link: src/mail.js, src/public.js, src/desk.js, test/flows.test.js

DOCS:
- There is no README. Install, Node >= 22.13, `npm start`, `npm test`, the PORT and DATA_DIR variables, editing setup.json before the first start, and where the first passwords land (first-passwords.txt) are only discoverable from package.json, a comment in server.js and the `_note` in setup.json.
- The clone ships brief.md in the project root.
- Other observations: `icsEsc` in src/mail.js does not escape semicolons (`'\;'` is just `;`). The confirmation page says "We have sent a confirmation to your email address" although nothing is sent. A hand-crafted POST can book the repeated 03:00 hour on 31.10, which displays with the same wall time as the first 03:00 booking (different real hour, not offered in the UI).
- I left studio.db, outbox/, first-passwords.txt and server.log from the run in the clone; Katrin's desk password there was changed during testing.
