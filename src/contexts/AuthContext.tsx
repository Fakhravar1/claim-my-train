import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

interface Profile {
  id: string;
  email: string | null;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  claim_email: string | null;
  claim_mobile: string | null;
  claim_ticket_id: string | null;
  claim_personnummer: string | null;
  claims_done_count: number;
  is_period_ticket: boolean;
  preferred_from_stop_id: string | null;
  preferred_to_stop_id: string | null;
  ticket_valid_until: string | null;
  street_address: string | null;
  postal_code: string | null;
  city: string | null;
  payout_method: string | null;
  clearing_number: string | null;
  account_number: string | null;
  signature_path: string | null;
  digest_frequency: string | null;
  purchasing_operator: string | null;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  signInWithGoogle: (nextPath?: string) => Promise<void>;
  signOut: () => Promise<void>;
  /** Re-fetch the profile row (e.g. after Settings saves a change). */
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = async (userId: string) => {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, email, full_name, first_name, last_name, avatar_url, claim_email, claim_mobile, claim_ticket_id, claim_personnummer, claims_done_count, is_period_ticket, preferred_from_stop_id, preferred_to_stop_id, ticket_valid_until, street_address, postal_code, city, payout_method, clearing_number, account_number, signature_path, digest_frequency, purchasing_operator")
      .eq("id", userId)
      .single();
    if (error) {
      const { data: fallbackData } = await supabase
        .from("profiles")
        .select("id, email, full_name, avatar_url")
        .eq("id", userId)
        .single();
      setProfile({
        ...fallbackData,
        first_name: null,
        last_name: null,
        claim_email: null,
        claim_mobile: null,
        claim_ticket_id: null,
        claim_personnummer: null,
        claims_done_count: 0,
        is_period_ticket: false,
        preferred_from_stop_id: null,
        preferred_to_stop_id: null,
        ticket_valid_until: null,
        street_address: null,
        postal_code: null,
        city: null,
        payout_method: null,
        clearing_number: null,
        account_number: null,
        signature_path: null,
        digest_frequency: null,
        purchasing_operator: null,
      } as Profile);
      return;
    }
    setProfile(data);
  };

  const refreshProfile = async () => {
    if (user) await fetchProfile(user.id);
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        if (session?.user) {
          setTimeout(() => fetchProfile(session.user.id), 0);
        } else {
          setProfile(null);
        }
        setLoading(false);
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfile(session.user.id);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signInWithGoogle = async (nextPath?: string) => {
    const safeNextPath = nextPath?.startsWith("/") ? nextPath : "/";
    // Land OAuth straight on the destination — the Supabase client parses the
    // token from the URL hash on any route (detectSessionInUrl), so there's no
    // need to bounce through an intermediate /login page (which flashed the old
    // shadcn login UI for a frame before redirecting on).
    const redirectTo = `${window.location.origin}${safeNextPath}`;
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo },
    });
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setProfile(null);
  };

  return (
    <AuthContext.Provider value={{ user, session, profile, loading, signInWithGoogle, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
};
