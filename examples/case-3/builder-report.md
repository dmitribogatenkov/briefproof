The closing message of a plain Claude Code agent (no Briefproof) that was given
an empty folder with `brief.md` and the single instruction "Build what brief.md
describes." Unedited, apart from the folder path in the second paragraph being
shortened.

---

The booking system from brief.md is built and working: all 35 automated tests pass, and I ran it in a browser to check the booking page at 360 px, a keyboard-only booking, and the front desk grid.

It is a Node program with no dependencies (needs Node 22.13 or newer; built and tested on 24). Everything lives in the project folder.

**To run it**
- `node server.js` in the project folder (port 8080, or set `PORT`); `npm test` runs the tests.
- The first start creates `studio.db` and the `outbox/` folder, and writes the generated front desk passwords to `first-passwords.txt`.
- The booking page is at `/` and the front desk at `/desk`; the console prints the wifi address to give clients.

**What was checked**
- **Tests:** every rule in the brief has a test, including the two clock-change nights, six simultaneous requests for one slot (one wins, five get "just taken" with the nearest times), and two simultaneous bookings on one gift card.
- **Browser:** no sideways scroll at 360 px in Estonian and Russian, and a booking made by keyboard alone up to the details form. The front desk day grid was checked in both views, and a written `.eml` with its `.ics` parsed correctly in a standard mail library.
- **Not checked:** opening the `.ics` in an actual calendar app, opening the CSV in Excel, or subscribing a phone to a therapist's calendar link.

**Placeholders the owner must replace**
- `setup.json` is read only on the first start. It has invented therapist names ("Omanik", "Terapeut 3" next to Katrin), working hours Mon–Fri 09:00–18:00, five services with made-up prices, the phone number "+372 0000 0000" and a dummy sender address.
- All of these can also be changed later under Settings in the front desk.

**Choices I made where the brief was silent**
- **Front desk language:** English only. The booking page and emails are in Estonian, English and Russian.
- **Gift card money on late cancellation or no-show:** treated like a pass visit — returned when cancelled in time, kept otherwise. The brief states this only for passes.
- **Pass "first use":** the start time of the earliest massage paid with it; the pass covers massages starting within 12 months of that.
- **Hot stone heating:** the 20 minutes may fall before the therapist's working day starts, since only the room is needed.
- **Front desk bookings:** skip the 2-hour, 60-day and 12-hour rules only. Rooms, changeover, blocked time, who does which service and the room-2 rule are always enforced; working hours can be overridden with a tick box.
- **No-shows:** matched by phone or email; a blocked client also cannot join the waiting list.
- **Waiting list:** someone who lets an offer lapse stays on the list for later slots; an offered slot is held from everyone else for the 30 minutes.
- **Clients:** identified by phone number, so a repeat booking with the same phone updates the stored name and email.
- **Privacy deletion:** deletes that client's `.eml` files from the outbox rather than redacting them.
- **Cancellation email and offer attachment:** a cancellation also writes an email, and the waiting-list offer email carries the offered slot as a tentative calendar entry.
- **Clock-change night in autumn:** the repeated 03:00–04:00 hour is offered online once.

**Limits to know about**
- Links in emails and the therapists' calendar links point at the front desk computer's wifi address, so they only work on the studio wifi until it is hosted somewhere. The address is editable in Settings.
- The front desk runs over plain http on the wifi, so passwords are not encrypted in transit.
- There is no README; the run instructions above are the only ones.

Trial data from my manual run (database, outbox, passwords file) has been removed, so the next start is a clean first start.
