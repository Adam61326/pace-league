import { getCountryName } from "@/lib/countries";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { StravaActions } from "../strava-actions";
import { DeleteAccountForm } from "./delete-account-form";
import { ProfileForm } from "./profile-form";

export default async function ParametresPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirectTo=/parametres");
  }

  const { data: profile } = await supabase
    .from("users")
    .select(
      "country_code, strava_athlete_id, birth_date, gender, height_cm, weight_kg, hr_max, hr_rest"
    )
    .eq("id", user.id)
    .single();

  const isStravaConnected = Boolean(profile?.strava_athlete_id);

  return (
    <div className="flex flex-1 flex-col items-center gap-8 bg-background px-6 py-16">
      <div className="flex w-full max-w-2xl flex-col gap-10">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-white">Paramètres</h1>
          <p className="text-sm text-zinc-400">
            Ton compte, tes données physiologiques et ta connexion Strava.
          </p>
        </div>

        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold tracking-tight text-zinc-400">Compte</h2>
          <div className="flex flex-col gap-2 rounded-md border border-white/10 p-4 text-sm">
            <p>
              <span className="text-zinc-400">E-mail : </span>
              <span className="text-white">{user.email}</span>
            </p>
            <p>
              <span className="text-zinc-400">Pays : </span>
              <span className="text-white">
                {profile?.country_code ? getCountryName(profile.country_code) : "—"}
              </span>
            </p>
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold tracking-tight text-zinc-400">
            Profil physiologique
          </h2>
          <ProfileForm
            birthDate={profile?.birth_date ?? null}
            gender={profile?.gender ?? null}
            heightCm={profile?.height_cm != null ? Number(profile.height_cm) : null}
            weightKg={profile?.weight_kg != null ? Number(profile.weight_kg) : null}
            hrMax={profile?.hr_max ?? null}
            hrRest={profile?.hr_rest ?? null}
          />
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold tracking-tight text-zinc-400">Strava</h2>
          <div className="flex items-center justify-between rounded-md border border-white/10 p-4 text-sm">
            <span className="text-zinc-400">Statut</span>
            <span className="text-white">{isStravaConnected ? "connecté" : "non connecté"}</span>
          </div>
          <StravaActions isConnected={isStravaConnected} />
        </section>

        <section className="flex flex-col gap-3 border-t border-white/10 pt-8">
          <h2 className="text-xs font-semibold tracking-wide text-zinc-400 uppercase">
            Zone dangereuse
          </h2>
          <DeleteAccountForm />
        </section>
      </div>
    </div>
  );
}
