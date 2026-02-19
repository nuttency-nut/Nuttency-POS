import { createContext, useContext, useEffect, useState, ReactNode } from "react";
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

const roleCacheKey = (userId: string) => `role_cache_${userId}`;

const getCachedRole = (userId: string): AppRole | null => {
  try {
    const raw = localStorage.getItem(roleCacheKey(userId));
    if (raw === "admin" || raw === "manager" || raw === "staff" || raw === "no_role") {
      return raw;
    }
    return null;
  } catch {
    return null;
  }
};

const setCachedRole = (userId: string, role: AppRole) => {
  try {
    localStorage.setItem(roleCacheKey(userId), role);
  } catch {
    // ignore storage errors
  }
};

const withTimeout = <T,>(promise: Promise<T>, timeoutMs: number, tag: string): Promise<T> =>
  Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`[${tag}] timeout ${timeoutMs}ms`)), timeoutMs)
    ),
  ]);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [loading, setLoading] = useState(true);

  const resolveRole = async (userId: string) => {
    const cachedRole = getCachedRole(userId);
    if (cachedRole) {
      setRole(cachedRole);
    }

    try {
      const { data, error } = await withTimeout(
        supabase.from("user_roles").select("role").eq("user_id", userId).maybeSingle(),
        8000,
        "AUTH_ROLE_FETCH"
      );

      if (error) {
        console.error("[AUTH_ROLE_FETCH_ERROR]", error.message);
        return;
      }

      const nextRole = ((data?.role as AppRole) ?? "no_role");
      setRole(nextRole);
      setCachedRole(userId, nextRole);
    } catch (error) {
      console.error("[AUTH_ROLE_FETCH_EXCEPTION]", error);
      // Keep cached role (if any), don't force no_role on transient failures.
    }
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, nextSession) => {
        setSession(nextSession);
        setUser(nextSession?.user ?? null);

        if (!nextSession?.user) {
          setRole(null);
          setLoading(false);
          return;
        }

        setLoading(true);
        await resolveRole(nextSession.user.id);
        setLoading(false);
      }
    );

    supabase.auth
      .getSession()
      .then(async ({ data: { session: initialSession } }) => {
        setSession(initialSession);
        setUser(initialSession?.user ?? null);

        if (!initialSession?.user) {
          setRole(null);
          setLoading(false);
          return;
        }

        setLoading(true);
        await resolveRole(initialSession.user.id);
        setLoading(false);
      })
      .catch((error) => {
        console.error("[AUTH_GET_SESSION_ERROR]", error);
        setLoading(false);
      });

    const onVisibilityChange = () => {
      if (localStorage.getItem("debug_supabase") === "1") {
        console.log("[AUTH_VISIBILITY]", {
          visibility: document.visibilityState,
          online: navigator.onLine,
        });
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
