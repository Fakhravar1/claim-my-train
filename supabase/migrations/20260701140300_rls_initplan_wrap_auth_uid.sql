-- Advisor lint 0003 auth_rls_initplan: wrap auth.uid() in (select auth.uid()) so Postgres
-- evaluates it once per query (as an initplan) instead of re-evaluating per row. Semantics
-- are unchanged — this is a pure performance fix across profiles/claims/digest_log/commute_routes.
--
-- NB (repo-honesty): recorded per CLAUDE.md §11 Option A. Applied via the Supabase MCP
-- apply_migration (remote), not replayed via the CLI.

-- profiles
alter policy "Users can view own profile"   on public.profiles using ((select auth.uid()) = id);
alter policy "Users can insert own profile" on public.profiles with check ((select auth.uid()) = id);
alter policy "Users can update own profile" on public.profiles using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

-- claims
alter policy "users insert own claims" on public.claims with check ((select auth.uid()) = user_id);
alter policy "users select own claims" on public.claims using ((user_id is not null) and ((select auth.uid()) = user_id));
alter policy "users update own claims" on public.claims using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- digest_log
alter policy "read own digest log" on public.digest_log using ((select auth.uid()) = user_id);

-- commute_routes
alter policy "select own commute routes" on public.commute_routes using ((select auth.uid()) = user_id);
alter policy "insert own commute routes" on public.commute_routes with check ((select auth.uid()) = user_id);
alter policy "update own commute routes" on public.commute_routes using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
alter policy "delete own commute routes" on public.commute_routes using ((select auth.uid()) = user_id);
