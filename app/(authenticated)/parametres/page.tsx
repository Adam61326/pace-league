import { getCountryName } from "@/lib/countries";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { StravaActions } from "../strava-actions";
import { DeleteAccountForm } from "./delete-account-form";
import { DisplayNameForm } from "./display-name-form";
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
      "country_code, strava_athlete_id, display_name, birth_date, gender, height_cm, weight_kg, hr_max, hr_rest"
    )
    .eq("id", user.id)
    .single();

  const isStravaConnected = Boolean(profile?.strava_athlete_id);

  return (
    <div className="flex flex-1 flex-col items-center gap-8 bg-background px-6 py-16">
      <div className="flex w-full max-w-2xl flex-col gap-10">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">Paramètres</h1>
          <p className="text-sm text-foreground-secondary">
            Ton compte, tes données physiologiques et ta connexion Strava.
          </p>
        </div>

        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold tracking-tight text-foreground-secondary">Compte</h2>
          <div className="flex flex-col gap-2 rounded-[10px] border border-border p-4 text-sm">
            <p>
              <span className="text-foreground-secondary">E-mail : </span>
              <span className="text-foreground">{user.email}</span>
            </p>
            <p>
              <span className="text-foreground-secondary">Pays : </span>
              <span className="text-foreground">
                {profile?.country_code ? getCountryName(profile.country_code) : "—"}
              </span>
            </p>
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold tracking-tight text-foreground-secondary">Identité</h2>
          <DisplayNameForm displayName={profile?.display_name ?? null} />
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold tracking-tight text-foreground-secondary">
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
          <h2 className="text-sm font-semibold tracking-tight text-foreground-secondary">Strava</h2>
          <div className="flex items-center justify-between rounded-[10px] border border-border p-4 text-sm">
            <span className="text-foreground-secondary">Statut</span>
            <span className="text-foreground">{isStravaConnected ? "connecté" : "non connecté"}</span>
          </div>
          <StravaActions isConnected={isStravaConnected} />
        </section>

        <section className="flex flex-col gap-3 border-t border-border pt-8">
          <h2 className="text-xs font-semibold tracking-wide text-foreground-secondary uppercase">
            Zone dangereuse
          </h2>
          <DeleteAccountForm />
        </section>
      </div>
    </div>
  );
}
