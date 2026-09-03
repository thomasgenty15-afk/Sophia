import { parseBooleanEnv } from "./prelaunch";

// ── `VITE_B2C_ONLY` — LE MONDE PRO EST OCCULTÉ, PAS SUPPRIMÉ ───────────────
//
// Lancement B2C : pendant cette période, le site ne vend qu'AU FOYER. Les
// quatre pages professionnelles (`/pro`, `/coaches`, `/gyms`, `/communities`),
// l'inscription coach de `/auth` et l'accès à l'espace coach sont retirés de
// la surface.
//
// ⚠️ UN INTERRUPTEUR, PAS UNE SUPPRESSION, et c'est l'arbitrage central. Le
// travail pro (huit écrans coach, `coach-signup-v1`, la doctrine, le protocole,
// la facturation au siège) reste EN PLACE et continue de typechecker. Le jour
// où le pro rouvre, c'est une variable d'environnement qui change — pas un
// revert à démêler au milieu de trois semaines de commits B2C.
//
// ── CE QUE CE DRAPEAU NE FAIT PAS ─────────────────────────────────────────
// Il n'est PAS une frontière de sécurité, et il ne prétend pas l'être. C'est du
// code client, servi au visiteur, lisible dans le bundle. Ce qu'il ferme, ce
// sont les PORTES : plus aucun chemin ne mène au monde pro, et la porte de
// `/auth` refuse. RLS et les fonctions edge restent exactement ce qu'elles
// étaient — `coaches` n'a toujours aucune policy d'INSERT, et `coach-signup-v1`
// reste le seul écrivain de cette table.
//
// ── L'EXCEPTION `internal_admins`, ET POURQUOI ELLE EST OBLIGATOIRE ────────
// Le refus de connexion (`/auth`) DÉCONNECTE le compte. Sans exception, un
// compte à la fois admin interne et coach se verrait fermer TOUT le produit —
// `/admin` compris — pour une raison qui ne concerne que l'espace pro. Le
// carve-out est donc une condition de non-régression, pas une faveur.
// Voir `isProAccessRefused` dans `keel/api/postLogin.ts`.

export function isProSurfaceHidden(): boolean {
  return parseBooleanEnv(getProSurfaceRawValue(), false);
}

export function getProSurfaceRawValue(): string {
  return String(import.meta.env.VITE_B2C_ONLY ?? "").trim();
}
