"use client";

import { IconSearch } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const DEBOUNCE_MS = 300;

// Champ de recherche (Sprint 16) : reflète et met à jour ?q= dans l'URL,
// débouncé pour ne pas déclencher une requête serveur à chaque frappe.
export function SearchInput({ initialQuery }: { initialQuery: string }) {
  const router = useRouter();
  const [value, setValue] = useState(initialQuery);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  function handleChange(next: string) {
    setValue(next);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      const params = new URLSearchParams();
      if (next.trim()) params.set("q", next.trim());
      router.replace(params.size > 0 ? `/recherche?${params.toString()}` : "/recherche");
    }, DEBOUNCE_MS);
  }

  return (
    <div className="relative">
      <IconSearch size={18} className="absolute top-1/2 left-4 -translate-y-1/2 text-zinc-500" />
      <input
        type="text"
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        placeholder="Rechercher un coureur..."
        className="w-full rounded-xl border border-white/10 bg-white/5 py-3.5 pr-4 pl-11 text-[15px] text-white outline-none focus:border-accent"
      />
    </div>
  );
}
