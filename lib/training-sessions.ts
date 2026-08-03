import type { SupabaseClient } from "@supabase/supabase-js";

// 'course' retiré (plus de type "Course" dans le calendrier d'entraînement —
// ne pas confondre avec race_plans, qui reste inchangé) : 4 types désormais.
export const SESSION_TYPES = ["endurance", "fractionne", "renfo_ppg", "repos"] as const;
export type SessionType = (typeof SESSION_TYPES)[number];

export const REP_UNITS = ["distance", "time"] as const;
export type RepUnit = (typeof REP_UNITS)[number];

export const RECOVERY_TYPES = ["trot", "marche", "statique"] as const;
export type RecoveryType = (typeof RECOVERY_TYPES)[number];

// Couleurs distinctes par type de séance (onglet actif du modal + pastille
// du calendrier, voir captures fournies) : bleu/orange/violet/gris, chacun
// avec sa propre variante "onglet actif" (fond plein) et "pastille" (fond
// teinté). Les onglets inactifs partagent tous le même style neutre bleuté
// (voir TrainingSessionModal), indépendant du type.
export const SESSION_TYPE_META: Record<
  SessionType,
  { label: string; activeTabClass: string; badgeClass: string }
> = {
  endurance: { label: "Endurance", activeTabClass: "bg-accent text-white", badgeClass: "bg-accent/15 text-accent" },
  fractionne: { label: "Fractionné", activeTabClass: "bg-alert text-white", badgeClass: "bg-alert/15 text-alert" },
  renfo_ppg: { label: "Renfo / PPG", activeTabClass: "bg-purple-400 text-white", badgeClass: "bg-purple-400/15 text-purple-400" },
  repos: { label: "Repos", activeTabClass: "bg-gray-500 text-white", badgeClass: "bg-white/10 text-foreground-tertiary" },
};

// Champs très hétérogènes selon le type (voir migration
// 20260806000000_add_training_sessions.sql) : plutôt qu'une union
// discriminée lourde pour un blob jsonb qui n'est de toute façon pas typé
// côté base, un seul type "boîte à outils" avec tous les champs possibles en
// optionnel — chaque composant ne lit/écrit que les clés pertinentes à son
// type (voir TrainingSessionModal, computeSessionLabel).
export interface TrainingSessionDetails {
  // endurance
  distanceKm?: number | null;
  durationSec?: number | null;
  targetPaceSecPerKm?: number | null;
  targetHr?: string | null;
  // fractionné (distanceKm partagé avec endurance)
  warmupMin?: number | null;
  repCount?: number | null;
  repUnit?: RepUnit | null;
  repValue?: string | null;
  // Secondes par km (même unité que targetPaceSecPerKm) — remplace un champ
  // texte libre ("ex : 3:50/km") pas pratique à remplir, voir PaceInput.
  targetPaceSecPerKmPerRep?: number | null;
  recoverySec?: number | null;
  recoveryType?: RecoveryType | null;
  cooldownMin?: number | null;
  stopRule?: string | null;
  // renfo_ppg
  durationMin?: number | null;
  exercises?: string | null;
}

export interface TrainingSession {
  id: string;
  sessionDate: string; // 'YYYY-MM-DD'
  type: SessionType;
  details: TrainingSessionDetails;
  notes: string | null;
}

interface TrainingSessionRow {
  id: string;
  session_date: string;
  session_type: SessionType;
  details: TrainingSessionDetails | null;
  notes: string | null;
}

function toTrainingSession(row: TrainingSessionRow): TrainingSession {
  return {
    id: row.id,
    sessionDate: row.session_date,
    type: row.session_type,
    details: row.details ?? {},
    notes: row.notes,
  };
}

function formatDurationLabel(totalSeconds: number): string {
  const rounded = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(rounded / 3600);
  const m = Math.round((rounded % 3600) / 60);
  if (h > 0) return `${h}h${String(m).padStart(2, "0")}`;
  return `${m} min`;
}

// Libellé affiché sur la pastille du calendrier — règle la plus simple
// possible (voir échange de validation) : notes prioritaires si renseignées
// (seul moyen d'obtenir un libellé libre), sinon dérivé de `details` selon
// le type, exactement comme demandé : distance pour l'endurance,
// "{reps}×{valeur}{unité}" pour le fractionné, libellé fixe pour renfo-PPG
// et repos (pas de champ chiffrable à résumer pour ces deux types).
export function computeSessionLabel(session: Pick<TrainingSession, "type" | "details" | "notes">): string {
  const trimmedNotes = session.notes?.trim();
  if (trimmedNotes) return trimmedNotes;

  const d = session.details ?? {};
  switch (session.type) {
    case "endurance": {
      if (d.distanceKm) return `${d.distanceKm.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} km endurance`;
      if (d.durationSec) return `${formatDurationLabel(d.durationSec)} endurance`;
      return SESSION_TYPE_META.endurance.label;
    }
    case "fractionne": {
      if (d.repCount && d.repValue) {
        const unit = d.repUnit === "time" ? "s" : "m";
        return `${d.repCount}×${d.repValue}${unit}`;
      }
      return SESSION_TYPE_META.fractionne.label;
    }
    case "renfo_ppg":
      return SESSION_TYPE_META.renfo_ppg.label;
    case "repos":
      return SESSION_TYPE_META.repos.label;
  }
}

const TRAINING_SESSION_COLUMNS = "id, session_date, session_type, details, notes";

// Bornes du mois affiché sur /calendrier — les jours des mois adjacents visibles
// en fin/début de grille ne sont pas cliquables (voir TrainingCalendar), donc
// leurs séances éventuelles n'ont pas besoin d'être chargées ici.
export async function getTrainingSessionsForMonth(
  supabase: SupabaseClient,
  userId: string,
  year: number,
  month: number // 1-12
): Promise<Map<string, TrainingSession>> {
  const from = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const to = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

  const { data, error } = await supabase
    .from("training_sessions")
    .select(TRAINING_SESSION_COLUMNS)
    .eq("user_id", userId)
    .gte("session_date", from)
    .lte("session_date", to)
    .returns<TrainingSessionRow[]>();

  if (error) throw error;

  return new Map((data ?? []).map((row) => [row.session_date, toTrainingSession(row)]));
}
