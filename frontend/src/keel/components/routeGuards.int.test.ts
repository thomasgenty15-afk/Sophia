import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * L8/O2 — LA PORTE PAR LAQUELLE UN SECONDAIRE PREND LA MAIN.
 *
 * ── LE DÉFAUT QUE CE TEST GARDE, ET IL A ÉTÉ MESURÉ PAR LA LECTURE ────────
 * `KeelStudentRoute` exige `profiles.keel_role = 'student'`. La réclamation
 * d'un profil de foyer ne l'écrit PAS, et la migration le dit en toutes lettres
 * (20260811060000: « LE RÔLE N'EST PAS ÉCRIT »). Tant que `/app/plan` était
 * derrière cette garde, un compte secondaire y lisait « tu n'es pas un élève »
 * — c'est-à-dire que le seul écran où le modèle lui demande d'agir lui était
 * fermé. D2: `generate-meal-v1` ne sert QUE les comptes secondaires qui
 * prennent la main et les comptes individuels sans foyer.
 *
 * Sans cette porte, le bouton de prise de main (`keel_validate_meal_plan`) est
 * du code que personne ne peut atteindre, et la fusion, la défusion et
 * l'avertissement de D8 n'existent pour aucun utilisateur réel.
 *
 * ── POURQUOI UN TEST DE SOURCE ───────────────────────────────────────────
 * La suite de ce dépôt ne monte pas de composant (environnement `node`). Une
 * garde de navigation se relit donc dans le routeur, comme les tests de
 * position du serveur relisent l'ordre des refus: ça ne prouve pas que l'écran
 * s'affiche, ça prouve que la porte n'a pas été refermée par distraction.
 */

const APP = readFileSync(resolve(__dirname, "../../App.tsx"), "utf8");

/** Le bloc `<Route …>` qui déclare ce chemin, jusqu'à sa fermeture. */
function routeBlock(path: string): string {
  const at = APP.indexOf(`path="${path}"`);
  expect(at, `la route ${path} a disparu du routeur`).toBeGreaterThan(0);
  return APP.slice(at, at + 400);
}

describe("les gardes de route KEEL", () => {
  it("laisse un membre de foyer atteindre /app/plan", () => {
    // C'est là que vit `MealBuilder`, donc la composition d'un plan personnel
    // ET le bouton qui le valide.
    expect(routeBlock("/app/plan")).toContain("<KeelHouseholdRoute>");
  });

  it("laisse un membre de foyer atteindre /app/household", () => {
    // La correction du lot 6, pour la même population et la même raison. Elle
    // est ici pour que les deux portes bougent ensemble ou pas du tout.
    expect(routeBlock("/app/household")).toContain("<KeelHouseholdRoute>");
  });

  it("garde les écrans de coaching derrière la garde ÉLÈVE", () => {
    // LE CAS QUI PASSE, et sans lui ce fichier dirait seulement « tout est
    // ouvert »: `/app/today`, `/app/chat` et `/app/progress` n'ont rien à
    // montrer à quelqu'un sans coach ni plan prescrit, et c'est le motif écrit
    // dans `KeelHouseholdRoute` pour ne PAS écrire `keel_role` à la
    // réclamation. Les élargir serait une décision, pas un oubli.
    for (const path of ["/app/today", "/app/chat", "/app/progress"]) {
      expect(routeBlock(path), path).toContain("<KeelStudentRoute>");
    }
  });
});
