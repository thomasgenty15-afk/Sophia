import { assert, assertEquals } from "jsr:@std/assert@^1.0.0";

import {
  planTimingOf,
  withoutSpentFirstDay,
} from "./meal_plan_window.ts";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * TROIS JOURS DEMANDÉS À 20 H FONT UN PLAN DE DEUX JOURS — 2026-09-04
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * La décision, mot pour mot: « si la personne demande lundi mardi mercredi
 * alors qu'on est lundi 20h, alors il faut juste que le plan soit pour mardi et
 * mercredi. Et oui il peut y avoir un warning si besoin ».
 *
 * ⛔ ON GARDE LA FIN. La formule inverse — « trois demandés = trois nourris »,
 * qui irait chercher un jeudi — a été explicitement écartée. Le premier test de
 * ce fichier est donc celui de la DATE DE FIN, parce que c'est la propriété que
 * la décision porte et la seule qu'un futur lecteur pourrait « améliorer » à
 * l'envers sans s'en apercevoir.
 */

const LUNDI = "2026-09-07";
const MARDI = "2026-09-08";
const MERCREDI = "2026-09-09";
const TROIS_REPAS = ["breakfast", "lunch", "dinner"] as const;

Deno.test("la FIN ne bouge pas — c'est la décision, pas un effet de bord", () => {
  const out = withoutSpentFirstDay({ startsOn: LUNDI, durationDays: 3 }, {
    today: LUNDI,
    cookOnlyDay: null,
    declaredSlots: TROIS_REPAS,
    passedSlots: TROIS_REPAS,
  });
  assertEquals(out.startsOn, MARDI);
  assertEquals(out.durationDays, 2);
  assertEquals(out.dropped, "mon");
  assertEquals(out.refused, null);
  // ⛔ LA PROPRIÉTÉ CENTRALE, ÉCRITE COMME UNE ÉGALITÉ: début + durée est
  // invariant. Un lot qui « compenserait » en allongeant la fenêtre ferait
  // mercredi + 1 = jeudi, et ce test le dirait.
  const finAvant = new Date(LUNDI).getTime() + 3 * 86400000;
  const finApres = new Date(out.startsOn).getTime() + out.durationDays * 86400000;
  assertEquals(finApres, finAvant);
  assertEquals(new Date(finApres - 86400000).toISOString().slice(0, 10), MERCREDI);
});

Deno.test("⛔ LE PIÈGE: la veille de cuisine n'est JAMAIS mangée par le retrait", () => {
  // `withCookDayBefore` recule `startsOn`: quelqu'un qui a demandé la veille se
  // retrouve avec `startsOn === today` ET `cookOnlyDay === today`. Aujourd'hui
  // on ne mange pas, on cuisine — donc « tous les moments sont passés » est
  // trivialement vrai, et sans cette garde le lot mangerait la veille que la
  // personne vient de demander.
  const out = withoutSpentFirstDay({ startsOn: LUNDI, durationDays: 4 }, {
    today: LUNDI,
    cookOnlyDay: "mon",
    declaredSlots: TROIS_REPAS,
    passedSlots: TROIS_REPAS,
  });
  assertEquals(out.refused, "cook_day");
  assertEquals(out.startsOn, LUNDI);
  assertEquals(out.durationDays, 4);
  assertEquals(out.dropped, null);
});

Deno.test("un seul moment à venir suffit à tout garder", () => {
  const out = withoutSpentFirstDay({ startsOn: LUNDI, durationDays: 3 }, {
    today: LUNDI,
    cookOnlyDay: null,
    declaredSlots: TROIS_REPAS,
    passedSlots: ["breakfast", "lunch"],
  });
  assertEquals(out.refused, "slots_remain");
  assertEquals(out.startsOn, LUNDI);
  assertEquals(out.durationDays, 3);
});

Deno.test("une fenêtre d'UN jour ne se rétrécit pas — elle deviendrait vide", () => {
  // Générer zéro jour est pire que générer un plan court: on sert la fenêtre
  // demandée et le motif dit pourquoi elle est déjà entamée.
  const out = withoutSpentFirstDay({ startsOn: LUNDI, durationDays: 1 }, {
    today: LUNDI,
    cookOnlyDay: null,
    declaredSlots: TROIS_REPAS,
    passedSlots: TROIS_REPAS,
  });
  assertEquals(out.refused, "single_day");
  assertEquals(out.durationDays, 1);
  assertEquals(out.dropped, null);
});

Deno.test("une fenêtre qui commence demain n'a rien à retirer", () => {
  const out = withoutSpentFirstDay({ startsOn: MARDI, durationDays: 3 }, {
    today: LUNDI,
    cookOnlyDay: null,
    declaredSlots: TROIS_REPAS,
    passedSlots: TROIS_REPAS,
  });
  assertEquals(out.refused, "not_today");
  assertEquals(out.startsOn, MARDI);
});

Deno.test("un rythme illisible ne retire RIEN — fail-closed", () => {
  // Aucun moment déclaré ⇒ on ne sait pas dire que la journée est finie. Le
  // comportement d'avant ce lot, exactement: on ne rétrécit pas sur une
  // ignorance.
  const out = withoutSpentFirstDay({ startsOn: LUNDI, durationDays: 3 }, {
    today: LUNDI,
    cookOnlyDay: null,
    declaredSlots: [],
    passedSlots: [],
  });
  assertEquals(out.refused, "slots_remain");
  assertEquals(out.durationDays, 3);
});

Deno.test("le module est PUR: l'entrée ressort intacte", () => {
  const window = { startsOn: LUNDI, durationDays: 3 };
  const declared = [...TROIS_REPAS];
  const passed = [...TROIS_REPAS];
  withoutSpentFirstDay(window, {
    today: LUNDI,
    cookOnlyDay: null,
    declaredSlots: declared,
    passedSlots: passed,
  });
  assertEquals(window, { startsOn: LUNDI, durationDays: 3 });
  assertEquals(declared, [...TROIS_REPAS]);
  assertEquals(passed, [...TROIS_REPAS]);
});

// ---------------------------------------------------------------------------
// CE QUE LA PERSONNE LIT
// ---------------------------------------------------------------------------

Deno.test("le retrait DIT son motif, et il ne se confond avec aucun autre", () => {
  const timing = planTimingOf(
    { leadDay: null, reason: "after_cutoff" },
    { cookOnlyDay: null, startsOn: MARDI, refused: null },
    { dropped: "mon" },
  );
  assertEquals(timing, {
    kind: "starts_tomorrow",
    reason: "today_already_spent",
    lead_day: null,
  });
  // ⛔ ET SURTOUT PAS `same_morning`. « Courses et cuisson dès le matin » sur un
  // plan qui commence DEMAIN est un fait faux, et il est indémentable pour qui
  // le lit — c'est l'avertissement que le parseur du front porte déjà.
  assert(timing.kind !== "same_morning");
});

Deno.test("la veille l'emporte sur le retrait — les deux ne se croisent jamais", () => {
  // Ceinture: `withoutSpentFirstDay` refuse déjà `cook_day` quand une veille
  // existe, donc `dropped` ne peut pas être renseigné ici. Ce cas fige l'ORDRE
  // pour que personne ne l'inverse en croyant simplifier.
  const timing = planTimingOf(
    { leadDay: LUNDI, reason: "before_cutoff_today" },
    { cookOnlyDay: "mon", startsOn: LUNDI, refused: null },
    { dropped: "mon" },
  );
  assertEquals(timing.kind, "day_before");
});

Deno.test("sans retrait, le timing d'avant ce lot ne bouge pas", () => {
  const timing = planTimingOf(
    { leadDay: null, reason: "after_cutoff" },
    { cookOnlyDay: null, startsOn: LUNDI, refused: null },
    { dropped: null },
  );
  assertEquals(timing, {
    kind: "same_morning",
    reason: "after_cutoff",
    lead_day: null,
  });
});

// ---------------------------------------------------------------------------
// LE CÂBLAGE — parce qu'aucun test n'exécute la lane
// ---------------------------------------------------------------------------

/**
 * ⛔ CE FICHIER FERME LA MUTATION QUI, SANS LUI, NE ROUGIT NULLE PART.
 * `generate-meal-v1/index.ts` appelle `Deno.serve` au chargement: on ne peut
 * pas l'importer, donc rien n'exécute son câblage. Débrancher le retrait —
 * repasser `{ dropped: null }` à `planTimingOf`, ou dériver `daysToFill` AVANT
 * le retrait — laisserait `deno check` et toute la suite vertes, et la seule
 * chose qui changerait serait ce que la personne lit.
 *
 * ⚠️ ON ASSERTE DES ABSENCES ET DES ORDRES, PAS DES LIGNES. Épingler le texte
 * exact d'un appel photographie le code: ça rougit au premier argument ajouté
 * (c'est arrivé à `cook_the_day_before_test.ts` le jour même) et ça reste vert
 * si quelqu'un ajoute un cinquième lecteur mal câblé.
 */
async function laneSource(): Promise<string> {
  // SANS SES COMMENTAIRES: ce fichier RACONTE le défaut qu'il ferme en nommant
  // `dropped` et `planTimingOf` dans des pavés entiers. Un grep naïf y verrait
  // le câblage qu'il cherche et resterait vert le jour où il part.
  const src = await Deno.readTextFile(
    new URL("../../generate-meal-v1/index.ts", import.meta.url),
  );
  return src
    .split("\n")
    .map((l) => (l.trimStart().startsWith("//") ? "" : l))
    .join("\n")
    .replace(/\/\*[\s\S]*?\*\//g, "");
}

Deno.test("câblage — la lane solo passe son RETRAIT au timing, pas un zéro", async () => {
  const code = await laneSource();
  const appels = [...code.matchAll(/planTimingOf\(([^;]*?)\)/gs)];
  assertEquals(appels.length, 1, "un seul appel attendu dans la lane solo");
  const args = appels[0][1];
  assert(
    args.includes("spentFirstDay"),
    `planTimingOf ne reçoit pas le retrait: ${args.trim()}`,
  );
  assert(
    !/\{\s*dropped:\s*null\s*\}/.test(args),
    "la lane solo passe un retrait en dur — c'est le débranchement",
  );
});

Deno.test("câblage — `daysToFill` se dérive APRÈS le retrait, jamais avant", async () => {
  const code = await laneSource();
  const retrait = code.indexOf("withoutSpentFirstDay({");
  const derivation = code.indexOf("const daysToFill: string[] = windowDayOrder(");
  assert(retrait > 0, "`withoutSpentFirstDay` n'est plus appelé dans la lane");
  assert(derivation > 0, "`daysToFill` ne se dérive plus de `windowDayOrder`");
  // ⛔ L'ORDRE EST LE CÂBLAGE. Dérivé avant, `daysToFill` porterait la fenêtre
  // DEMANDÉE pendant que le verdict compterait la fenêtre RETENUE: deux vérités
  // dans le même plan, et c'est très exactement le défaut qu'on ferme.
  assert(
    derivation > retrait,
    "`daysToFill` est dérivé AVANT le retrait — la fenêtre annoncée et la fenêtre servie divergent",
  );
});

Deno.test("câblage — une seule lecture de l'heure alimente les deux questions", async () => {
  const code = await laneSource();
  const lectures = [...code.matchAll(/slotsPassedToday\(\{/g)];
  // Deux appels pourraient diverger, et c'est celui qu'on regarde le moins qui
  // garderait l'ancien état. `passedToday` sert au retrait ET au retrait des
  // moments passés plus bas.
  assertEquals(lectures.length, 1, "l'heure doit être lue UNE fois dans la lane");
  assert(code.includes("startsOn === todayDate ? passedToday : []"));
});

Deno.test("câblage — les deux refus qui comptent laissent une trace, les autres non", async () => {
  const code = await laneSource();
  // ⛔ SANS TRACE, UN LOT DÉSARMÉ RESSEMBLE TRAIT POUR TRAIT À UN LOT QUI
  // MARCHE. Quand le retrait ne mord pas, il n'écrit rien: aucune sortie ne
  // permet alors de dire si le module chargé est le neuf ou l'ancien. Les deux
  // refus « la journée EST dépensée mais on garde le jour » sont donc dits.
  assert(code.includes("spent_first_day_kept:"), "les refus utiles ne laissent aucune trace");
  assert(code.includes('spentFirstDay.refused === "cook_day"'));
  assert(code.includes('spentFirstDay.refused === "single_day"'));
  // ⚠️ ET LES DEUX CAS ORDINAIRES RESTENT MUETS: une ligne de bruit sur chaque
  // génération ferait cesser de lire le journal.
  assert(
    !code.includes('spentFirstDay.refused === "slots_remain"') &&
      !code.includes('spentFirstDay.refused === "not_today"'),
    "un refus ordinaire est journalisé — c'est du bruit sur chaque plan",
  );
});
