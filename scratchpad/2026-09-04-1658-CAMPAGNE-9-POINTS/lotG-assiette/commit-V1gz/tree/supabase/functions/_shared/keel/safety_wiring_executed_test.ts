import { assert, assertEquals } from "jsr:@std/assert@^1.0.0";

/**
 * FF-A2 — LES TROIS FILS DE SÉCURITÉ, TENUS PAR CE QU'ILS FONT.
 *
 * ══ LE DÉFAUT QUE CE FICHIER EXISTE POUR FERMER, mesuré le 2026-08-23 ══════
 *
 * Un audit a muté 22 MOTEURS de sécurité: 22 rouges. Il a ensuite coupé 12
 * FILS — les points d'APPEL entre le moteur et le plan. **Dix des douze
 * coupures ont laissé la suite entièrement verte: 4 419 épreuves, 0 échec.**
 *
 * Les trois fils gardés ici, avec ce que leur coupure produit:
 *
 *   W6c  `generate-meal-v1/index.ts`  la ceinture de régime ne lit plus ni le
 *        titre ni le `why` du plat ⇒ « Roast chicken » ne déclenche plus rien
 *        chez un végane, parce que sa liste d'ingrédients est innocente.
 *   W6b  `generate-meal-v1/index.ts`  la brèche est bien calculée, mais plus
 *        poussée dans `issues` ⇒ elle n'est écrite NULLE PART: ni sur la ligne
 *        `student_generated_meals.generated_from`, ni dans la réponse HTTP.
 *   W9   `sophia-brain/router/run.ts` `detectDeclaredMedicalCondition` n'est
 *        jamais appelé ⇒ « je suis cœliaque » n'est plus jamais analysé, et le
 *        bloc de déférence clinique n'est plus jamais injecté.
 *
 * ⛔ ── POURQUOI CE FICHIER NE CHERCHE AUCUNE CHAÎNE DANS LA SOURCE ─────────
 *
 * Deux fils du dépôt sont DÉJÀ « protégés », et ils le sont MAL:
 * `dietary_regime_solo_lane_test.ts:442` et `household_regime_belt_test.ts:673`
 * font un `assertStringIncludes` sur le TEXTE SOURCE de la lane.
 *
 * **La preuve que ça ne suffit pas est arithmétique.** La coupure W6c désarme
 * exactement ce que l'épingle prétend garder, **en ne changeant que
 * l'ARGUMENT** passé au moteur:
 *
 *     prose: [dish.title, dish.why].filter(…)   ⟶   prose: []
 *
 * Le littéral épinglé — `scanDietaryRegime(`, `boxMemberDiets:`, `regime:` —
 * reste **intact**. La suite reste **verte**. Une garde qui lit du texte ne
 * peut pas voir un fil débranché à l'intérieur d'un appel: elle voit que
 * l'appel est écrit, jamais ce qu'on lui donne.
 *
 * ⟳ ── CE QUE FAIT CE FICHIER À LA PLACE: IL EXÉCUTE LA VRAIE RÉGION ───────
 *
 * Chaque épreuve ① lit le fichier de PRODUCTION, ② en découpe la région du fil
 * par des ancres **structurelles** — jamais par le littéral qu'on veut garder —,
 * ③ la ré-enveloppe dans un module `data:` importé dynamiquement, qui importe
 * les **vrais moteurs** par URL `file:`, ④ l'appelle avec de **vraies entrées**
 * et ⑤ asserte l'**effet observé dans sa sortie**.
 *
 * La propriété que ça achète, et qu'aucune épingle n'achète: **couper
 * l'argument À L'INTÉRIEUR de l'appel change ce que la région rend** ⇒ rouge.
 *
 * ⚠️ ── ET POURQUOI PAS UN HARNAIS DE HANDLER COMPLET ───────────────────────
 *
 * Parce que `W9` vit dans `processMessage`, **7 778 lignes**, derrière une
 * authentification, un dispatcher LLM et une trentaine de lectures de base.
 * La lane voisine a écrit un tel harnais pour le foyer (`Deno.serve` stubé,
 * `fetch` stubé): il coûte des centaines de lignes de doublures par fonction
 * edge, et il n'atteindrait toujours pas `run.ts`. La région exécutée donne la
 * MÊME propriété de détection sur les trois fils, au même prix.
 *
 * ⚠️ ── CE QUE CES ÉPREUVES NE PROUVENT PAS ────────────────────────────────
 *
 * Elles tiennent le fil jusqu'à la **sortie de la fonction edge**. Au-delà,
 * mesuré le 2026-08-23: `frontend/src/keel/api/mealGeneration.ts` — documenté
 * comme « le SEUL chemin » de la lane solo — contient **0 occurrence** de
 * `issues`, quand `frontend/src/keel/api/household.ts` les lit. La brèche de
 * régime atteint la ligne en base et le corps HTTP; **aucun écran solo ne la
 * regarde**. Ce n'est pas le lot de ce fichier — c'est une fiche.
 */

// ═══════════════════════════════════════════════════════════════════════════
// LE DÉCOUPEUR — DES ANCRES STRUCTURELLES, JAMAIS LE FIL LUI-MÊME
// ═══════════════════════════════════════════════════════════════════════════
//
// ⛔ RÈGLE DE CHOIX D'ANCRE, et c'est elle qui sépare ce fichier d'une épingle:
// une ancre ne doit JAMAIS être la ligne qu'on veut garder. Si elle l'était, la
// supprimer ferait échouer le DÉCOUPAGE — donc rougir pour une raison de texte,
// et le fichier serait redevenu un `assertStringIncludes` déguisé. Les ancres
// utilisées ici sont: la ligne `if (…) {` qui CONSOMME le fil, et une bannière
// de commentaire. Les deux survivent à chacune des trois coupures.

const MEAL_SRC = new URL("../../generate-meal-v1/index.ts", import.meta.url);
const RUN_SRC = new URL(
  "../../sophia-brain/router/run.ts",
  import.meta.url,
);
const DIETARY = new URL("./dietary_regime.ts", import.meta.url).href;
const TOKENS = new URL("./tokens.ts", import.meta.url).href;
const FLOOR = new URL("./medical_condition_floor.ts", import.meta.url).href;

async function sourceLines(url: URL): Promise<string[]> {
  return (await Deno.readTextFile(url)).split("\n");
}

const isBlank = (l: string) => l.trim() === "";
const isComment = (l: string) => {
  const t = l.trim();
  return t.startsWith("//") || t.startsWith("/*") || t.startsWith("*");
};

/** L'ancre doit être UNIQUE: deux occurrences et on ne sait plus ce qu'on exécute. */
function soleIndex(lines: string[], exact: string, what: string): number {
  const hits: number[] = [];
  lines.forEach((l, i) => {
    if (l === exact) hits.push(i);
  });
  assertEquals(
    hits.length,
    1,
    `ANCRE « ${what} »: ${hits.length} ligne(s) exactement égales à\n` +
      `  ${JSON.stringify(exact)}\n` +
      `Une ancre non unique ne désigne plus une région: réparer l'ancre, pas la garde.`,
  );
  return hits[0];
}

/**
 * Le bloc ouvert par `start`, refermé par la PREMIÈRE ligne suivante égale à
 * `closer`. `deno fmt` garantit l'indentation, donc un fermant à la même
 * colonne que l'ouvrant est bien le sien.
 */
function blockAt(
  lines: string[],
  start: number,
  closer: string,
  what: string,
): string {
  for (let i = start + 1; i < lines.length; i++) {
    if (lines[i] === closer) return lines.slice(start, i + 1).join("\n");
  }
  throw new Error(
    `RÉGION « ${what} »: aucun fermant ${
      JSON.stringify(closer)
    } après la ligne ${start + 1}.`,
  );
}

/** Le groupe d'instructions CONTIGU qui commence à `start` (fin: ligne vide ou commentaire). */
function groupAt(lines: string[], start: number): string {
  let end = start;
  while (
    end + 1 < lines.length && !isBlank(lines[end + 1]) &&
    !isComment(lines[end + 1])
  ) end++;
  return lines.slice(start, end + 1).join("\n");
}

/** Le groupe d'instructions qui précède immédiatement `anchor` (commentaires sautés). */
function groupBefore(lines: string[], anchor: number, what: string): string {
  let j = anchor - 1;
  while (j >= 0 && (isBlank(lines[j]) || isComment(lines[j]))) j--;
  assert(j >= 0, `RÉGION « ${what} »: rien avant l'ancre.`);
  let k = j;
  while (k - 1 >= 0 && !isBlank(lines[k - 1]) && !isComment(lines[k - 1])) k--;
  return lines.slice(k, j + 1).join("\n");
}

/** Le groupe d'instructions qui suit une bannière de commentaire. */
function groupAfter(lines: string[], anchor: number, what: string): string {
  let j = anchor + 1;
  while (j < lines.length && (isBlank(lines[j]) || isComment(lines[j]))) j++;
  assert(j < lines.length, `RÉGION « ${what} »: rien après l'ancre.`);
  return groupAt(lines, j);
}

/**
 * L'EXÉCUTION. Un module `data:` — donc aucune écriture disque, et le gate ne
 * tourne qu'avec `--allow-read --allow-env`. Les imports du module généré sont
 * des URL `file:` ABSOLUES vers les vrais moteurs: c'est le code de production
 * qui est exécuté, pas une copie.
 */
// deno-lint-ignore no-explicit-any
async function execModule(source: string): Promise<any> {
  return await import(
    "data:application/typescript," + encodeURIComponent(source)
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// W6c / W6b — LA CEINTURE DE RÉGIME DE LA LANE SOLO
// ═══════════════════════════════════════════════════════════════════════════

/**
 * La région = le bloc `if (declaredRegime) { … }` de `generate-meal-v1`, en
 * entier: le calcul des brèches (W6c), la trace, et la poussée dans `issues`
 * (W6b). L'ancre est la ligne `if` — c'est la CONDITION du fil, jamais son
 * contenu; aucune des deux coupures ne la touche.
 */
async function loadBelt() {
  const lines = await sourceLines(MEAL_SRC);
  const start = soleIndex(
    lines,
    "    if (declaredRegime) {",
    "ceinture de régime, lane solo",
  );
  const region = blockAt(lines, start, "    }", "ceinture de régime");
  // Une région qui n'appelle plus le moteur n'est pas une région à exécuter:
  // c'est déjà le défaut. On le dit ici plutôt que de rendre `breaches: 0`.
  assert(
    region.includes("scanDietaryRegime("),
    "la région découpée n'appelle plus AUCUN moteur de régime — le fil n'est " +
      "pas débranché, il est arraché.",
  );
  const mod = await execModule(`
import {
  excludedSurfaceFormsFor,
  scanDietaryRegime,
} from ${JSON.stringify(DIETARY)};
import { type FoodGroupRef } from ${JSON.stringify(TOKENS)};

// deno-lint-ignore no-explicit-any
export function belt(declaredRegime: any, meal: any, issues: string[], userId: string, traced: string[]) {
  // La trace de la ceinture est sa SORTIE PUBLIQUE: elle publie \`breaches\`
  // AVANT la poussée dans \`issues\`. C'est ce qui permet de distinguer W6c
  // (rien n'a mordu) de W6b (ça a mordu et personne ne l'écrit).
  const console = { log: (s: string) => { traced.push(String(s)); }, warn: () => {} };
${region}
  return { issues, traced };
}
`);
  return (
    declaredRegime: string,
    dishes: unknown[],
    issues: string[] = [],
  ): { issues: string[]; trace: Record<string, number> } => {
    const traced: string[] = [];
    mod.belt(declaredRegime, { dishes }, issues, "u-test", traced);
    const line = traced
      .map((s) => {
        try {
          return JSON.parse(s);
        } catch {
          return null;
        }
      })
      .find((o) => o && o.tag === "keel.meal.dietary_regime");
    assert(
      line,
      "la ceinture n'a publié AUCUNE trace `keel.meal.dietary_regime`: " +
        "son compteur est parti, et un run muet ressemble à un run propre.",
    );
    return { issues, trace: line };
  };
}

/** Un plat dont les INGRÉDIENTS sont innocents: seule la prose peut mordre. */
const NEUTRAL_ITEMS = [
  { term: "olive oil", group: "olive_oil" },
  { term: "sea salt", group: null },
  { term: "carrot", group: "non_starchy_veg" },
];

Deno.test("W6c — la ceinture lit le TITRE du plat, pas seulement ses ingrédients", async () => {
  const belt = await loadBelt();
  // ⛔ LE CAS EXACT DE LA COUPURE. Une végane, un plat dont la liste
  // d'ingrédients ne porte RIEN d'interdit, et « chicken » uniquement dans le
  // titre. Si la ceinture ne lit que les ingrédients, elle sert du poulet.
  const { trace } = belt("vegan", [{
    title: "Roast chicken",
    why: "A comforting Sunday tray.",
    ingredients: NEUTRAL_ITEMS,
  }]);
  assertEquals(
    trace.breaches,
    1,
    "la ceinture de régime solo ne lit plus le TITRE du plat: « Roast " +
      "chicken » ne mord plus chez une végane. Le fil coupé est l'ARGUMENT " +
      "`prose:` de `scanDietaryRegime`, pas l'appel — un test qui cherche " +
      "`scanDietaryRegime(` dans la source reste vert ici.",
  );
  assertEquals(trace.dishes, 1);
  assert(trace.forms > 0, "la ceinture n'avait aucune aiguille à chercher");
});

Deno.test("W6c — la ceinture lit aussi le `why`, où le modèle range la viande", async () => {
  const belt = await loadBelt();
  // La moitié qu'une coupure PARTIELLE atteindrait: `prose: [dish.title]`
  // laisserait le premier test vert et celui-ci rouge.
  const { trace } = belt("vegan", [{
    title: "Sunday tray bake",
    why: "Built around roast chicken, slow and easy.",
    ingredients: NEUTRAL_ITEMS,
  }]);
  assertEquals(
    trace.breaches,
    1,
    "la ceinture ne lit plus le `why` du plat: la justification peut nommer " +
      "l'interdit sans que rien ne morde.",
  );
});

Deno.test("W6c — LE CAS QUI PASSE: un plat conforme ne produit AUCUNE brèche", async () => {
  const belt = await loadBelt();
  // ⛔ SANS CE CAS, LA GARDE EST INUTILISABLE. Une ceinture qui mord sur tout
  // rougirait pareil, et on ne saurait pas la distinguer d'une ceinture juste.
  const { issues, trace } = belt("vegan", [{
    title: "Lentil tray bake",
    why: "A comforting Sunday tray.",
    ingredients: [
      { term: "green lentils", group: "legumes" },
      ...NEUTRAL_ITEMS,
    ],
  }]);
  assertEquals(trace.breaches, 0);
  assertEquals(
    issues,
    [],
    "un plat végane conforme fait quand même parler la ceinture: elle " +
      "refuserait le garde-manger de ceux qu'elle protège.",
  );
});

Deno.test("W6c — LE CAS QUI PASSE: l'analogue végétal est DÉSAMORCÉ, pas compté", async () => {
  const belt = await loadBelt();
  // ⚠️ CICATRICE DU DÉPÔT: « laitue » ne doit pas matcher « lait » — 12 faux
  // positifs sur 12 mesurés. Ce cas existe pour prouver qu'on exécute le VRAI
  // moteur (`isPlantAnalogue`, fermé depuis le run réel du 2026-08-11) et non
  // un appariement écrit ici. Un matcheur maison compterait « Soy yoghurt »
  // comme une brèche de régime végane.
  const { issues, trace } = belt("vegan", [{
    title: "Soy yoghurt bowl",
    why: "Cool and quick, no cooking.",
    ingredients: [{ term: "soy yoghurt", group: null }, ...NEUTRAL_ITEMS],
  }]);
  assertEquals(trace.breaches, 0);
  assert(
    trace.analogues_silenced > 0,
    "le désamorçage des analogues végétaux ne compte plus rien: une ceinture " +
      "qui blanchirait tout demain afficherait le même `breaches: 0`.",
  );
  assertEquals(issues, []);
});

Deno.test("W6b — la brèche détectée est POUSSÉE dans `issues`", async () => {
  const belt = await loadBelt();
  const { issues, trace } = belt("vegan", [{
    title: "Roast chicken",
    why: "A comforting Sunday tray.",
    ingredients: NEUTRAL_ITEMS,
  }]);
  // ① LA PRÉMISSE, ARMÉE. Sans elle, la garde serait indistinguable d'une
  //   garde qui échoue parce que le calcul n'a rien trouvé — c'est-à-dire
  //   qu'elle porterait le nom de W6b en gardant W6c.
  assertEquals(
    trace.breaches,
    1,
    "prémisse non tenue: la ceinture n'a rien détecté, donc cette épreuve ne " +
      "dit RIEN sur W6b. Lire d'abord les épreuves W6c.",
  );
  // ② LE FIL LUI-MÊME.
  const pushed = issues.filter((i) => i.startsWith("dietary_regime_breach: "));
  assertEquals(
    pushed.length,
    1,
    "la ceinture a COMPTÉ une brèche et ne l'écrit nulle part: `issues` part " +
      "à la fois sur la ligne `student_generated_meals.generated_from` et " +
      "dans la réponse HTTP. Coupé ici, le plan est écrit en base sans aucune " +
      "trace du motif — le contrôle existe et personne ne peut le lire.",
  );
  assert(
    pushed[0].includes("Roast chicken") && pushed[0].includes("chicken"),
    `la brèche poussée ne nomme ni le plat ni le terme: ${pushed[0]}`,
  );
});

Deno.test("W6b — LE CAS QUI PASSE: sans brèche, `issues` n'est pas touché", async () => {
  const belt = await loadBelt();
  const before = ["some_unrelated_issue"];
  const { issues } = belt("vegan", [{
    title: "Lentil tray bake",
    why: "A comforting Sunday tray.",
    ingredients: [
      { term: "green lentils", group: "legumes" },
      ...NEUTRAL_ITEMS,
    ],
  }], before);
  assertEquals(
    issues,
    ["some_unrelated_issue"],
    "la ceinture ajoute une ligne à `issues` sur un plan sain: un diagnostic " +
      "qui crie tout le temps ne se lit plus.",
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// W9 — LE PLANCHER DE DÉCLARATION DE MALADIE, DANS `processMessage`
// ═══════════════════════════════════════════════════════════════════════════
//
// Trois régions, parce que le fil a trois segments et qu'un seul des trois est
// la coupure de ce lot (le premier). Les deux autres sont la CHAÎNE: elles
// montrent jusqu'où le drapeau voyage, et elles rendent lisible le fait que le
// premier segment est le seul qui décide.

/** ① L'APPEL. Ancre: la ligne `if (declaredCondition) {`, qui CONSOMME le drapeau. */
async function loadDetectRegion() {
  const lines = await sourceLines(RUN_SRC);
  const anchor = soleIndex(
    lines,
    "    if (declaredCondition) {",
    "plancher de maladie, consommation du drapeau",
  );
  const region = groupBefore(lines, anchor, "plancher de maladie, production");
  const mod = await execModule(`
import { detectDeclaredMedicalCondition } from ${JSON.stringify(FLOOR)};
// deno-lint-ignore no-explicit-any
export function produce(userMessage: any) {
${region}
  return declaredCondition;
}
`);
  return mod.produce as (m: unknown) => { condition_ref: string } | null;
}

/** ② L'AFFECTATION. Ancre: le `console.warn` du plancher, qui n'est pas le fil. */
async function loadRaiseRegion() {
  const lines = await sourceLines(RUN_SRC);
  const anchor = soleIndex(
    lines,
    '      console.warn("[keel] medical_condition_floor raised", {',
    "plancher de maladie, journal",
  );
  const region = groupAt(lines, anchor);
  const mod = await execModule(`
// deno-lint-ignore no-explicit-any
export function raise(declaredCondition: any, keelTurn: any, requestId: string) {
  const console = { warn: () => {}, log: () => {}, error: () => {} };
${region}
  return keelTurn;
}
`);
  // deno-lint-ignore no-explicit-any
  return mod.raise as (c: any, t: any, r: string) => any;
}

/** ③ LA LECTURE. Ancre: la bannière de commentaire qui la précède. */
async function loadInjectRegion() {
  const lines = await sourceLines(RUN_SRC);
  const anchor = soleIndex(
    lines,
    "  // LE VERROU MÉDICAL EN PREMIER — avant même les contraintes dures.",
    "bloc de déférence clinique, bannière",
  );
  const region = groupAfter(lines, anchor, "bloc de déférence clinique");
  const mod = await execModule(`
import { CLINICAL_DEFERRAL_BLOCK } from ${JSON.stringify(FLOOR)};
// deno-lint-ignore no-explicit-any
export function inject(keel: any, blocks: string[]) {
${region}
  return blocks;
}
`);
  return {
    inject: mod.inject as (k: unknown, b: string[]) => string[],
    // Le bloc réel, pour comparer à ce qui a été poussé.
    block: (await import(FLOOR)).CLINICAL_DEFERRAL_BLOCK as string,
  };
}

Deno.test("W9 — `detectDeclaredMedicalCondition` est APPELÉ sur le message de l'élève", async () => {
  const produce = await loadDetectRegion();
  // ⛔ LE CAS DE LA CAMPAGNE QA DU 2026-08-05: « je suis diabétique de type 2,
  // je mange quoi ? » recevait un protocole prescriptif complet, renvoi
  // clinicien FR 0/3, et `student_safety_constraints` restait vide.
  const hit = produce("je suis cœliaque");
  assert(
    hit,
    "le plancher de maladie n'est plus appelé sur le message du tour: une " +
      "déclaration de maladie n'est plus JAMAIS analysée, et le bloc de " +
      "déférence clinique n'est plus JAMAIS injecté. C'est le seul défaut de " +
      "la campagne qui peut blesser quelqu'un.",
  );
  assertEquals(hit.condition_ref, "coeliac_disease");
  // ⚠️ ET L'ARGUMENT, pas seulement l'appel: un message ANGLAIS doit passer par
  // le même chemin. Une coupure qui tronque ou remplace `userMessage` laisse
  // l'appel écrit dans la source et rend `null` ici.
  assertEquals(
    produce("I have coeliac disease")?.condition_ref,
    "coeliac_disease",
  );
  assertEquals(
    produce("je suis diabétique de type 2, je mange quoi ?")?.condition_ref,
    // ⚠️ `diabetes`, PAS `diabetes_type_2`. La liste fermée du plancher ne
    // porte pas le sous-type, et c'est voulu: `diabetes_type_2` est
    // précisément l'une des formes DIFFORMES que le dispatcher LLM écrivait
    // avant que le plancher ne le remplace (mesuré le 2026-08-06, 7 lignes
    // sur 44). L'attendre ici ferait de la garde le témoin de l'ancien défaut.
    "diabetes",
  );
});

Deno.test("W9 — LE CAS QUI PASSE: un message sans déclaration ne lève RIEN", async () => {
  const produce = await loadDetectRegion();
  // ⛔ SANS CE CAS, UN PLANCHER QUI LÈVE TOUJOURS PASSERAIT LA GARDE. Et
  // sur-déclencher n'est pas gratuit: le tour entier bascule en posture
  // clinique, ce qui fait taire le produit chez quelqu'un qui n'a rien déclaré.
  assertEquals(produce("j'ai mangé des pâtes sans gluten ce midi"), null);
  assertEquals(produce("c'est quoi la maladie coeliaque ?"), null);
  assertEquals(produce("je ne suis pas diabétique"), null);
  assertEquals(produce("ma mère est diabétique"), null);
  assertEquals(produce(""), null);
});

Deno.test("W9 — le drapeau est POSÉ sur le contexte du tour", async () => {
  const produce = await loadDetectRegion();
  const raise = await loadRaiseRegion();
  const hit = produce("je suis cœliaque");
  assert(hit, "prémisse non tenue: voir l'épreuve d'appel ci-dessus.");
  const before = { declared_medical_condition: null, safety_constraints: [] };
  const after = raise(hit, before, "req-test");
  assertEquals(
    after.declared_medical_condition,
    "coeliac_disease",
    "le plancher détecte et le contexte du tour ne le porte pas: le drapeau " +
      "meurt entre la détection et le prompt.",
  );
  // Le reste du contexte n'est pas écrasé au passage.
  assertEquals(after.safety_constraints, []);
});

Deno.test("W9 — le drapeau posé INJECTE le bloc de déférence clinique", async () => {
  const { inject, block } = await loadInjectRegion();
  // ① Avec le drapeau: le bloc part.
  const withFlag = inject(
    { declared_medical_condition: "coeliac_disease" },
    [],
  );
  assertEquals(
    withFlag,
    [block],
    "le drapeau de maladie n'ouvre plus le bloc de déférence clinique: le " +
      "tour répond en conseil nutritionnel à quelqu'un dont la maladie se " +
      "soigne.",
  );
  // ② LE CAS QUI PASSE: sans drapeau, pas un octet de prompt en plus. Un bloc
  //    poussé pour toute la population coûterait le budget de prompt de chaque
  //    tour, et ferait le produit muet là où il est utile.
  assertEquals(inject({ declared_medical_condition: null }, []), []);
});
