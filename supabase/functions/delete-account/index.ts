// Deletes the calling user's own Supabase Auth account.
//
// Called by AuthRepository.deleteAccount() (composeApp/src/commonMain/.../core/auth/AuthRepository.kt)
// as `client.functions.invoke("delete-account")` — no request body, just the
// caller's session JWT in the Authorization header (attached automatically by
// the Supabase client). This function must run with JWT verification enabled
// (see supabase/config.toml: [functions.delete-account] verify_jwt = true),
// but Supabase's automatic JWT check only confirms the token is *valid* — it
// doesn't tell this function *who* the caller is, so we still derive the user
// id ourselves via a caller-scoped client's auth.getUser() call below.
//
// Every table in this schema has `user_id uuid references auth.users(id) on
// delete cascade`, so deleting the auth.users row cascades through every
// profile-scoped table (profiles, watch_progress, library, collections,
// settings, credentials, addons, plugins, ...) automatically — no manual
// per-table cleanup needed here.

import "@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return jsonResponse({ error: "Missing Authorization header" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return jsonResponse({ error: "Function is missing required Supabase secrets" }, 500);
  }

  try {
    // Scoped to the caller's own JWT — used only to verify who's calling.
    // Never used to perform the deletion itself (it has no elevated rights).
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userData, error: userError } = await callerClient.auth.getUser();
    if (userError || !userData?.user) {
      return jsonResponse({ error: "Invalid or expired session" }, 401);
    }
    const userId = userData.user.id;

    // Deleting an auth user requires the service_role (admin) key.
    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { error: deleteError } = await adminClient.auth.admin.deleteUser(userId);
    if (deleteError) {
      return jsonResponse({ error: deleteError.message }, 500);
    }

    return jsonResponse({ success: true }, 200);
  } catch (error) {
    return jsonResponse({ error: (error as Error).message }, 500);
  }
});
