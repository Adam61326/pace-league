import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// "/" (classement mondial), "/classement" (redirect) et "/hall-of-fame"
// restent publics — voir Sprint 11 (accueil = classement) et Sprint 14
// (Hall of Fame public, comme le classement mondial).
const PROTECTED_PATHS = [
  "/dashboard",
  "/ligues",
  "/ligues-privees",
  "/mes-activites",
  "/parametres",
  "/badges",
];

// Onboarding pays (Sprint 15) : une connexion Google n'a jamais de
// country_code (pas de métadonnées OAuth équivalentes au champ du formulaire
// d'inscription classique). Exempté de PROTECTED_PATHS pour ne pas se
// rediriger vers lui-même.
const ONBOARDING_PATH = "/onboarding/pays";

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Ne pas insérer de logique entre createServerClient et getUser() :
  // getUser() est ce qui déclenche le rafraîchissement du token si besoin.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isProtected = PROTECTED_PATHS.some((path) =>
    request.nextUrl.pathname.startsWith(path)
  );

  if (isProtected && !user) {
    const redirectUrl = new URL("/login", request.url);
    redirectUrl.searchParams.set("redirectTo", request.nextUrl.pathname);
    return NextResponse.redirect(redirectUrl);
  }

  // Bloque l'accès au reste de l'app tant que le pays n'est pas renseigné
  // (CLAUDE.md Sprint 15) : ne concerne que les chemins déjà protégés
  // ci-dessus, jamais les pages publiques ("/", /classement, /hall-of-fame).
  if (isProtected && user && !request.nextUrl.pathname.startsWith(ONBOARDING_PATH)) {
    const { data: profile } = await supabase
      .from("users")
      .select("country_code")
      .eq("id", user.id)
      .single();

    if (!profile?.country_code) {
      return NextResponse.redirect(new URL(ONBOARDING_PATH, request.url));
    }
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
