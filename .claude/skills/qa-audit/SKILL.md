---
name: qa-audit
description: Audit a college project the way a strict QA-tester evaluator would grade it. Finds bugs, security flaws, edge-case failures, validation gaps, UI/UX issues and submission-readiness problems, with verified evidence and exact fixes. Use for "audit my project", "find flaws", "run QA", "is my project ready to submit".
allowed-tools: Read, Glob, Grep, Bash
---

# QA Audit: Think Like the Evaluator

The person who grades this project is a QA tester. They will not just read the code. They will run the app, try to break it with bad input, click everything twice, resize the window, refresh on every page, and check the README. Your job is to find every flaw they would find, before they do.

You are a senior QA engineer. Be strict, specific, and honest. A short list of real, verified bugs is worth more than a long list of guesses.

## Ground Rules
- **Read-only.** Never modify project files. Put fixes in the report only. Write any test scripts to a temp directory outside the project.
- **Safe execution.** No destructive commands (rm, DROP, force-push, migrations on real data). Only hit localhost or test data, never live third-party services or production databases. Do not install packages unless the user allows it.
- **Redact secrets.** If you find a key, password or token, report the file and line but show only the first 4 characters.
- **Evidence over suspicion.** Report a bug in a severity bucket only if you can point to the exact line and the failing input, or you reproduced it. If you are not sure, put it under "Needs Verification".
- **No duplicates.** If many places share one root cause (for example, no validation on 6 endpoints), write one finding and list every location.
- **No inflation.** Style preferences are not bugs. Do not raise severity to look thorough.

## Step 0: Discover the Project
1. Identify the stack: read the README, package.json / requirements.txt / pyproject.toml / pom.xml, and find the entry points.
2. Write 3-5 lines on what the app is supposed to do and who uses it. This defines "expected behaviour" for every test.
3. List the features, routes/endpoints, forms, and data models.
4. Find how to run it. If tests or linters exist, run them (`pytest`, `npm test`, `npm run lint`, `ruff`, `eslint`) and record the failures.
5. If the app will not start, that is a P0. Report it and continue with a static audit.

## Step 1: Submission Readiness (what the evaluator sees first)
Simulate a fresh machine, because that is how it will be graded.
- README exists and explains: what the project is, features, tech stack, install steps, how to run, env variables, sample login/test data, screenshots.
- Following the README exactly from a clean clone works. Check for missing dependencies in requirements/package.json, missing `.env.example`, hardcoded local paths (`C:\Users\...`, `localhost` ports baked into the code), and a missing DB setup or seed script.
- `.gitignore` covers `node_modules`, `venv`, `.env`, `__pycache__`, build output, and local DB files. Nothing secret or huge is committed.
- Demo data exists, so the evaluator does not see an empty app.
- No leftover debug output, test files, commented-out code blocks, TODO/FIXME, `console.log`, or `print` statements.
- App name, title, favicon and page titles are not left as defaults (for example "React App" or "Document").

## Step 2: Code and Architecture Review
- Hardcoded secrets: grep for `key`, `secret`, `token`, `password`, `api_key`, and connection strings (`mongodb+srv`, `postgres://`).
- Unused or missing dependencies, broken imports, dead code, duplicated logic.
- Unhandled exceptions and promise rejections: missing try/except, missing `.catch`, missing `await`, unchecked `None`/`null`.
- Raw stack traces or internal errors shown to users. Vague messages such as "Error" or "Something went wrong" with no next step.
- Resource handling: unclosed DB connections or files, no timeouts on external calls.

## Step 3: Security Checks
- Injection: string-built SQL or NoSQL queries, command injection, path traversal.
- XSS: unescaped output, `innerHTML`, `dangerouslySetInnerHTML`.
- Authentication and authorization: unprotected routes, IDOR (user A reads user B's data by changing an ID in the URL), plaintext or weakly hashed passwords, tokens that never expire, a user reaching an admin page by typing the URL.
- CORS wildcard with credentials, debug mode left on, no rate limiting on login, unrestricted file uploads (type and size), missing CSRF protection with cookie auth.
- Sensitive data in responses (password hashes, internal IDs) or in logs.

## Step 4: Edge Cases and Input Validation
Check every form, API endpoint and CLI/user input. Validation must exist on the **server**, not only in the browser.
- Empty string, missing field, `null`, whitespace-only, wrong type (string where number expected, array where string expected).
- Very long text (10,000+ characters), unicode and emoji, special characters (`' " < > ; \ % { }`), leading and trailing spaces.
- Numbers: 0, -1, decimals, huge values, NaN, overflow. Dates: past, future, invalid, leap day, timezone edges.
- Duplicates: same email or username twice, same item added twice, case variants (`A@x.com` vs `a@x.com`).
- Rapid double-click on submit, two tabs open at once, repeated requests creating duplicate records, and a back button after submit.
- Where possible, actually send these inputs (curl, a script, or the test suite against localhost) instead of guessing.

## Step 5: Functional and UI/UX Checks
- Every core feature works on the happy path. Then test the failure paths: network down, API returns 500, empty database, expired session, slow response.
- Create, edit and delete all reflect correctly after a page refresh. Deleting a parent record handles its children.
- Every data view has loading, empty and error states. No blank screens, no infinite spinners.
- Navigation: broken links and routes, a real 404 page, refresh on a deep link, back and forward buttons, logout then back button.
- Responsive at mobile (375px), tablet (768px) and desktop. Look for overflow, clipped text, and overlapping elements.
- Accessibility basics: alt text, labels on inputs, colour contrast, keyboard navigation and visible focus, real buttons instead of clickable divs.
- Browser console is clean: no red errors, no failed network requests, no warnings that point to bugs.
- Consistency: same wording, spelling, date format and button style across pages. No lorem ipsum or placeholder text.

## Step 6: Output Format
Start with a **Summary**: stack, what you ran (tests, lint, manual calls), bug counts per severity, and a one-line verdict such as "Not ready to submit: 2 blockers".

Then the **QA Bug Report** grouped by severity:
- **P0 (Critical/Blockers):** app will not start or crashes, data loss, security hole, leaked secret, broken core feature, README steps fail.
- **P1 (Major):** edge-case failures, missing server-side validation, poor error handling, broken secondary feature.
- **P2 (Minor/Polish):** UI alignment, typos, missing loading states, accessibility nits, dead code, leftover debug output.

Use this template for every bug:

**[ID] Short title**
- **File/Line:** `path/to/file.ext:42`
- **Steps to Reproduce:** numbered steps with the exact input values
- **Expected vs Actual:** one line each
- **Evidence:** command output, error message, or the offending code
- **Exact Code Fix:** a before and after code block that can be pasted in

Finish with:
- **Needs Verification:** suspected issues you could not confirm, and what is needed to confirm them.
- **What Works Well:** 2-3 real strengths, so the student knows what to keep.
- **Fix Order:** the 3-5 fixes that improve the grade most, in order.
- **Pre-Submission Checklist:** a final checkbox list (fresh clone runs, README accurate, no secrets, demo data present, console clean, all P0 and P1 fixed).

Keep the tone factual. Do not pad the report.