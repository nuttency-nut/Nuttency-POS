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

  const fetchRole = async (userId: string): Promise<AppRole> => {
    const { data, error } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      return "no_role";
    }

    return (data?.role as AppRole) ?? "no_role";
  };

  useEffect(() => {
    mountedRef.current = true;

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, newSession) => {
        if (!mountedRef.current) return;

        // Always sync latest session from auth events.
        setSession(newSession);
        setUser(newSession?.user ?? null);

        if (event === "SIGNED_OUT") {
          setRole(null);
          setLoading(false);
          return;
        }

        if (newSession?.user) {
          setTimeout(async () => {
            const nextRole = await fetchRole(newSession.user.id);
            if (!mountedRef.current) return;
            setRole(nextRole);
            setLoading(false);
          }, 0);
          return;
        }

        setRole(null);
        setLoading(false);
      }
    );

    const bootstrapSession = async () => {
      try {
        const { data: { session: initialSession } } = await supabase.auth.getSession();
        if (!mountedRef.current) return;

        setSession(initialSession);
        setUser(initialSession?.user ?? null);

        if (initialSession?.user) {
          const nextRole = await fetchRole(initialSession.user.id);
          if (!mountedRef.current) return;
          setRole(nextRole);
        } else {
          setRole(null);
        }
      } catch (error) {
        if (!mountedRef.current) return;
        setSession(null);
        setUser(null);
        setRole(null);
      } finally {
        if (!mountedRef.current) return;
        setLoading(false);
      }
    };

    void bootstrapSession();

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
