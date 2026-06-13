# Athleta Front of House — build brief

Custom lead, trial, sales & retention system for Athleta Gymnastics (two sites: Coolaroo, Altona North).
The full specification is `docs/SCOPE.html`. The frozen UI reference is `docs/PROTOTYPE_REFERENCE.jsx` (v10).
**Anything not in the scope is out of scope. When the scope and this file conflict, the scope wins.**

## Stack (fixed — do not substitute)
- Next.js (App Router, TypeScript) deployed on Vercel
- Supabase (Postgres + Auth), project region Sydney — schema in `supabase/schema.sql`
- No ORMs beyond the Supabase client. No CSS frameworks beyond what the prototype implies (inline styles / CSS modules matching the prototype's look are fine; Tailwind acceptable if it reproduces the prototype exactly)
- Zapier webhooks for: Gravity Forms lead intake (inbound), Gmail draft creation for ALL outbound email (outbound)

## Non-negotiable product rules
1. **Reception staff are not computer-savvy.** Every screen must be self-evident. One clear next action per row. If a feature needs explaining, redesign it.
2. **Australian English everywhere** — enrol, enrolment, cancelled, programme.
3. **Colour system:** solid red = not contacted/problem; yellow = needs action; green = good/confirmed; ONE orange button per row = the next action; the sale button is GREEN. Don't decorate — squared, dense, ops-tool look per the prototype.
4. **No hard deletes anywhere.** Archive (soft delete) with who/when. Full audit trail: every create, status change, note, undo and verification is stamped with user + timestamp.
5. **Every action is undoable** where the prototype shows undo, and every undo is logged.
6. **Mandatory next action:** an active lead must always carry a next-action date/time until it is Enrolled, Lost or Nurture.
7. **Individual logins, site-locked by role.** Receptionists/Site Leads see their own site only. Admin and Management see both.
8. **Sales and departures only count once admin-verified** (iClassPro entry checked). Net growth = verified sales − verified departures, by effective date, per site.
9. **Children vs parents always labelled.** A guardian can have many child leads; the family is always one click away (see prototype parent profile).
10. **System stamps all dates** (received, notice, effective). Never trust user-typed dates from parents.

## Definitions (do not reinterpret)
- **Contacted** = any logged call outcome including voicemail (deliberate decision — do NOT use a two-way-only definition)
- **Lost** = dead lead, requires reason. **Nurture** = not now, requires a future follow-up date.
- **Operating days** = Mon–Sat excluding per-site blockout days (managed in settings).

## Working style
- Work in small PRs, one task brief per PR, branch per task.
- Every PR description: what was built, which scope section it implements, what to click in the preview to test it.
- Seed data: keep the prototype's seeded examples (incl. the Osman two-child family) so previews are reviewable.
- The reviewer is a non-developer reviewing via Vercel preview URLs on a phone. Make previews work logged-in by seeding test users (one per role) and stating their credentials in the PR description.
- Task briefs live in `tasks/` and are numbered. Do them in order unless told otherwise.
