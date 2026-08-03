// FORT Timer - Account löschen
//
// Löscht den einloggten User selbst aus auth.users. Das ist absichtlich eine
// Edge Function statt Client-Code: der service_role Key, der zum Löschen von
// Auth-Usern nötig ist, darf niemals im Browser/der App landen. Diese
// Funktion läuft serverseitig bei Supabase und bekommt den service_role Key
// automatisch als Umgebungsvariable - kein manuelles Secret-Setup nötig.
//
// Alle abhängigen Zeilen (profiles, profile_private, gear, training_runs)
// verschwinden automatisch mit, weil sie beim Anlegen mit
// "on delete cascade" an auth.users gebunden wurden.
//
// Deploy (einmalig, siehe README/Anleitung):
//   supabase functions deploy delete-account

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  const jwt = authHeader.replace("Bearer ", "");
  if (!jwt) {
    return new Response(JSON.stringify({ error: "Nicht angemeldet." }), { status: 401 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const admin = createClient(supabaseUrl, serviceRoleKey);

  // Verify the caller's JWT ourselves and only ever delete *that* user -
  // never trust a user id passed in from the client.
  const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
  if (userErr || !userData?.user) {
    return new Response(JSON.stringify({ error: "Ungültige Sitzung." }), { status: 401 });
  }

  const { error: deleteErr } = await admin.auth.admin.deleteUser(userData.user.id);
  if (deleteErr) {
    return new Response(JSON.stringify({ error: deleteErr.message }), { status: 500 });
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
