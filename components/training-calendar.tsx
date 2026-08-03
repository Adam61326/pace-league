"use client";

import { TrainingSessionModal } from "@/components/training-session-modal";
import { computeSessionLabel, SESSION_TYPE_META, type TrainingSession } from "@/lib/training-sessions";
import { IconChevronLeft, IconChevronRight } from "@tabler/icons-react";
import Link from "next/link";
import { useState } from "react";

const WEEKDAY_LABELS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

const MONTH_LABELS = [
  "Janvier",
  "Février",
  "Mars",
  "Avril",
  "Mai",
  "Juin",
  "Juillet",
  "Août",
  "Septembre",
  "Octobre",
  "Novembre",
  "Décembre",
];

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function toDateStr(year: number, month: number, day: number): string {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

// Lundi = 0 .. Dimanche = 6 (convention semaine du produit, cf. CLAUDE.md).
function mondayFirstWeekday(date: Date): number {
  return (date.getUTCDay() + 6) % 7;
}

// Grille du mois : jours du mois précédent/suivant affichés en cases vides
// grisées non cliquables (pas de séances à charger pour eux, voir
// lib/training-sessions.ts getTrainingSessionsForMonth) — simplification
// assumée plutôt que de récupérer les séances des mois adjacents.
function buildMonthGrid(year: number, month: number): (string | null)[][] {
  const firstOfMonth = new Date(Date.UTC(year, month - 1, 1));
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const leadingBlanks = mondayFirstWeekday(firstOfMonth);

  const cells: (string | null)[] = [
    ...Array.from({ length: leadingBlanks }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => toDateStr(year, month, i + 1)),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const weeks: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

function adjacentMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const d = new Date(Date.UTC(year, month - 1 + delta, 1));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
}

export function TrainingCalendar({
  year,
  month,
  sessionsByDate,
}: {
  year: number;
  month: number;
  sessionsByDate: Record<string, TrainingSession>;
}) {
  const [openDate, setOpenDate] = useState<string | null>(null);
  const weeks = buildMonthGrid(year, month);
  const prev = adjacentMonth(year, month, -1);
  const next = adjacentMonth(year, month, 1);
  const todayStr = new Date().toISOString().slice(0, 10);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-semibold tracking-tight text-foreground">
          {MONTH_LABELS[month - 1]} {year}
        </h2>
        <div className="flex items-center gap-2">
          <Link
            href={`?month=${prev.year}-${pad2(prev.month)}`}
            className="flex h-8 w-8 items-center justify-center rounded-[10px] border border-border text-foreground-secondary hover:bg-white/[.06]"
          >
            <IconChevronLeft size={16} stroke={1.75} />
          </Link>
          <Link
            href={`?month=${next.year}-${pad2(next.month)}`}
            className="flex h-8 w-8 items-center justify-center rounded-[10px] border border-border text-foreground-secondary hover:bg-white/[.06]"
          >
            <IconChevronRight size={16} stroke={1.75} />
          </Link>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border">
        <div className="grid grid-cols-7 border-b border-border bg-white/[.02]">
          {WEEKDAY_LABELS.map((label) => (
            <div key={label} className="px-2 py-2 text-center text-xs font-semibold tracking-wide text-foreground-tertiary uppercase">
              {label}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7">
          {weeks.flatMap((week, weekIndex) =>
            week.map((dateStr, dayIndex) => {
              const session = dateStr ? sessionsByDate[dateStr] : undefined;
              const isToday = dateStr === todayStr;

              return (
                <button
                  key={`${weekIndex}-${dayIndex}`}
                  type="button"
                  disabled={!dateStr}
                  onClick={() => dateStr && setOpenDate(dateStr)}
                  className={`flex min-h-[84px] flex-col items-start gap-1.5 border-b border-r border-border p-2 text-left transition-colors ${
                    dateStr ? "hover:bg-white/[.04]" : "bg-white/[.01]"
                  }`}
                >
                  {dateStr && (
                    <>
                      <span
                        className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${
                          isToday ? "bg-accent text-white" : "text-foreground-secondary"
                        }`}
                      >
                        {Number(dateStr.slice(-2))}
                      </span>
                      {session && (
                        <span
                          className={`w-full truncate rounded-full px-2 py-1 text-[11px] font-medium ${SESSION_TYPE_META[session.type].badgeClass}`}
                          title={computeSessionLabel(session)}
                        >
                          {computeSessionLabel(session)}
                        </span>
                      )}
                    </>
                  )}
                </button>
              );
            })
          )}
        </div>
      </div>

      {openDate && (
        <TrainingSessionModal dateStr={openDate} initialSession={sessionsByDate[openDate] ?? null} onClose={() => setOpenDate(null)} />
      )}
    </div>
  );
}
