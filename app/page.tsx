import Link from "next/link";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 bg-zinc-50 px-6 text-center dark:bg-black">
      <h1 className="text-3xl font-semibold tracking-tight">Ligue Mondiale de Coureurs</h1>
      <p className="max-w-md text-lg text-zinc-600 dark:text-zinc-400">
        Connectez votre compte Strava et faites gagner des points à votre pays.
      </p>
      <div className="flex gap-4">
        <Link
          href="/signup"
          className="flex h-11 items-center justify-center rounded-full bg-foreground px-5 text-sm font-medium text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc]"
        >
          Créer un compte
        </Link>
        <Link
          href="/login"
          className="flex h-11 items-center justify-center rounded-full border border-black/[.08] px-5 text-sm font-medium transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:hover:bg-[#1a1a1a]"
        >
          Se connecter
        </Link>
      </div>
    </div>
  );
}
