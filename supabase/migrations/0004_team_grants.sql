-- Take away privileges the client keys never use.
--
-- Supabase grants ALL on every new table to anon and authenticated by default,
-- and row-level security is then the only thing holding the line. That worked:
-- admin_tasks and admin_messages have RLS on with no policies, so the
-- publishable key already reads nothing from them. But it means one permissive
-- policy -- including the "enable read access for all users" template the
-- Supabase dashboard offers in one click -- would expose the staff chat and the
-- work board to anyone with the key that ships in the page.
--
-- Two specifics that made this worth doing rather than leaving to RLS:
--
--   * anon held UPDATE on every column of customers, including role and
--     blocked. Only the absence of an anon policy stopped an account promoting
--     itself to admin or lifting its own block.
--   * anon and authenticated held TRUNCATE on all three tables, and TRUNCATE is
--     not subject to row-level security at all. No policy can restrain it.
--
-- The Worker is unaffected: it connects over DATABASE_URL as the table owner,
-- which bypasses both grants and RLS. Nothing in the browser talks to PostgREST
-- -- the publishable key is used only for GoTrue sign-in -- so nothing here is
-- reachable from the client by design.
--
-- There is no SQLite counterpart in drizzle/: the preview database has no roles.

-- ---------------------------------------------------------------- the team
-- Internal by construction. No client key has any business here.

revoke all on admin_tasks    from anon, authenticated;
revoke all on admin_messages from anon, authenticated;

-- ---------------------------------------------------------------- customers
-- Start from nothing, then hand back exactly what the policies are written
-- around: read your own row, and edit the six fields that are yours to edit.
-- role and blocked are deliberately absent -- RLS cannot restrict columns, so
-- the grant is what keeps an account from appointing or unblocking itself.

revoke all on customers from anon, authenticated;

grant select on customers to authenticated;
grant update (name, phone, address, city, postcode, wishlist) on customers to authenticated;
