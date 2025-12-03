import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import {
  getSession,
  onAuthChange,
  signInWithEmail,
  signOut as supabaseSignOut,
  signUpWithEmail,
} from "../../../data/remote/authApi";

interface AuthContextValue {
  session: Session | null;
  loading: boolean;
  signIn: (params: { email: string; password: string }) => Promise<void>;
  signUp: (params: { email: string; password: string; displayName: string }) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    getSession().then((currentSession) => {
      if (!mounted) return;
      setSession(currentSession);
      setLoading(false);
    });

    const unsubscribe = onAuthChange((_event, nextSession) => {
      setSession(nextSession);
      setLoading(false);
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  const signIn = useCallback(async ({ email, password }: { email: string; password: string }) => {
    await signInWithEmail(email, password);
  }, []);

  const signUp = useCallback(async ({
    email,
    password,
    displayName,
  }: {
    email: string;
    password: string;
    displayName: string;
  }) => {
    await signUpWithEmail({ email, password, displayName });
  }, []);

  const signOut = useCallback(async () => {
    await supabaseSignOut();
  }, []);

  const value = useMemo<AuthContextValue>(() => ({ session, loading, signIn, signUp, signOut }), [
    session,
    loading,
    signIn,
    signUp,
    signOut,
  ]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
