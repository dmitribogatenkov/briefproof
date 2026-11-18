The reply of the blind checker: a fresh agent given only `brief.md` and a clean
copy of the project, with the prompt from `skills/build/prompts/acceptance.md`.
Unedited.

---

RUNS: yes. `python3 app.py` (Python 3.9.6, stdlib only; I used `NO_BROWSER=1 python3 app.py`) serves http://127.0.0.1:8765. There is no README and no install step; the start command comes from the docstring at the top of app.py.
TESTS: none exist. `python3 -m unittest` reports "Ran 0 tests"; there is no tests folder and pytest is not installed.

REQUIREMENTS:
- ✓ "runs on my own laptop, in the browser, with no account and no internet connection" — page loaded in the browser from 127.0.0.1 with no login; grep of index.html for external URLs/src/href found none; the server binds to 127.0.0.1 only.
- ✓ "add an expense with a date, an amount, a description and a category" — filled the form in the browser (10.11.2026 / 1234,5 / Laptop / food) and the row appeared; POST /api/expenses returned 201.
- ✓ "typed with a comma (12,50) and shown the same way everywhere, with the euro sign after" — page shows "12,50 €", "1234,50 €", total "1266,50 €", and the duplicate prompt shows "12,50 €". Typing "12.50" is refused with "Type the amount with a comma, like 12,50." "1.234,50" is also refused, and there is no thousands separator.
- ✓ "same date, amount and description ... ask me whether I really want it twice" — submitting "coffee" 12,50 on 10.11.2026 showed "You already have "Coffee" for 12,50 € on 10.11.2026. Do you really want it twice?". "Don't add" left 4 rows; "Add it again" made 5. The match ignores letter case and category.
- ✓ "current month by default, newest first, with the month's total at the top" — opened on "November 2026" with rows ordered 15.11 then 10.11 and the total above the table. The total sits below the add form, not at the very top of the page.
- ✓ "go back and forward one month at a time" — clicking ← showed October 2026 (1 expense, 1234,56 €); → twice showed December 2026 ("No expenses this month.", 0,00 €).
- ~partial "export the month I am looking at as a real .xlsx ... opens in Excel with the amounts as numbers" — `curl /api/export?month=2026-11` returned expenses-2026-11.xlsx; `file` says "Microsoft Excel 2007+", all XML parts are well-formed, and amount cells are numeric (`<v>12.50</v>`, no text type) with a € number format and a SUM total. The October export contained only October. Not tried: actually opening it in Excel, and clicking the Export button in the browser (I called the URL it points to).
- ✓ "older than 24 months are removed automatically when the app starts, and the app tells me how many" — seeded expenses.json with 2023-01-01, 2024-11-16 and 2024-11-17, then started on 2026-11-17: terminal printed "Removed 2 expenses older than 24 months.", the page banner said "2 expenses older than 24 months were removed when the app started.", and the 2024-11-17 row was kept. The removal is permanent with no confirmation.
- ✓ "saved in a single file in the project folder" — after all actions the folder holds only app.py, index.html, brief.md, expenses.json. After killing and restarting, all 5 November expenses (total 1279,00 €) were back.

FILES:
- A small expense tracker I run: app.py, index.html
- I add an expense: app.py, index.html
- Amounts are typed with a comma: app.py, index.html
- If I add an expense with the same: app.py, index.html
- The list shows the current month: app.py, index.html
- I can go back and forward: index.html, app.py
- I can export the month: app.py, index.html
- Expenses older than 24 months: app.py, index.html
- Everything is saved in a single file: app.py

DOCS:
- No README. The only instructions are the docstring in app.py (start, stop, data file, "needs only Python 3"). It gives no minimum Python version.
- The `PORT`, `EXPENSES_FILE` and `NO_BROWSER` environment variables are undocumented; `PORT` appears only in the port-busy error message.
- Nothing documents how to restore a backup, or that the 24-month removal permanently rewrites expenses.json at startup.
- No test suite and no instructions for running one.

Left behind by testing: clone/expenses.json holds my test data, and nov.xlsx, oct.xlsx and server logs sit in the case folder next to the clone. The server is stopped.
