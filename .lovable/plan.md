## 1. Email + password authentication

**Login page (`src/pages/Login.tsx`)**
- Add tabs: "Sign in" / "Create account", each with email + password fields.
- Sign in → `supabase.auth.signInWithPassword({ email, password })`.
- Sign up → `supabase.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin + '/login?next=...' } })`. The existing `handle_new_user` trigger creates the profile row automatically.
- Keep the existing Google button above the form, separated by a divider.
- Validate with zod (email format, password ≥ 8 chars). Show toast on auth errors.

**Supabase config**
- Email provider is on by default; no migration needed for that. Email confirmation stays on (default) — user must click the link before signing in. We surface that in a toast after signup.

## 2. Personal info: address fields

**Migration** — add three nullable columns to `public.profiles`:
- `street_address text`
- `postal_code text`
- `city text`

No RLS changes (existing "Users can update own profile" policy covers them). Types in `src/integrations/supabase/types.ts` regenerate after the migration.

**AuthContext (`src/contexts/AuthContext.tsx`)**
- Extend `Profile` interface and the `select(...)` column lists to include the three new fields.

**Settings page (`src/pages/Settings.tsx`)**
- In the "Personal info" tab, after Personnummer, add three inputs: Street address, Postal code, City (postal code + city on one row on `md+`).
- Wire local state + `useEffect` hydrate + include in the `profiles` upsert in `handleSubmit`.

## Technical notes

- No changes to edge functions, dbt, or region pages.
- Google sign-in flow is untouched.
- Auth-state listener in `AuthContext` already handles password sessions — no changes needed there.

## Open question

Should sign-up require **email confirmation** (current Supabase default — user clicks link, then can sign in), or do you want it disabled so accounts work immediately? Default is more secure; disabling is friendlier for testing. I'll go with the default unless you say otherwise.