import { redirect } from "next/navigation";

// Sprint 11 : /classement a fusionné avec la page d'accueil "/", qui est
// maintenant le classement mondial (public + personnalisé si connecté).
// Redirect conservé pour ne pas casser d'éventuels liens/favoris existants.
export default function ClassementRedirect() {
  redirect("/");
}
