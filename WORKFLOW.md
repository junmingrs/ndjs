# Workflow

## 1. Read the brief
- Read `AGENTS.md` first.
- Identify the user goal, constraints, and any non-goals.
- Note the product context: calendar + task management with AI assistance.

## 2. Inspect the repo
- Find the relevant UI, state, helper, and data files. 
- Never go into node_modules/.
- Check existing patterns before changing anything.
- Keep unrelated user changes intact.

## 3. Plan the change
- Break the work into small, ordered steps.
- Keep logic separate from presentation.
- Preserve deterministic behavior when sorting or ties matter.

## 4. Build carefully
- Make the smallest safe change that solves the request.
- Update types, components, and helpers together when needed.
- Keep AI actions human-in-the-loop and user-confirmed.

## 5. Verify
- Run `npm run lint`.
- Confirm the feature works end to end.
- Fix regressions before finishing.
