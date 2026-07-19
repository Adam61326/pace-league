import { createClient } from "@/lib/supabase/server";
import { IconFlag, IconUsersGroup, IconWorld } from "@tabler/icons-react";
import Link from "next/link";
import { redirect } from "next/navigation";

const FEATURES = [
  {
    icon: IconWorld,
    title: "Classement mondial",
    description:
      "Chaque activité Strava valide te rapporte des points. Vois où tu te situes face à des coureurs du monde entier, débutants comme confirmés.",
  },
  {
    icon: IconFlag,
    title: "Ligues par pays",
    description:
      "Ton score et celui de tes compatriotes s'additionnent pour faire progresser votre pays, en divisions A/B/C avec promotion et relégation chaque saison.",
  },
  {
    icon: IconUsersGroup,
    title: "Ligues privées",
    description:
      "Crée une ligue pour ton club ou tes amis et partage un code à 6 caractères pour les inviter. Votre propre classement, indépendant du reste.",
  },
];

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect("/dashboard");
  }

  return (
    <div className="flex flex-1 flex-col bg-zinc-50 dark:bg-black">
      <header className="border-b border-black/[.08] dark:border-white/[.145]">
        <div className="mx-auto flex h-16 w-full max-w-5xl items-center justify-between px-6">
          <span className="text-lg font-semibold tracking-tight">PaceLeague</span>
          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="flex h-10 items-center justify-center rounded-full px-4 text-sm font-medium transition-colors hover:bg-black/[.04] dark:hover:bg-white/[.06]"
            >
              Se connecter
            </Link>
            <Link
              href="/signup"
              className="flex h-10 items-center justify-center rounded-full bg-foreground px-4 text-sm font-medium text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc]"
            >
              Créer un compte
            </Link>
          </div>
        </div>
      </header>

      <section className="flex flex-col items-center gap-6 px-6 py-24 text-center">
        <span className="text-xs font-semibold tracking-widest text-zinc-500 uppercase dark:text-zinc-400">
          Course à pied · Compétition par pays
        </span>
        <h1 className="max-w-2xl text-4xl font-semibold tracking-tight sm:text-5xl">
          Chaque foulée compte, pour toi et pour ton pays
        </h1>
        <p className="max-w-xl text-lg text-zinc-600 dark:text-zinc-400">
          Connecte ton compte Strava : chacune de tes sorties valides te rapporte des points
          chaque semaine. Débutant ou confirmé, ta régularité et ta progression font gagner ton
          pays dans un classement mondial par équipes.
        </p>
        <Link
          href="/signup"
          className="flex h-12 items-center justify-center rounded-full bg-foreground px-8 text-sm font-medium text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc]"
        >
          Rejoindre gratuitement
        </Link>
      </section>

      <section className="mx-auto grid w-full max-w-5xl gap-8 px-6 pb-24 sm:grid-cols-3">
        {FEATURES.map(({ icon: Icon, title, description }) => (
          <div key={title} className="flex flex-col items-start gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-foreground/10">
              <Icon size={20} stroke={1.75} />
            </span>
            <h2 className="text-base font-semibold tracking-tight">{title}</h2>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">{description}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
