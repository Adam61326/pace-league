"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

interface Props {
  birthDate: string | null;
  gender: string | null;
  heightCm: number | null;
  weightKg: number | null;
  hrMax: number | null;
  hrRest: number | null;
}

interface FormState {
  birth_date: string;
  gender: string;
  height_cm: string;
  weight_kg: string;
  hr_max: string;
  hr_rest: string;
}

const FIELDS: { key: keyof FormState; label: string; type: string; min?: number; max?: number }[] = [
  { key: "birth_date", label: "Date de naissance", type: "date" },
  { key: "height_cm", label: "Taille (cm)", type: "number", min: 0, max: 250 },
  { key: "weight_kg", label: "Poids (kg)", type: "number", min: 0, max: 300 },
  { key: "hr_max", label: "FC max (bpm)", type: "number", min: 100, max: 230 },
  { key: "hr_rest", label: "FC repos (bpm)", type: "number", min: 30, max: 120 },
];

export function ProfileForm({ birthDate, gender, heightCm, weightKg, hrMax, hrRest }: Props) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>({
    birth_date: birthDate ?? "",
    gender: gender ?? "",
    height_cm: heightCm != null ? String(heightCm) : "",
    weight_kg: weightKg != null ? String(weightKg) : "",
    hr_max: hrMax != null ? String(hrMax) : "",
    hr_rest: hrRest != null ? String(hrRest) : "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function updateField(key: keyof FormState, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
    setSaved(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const response = await fetch("/api/account/update-profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => null);
      setError(
        body?.error === "hr_rest_must_be_below_hr_max"
          ? "La FC repos doit être inférieure à la FC max."
          : "L'enregistrement a échoué, réessayez."
      );
      setSaving(false);
      return;
    }

    setSaving(false);
    setSaved(true);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {FIELDS.map(({ key, label, type, min, max }) => (
          <div key={key} className="flex flex-col gap-1">
            <label htmlFor={key} className="text-sm font-medium text-zinc-300">
              {label}
            </label>
            <input
              id={key}
              type={type}
              min={min}
              max={max}
              value={form[key]}
              onChange={(e) => updateField(key, e.target.value)}
              className="rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-accent"
            />
          </div>
        ))}
        <div className="flex flex-col gap-1">
          <label htmlFor="gender" className="text-sm font-medium text-zinc-300">
            Genre
          </label>
          <select
            id="gender"
            value={form.gender}
            onChange={(e) => updateField("gender", e.target.value)}
            className="rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-accent"
          >
            <option value="" className="bg-surface text-white">
              Non précisé
            </option>
            <option value="homme" className="bg-surface text-white">
              Homme
            </option>
            <option value="femme" className="bg-surface text-white">
              Femme
            </option>
            <option value="autre" className="bg-surface text-white">
              Autre
            </option>
          </select>
        </div>
      </div>

      <p className="text-xs text-zinc-500">
        FC max et FC repos débloquent l&apos;axe Endurance de l&apos;algorithme de performance sur le
        tableau de bord.
      </p>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <button
        type="submit"
        disabled={saving}
        className="flex h-10 w-fit items-center justify-center rounded-full bg-accent px-5 text-sm font-semibold text-black transition-colors hover:bg-accent-hover disabled:opacity-50"
      >
        {saving ? "Enregistrement…" : saved ? "Enregistré ✓" : "Enregistrer"}
      </button>
    </form>
  );
}
