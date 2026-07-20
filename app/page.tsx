import { Logo } from "@/components/logo";
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

interface PublicStats {
  connected_users: number;
  countries_count: number;
  total_km: number;
}

const numberFormatter = new Intl.NumberFormat("fr-FR");

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect("/dashboard");
  }

  const { data: stats } = await supabase
    .rpc("get_public_stats")
    .maybeSingle<PublicStats>();

  const STATS = [
    { label: "Coureurs connectés à Strava", value: numberFormatter.format(stats?.connected_users ?? 0) },
    { label: "Pays représentés", value: numberFormatter.format(stats?.countries_count ?? 0) },
    { label: "Km cumulés", value: numberFormatter.format(Math.round(stats?.total_km ?? 0)) },
  ];

  return (
    <div className="flex flex-1 flex-col bg-background">
      <header className="border-b border-white/10">
        <div className="mx-auto flex h-16 w-full max-w-5xl items-center justify-between px-6">
          <Logo />
          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="flex h-10 items-center justify-center rounded-full px-4 text-sm font-medium text-zinc-300 transition-colors hover:bg-white/[.06] hover:text-white"
            >
              Se connecter
            </Link>
            <Link
              href="/signup"
              className="flex h-10 items-center justify-center rounded-full bg-accent px-4 text-sm font-semibold text-black transition-colors hover:bg-accent-hover"
            >
              Créer un compte
            </Link>
          </div>
        </div>
      </header>

      <section className="relative flex flex-col items-center gap-6 overflow-hidden px-6 py-24 text-center">
        <div
          aria-hidden
          className="pointer-events-none absolute top-[-12rem] left-1/2 h-[28rem] w-[42rem] -translate-x-1/2 rounded-full opacity-25 blur-[100px]"
          style={{
            background:
              "radial-gradient(circle, #39D353 0%, #4D96FF 45%, transparent 75%)",
          }}
        />

        <span className="relative text-xs font-semibold tracking-widest text-zinc-400 uppercase">
          Course à pied · Compétition par pays
        </span>
        <h1 className="relative max-w-2xl text-4xl font-semibold tracking-tight text-white sm:text-5xl">
          Chaque foulée compte, pour toi et pour ton pays
        </h1>
        <p className="relative max-w-xl text-lg text-zinc-400">
          Connecte ton compte Strava : chacune de tes sorties valides te rapporte des points
          chaque semaine. Débutant ou confirmé, ta régularité et ta progression font gagner ton
          pays dans un classement mondial par équipes.
        </p>
        <Link
          href="/signup"
          className="relative flex h-12 items-center justify-center rounded-full bg-accent px-8 text-sm font-semibold text-black transition-colors hover:bg-accent-hover"
        >
          Rejoindre gratuitement
        </Link>

        <dl className="relative mt-8 grid w-full max-w-2xl grid-cols-3 gap-4">
          {STATS.map(({ label, value }) => (
            <div
              key={label}
              className="flex flex-col items-center gap-1 rounded-2xl border border-white/10 bg-surface/60 px-4 py-5"
            >
              <dt className="order-2 text-xs text-zinc-400">{label}</dt>
              <dd className="order-1 text-2xl font-semibold tracking-tight text-white">
                {value}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="mx-auto grid w-full max-w-5xl gap-8 px-6 pb-24 sm:grid-cols-3">
        {FEATURES.map(({ icon: Icon, title, description }) => (
          <div key={title} className="flex flex-col items-start gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-accent/15">
              <Icon size={20} stroke={1.75} className="text-accent" />
            </span>
            <h2 className="text-base font-semibold tracking-tight text-white">{title}</h2>
            <p className="text-sm text-zinc-400">{description}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
