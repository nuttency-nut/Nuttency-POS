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
  const restoringSessionRef = useRef(false);

  const safeRefreshSession = async () => {
    try {
      await supabase.auth.refreshSession();
    } catch (error) {
      // Ignore lock-timeout refresh errors; another tab/process is already refreshing token.
      const message = error instanceof Error ? error.message.toLowerCase() : "";
      if (!message.includes("lock") && !message.includes("timed out")) {
        throw error;
      }
    }
  };

  const fetchRole = async (userId: string) => {
    try {
      const queryRole = () =>
        supabase.from("user_roles").select("role").eq("user_id", userId).maybeSingle();

      let { data, error } = await queryRole();

      if (error) {
        const message = error.message.toLowerCase();
        const shouldRefresh =
          message.includes("jwt") ||
          message.includes("token") ||
          message.includes("session");

        if (shouldRefresh) {
          await safeRefreshSession();
          const retry = await queryRole();
          data = retry.data;
          error = retry.error;
        }
      }

      if (error) {
        console.error("[AUTH_FETCH_ROLE_ERROR]", error.message);
        setRole("no_role");
        return;
      }

      setRole((data?.role as AppRole) ?? "no_role");
    } catch (error) {
      console.error("[AUTH_FETCH_ROLE_EXCEPTION]", error);
      setRole("no_role");
    }
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        try {
          setSession(session);
          setUser(session?.user ?? null);

          if (session?.user) {
            await fetchRole(session.user.id);
          } else {
            setRole(null);
          }
        } catch (error) {
          console.error("[AUTH_STATE_CHANGE_ERROR]", error);
          setRole("no_role");
        } finally {
          setLoading(false);
        }
      }
    );

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      try {
        setSession(session);
        setUser(session?.user ?? null);
        if (session?.user) {
          await fetchRole(session.user.id);
        }
      } catch (error) {
        console.error("[AUTH_GET_SESSION_ERROR]", error);
        setRole("no_role");
      } finally {
        setLoading(false);
      }
    });

    const onVisibilityChange = async () => {
      if (document.visibilityState !== "visible") return;
      if (restoringSessionRef.current) return;

      restoringSessionRef.current = true;
      try {
        const { data } = await supabase.auth.getSession();
        if (!data.session?.user) return;
        await safeRefreshSession();
        await fetchRole(data.session.user.id);
      } finally {
        restoringSessionRef.current = false;
      }
    };

    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
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
