import { SubTabs } from "@/components/sub-tabs";
import { createClient } from "@/lib/supabase/server";
import { IconLock } from "@tabler/icons-react";
import { redirect } from "next/navigation";

const BADGES_TABS = [
  { href: "/dashboard", label: "Vue d'ensemble" },
  { href: "/mes-activites", label: "Mes activités" },
  { href: "/badges", label: "Badges" },
];

const CATEGORY_LABELS: Record<string, string> = {
  distance: "Distance",
  dplus: "Dénivelé (D+)",
  regularity: "Régularité",
  performance: "Performance",
};

const CATEGORY_ORDER = ["distance", "dplus", "regularity", "performance"];

interface BadgeRow {
  key: string;
  category: string;
  label: string;
  description: string;
}

interface UserBadgeRow {
  badge_key: string;
  earned_at: string;
}

// badges est en lecture publique et user_badges filtré par RLS à
// auth.uid()=user_id (donnée personnelle, contrairement à country_scores/
// tier_cohorts qui sont des données compétitives publiques) : le client
// authentifié standard suffit, pas besoin du client admin ici.
export default async function BadgesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirectTo=/badges");
  }

  const [{ data: badges }, { data: earned }] = await Promise.all([
    supabase.from("badges").select("key, category, label, description").returns<BadgeRow[]>(),
    supabase
      .from("user_badges")
      .select("badge_key, earned_at")
      .eq("user_id", user.id)
      .returns<UserBadgeRow[]>(),
  ]);

  const earnedByKey = new Map((earned ?? []).map((b) => [b.badge_key, b.earned_at]));
  const allBadges = badges ?? [];

  return (
    <div className="flex flex-1 flex-col items-center gap-8 bg-background px-6 py-16">
      <div className="flex w-full max-w-2xl flex-col gap-6">
        <div className="flex flex-col gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-white">Badges</h1>
            <p className="text-sm text-zinc-400">
              {earnedByKey.size} / {allBadges.length} débloqués
            </p>
          </div>
          <SubTabs tabs={BADGES_TABS} activeHref="/badges" />
        </div>

        {CATEGORY_ORDER.map((category) => {
          const categoryBadges = allBadges
            .filter((b) => b.category === category)
            .sort((a, b) => a.key.localeCompare(b.key));

          if (categoryBadges.length === 0) return null;

          return (
            <section key={category} className="flex flex-col gap-3">
              <h2 className="text-sm font-semibold tracking-tight text-zinc-400">
                {CATEGORY_LABELS[category] ?? category}
              </h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {categoryBadges.map((badge) => {
                  const earnedAt = earnedByKey.get(badge.key);
                  const isEarned = earnedAt != null;
                  return (
                    <div
                      key={badge.key}
                      className={`flex flex-col gap-1 rounded-md border p-4 ${
                        isEarned ? "border-accent/30 bg-accent/5" : "border-white/10 opacity-50"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={`text-sm font-semibold ${isEarned ? "text-white" : "text-zinc-300"}`}
                        >
                          {badge.label}
                        </span>
                        {!isEarned && <IconLock size={14} className="shrink-0 text-zinc-500" />}
                      </div>
                      <span className="text-xs text-zinc-400">{badge.description}</span>
                      {isEarned && (
                        <span className="text-xs text-accent">
                          Débloqué le{" "}
                          {new Date(earnedAt).toLocaleDateString("fr-FR", { timeZone: "UTC" })}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
