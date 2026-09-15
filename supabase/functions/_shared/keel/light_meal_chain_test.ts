/**
 * ══════════════════════════════════════════════════════════════════════════
 * LOT 2.2 — LE « + REPAS LÉGER » VA DE L'ÉCRAN JUSQU'AU PROMPT.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⛔ LE TROU MESURÉ. Le verdict de bêta du 2026-09-14 portait, en blocage B2:
 * « Préférence "dîner léger" non tracée UI → RPC → prompt ». Le profil maintien
 * de la campagne n'avait JAMAIS été mesuré pour cette raison: le harnais
 * écrivait `size: light` dans le rythme, un canal que le moteur ne lit pas, et
 * personne ne pouvait dire où la réponse se perdait. Chaque maillon avait ses
 * tests; la JOINTURE n'en avait aucun.
 *
 * Ce fichier suit UNE réponse — « le dîner pèse moins ce soir » — à travers les
 * quatre maillons, avec les VRAIES fonctions des deux côtés:
 *
 *   ① l'écran sérialise      `habitEntriesToWrite` (frontend/lib/mealExtras.ts)
 *   ② la base la range         `household_member_habits.slots` (même colonne que la prose)
 *   ③ le moteur relit        `parseMemberLight` (household_habits.ts)
 *   ④ le prompt le dit       `household_prompt_v34.ts` → « dinner (light) »
 *
 * ⚠️ ① EST IMPORTÉ DU FRONTEND, PAS RECOPIÉ. Une copie du sérialiseur ici
 * serait verte le jour où l'écran change d'avis — c'est très exactement le mode
 * d'échec que ce test existe pour attraper.
 */
import { assert, assertEquals } from "jsr:@std/assert@1";

import { habitEntriesToWrite } from "../../../../frontend/src/keel/lib/mealExtras.ts";
import { parseMemberLight, parseMemberHabits } from "./household_habits.ts";

// ⛔ LA RÉPONSE, POSÉE UNE FOIS. Tout le fichier la suit; aucune étape n'a le
// droit de la réécrire pour s'arranger.
const OCCASIONS = ["breakfast", "lunch", "dinner"] as const;
const REPONSE_ECRAN = {
  habits: {} as Record<string, string>,
  light: { dinner: true },
  occasions: OCCASIONS,
};

Deno.test("① l'écran écrit une entrée pour un moment dont SEUL le léger est répondu", () => {
  const ecrit = habitEntriesToWrite(REPONSE_ECRAN);
  // Une bulle cochée sans prose est une réponse: sans cette entrée, la réponse
  // n'atteindrait jamais la base — et l'écran montrerait une bulle allumée que
  // personne n'a enregistrée.
  assertEquals(ecrit.length, 1);
  assertEquals(ecrit[0].slot, "dinner");
  assertEquals(ecrit[0].light, true);
});

Deno.test("③ le moteur relit CE QUE l'écran a écrit, sans adaptateur", () => {
  // ⚠️ AUCUNE TRANSFORMATION ENTRE LES DEUX. La sortie du sérialiseur est
  // passée telle quelle au parseur du moteur: c'est la jointure qui manquait.
  const enBase = habitEntriesToWrite(REPONSE_ECRAN);
  assertEquals(parseMemberLight(enBase), { dinner: true });

  // Et la prose reste vide: `parseMemberHabits` jette les entrées muettes, ce
  // qui est voulu — c'est pour ça que `light` voyage à côté, pas dedans.
  assertEquals(parseMemberHabits(enBase).length, 0);
});

Deno.test("③bis la dérivation du handler ne garde que les moments COCHÉS", () => {
  // La ligne du handler, à l'identique: `Object.entries(light).filter(on ===
  // true).map(slot)`. Un `false` explicite (« non, il ne pèse pas moins ») ne
  // doit pas devenir un dîner léger.
  const mixte = habitEntriesToWrite({
    habits: { lunch: "je mange au bureau" },
    light: { dinner: true, lunch: false },
    occasions: OCCASIONS,
  });
  const light = parseMemberLight(mixte);
  assertEquals(light, { dinner: true, lunch: false });
  const lightSlots = Object.entries(light)
    .filter(([, on]) => on === true)
    .map(([slot]) => slot);
  assertEquals(lightSlots, ["dinner"]);
});

Deno.test("⛔ LE CÂBLAGE DU HANDLER: une seule dérivation, depuis CETTE lecture", async () => {
  const src = await Deno.readTextFile(
    new URL("../../generate-household-meal-v1/index.ts", import.meta.url),
  );
  // La RPC qui rend la colonne, le parseur, puis les deux champs qui en
  // descendent. Un maillon renommé sans l'autre casse ici, pas en production.
  assert(src.includes('admin.rpc("keel_household_habits_for"'), "la RPC des habitudes");
  assert(src.includes("light: parseMemberLight(row.slots),"), "le parseur du léger");
  assert(src.includes("mealLight: rawHabits.get(r.member_id)?.light ?? {},"));
  assert(
    src.includes(
      'lightSlots: Object.entries(rawHabits.get(r.member_id)?.light ?? {})',
    ),
    "la dérivation des moments légers",
  );
  // ⚠️ UNE SEULE. Deux dérivations diraient deux listes pour une même bouche.
  assertEquals(
    (src.match(/lightSlots: Object\.entries\(/g) ?? []).length,
    1,
  );
});

Deno.test("④ le prompt DIT le moment léger, et ne le dit que là", async () => {
  const src = await Deno.readTextFile(new URL("./household_prompt_v34.ts", import.meta.url));
  // ⛔ LE SEUL ENDROIT OÙ LE MODÈLE L'APPREND. Sans cette ligne, la préférence
  // traverse toute la pile pour mourir avant le prompt — le défaut B2 exact.
  assert(src.includes("const light = new Set(m.lightSlots ?? []);"));
  assert(
    src.includes('light.has(o.slot) ? `${o.slot} (light)` : o.slot'),
    "le moment coché doit se dire `(light)` au modèle",
  );
});
