-- Security hardening for the SECURITY DEFINER functions flagged by the Supabase advisor.
--
-- 1) handle_new_user() is an auth.users trigger, NOT a public RPC. Because it is SECURITY
--    DEFINER and had EXECUTE granted to anon/authenticated, it was callable at
--    /rest/v1/rpc/handle_new_user by unauthenticated clients. Revoke that; the trigger still
--    fires as table owner.
-- 2) Pin search_path on both the SECURITY DEFINER trigger and the STABLE claim_eligibility
--    resolver so a caller-controlled search_path cannot redirect their object resolution
--    (advisor lint 0011 function_search_path_mutable).
--
-- NB (repo-honesty): recorded per CLAUDE.md §11 Option A. Applied via the Supabase MCP
-- apply_migration (remote), not replayed via the CLI.

revoke execute on function public.handle_new_user() from anon, authenticated, public;

alter function public.handle_new_user() set search_path = public;
alter function public.claim_eligibility(integer, boolean, numeric, text) set search_path = public, dbt_dev;
