import { createClient } from "@supabase/supabase-js";

// Client à privilèges élevés (service_role, bypass RLS) pour les traitements
// serveur-à-serveur sans session utilisateur (ex: webhook Strava).
// Ne jamais exposer ce client ou la clé au navigateur.
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
