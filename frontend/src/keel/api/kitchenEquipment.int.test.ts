import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  constraintsFromRow,
  initialKitchenSelection,
  KITCHEN_EQUIPMENT_KEY,
  KITCHEN_TOOLS,
  planKitchenEquipmentWrite,
  readKitchenEquipment,
  toggleKitchenTool,
} from "./kitchenEquipment";
// ⚠️ LE MODULE SERVEUR EST IMPORTÉ, PAS RECOPIÉ DANS LE TEST. Patron de
// `api/cookingShape.int.test.ts` et de `api/householdReference.int.test.ts`:
// une seconde définition d'une même règle est une divergence en attente, et
// c'est celle qu'on regarde le moins qui garde l'ancien comportement. Ce qu'on
// épingle ici est très exactement que les DEUX listes de jetons sont la même,
// dans le même ordre, et que les DEUX lecteurs refusent la même chose.
import {
  hasKitchenTool,
  KITCHEN_EQUIPMENT_KEY as SERVER_KEY,
  KITCHEN_TOOLS as SERVER_KITCHEN_TOOLS,
  readKitchenEquipment as serverReadKitchenEquipment,
} from "../../../../supabase/functions/_shared/keel/kitchen_equipment.ts";

/**
 * L2-A — LES MOYENS DE CUISSON, DE L'ÉCRAN JUSQU'À LA COLONNE.
 *
 * ── CE QUE CE FICHIER PROTÈGE ─────────────────────────────────────────────
 * Quatre défauts peuvent casser ce lot sans que rien n'échoue:
 *
 *   ① les deux listes de jetons divergent — l'écran écrit `hob`, le serveur
 *      lit `stovetop`, et la déclaration disparaît en silence;
 *   ② « on ne m'a rien demandé » se lit « je n'ai rien » — et le premier plan
 *      généré après ce lot retire le four et le congélateur à TOUS les comptes
 *      créés avant aujourd'hui;
 *   ③ `[]` s'écrit en base — un foyer déclaré sans aucun moyen de cuisson,
 *      c'est-à-dire un foyer à qui ce produit n'a plus rien à composer;
 *   ④ la clé se met à voyager dans le corps de la requête au lieu de vivre
 *      dans la colonne, ou l'inverse — deux chemins pour un seul fait, et
 *      c'est toujours celui que l'écran ne montre pas qui gagne.
 */

const ROOT = resolve(__dirname, "../../../..");

/** ⚠️ COMMENTAIRES RETIRÉS — cicatrice `caller-audit-must-strip-comments`. */
function code(rel: string): string {
  return readFileSync(resolve(ROOT, rel), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .split("\n")
    .map((line) => {
      const at = line.indexOf("//");
      if (at < 0) return line;
      if (at > 0 && line[at - 1] === ":") return line;
      return line.slice(0, at);
    })
    .join("\n");
}

describe("① les deux bouts nomment les mêmes sept outils", () => {
  it("la liste de l'écran est celle du serveur, dans le même ordre", () => {
    expect([...KITCHEN_TOOLS]).toEqual([...SERVER_KITCHEN_TOOLS]);
  });

  it("la clé de colonne est la même des deux côtés", () => {
    // Une clé qui diverge écrit dans un jsonb libre sans erreur: la colonne
    // porterait `kitchen_equipment` d'un côté et `kitchenEquipment` de
    // l'autre, et le lecteur ne verrait jamais rien.
    expect(KITCHEN_EQUIPMENT_KEY).toBe(SERVER_KEY);
    expect(KITCHEN_EQUIPMENT_KEY).toBe("kitchen_equipment");
  });

  it("les deux lecteurs rendent la même chose sur les mêmes entrées", () => {
    const cases: unknown[] = [
      undefined,
      [],
      ["oven"],
      ["freezer", "oven"],
      ["oven", "fourneau"],
      ["fourneau"],
      "oven",
      { oven: true },
    ];
    for (const value of cases) {
      const pc = value === undefined ? {} : { kitchen_equipment: value };
      const front = readKitchenEquipment(pc);
      const back = serverReadKitchenEquipment(pc);
      expect(front === null ? null : [...front], JSON.stringify(value)).toEqual(
        back === null ? null : [...back],
      );
    }
  });
});

describe("② « rien demandé » n'est pas « rien »", () => {
  it("une colonne sans la clé rend `null`, jamais `[]`", () => {
    // ⚠️ LE TEST QUI VAUT LE LOT. Tous les comptes qui existent aujourd'hui
    // sont dans ce cas.
    expect(readKitchenEquipment({})).toBeNull();
    expect(readKitchenEquipment(null)).toBeNull();
    expect(readKitchenEquipment({ cooking_time_min: 30 })).toBeNull();
  });

  it("l'écran d'un compte jamais interrogé n'affiche AUCUNE case cochée", () => {
    // Le pendant visible de la garde: `null` ⇒ sélection vide à l'écran, et
    // rien n'est écrit tant que personne n'a coché. « Coche automatique =
    // faits faux indémentables ».
    expect([...initialKitchenSelection(null)]).toEqual([]);
    expect([...initialKitchenSelection({})]).toEqual([]);
  });

  it("un compte qui a répondu retrouve SES cases, et elles seules", () => {
    expect([...initialKitchenSelection({ kitchen_equipment: ["freezer", "oven"] })])
      .toEqual(["oven", "freezer"]);
  });

  it("`hasKitchenTool` distingue les trois cas", () => {
    const asked = readKitchenEquipment({ kitchen_equipment: ["oven"] });
    expect(hasKitchenTool(asked, "oven")).toBe(true);
    expect(hasKitchenTool(asked, "freezer")).toBe(false);
    expect(hasKitchenTool(null, "freezer")).toBeNull();
  });
});

describe("③ la sélection vide est refusée AVANT le réseau", () => {
  it("rien de coché ⇒ un refus nommé, pas une écriture", () => {
    expect(planKitchenEquipmentWrite([])).toEqual({ ok: false, reason: "empty" });
  });

  it("des jetons tous inconnus ⇒ le même refus", () => {
    // Sans ça, `["fourneau"]` s'écrirait comme `[]` après filtrage: une
    // déclaration vide en base, exactement ce que le refus existe pour éviter.
    expect(planKitchenEquipmentWrite(["fourneau", "", "microondes"]))
      .toEqual({ ok: false, reason: "empty" });
  });

  it("une sélection lisible passe, dans l'ordre de la liste", () => {
    expect(planKitchenEquipmentWrite(["blender", "oven", "microwave"]))
      .toEqual({ ok: true, tools: ["oven", "microwave", "blender"] });
  });

  it("l'ordre écrit est celui de la liste, pas celui des clics", () => {
    // Deux foyers qui cochent les mêmes cases dans un ordre différent doivent
    // écrire la MÊME chose: sinon la consigne bouge sans qu'aucun fait n'ait
    // changé, et le cache de prompt saute pour rien.
    const a = planKitchenEquipmentWrite(["freezer", "oven"]);
    const b = planKitchenEquipmentWrite(["oven", "freezer"]);
    expect(a).toEqual(b);
  });

  it("un doublon ne double pas la déclaration", () => {
    expect(planKitchenEquipmentWrite(["oven", "oven", " OVEN "]))
      .toEqual({ ok: true, tools: ["oven"] });
  });
});

describe("la case se coche et se décoche, sans perdre l'ordre", () => {
  it("cocher ajoute à sa place, pas à la fin", () => {
    expect([...toggleKitchenTool(["freezer"], "oven")]).toEqual(["oven", "freezer"]);
  });

  it("re-cliquer décoche", () => {
    expect([...toggleKitchenTool(["oven", "freezer"], "oven")]).toEqual(["freezer"]);
  });

  it("tout décocher rend une sélection vide, que l'écrivain refusera", () => {
    // La carte DOIT pouvoir arriver à zéro coche — sinon on ne peut pas
    // corriger une erreur. C'est l'ÉCRITURE qui refuse, pas la case.
    expect([...toggleKitchenTool(["oven"], "oven")]).toEqual([]);
    expect(planKitchenEquipmentWrite(toggleKitchenTool(["oven"], "oven")).ok)
      .toBe(false);
  });
});

describe("④ la donnée vit dans la colonne, et nulle part ailleurs", () => {
  it("l'écriture passe par le propriétaire de la colonne", () => {
    const src = code("frontend/src/keel/api/kitchenEquipment.ts");
    // `mergePracticalConstraints` porte l'étalement (deux cartes ouvertes ne
    // se désécrivent pas) ET le refus d'un update qui n'a touché aucune ligne
    // — PostgREST répond 204 sans erreur, et l'écran affichait « Enregistré ».
    //
    // ⚠️ ON ÉPINGLE L'APPEL, PAS LA MENTION, ET C'EST UN DURCISSEMENT MESURÉ.
    // La première version cherchait `toContain("mergePracticalConstraints")`:
    // la mutation qui remplace l'appel par un écrivain maison laisse l'IMPORT
    // en place, donc le nom est toujours dans le fichier et le test restait
    // VERT (M14, 2026-08-18). Une garde qui ne mord pas ressemble trait pour
    // trait à une garde qui marche.
    expect(src, "l'écriture court-circuite le propriétaire de la colonne")
      .toMatch(/await\s+mergePracticalConstraints\(\{/);
    // ⚠️ C'EST L'ÉCRITURE QUI EST INTERDITE EN DIRECT, PAS LA LECTURE. Ce
    // module LIT bien `student_goals` — c'est la relecture fraîche du §⑤, et
    // elle est le correctif, pas le défaut. Ce qu'on refuse est un `update` /
    // `upsert` / `insert` maison, qui contournerait l'étalement et le refus
    // d'un update à zéro ligne.
    //
    // ⚠️ ON REGARDE LA CHAÎNE, PAS LE FICHIER. Une recherche de `.delete(` sur
    // tout le module accuse `Set#delete` dans `toggleKitchenTool` — rouge au
    // premier lancement, sur un module parfaitement correct. Une garde qui se
    // trompe de sujet finit désarmée.
    //
    // ⚠️ ET ON LES REGARDE TOUTES, PAS LA PREMIÈRE — SECOND DURCISSEMENT,
    // MESURÉ LE 2026-08-18 (L2-B, mutation M21). La version d'avant partait de
    // `src.indexOf('from("student_goals")')`: elle n'inspectait donc QUE la
    // première requête. Un second écrivain maison ajouté PLUS BAS dans le
    // fichier — un `.update()` direct, écrit après la fusion — laissait la
    // suite entièrement VERTE, parce que le comptage d'écrivains ci-dessous ne
    // compte que les appels à `mergePracticalConstraints` et ne voit pas une
    // requête écrite à la main. On épingle donc d'abord qu'il n'y a QU'UNE
    // seule requête vers cette table, puis on juge chacune.
    const statements = src.split('from("student_goals")').slice(1)
      .map((chain) => chain.slice(0, chain.indexOf(";")));
    expect(
      statements.length,
      "ce module parle à `student_goals` ailleurs que dans sa relecture",
    ).toBe(1);
    for (const statement of statements) {
      expect(statement, "la seule requête directe n'est plus une lecture")
        .toContain(".select(");
      for (const verb of [".update(", ".upsert(", ".insert(", ".delete("]) {
        expect(statement, `l'écriture parle directement à la table (${verb})`)
          .not.toContain(verb);
      }
      // ⚠️ ET LA LECTURE EST SCOPÉE. Sans `.eq("user_id", …)`, quelqu'un qui
      // est à la fois coach et mangeur relit la ligne d'un de ses élèves et
      // fusionne dessus — RLS ne remplace pas un `.eq(user_id)`, cicatrice de
      // cette table.
      expect(statement, "la relecture n'est plus scopée sur le compte")
        .toContain('.eq("user_id"');
    }
    // Un seul écrivain: deux appels voudraient dire deux patches, donc une
    // seconde écriture capable d'effacer la première.
    expect(
      src.split("mergePracticalConstraints(").length - 1,
      "il y a plus d'un écrivain dans ce module",
    ).toBe(1);
  });

  /**
   * ⑤ LA PHOTO PRISE AU MONTAGE — la cicatrice la plus chère de cette colonne,
   * et cette carte tombe très exactement dedans.
   *
   * `mergePracticalConstraints` réécrit l'objet EN ENTIER. Sur l'étape `table`,
   * le « Continuer » écrit `diet_asked` dans la même colonne à la seconde d'à
   * côté: fusionner sur un `current` lu au montage l'efface. Mesuré deux fois
   * le 2026-08-15 (`SetupPage:1119`, `SetupPage:1456`) — « Je mange de tout »
   * ne survivait jamais, et l'étape retenait sur une question à laquelle on
   * venait de répondre.
   */
  it("l'écrivain N'ACCEPTE PAS de `current` — un paramètre ignoré finit honoré", () => {
    const src = code("frontend/src/keel/api/kitchenEquipment.ts");
    const signature = src.slice(
      src.indexOf("export async function saveKitchenEquipment"),
    ).slice(0, 200);
    expect(signature, "l'écrivain accepte encore une photo d'état")
      .not.toContain("current");
  });

  it("l'écrivain RELIT la colonne avant de fusionner, jamais après", () => {
    const src = code("frontend/src/keel/api/kitchenEquipment.ts");
    const body = src.slice(src.indexOf("export async function saveKitchenEquipment"));
    const read = body.indexOf("readFreshConstraints(");
    const merge = body.indexOf("mergePracticalConstraints(");
    expect(read, "plus aucune relecture avant l'écriture").toBeGreaterThan(-1);
    expect(read, "la relecture arrive après la fusion").toBeLessThan(merge);
  });

  it("la carte ne passe PAS sa photo à l'écrivain", () => {
    const src = code("frontend/src/keel/components/KitchenEquipmentCard.tsx");
    const call = src.slice(src.indexOf("saveKitchenEquipment({")).slice(0, 160);
    expect(call, "la carte repasse sa photo d'état au moment d'écrire")
      .not.toContain("practicalConstraints");
  });

  it("le décideur pur est bien CÂBLÉ sur la lecture réseau", () => {
    // ⚠️ SANS CETTE LIGNE, LA CEINTURE EST ARMÉE SUR UN COFFRE VIDE. Les trois
    // tests de `constraintsFromRow` ci-dessous l'appellent EN DIRECT: ils
    // resteraient verts si la lecture réseau cessait de passer par lui et se
    // remettait à avaler l'erreur. C'est la cicatrice
    // `safety-constraints-armed-belt-empty-vault`, en miniature.
    const src = code("frontend/src/keel/api/kitchenEquipment.ts");
    const reader = src.slice(src.indexOf("async function readFreshConstraints"));
    const body = reader.slice(0, reader.indexOf("\n}"));
    expect(body, "la lecture réseau ne passe plus par `constraintsFromRow`")
      .toContain("constraintsFromRow(");
  });

  it("⛔ une lecture ratée LÈVE — elle ne rend jamais un objet vide", () => {
    // Rendre `{}` ferait fusionner sur du néant, c'est-à-dire ÉCRASER le
    // rythme, le budget, le régime et les préférences avec la seule clé de
    // cette carte. Un incident réseau deviendrait une perte de données.
    expect(() =>
      constraintsFromRow({ error: { message: "network down" }, row: null })
    ).toThrow(/could not read/i);
  });

  it("une ligne absente ou une colonne nulle rendent `{}`, sans lever", () => {
    // Il n'y a alors rien à conserver — et « aucune ligne » est de toute façon
    // rattrapé par le refus de `mergePracticalConstraints`.
    expect(constraintsFromRow({ error: null, row: null })).toEqual({});
    expect(constraintsFromRow({ error: null, row: { practical_constraints: null } }))
      .toEqual({});
    // Une valeur qui n'est pas un objet ne se répand pas: `{...["a"]}` rendrait
    // `{0:"a"}`, c'est-à-dire une colonne remplie de bruit.
    expect(constraintsFromRow({ error: null, row: { practical_constraints: ["a"] } }))
      .toEqual({});
  });

  it("ce qui est déjà dans la colonne traverse intact", () => {
    const kept = { eating_rhythm: [{ slot: "lunch" }], diet_asked: true };
    expect(constraintsFromRow({ error: null, row: { practical_constraints: kept } }))
      .toEqual(kept);
  });

  it("le module d'API n'importe AUCUNE clé de langue", () => {
    // Règle mesurée sur `cookingShape.ts`: `pageSeams.int.test.ts` attribue
    // chaque littéral de clé à toutes les pages qui atteignent le module.
    const src = code("frontend/src/keel/api/kitchenEquipment.ts");
    expect(src).not.toContain("i18n/t");
    expect(src).not.toMatch(/"setup\.[a-z_.]+"/);
  });

  it("le jeton ne voyage PAS dans le corps d'une requête de génération", () => {
    // Le budget et le mode de cuisson voyagent parce qu'ils décrivent LA
    // SEMAINE qu'on commande. Un four décrit la CUISINE: il est durable, il se
    // relit dans la colonne, et l'ajouter au corps ferait deux chemins pour un
    // seul fait.
    for (
      const rel of [
        "frontend/src/keel/api/household.ts",
        "frontend/src/keel/api/planDraft.ts",
        "frontend/src/keel/api/mealGeneration.ts",
      ]
    ) {
      expect(code(rel), `${rel} envoie l'équipement dans la requête`)
        .not.toContain("kitchen_equipment");
    }
  });

  // ⚠️ CE TEST A ÉTÉ RENVERSÉ LE 2026-08-18 (QA 01-injection, lane solo).
  //
  // Il gardait la frontière de lot L2-A: « ce lot COLLECTE, il ne parle pas au
  // modèle — c'est le lot L7 ». Il a tenu exactement ce qu'on lui demandait, et
  // ce qu'on lui demandait a fini par coûter: sur le run réel
  // `798c5cd6-acbf-43e3-8dcc-97128d3edd78`, un élève qui venait de cocher
  // « plaque, micro-ondes, blender » a reçu un plan dont la première session
  // commence par « Heat the oven » et dont le dîner est « roast potatoes ».
  //
  // Une contrainte documentée survit à sa cause: la garde disait toujours
  // « pas encore », personne ne revenait, et l'écran promettait « Your next
  // plan is built around this ». Le geste juste n'est pas de supprimer le test,
  // c'est de lui faire garder LA NOUVELLE VÉRITÉ — le tronc parle, et il ne dit
  // que des ABSENCES déclarées.
  it("le tronc PARLE au modèle, et seulement de ce qui MANQUE", () => {
    const engine = code("supabase/functions/_shared/keel/meal_generation.ts");
    // La ligne vient du module qui porte le jeton et le lecteur, jamais d'une
    // phrase réécrite dans le constructeur de prompt.
    expect(engine).toContain("kitchenEquipmentPromptLines");
    // ⚠️ ET LE CONSTRUCTEUR N'ÉCRIT AUCUNE PHRASE D'INTERDICTION LUI-MÊME: une
    // seconde formulation dériverait de la liste fermée sans que rien ne
    // l'attrape. (Le mot « oven » existe ailleurs dans ce fichier — le prompt
    // système explique qu'une cuisson au four est une PRÉPARATION. Ce qu'on
    // interdit ici, c'est une phrase qui INTERDIRAIT un outil.)
    for (const tool of KITCHEN_TOOLS) {
      expect(engine, `une phrase « no ${tool} » est écrite dans le tronc`)
        .not.toContain(`no ${tool}`);
    }
    // La lane foyer garde SON bloc (`kitchenBlock`, enveloppe v16): elle ne
    // passe pas l'équipement au tronc, sinon la consigne partirait deux fois.
    expect(code("supabase/functions/generate-household-meal-v1/index.ts"))
      .toContain("readKitchenEquipment");
  });
});
