"use client";

import { IconChevronDown } from "@tabler/icons-react";

// Style commun à tous les <select> de l'app : `appearance-none` +
// `color-scheme: dark` global (app/globals.css) — sans ça, sur un
// OS/navigateur en thème clair, le popup natif d'options peut s'afficher en
// clair alors que notre texte hérite d'une couleur claire pensée pour un
// fond sombre (illisible), et Windows dessine un anneau de focus dans la
// couleur d'accent système (souvent orange) autour d'un <select> non stylé.
export const SELECT_CLASS =
  "appearance-none rounded-[10px] border border-border bg-white/5 px-3 py-2 pr-8 text-sm text-foreground outline-none focus:border-accent";
export const OPTION_CLASS = "bg-surface text-foreground";

export function SelectChevron() {
  return (
    <IconChevronDown
      size={16}
      className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-foreground-tertiary"
    />
  );
}
