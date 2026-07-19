import Link from "next/link";
import { SignupForm } from "./signup-form";

export default function SignupPage() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-8 bg-[#0A0A0A] px-6 py-16">
      <Link href="/" className="text-lg font-semibold tracking-tight text-white">
        PaceLeague
      </Link>
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#141414] p-8 shadow-xl">
        <h1 className="mb-6 text-xl font-semibold tracking-tight text-white">Créer un compte</h1>
        <SignupForm />
      </div>
    </div>
  );
}
