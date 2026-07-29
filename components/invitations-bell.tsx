"use client";

import { Avatar } from "@/components/avatar";
import { ClubInvitationActions } from "@/components/club-invitation-actions";
import { formatDisplayName } from "@/lib/display-name";
import type { PendingClubInvitation } from "@/lib/club-invitations";
import { IconBell } from "@tabler/icons-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

// Cloche de notification (Sprint 18) : n'existait pas avant ce sprint (ni
// statique ni branchée) — voir décision produit. Interroge club_invitations
// directement (pas de table notifications générique) via une prop server
// (layout.tsx récupère getPendingInvitations à chaque rendu), pas de fetch
// client au montage : évite un flash "0 invitation" le temps du chargement.
export function InvitationsBell({
  invitations,
  align = "right",
}: {
  invitations: PendingClubInvitation[];
  // "left" pour la sidebar desktop (la cloche est près du bord gauche de
  // l'écran, un popover ancré à droite déborderait hors du viewport) ;
  // "right" pour la barre mobile (cloche près du bord droit, comportement
  // d'origine).
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="relative flex h-9 w-9 items-center justify-center rounded-[10px] text-foreground-secondary transition-colors hover:bg-white/[.06] hover:text-foreground"
      >
        <IconBell size={19} stroke={1.75} />
        {invitations.length > 0 && (
          <span className="absolute top-1.5 right-1.5 flex h-2 w-2 items-center justify-center rounded-full bg-alert" />
        )}
      </button>

      {open && (
        <div
          className={`absolute top-full z-20 mt-2 w-80 rounded-2xl border border-border bg-surface py-2 shadow-xl ${
            align === "left" ? "left-0" : "right-0"
          }`}
        >
          <div className="flex items-center justify-between px-3 pb-2">
            <span className="text-xs font-semibold tracking-wide text-foreground-secondary uppercase">
              Invitations club
            </span>
          </div>

          {invitations.length === 0 ? (
            <p className="px-3 py-4 text-sm text-foreground-secondary">Aucune invitation en attente.</p>
          ) : (
            <div className="flex max-h-80 flex-col gap-1 overflow-y-auto px-2">
              {invitations.map((invitation) => (
                <div key={invitation.id} className="flex flex-col gap-2 rounded-[10px] p-2 hover:bg-white/[.04]">
                  <div className="flex items-center gap-2">
                    <Avatar
                      userId={invitation.invitedBy?.id ?? invitation.id}
                      photoUrl={invitation.invitedBy?.photoUrl ?? null}
                      firstname={invitation.invitedBy?.firstname ?? null}
                      lastname={invitation.invitedBy?.lastname ?? null}
                      size={32}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">{invitation.club?.name ?? "Club"}</p>
                      <p className="truncate text-xs text-foreground-secondary">
                        Invité par{" "}
                        {invitation.invitedBy
                          ? formatDisplayName(
                              invitation.invitedBy.displayName,
                              invitation.invitedBy.firstname,
                              invitation.invitedBy.lastname
                            )
                          : "un admin"}
                      </p>
                    </div>
                  </div>
                  <ClubInvitationActions invitationId={invitation.id} compact />
                </div>
              ))}
            </div>
          )}

          <Link
            href="/clubs"
            onClick={() => setOpen(false)}
            className="mt-1 block px-3 pt-2 text-center text-xs font-medium text-accent hover:underline"
          >
            Voir tout sur /clubs
          </Link>
        </div>
      )}
    </div>
  );
}
