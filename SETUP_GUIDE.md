# One-time setup (do once, in order)

1. **GitHub — create the repo.** github.com → New repository → name `athleta-front-of-house`,
   Private, owner = the Athleta account. Then "uploading an existing file" → drag the entire
   contents of this starter kit in (keep the folder structure) → Commit.

2. **Supabase — create the project.** supabase.com → New project → name `athleta-foh`,
   region **Sydney (ap-southeast-2)**, generate a strong DB password and save it somewhere safe.
   When it finishes: SQL Editor → paste the contents of `supabase/schema.sql` → Run.
   Then Settings → API: copy the **Project URL** and **anon key** (needed in step 3).

3. **Vercel — connect the repo.** vercel.com → Add New → Project → Import the GitHub repo.
   Before deploying, add Environment Variables:
   - `NEXT_PUBLIC_SUPABASE_URL` = the Project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = the anon key
   (First deploy will fail until Task 00 adds the app — that's expected.)

4. **Claude Code.** claude.ai/code → connect GitHub → select the repo →
   first prompt: **"Read CLAUDE.md, then do tasks/00-foundations.md"**.

5. Review each PR via its Vercel preview link, comment in plain English, merge when happy,
   then start the next numbered task.
