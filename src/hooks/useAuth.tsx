import { createContext, useContext, useEffect, useRef, useState, ReactNode } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

type AppRole = "admin" | "manager" | "staff" | "no_role";

interface AuthContextType {
  session: Session | null;
  user: User | null;
  role: AppRole | null;
  loading: boolean;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: Error | null }>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(true);
  const bootstrappedRef = useRef(false);

  const resolveRole = async (userId: string): Promise<AppRole> => {
    const { data, error } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      console.error("[AUTH_ROLE_FETCH_ERROR]", error.message);
      return "no_role";
    }

    return (data?.role as AppRole) ?? "no_role";
  };

  useEffect(() => {
    mountedRef.current = true;

    const applySession = async (nextSession: Session | null) => {
      if (!mountedRef.current) return;

      setSession(nextSession);
      setUser(nextSession?.user ?? null);

      if (!nextSession?.user) {
        setRole(null);
        setLoading(false);
        bootstrappedRef.current = true;
        return;
      }

      if (!bootstrappedRef.current) {
        setLoading(true);
      }
      const nextRole = await resolveRole(nextSession.user.id);
      if (!mountedRef.current) return;
      setRole(nextRole);
      setLoading(false);
      bootstrappedRef.current = true;
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, nextSession) => {
        if (event === "SIGNED_OUT") {
          if (!mountedRef.current) return;
          setSession(null);
          setUser(null);
          setRole(null);
          setLoading(false);
          bootstrappedRef.current = true;
          return;
        }

        if (event === "TOKEN_REFRESHED" || event === "SIGNED_IN") {
          await applySession(nextSession);
          return;
        }

        await applySession(nextSession);
      }
    );

    supabase.auth
      .getSession()
      .then(async ({ data: { session: initialSession } }) => {
        await applySession(initialSession);
      })
      .catch((error) => {
        console.error("[AUTH_GET_SESSION_ERROR]", error);
        if (!mountedRef.current) return;
        setLoading(false);
        bootstrappedRef.current = true;
      });

    return () => {
      mountedRef.current = false;
      subscription.unsubscribe();
    };
  }, []);

  const signUp = async (email: string, password: string, fullName: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: window.location.origin,
        data: { full_name: fullName },
      },
    });
    return { error: error as Error | null };
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error as Error | null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setRole(null);
  };

  return (
    <AuthContext.Provider value={{ session, user, role, loading, signUp, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
