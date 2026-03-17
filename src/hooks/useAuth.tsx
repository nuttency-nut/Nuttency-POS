import { createContext, useContext, useEffect, useRef, useState, ReactNode } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { getAllPermissions, getDefaultPermissions } from "@/lib/permissions";

type SystemRole = "admin" | "manager" | "staff" | "no_role";
type DeclaredRole = {
  id: string;
  name: string;
  permissions: Record<string, boolean>;
};

interface AuthContextType {
  session: Session | null;
  user: User | null;
  role: SystemRole | null;
  declaredRole: DeclaredRole | null;
  permissions: Record<string, boolean>;
  hasPermission: (key: string) => boolean;
  loading: boolean;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: Error | null }>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<SystemRole | null>(null);
  const [declaredRole, setDeclaredRole] = useState<DeclaredRole | null>(null);
  const [permissions, setPermissions] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(true);
  const db = supabase as any;

  const fetchRole = async (userId: string): Promise<SystemRole> => {
    const { data, error } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      return "no_role";
    }

    return (data?.role as SystemRole) ?? "no_role";
  };

  const fetchDeclaredRole = async (userId: string): Promise<DeclaredRole | null> => {
    const { data: assignment, error: assignmentError } = await db
      .from("user_role_assignments")
      .select("role_id")
      .eq("user_id", userId)
      .maybeSingle();

    if (assignmentError || !assignment?.role_id) {
      return null;
    }

    const { data: roleRow, error: roleError } = await db
      .from("role_definitions")
      .select("id,name,permissions")
      .eq("id", assignment.role_id)
      .maybeSingle();

    if (roleError || !roleRow) {
      return null;
    }

    return {
      id: String(roleRow.id),
      name: String(roleRow.name ?? ""),
      permissions: (roleRow.permissions as Record<string, boolean>) ?? {},
    };
  };

  const getFallbackPermissions = (systemRole: SystemRole | null) => {
    if (!systemRole || systemRole === "no_role") return {};
    if (systemRole === "admin") return getAllPermissions();

    const fallback = getDefaultPermissions();
    if (systemRole === "manager") {
      [
        "pos",
        "orders",
        "orders.update",
        "reports",
        "settings",
        "settings.roles",
        "settings.transfer_lookup",
        "settings.role_declaration",
        "settings.store_declaration",
      ].forEach((key) => {
        fallback[key] = true;
      });
      return fallback;
    }

    if (systemRole === "staff") {
      ["pos", "orders", "orders.update", "settings", "settings.transfer_lookup"].forEach((key) => {
        fallback[key] = true;
      });
      return fallback;
    }

    return fallback;
  };

  const resolvePermissions = (systemRole: SystemRole | null, roleData: DeclaredRole | null) => {
    if (roleData) {
      return roleData.permissions ?? {};
    }
    return getFallbackPermissions(systemRole);
  };

  const hasPermission = (key: string) => Boolean(permissions?.[key]);

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
          setDeclaredRole(null);
          setPermissions({});
          setLoading(false);
          return;
        }

        if (newSession?.user) {
          setTimeout(async () => {
            const [nextRole, nextDeclaredRole] = await Promise.all([
              fetchRole(newSession.user.id),
              fetchDeclaredRole(newSession.user.id),
            ]);
            if (!mountedRef.current) return;
            setRole(nextRole);
            setDeclaredRole(nextDeclaredRole);
            setPermissions(resolvePermissions(nextRole, nextDeclaredRole));
            setLoading(false);
          }, 0);
          return;
        }

        setRole(null);
        setDeclaredRole(null);
        setPermissions({});
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
          const [nextRole, nextDeclaredRole] = await Promise.all([
            fetchRole(initialSession.user.id),
            fetchDeclaredRole(initialSession.user.id),
          ]);
          if (!mountedRef.current) return;
          setRole(nextRole);
          setDeclaredRole(nextDeclaredRole);
          setPermissions(resolvePermissions(nextRole, nextDeclaredRole));
        } else {
          setRole(null);
          setDeclaredRole(null);
          setPermissions({});
        }
      } catch (error) {
        if (!mountedRef.current) return;
        setSession(null);
        setUser(null);
        setRole(null);
        setDeclaredRole(null);
        setPermissions({});
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
    setDeclaredRole(null);
    setPermissions({});
  };

  return (
    <AuthContext.Provider value={{ session, user, role, declaredRole, permissions, hasPermission, loading, signUp, signIn, signOut }}>
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
