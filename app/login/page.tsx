import Link from "next/link";
import { LoginForm } from "./login-form";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const redirectTo =
    typeof params.redirectTo === "string" ? params.redirectTo : "/dashboard";
  const initialError = typeof params.error === "string" ? params.error : undefined;

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-8 bg-[#0A0A0A] px-6 py-16">
      <Link href="/" className="text-lg font-semibold tracking-tight text-white">
        PaceLeague
      </Link>
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#141414] p-8 shadow-xl">
        <h1 className="mb-6 text-xl font-semibold tracking-tight text-white">Connexion</h1>
        <LoginForm redirectTo={redirectTo} initialError={initialError} />
      </div>
    </div>
  );
}
