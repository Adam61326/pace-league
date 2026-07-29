import type { ComponentType } from "react";

interface IconComponentProps {
  size?: number;
  stroke?: number;
  className?: string;
}

// Ecran UI statique sans backend (Sprint 17) : composant partage par les 5
// ecrans de la maquette sans table/route associee (Clubs, Competitions, Plan
// Entrainement, Vue Coach, Messagerie). Purement presentationnel — pas
// d'appel API, pas de donnee inventee qui ressemblerait a du contenu reel.
export function ComingSoon({
  icon: Icon,
  title,
  description,
  previewLabel,
  previewRows,
}: {
  icon: ComponentType<IconComponentProps>;
  title: string;
  description: string;
  previewLabel: string;
  previewRows: number;
}) {
  return (
    <div className="flex flex-1 flex-col items-center gap-8 bg-background px-6 py-16">
      <div className="flex w-full max-w-2xl flex-col gap-8">
        <div className="flex flex-col items-center gap-4 py-8 text-center">
          <span className="gradient-signature flex h-16 w-16 items-center justify-center rounded-2xl">
            <Icon size={30} stroke={1.75} className="text-white" />
          </span>
          <div className="flex flex-col gap-2">
            <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
            <p className="mx-auto max-w-md text-sm text-foreground-secondary">{description}</p>
          </div>
          <span className="rounded-full border border-border px-3 py-1 text-xs font-medium text-foreground-tertiary">
            Bientôt disponible
          </span>
        </div>

        <div className="flex flex-col gap-3">
          <p className="text-xs font-semibold tracking-wide text-foreground-tertiary uppercase">{previewLabel}</p>
          <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4 opacity-50">
            {Array.from({ length: previewRows }, (_, i) => (
              <div key={i} className="flex items-center gap-3 rounded-[10px] p-2">
                <div className="h-9 w-9 shrink-0 rounded-full bg-white/10" />
                <div className="flex flex-1 flex-col gap-1.5">
                  <div className="h-2.5 w-1/3 rounded-full bg-white/10" />
                  <div className="h-2 w-1/2 rounded-full bg-white/5" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
