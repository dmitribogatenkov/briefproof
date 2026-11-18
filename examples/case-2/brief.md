I'm a freelancer and I want my own invoicing tool. It runs on my laptop, in the
browser, with no account and no internet connection, and everything is saved in
one file in the project folder.

Clients. Each client has a name, an address, a country, an optional VAT number,
and a language for their invoices: Estonian or English. When I search for a
client, the search ignores upper and lower case and also the dots and tildes on
letters, so typing "polva" finds "Põlva Köök OÜ". A client that has at least one
issued invoice can't be deleted, only archived, and archived clients don't show
up when I pick a client for a new invoice.

Time entries. I track my hours in another tool and export them as a CSV with
semicolons between the columns: date as dd.mm.yyyy, client name, description,
and time as h:mm. I import that file. If any row is wrong (unknown client, bad
date, bad time), nothing is imported at all and I get the list of the wrong rows
with their line numbers. Importing the same file twice must not create the same
entries twice. Each entry is rounded up to the next 15 minutes on its own, before
anything is added together.

Invoices. A new invoice starts as a draft. I pick a client, then pick which of
their unbilled time entries go on it, and I can add other lines by hand with a
description, a quantity and a unit price. My hourly rate is set per client. While
it's a draft I can change anything, and if I delete a draft I have 10 seconds to
undo it.

When I issue an invoice it gets its number, and from then on nothing on it can be
changed, not by me and not by a bug: if I need to fix something I create a credit
note for it, which is its own document with its own number and negative amounts,
and points back to the invoice it corrects. Numbers look like 2026-001 and
restart every year. There are never gaps and a number is never used twice, even
if I delete drafts in between, because drafts don't have numbers.

Money. Prices are entered without VAT. The VAT rate is 24% by default and I can
change it in the settings, but changing it never changes invoices already issued.
VAT is worked out once on the invoice total, not line by line, and rounded to
cents with halves going up. If the client is in another EU country and has a VAT
number, VAT is 0 and the invoice carries the line "Reverse charge, Article 196 of
Council Directive 2006/112/EC". Clients outside the EU get 0 VAT with no such
line. Amounts are shown with a comma as the decimal separator and a space between
thousands, like 1 234,50 €.

Due dates. An invoice is due 14 days after the issue date unless the client has
their own number of days. If the due date lands on a Saturday or Sunday it moves
to the following Monday. An issued invoice that is past its due date and not
marked as paid shows as overdue, with the number of days.

The invoice itself. I can print it or save it as a PDF from the browser, and it
must look like an invoice, not like a web page: no buttons or menus on paper.
Everything on it is in the client's language, including the month names in dates
and the total written out in words (for example "kakssada kolmkümmend neli eurot
ja 50 senti" or "two hundred thirty-four euros and 50 cents"). An invoice with up
to 15 lines fits on one A4 page. Longer ones continue on the next page with the
table header repeated.

Overview. The first screen shows this year's invoiced total without VAT, what is
still unpaid, what is overdue, and the same three numbers per client, biggest
first. Credit notes reduce these totals.

Safety. Every time I issue an invoice or a credit note, a copy of the data file
is put in a backups folder with the date and time in its name, and only the 20
newest copies are kept.
