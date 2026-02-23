
# Add Google Login with User Profiles

## Overview
Add Google OAuth sign-in using Supabase Auth, with a `profiles` table to store user data, and integrate login/logout into the app UI.

## What You Need to Do First (in Supabase Dashboard)
Before the code changes will work, you need to set up Google as an OAuth provider:

1. Go to the **Google Cloud Console** and create OAuth credentials (Web application type)
2. Set the **Authorized redirect URL** to: `https://jnfwmdirvnqfpfhtipld.supabase.co/auth/v1/callback`
3. Set the **Authorized JavaScript origins** to your site URL (e.g. `https://claim-my-train.lovable.app`)
4. Copy the **Client ID** and **Client Secret**
5. Go to your **Supabase Dashboard > Authentication > Providers > Google** and paste them in
6. Under **Authentication > URL Configuration**, set:
   - Site URL: `https://claim-my-train.lovable.app`
   - Redirect URLs: `https://claim-my-train.lovable.app`

## Code Changes

### 1. Database Migration -- Create `profiles` table
Create a `profiles` table linked to `auth.users` with auto-creation on signup:

```sql
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  full_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = 'public'
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'avatar_url'
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();
```

### 2. Create Auth Context (`src/contexts/AuthContext.tsx`)
- Provide `user`, `session`, `profile`, `signInWithGoogle()`, `signOut()`, and `loading` state
- Use `onAuthStateChange` listener (set up before `getSession()`)
- Fetch profile from the `profiles` table after login

### 3. Create Login Page (`src/pages/Login.tsx`)
- Simple page with a "Sign in with Google" button
- Redirect to home after successful login

### 4. Create User Menu Component (`src/components/UserMenu.tsx`)
- Show user avatar and name when logged in (from profile data)
- Dropdown with "Sign out" option
- Show "Sign in" button when logged out

### 5. Update `src/App.tsx`
- Wrap app in `AuthProvider`
- Add `/login` route
- Optionally protect routes (or keep public with login as optional)

### 6. Update `src/pages/Index.tsx`
- Add the `UserMenu` component to the header area

### Files Created/Modified
- **New**: `src/contexts/AuthContext.tsx`
- **New**: `src/pages/Login.tsx`
- **New**: `src/components/UserMenu.tsx`
- **Modified**: `src/App.tsx` (add AuthProvider + login route)
- **Modified**: `src/pages/Index.tsx` (add UserMenu to header)
- **Migration**: Create `profiles` table with RLS + trigger
