I run a small massage studio in Tallinn and I want a booking system of my own.
For now it runs on one computer at the front desk and clients reach it over the
studio's wifi or from a tablet at the door, so no hosting, no accounts with
outside services and no internet needed. Everything is kept in one database file
in the project folder.

Who works here. We are three therapists and we have two rooms, so at most two
massages can happen at the same time even when all three of us are working. Each
therapist has their own weekly working hours and can do only some of the
services (for example only Katrin does the pregnancy massage). A therapist can
block out time, like a dentist visit or a holiday, and blocked time can't be
booked. One of the rooms has the table that goes low enough for the pregnancy
massage, so that service can only happen in room 2.

Services. Each service has a name in Estonian, English and Russian, a length in
minutes and a price. After every massage the room needs 15 minutes to be changed
and aired before the next one in the same room, but the therapist doesn't need
that break and can start in the other room right away. The hot stone massage
needs 30 minutes instead of 15, and it also needs 20 minutes before it to heat
the stones, during which the room is taken but the therapist is free. If I change
a price, bookings that already exist keep the price they were made at.

Booking, the client side. A client picks a service, then either a therapist or
"anyone", then a day, and sees the free times. Times are offered every 15
minutes, but only ones where the whole thing fits: the therapist is working and
free, a suitable room is free including the changeover, and it ends before the
therapist's day ends. Nothing can be booked less than 2 hours ahead or more than
60 days ahead. With "anyone" the system picks the therapist who has the fewest
bookings that day, and if that is equal, the one whose name comes first in the
alphabet. The client leaves a name, a phone number and an email, and the phone
number is accepted with or without the +372 and with spaces, and stored the same
way every time. Two people pressing the button for the same slot at the same
moment must never both get it: the second one is told the time has just been
taken and is shown the nearest free times on the same day.

The booking page is in Estonian by default with a switch to English and Russian,
and the choice sticks for the next visit. It has to work on a phone that is 360
pixels wide without scrolling sideways, and I want to be able to do the whole
booking with the keyboard alone. Dates are shown as 17.11.2026 and times in 24
hours. All times are Tallinn time, and the two nights a year when the clocks
change must not produce a booking at a time that doesn't exist or a double one.

Emails. I don't have a mail service yet, so don't send anything: write each
email as an .eml file into an outbox folder and I'll hook up sending later. A
confirmation goes out when a booking is made, in the language the client booked
in, with a link to cancel and a link to move the booking. A reminder goes out 24
hours before, but not for bookings made less than 24 hours ahead. Every email
has the booking as a calendar attachment (.ics) that opens in a normal calendar
program with the right start and end.

Cancelling and moving. A client can cancel or move for free up to 12 hours
before the start, using the link from the email, without logging in. Later than
that the link shows our phone number instead. The links must not be guessable
and stop working once the booking is in the past. Moving keeps the same booking
and its price, it doesn't cancel and create a new one. When a slot is freed, the
first person on the waiting list for that day and service gets an email offering
it and has 30 minutes to take it before it goes to the next person. A client can
join the waiting list for a day when nothing suitable is free.

Passes and gift cards. We sell a pass of 10 massages of one service for the
price of 9, valid 12 months from the first use, not from the purchase. A booking
can be paid with a pass, which uses one visit, and cancelling in time gives the
visit back but a late cancellation or a no-show doesn't. Gift cards have a code
and an amount in euros, can be used in parts across several bookings, and expire
12 months after they were sold. A gift card code is 10 characters and never
contains letters or numbers that are easy to mix up (0 and O, 1 and I and L).
Nobody can spend more than what is left on a card, even if two bookings are made
with it at the same moment.

The front desk. This part is behind a password. It shows the day as a grid with
a column per room and the therapist's name on each booking, and I can switch to
a column per therapist. I can make, move and cancel bookings by hand there,
including ones that break the 2 hour and 12 hour rules, but never ones that put
two massages in one room or one therapist in two places. I can mark a booking as
done or as a no-show. A client who has two no-shows in the last 6 months can't
book online any more and sees a message asking them to call us. I can sell a
pass or a gift card, and see what is left on any of them and where it was used.

Money and reports. Prices include VAT. For any month I can download a CSV with
one row per finished booking: date, therapist, service, price, how it was paid
(cash, card, pass, gift card, or a mix) and how much of each. The file uses
semicolons and a comma as the decimal separator so it opens correctly in my
Excel, and it has totals per therapist at the bottom. A pass or gift card sale
is its own row on the day it was sold, and a booking paid with a pass or gift
card counts as 0 in the cash and card columns so that money isn't counted twice.

Privacy. If a client asks, I can delete their personal data: the name, phone and
email are removed everywhere including the emails already in the outbox, but the
bookings stay for the accounting, with the client shown as "deleted client".
Every change made at the front desk, who did what to which booking and when, is
kept in a log that can't be edited from the app. Each of us has our own password
for the front desk, and only I can see the reports, change prices or delete
client data.

Each therapist can also have a private calendar link to subscribe to from their
phone, showing their own bookings with the service and the room but only the
client's first name.
