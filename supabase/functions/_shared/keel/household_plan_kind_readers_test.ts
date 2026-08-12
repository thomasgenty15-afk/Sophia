/**
 * `household_id is not null` NE VEUT PAS DIRE « PLAN DU FOYER ».
 *
 * ⚠️ MESURÉ DEUX FOIS LE 2026-08-12, dans deux lecteurs indépendants qui
 * avaient fait la même lecture erronée du schéma.
 *
 *   · `household_turn_context.ts` rendait au chat le plan PERSONNEL du membre
 *     le plus récent. Chacun, le maître compris, s'entendait décrire les plats
 *     de quelqu'un d'autre comme le dîner de la maison.
 *   · `frontend/src/keel/api/household.ts` (`loadHouseholdMeal`) vidait la carte
 *     de composition du foyer dès qu'un secondaire générait un plan personnel
 *     commençant après celui du foyer: elle rendait sa ligne, qui n'a aucune
 *     `member_portions`.
 *
 * LA CAUSE EST DANS LE SCHÉMA, PAS DANS LES DEUX LECTEURS. `generate-meal-v1`
 * estampe `household_id` sur un plan PERSONNEL — exprès, pour que la fusion le
 * retrouve (L4). La colonne dit « à quel foyer se rattache ce plan », jamais
 * « ce plan est celui du foyer ». Seul `plan_kind` dit ça.
 *
 * L3 (la prise de main) a rendu la collision NOMINALE: prendre la main, c'est
 * précisément créer une ligne `personal` portant ce `household_id`. Le prochain
 * lecteur qui filtrera sur `household_id` seul tombera dedans le jour où il
 * sera écrit, pas des mois plus tard — d'où ce test, qui scanne au lieu
 * d'attendre.
 */
import { assert } from "jsr:@std/assert@1";

const ROOT = new URL("../../../../", import.meta.url);

/** Les lecteurs qui interrogent la table par le foyer. Ajoute-toi si tu en écris un. */
const READERS = [
  "supabase/functions/_shared/keel/household_turn_context.ts",
  "frontend/src/keel/api/household.ts",
  // L5 — le lecteur PARTAGÉ du plan du foyer: le générateur (fusion, défusion,
  // reprise collante) et le lecteur de propositions passent tous les deux par
  // lui. C'est aussi ce qui a retiré la requête du générateur de cette liste:
  // elle n'y est plus, elle est ici.
  "supabase/functions/_shared/keel/household_merge_notice_io.ts",
] as const;

Deno.test("tout lecteur qui filtre par foyer filtre AUSSI par plan_kind", async () => {
  for (const rel of READERS) {
    const src = await Deno.readTextFile(new URL(rel, ROOT));
    // On ne cherche pas n'importe où: seulement dans les requêtes qui visent
    // CETTE table. Un `household_id` ailleurs dans le fichier ne prouve rien.
    //
    // ⚠️ TOUTES LES REQUÊTES, ET PLUS SEULEMENT LA PREMIÈRE (L8). Ce test
    // lisait `indexOf` — donc la première occurrence — et un fichier déjà
    // listé pouvait recevoir un SECOND lecteur sans qu'aucune garde ne le
    // regarde. `frontend/src/keel/api/household.ts` en porte deux depuis L8
    // (le plan du foyer, et l'accès du maître au plan d'un secondaire).
    const offsets: number[] = [];
    for (
      let at = src.indexOf('.from("student_generated_meals")');
      at >= 0;
      at = src.indexOf('.from("student_generated_meals")', at + 1)
    ) {
      offsets.push(at);
    }
    assert(
      offsets.length > 0,
      `${rel}: plus aucune requête sur student_generated_meals — ce test est ` +
        `à réviser, pas à supprimer.`,
    );
    for (const from of offsets) {
      // La chaîne d'appel jusqu'au `.limit(` ou `;` qui la ferme.
      const chain = src.slice(from, from + 1200);
      const filtersByHousehold = /\.(eq|not)\(\s*["']household_id["']/.test(chain);
      if (!filtersByHousehold) continue;
      assert(
        /\.eq\(\s*["']plan_kind["']\s*,\s*["']household["']\s*\)/.test(chain),
        `${rel}: la requête filtre sur household_id SANS plan_kind. Un plan ` +
          `PERSONNEL porte aussi household_id: ce lecteur va rendre le plan ` +
          `d'un membre à la place de celui du foyer. C'est arrivé deux fois.`,
      );
    }
  }
});

Deno.test("l'accès du maître au plan d'un secondaire est scopé (L8/D9)", async () => {
  // ── POURQUOI CE TEST EXISTE ───────────────────────────────────────────────
  // D9 donne au maître l'ACCÈS à tous les plans, et l'écran le lui ouvre
  // (`loadMemberPersonalPlan`). Or la policy `student_generated_meals_household_read`
  // rend TOUTE ligne portant le foyer — y compris le plan personnel d'un AUTRE
  // secondaire. RLS ne remplace donc pas un `.eq("user_id")`: ce dépôt a déjà
  // rendu la ligne d'un élève à son coach faute de ce filtre.
  //
  // Et `plan_kind` est l'autre moitié, dans l'autre sens: sans lui, demander
  // « le plan de X » sur le compte du maître rendrait le plan DU FOYER.
  const src = await Deno.readTextFile(
    new URL("frontend/src/keel/api/household.ts", ROOT),
  );
  const at = src.indexOf("export async function loadMemberPersonalPlan");
  assert(
    at >= 0,
    "loadMemberPersonalPlan a disparu: si l'accès du maître aux plans a été " +
      "retiré, ce test est à retirer avec lui — pas à laisser passer.",
  );
  const body = src.slice(at, at + 1200);
  assert(
    /\.eq\(\s*["']user_id["']\s*,\s*userId\s*\)/.test(body),
    "loadMemberPersonalPlan ne scope plus par user_id: un secondaire lirait " +
      "le plan d'un autre secondaire.",
  );
  assert(
    /\.eq\(\s*["']plan_kind["']\s*,\s*["']personal["']\s*\)/.test(body),
    "loadMemberPersonalPlan ne filtre plus plan_kind='personal': elle peut " +
      "rendre le plan DU FOYER à la place du plan personnel demandé.",
  );
});

Deno.test("le générateur du foyer écrit bien plan_kind=household", async () => {
  // LE CAS QUI PASSE, et sans lui le test ci-dessus garde une porte qui ne
  // s'ouvre sur rien: si l'écrivain cessait d'estamper `household`, les deux
  // lecteurs seraient corrects ET vides.
  const src = await Deno.readTextFile(
    new URL("supabase/functions/generate-household-meal-v1/index.ts", ROOT),
  );
  assert(
    /p_plan_kind:\s*["']household["']/.test(src) ||
      /plan_kind:\s*["']household["']/.test(src),
    "generate-household-meal-v1 n'écrit plus plan_kind=household: les " +
      "lecteurs filtrent alors sur une valeur que personne ne produit.",
  );
});
