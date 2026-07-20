import { Logo } from "@/components/logo";
import Link from "next/link";
import { SignupForm } from "./signup-form";

export default function SignupPage() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-8 bg-background px-6 py-16">
      <Link href="/">
        <Logo />
      </Link>
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-surface p-8 shadow-xl">
        <h1 className="mb-6 text-xl font-semibold tracking-tight text-white">Créer un compte</h1>
        <SignupForm />
      </div>
    </div>
  );
}
