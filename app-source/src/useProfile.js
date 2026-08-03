import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

// Public leaderboard identity (username/gender/avatar/active gear) and the
// private full name are deliberately kept in two separate tables with
// different RLS rules - see supabase-schema-social.sql. This hook just gives
// the UI one place to read/write both.
export function useProfile(user) {
  const [profile, setProfile] = useState(null);
  const [privateData, setPrivateData] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!user) {
      setProfile(null);
      setPrivateData(null);
      return;
    }
    setLoading(true);
    const [{ data: p }, { data: priv }] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
      supabase.from("profile_private").select("*").eq("user_id", user.id).maybeSingle(),
    ]);
    setProfile(p || null);
    setPrivateData(priv || null);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  const friendlyError = (msg) => {
    if (!msg) return msg;
    if (msg.toLowerCase().includes("duplicate") || msg.toLowerCase().includes("unique")) {
      return "Dieser Username ist schon vergeben.";
    }
    return msg;
  };

  // username + gender + bio + instagram are saved together (and always
  // include username) so an upsert never trips the "username not null"
  // constraint on first insert.
  const saveProfile = useCallback(
    async ({ username, gender, bio, instagram }) => {
      if (!user) return "Nicht angemeldet.";
      const { error } = await supabase.from("profiles").upsert({
        id: user.id,
        username,
        gender: gender || null,
        bio: bio || null,
        instagram: instagram || null,
      });
      if (error) return friendlyError(error.message);
      await load();
      return null;
    },
    [user, load]
  );

  const saveFullName = useCallback(
    async (full_name) => {
      if (!user) return "Nicht angemeldet.";
      const { error } = await supabase
        .from("profile_private")
        .upsert({ user_id: user.id, full_name: full_name || null, updated_at: new Date().toISOString() });
      if (error) return error.message;
      await load();
      return null;
    },
    [user, load]
  );

  // Requires a username to already exist (profile row already created),
  // otherwise the upsert below would fail the "username not null" check.
  const uploadAvatar = useCallback(
    async (file) => {
      if (!user) return { error: "Nicht angemeldet." };
      if (!profile?.username) return { error: "Bitte zuerst einen Usernamen speichern." };
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
      const path = `${user.id}/avatar.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("avatars")
        .upload(path, file, { upsert: true, cacheControl: "3600" });
      if (upErr) return { error: upErr.message };
      const { data } = supabase.storage.from("avatars").getPublicUrl(path);
      const url = `${data.publicUrl}?t=${Date.now()}`; // cache-bust so the new image shows right away
      const { error: saveErr } = await supabase.from("profiles").update({ avatar_url: url }).eq("id", user.id);
      if (saveErr) return { error: saveErr.message };
      await load();
      return { url };
    },
    [user, profile, load]
  );

  // Snapshot of the gear's current name at the time it's marked active -
  // used to tag future runs (and the leaderboard) without exposing the
  // private gear table to other users.
  const setActiveGear = useCallback(
    async (name) => {
      if (!user) return "Nicht angemeldet.";
      if (!profile?.username) return "Bitte zuerst einen Usernamen speichern.";
      const { error } = await supabase.from("profiles").update({ active_gear_name: name }).eq("id", user.id);
      if (error) return error.message;
      await load();
      return null;
    },
    [user, profile, load]
  );

  return { profile, privateData, loading, saveProfile, saveFullName, uploadAvatar, setActiveGear, reload: load };
}
