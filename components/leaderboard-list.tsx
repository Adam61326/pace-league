"use client";

import { Avatar } from "@/components/avatar";
import { StreakBadge } from "@/components/streak-badge";
import { TitleBadge } from "@/components/title-badge";
import { WeeklyStatsPanel } from "@/components/weekly-stats-panel";
import { getCountryFlag } from "@/lib/countries";
import { formatDisplayName } from "@/lib/display-name";
import Link from "next/link";
import { useState } from "react";

export interface LeaderboardRowData {
  userId: string;
  rank: number | string;
  displayName: string | null;
  firstname: string | null;
  lastname: string | null;
  photoUrl: string | null;
  countryCode: string | null; // null => pas de drapeau (ligues privées)
  titleLabel: string | null;
  streakDays?: number;
  points: number;
  isMe?: boolean;
  highlightClass?: string; // fond de ligne (promotion / relégation) en plus de isMe
}

// Liste de classement cliquable, partagée par l'accueil, /ligues et
// /ligues-privees/[id] (Sprint 16) : clic sur la ligne ouvre le panel stats
// hebdo, clic sur le nom navigue vers /profil/[id] (stopPropagation pour ne
// pas aussi ouvrir le panel).
export function LeaderboardList({ rows }: { rows: LeaderboardRowData[] }) {
  const [openUserId, setOpenUserId] = useState<string | null>(null);

  return (
    <>
      <ol className="flex flex-col divide-y divide-white/10 rounded-md border border-white/10">
        {rows.map((row) => (
          <li
            key={row.userId}
            onClick={() => setOpenUserId(row.userId)}
            className={`flex cursor-pointer items-center gap-3 px-4 py-3 text-sm ${
              row.highlightClass ?? (row.isMe ? "bg-white/[.06]" : "")
            }`}
          >
            <span className="w-6 text-right text-zinc-400">{row.rank}</span>
            <Avatar
              userId={row.userId}
              photoUrl={row.photoUrl}
              firstname={row.firstname}
              lastname={row.lastname}
              size={28}
            />
            {row.countryCode && <span aria-hidden>{getCountryFlag(row.countryCode)}</span>}
            <span className="min-w-0 flex-1">
              <span className="font-medium text-white">
                <Link
                  href={`/profil/${row.userId}`}
                  onClick={(e) => e.stopPropagation()}
                  className="hover:underline"
                >
                  {formatDisplayName(row.displayName, row.firstname, row.lastname)}
                </Link>
                {row.isMe && <span className="text-zinc-400"> (toi)</span>}
              </span>
              {row.titleLabel && <TitleBadge label={row.titleLabel} />}
              {row.streakDays != null && row.streakDays > 0 && (
                <span className="block">
                  <StreakBadge days={row.streakDays} />
                </span>
              )}
            </span>
            <span className="font-semibold text-white">{row.points} pts</span>
          </li>
        ))}
      </ol>

      <WeeklyStatsPanel userId={openUserId} onClose={() => setOpenUserId(null)} />
    </>
  );
}
