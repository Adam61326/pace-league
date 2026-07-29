import { PerformanceRadar } from "@/components/performance-radar";
import { computePerformanceAxes } from "@/lib/performance";
import { createClient } from "@/lib/supabase/server";
import { IconActivity } from "@tabler/icons-react";
import Link from "next/link";
import { redirect } from "next/navigation";

// Page standalone Statistiques (Sprint 17, "Statistiques" de la maquette) :
// reutilise computePerformanceAxes + PerformanceRadar tels quels, deja
// utilises dans /dashboard et /profil/[id] — aucune nouvelle logique de
// calcul, juste une vue dediee au radar de performance.
export default async function StatistiquesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirectTo=/statistiques");
  }

  const { data: hrProfile } = await supabase
    .from("users")
    .select("hr_max, hr_rest")
    .eq("id", user.id)
    .single();

  const axes = await computePerformanceAxes(supabase, user.id, hrProfile?.hr_max ?? null, hrProfile?.hr_rest ?? null);

  const missingHr = hrProfile?.hr_max == null || hrProfile?.hr_rest == null;

  return (
    <div className="flex flex-1 flex-col items-center gap-8 bg-background px-6 py-16">
      <div className="flex w-full max-w-2xl flex-col gap-8">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">Statistiques</h1>
          <p className="text-sm text-foreground-secondary">
            Ta performance à 4 axes, comparée à ton propre historique — jamais aux autres coureurs.
          </p>
        </div>

        <section className="flex flex-col gap-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold tracking-tight text-foreground-secondary">
            <IconActivity size={16} stroke={1.75} />
            Performance
          </h2>
          <div className="flex flex-wrap items-start gap-6">
            <div className="flex justify-center rounded-2xl border border-border bg-surface p-6">
              <PerformanceRadar axes={axes} />
            </div>
            <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-2" style={{ minWidth: 240 }}>
              {axes.map((axis) => (
                <div key={axis.key} className="flex flex-col gap-1 rounded-[10px] border border-border p-4">
                  <span className="text-sm font-medium text-foreground">{axis.label}</span>
                  {axis.percentile != null ? (
                    <>
                      <span className="font-mono text-lg font-semibold tracking-tight text-foreground">
                        {axis.percentile}e percentile
                      </span>
                      {axis.detail && <span className="text-xs text-foreground-secondary">{axis.detail}</span>}
                      {axis.trend && (
                        <span
                          className={`text-xs font-medium ${
                            axis.trend === "hausse"
                              ? "text-green-400"
                              : axis.trend === "baisse"
                                ? "text-red-400"
                                : "text-foreground-secondary"
                          }`}
                        >
                          Tendance : {axis.trend}
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="text-xs text-foreground-secondary">{axis.unavailableReason}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
          {missingHr && (
            <p className="text-xs text-foreground-tertiary">
              Renseigne ta FC max et ta FC repos dans{" "}
              <Link href="/parametres" className="text-accent hover:underline">
                Paramètres
              </Link>{" "}
              pour débloquer l&apos;axe Efficacité.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
