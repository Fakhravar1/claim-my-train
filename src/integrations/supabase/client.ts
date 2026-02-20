import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "https://jnfwmdirvnqfpfhtipld.supabase.co";
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "";

if (!SUPABASE_ANON_KEY) {
  console.warn("Missing VITE_SUPABASE_PUBLISHABLE_KEY environment variable");
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
