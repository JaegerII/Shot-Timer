import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

export function useAuth() {
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  const signUp = useCallback(async (email, password) => {
    const { error } = await supabase.auth.signUp({ email, password });
    return error ? error.message : null;
  }, []);

  const signIn = useCallback(async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return error ? error.message : null;
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const signInWithGoogle = useCallback(async () => {
    const redirectTo = `${window.location.origin}${window.location.pathname}`;
    await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo } });
  }, []);

  const signInWithApple = useCallback(async () => {
    const redirectTo = `${window.location.origin}${window.location.pathname}`;
    await supabase.auth.signInWithOAuth({ provider: "apple", options: { redirectTo } });
  }, []);

  const updatePassword = useCallback(async (password) => {
    const { error } = await supabase.auth.updateUser({ password });
    return error ? error.message : null;
  }, []);

  const updateEmail = useCallback(async (email) => {
    const { error } = await supabase.auth.updateUser({ email });
    return error ? error.message : null;
  }, []);

  // Calls the "delete-account" Edge Function rather than doing this
  // client-side - permanently removing an auth user requires the
  // service_role key, which must never be embedded in the app. The function
  // verifies the caller's own session token and only ever deletes that user.
  const deleteAccount = useCallback(async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData?.session?.access_token;
    if (!token) return "Nicht angemeldet.";
    try {
      const { error } = await supabase.functions.invoke("delete-account", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (error) return error.message || "Löschen fehlgeschlagen.";
      await supabase.auth.signOut();
      return null;
    } catch (err) {
      return err?.message || "Löschen fehlgeschlagen.";
    }
  }, []);

  return {
    session,
    user: session?.user ?? null,
    authLoading,
    signUp,
    signIn,
    signOut,
    signInWithGoogle,
    signInWithApple,
    updatePassword,
    updateEmail,
    deleteAccount,
  };
}
