import { TrainingCalendar } from "@/components/training-calendar";
import { getTrainingSessionsForMonth } from "@/lib/training-sessions";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

function parseMonthParam(monthParam: string | undefined): { year: number; month: number } {
  const now = new Date();
  const fallback = { year: now.getUTCFullYear(), month: now.getUTCMonth() + 1 };
  if (!monthParam) return fallback;

  const match = /^(\d{4})-(\d{2})$/.exec(monthParam);
  if (!match) return fallback;

  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) return fallback;
  return { year, month };
}

// Calendrier d'entraînement : une séance par jour, créée/éditée via le modal
// "Ajouter une séance" (components/training-session-modal.tsx). Mois affiché
// via ?month=YYYY-MM (navigation prev/next dans TrainingCalendar), par
// défaut le mois en cours.
export default async function CalendrierPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirectTo=/calendrier");
  }

  const { month: monthParam } = await searchParams;
  const { year, month } = parseMonthParam(monthParam);

  const sessions = await getTrainingSessionsForMonth(supabase, user.id, year, month);
  const sessionsByDate = Object.fromEntries(sessions);

  return (
    <div className="flex flex-1 flex-col gap-8 bg-background px-6 py-16">
      <div className="flex w-full flex-col gap-8">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">Calendrier</h1>
          <p className="text-sm text-foreground-secondary">Planifie tes séances et suis ton entraînement jour par jour.</p>
        </div>

        <TrainingCalendar year={year} month={month} sessionsByDate={sessionsByDate} />
      </div>
    </div>
  );
}
