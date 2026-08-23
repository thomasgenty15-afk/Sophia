// ═══════════════════════════════════════════════════════════════════════════
// LOT 1J — LE CÂBLAGE DE LA MÉMOIRE STRUCTURÉE, ÉPINGLÉ SUR LES LANES
// (trois à l'origine; la lane WEEK-PLAN est partie avec sa fonction edge le
//  2026-08-19 — le constat de mesure ci-dessous porte encore sur les trois)
//
// ⚠️ CE FICHIER EXISTE À CAUSE D'UNE MESURE, PAS D'UNE INTUITION. Un
// vérificateur adversarial a neutralisé le câblage des trois générateurs —
// `routeRetainedItems([...retainedDurable.items, ...retainedNextPlan])`
// remplacé par `routeRetainedItems([])` — et a relancé la suite:
//
//     baseline                           : ok | 3507 passed | 0 failed
//     câblage neutralisé sur les 3 lanes : ok | 3507 passed | 0 failed
//
// Tous les seaux vides ⇒ patch vide, composition vide, envies vides, rythme
// vide: le prompt redevient EXACTEMENT celui d'avant le chantier, et pas un
// test ne rougit. Un lot entièrement débranché était donc indiscernable d'un
// lot qui marche, et le prochain refactor pouvait retirer les trois blocs en
// repartant vert.
//
// ── CE QUE CES TESTS TIENNENT, PAR ORDRE DE CE QU'IL EN COÛTE DE LE PERDRE ──
//
//   * L'ORDRE. C'est la seule famille qui attrape le défaut de FOND: un
//     correctif logistique posé APRÈS son lecteur ne change que la trace. Les
//     trois fichiers le promettent en toutes lettres dans leurs commentaires,
//     et rien ne le tenait. Une propriété écrite dans un commentaire n'est pas
//     une garde.
//   * LES DEUX MAGASINS DANS LE MÊME APPEL. Retirer `...retainedNextPlan`
//     laissait 3544 verts: les `craving` et les retours sur brouillon
//     disparaissaient du produit sans un mot.
//   * CHAQUE DESTINATION, une assertion par famille et par lane. Un seau
//     rempli qu'aucun lecteur ne reçoit est un seau vide avec plus d'étapes.
//   * `speaksFor` N'EST JAMAIS VIDE. `SpeaksFor = readonly RetainedSubject[]`
//     autorise `[]` à la compilation, et `concerns` fait `speaksFor ?? []`:
//     un `[]` ne casse rien, ne journalise rien, et verse TOUT dans
//     `otherSubjects`. La cicatrice « paramètre de garde optionnel = garde
//     désarmée » n'a pas été refermée, elle a changé de forme — de `?` à `[]`.
//
// ── LA MOITIÉ QU'ON OUBLIE, ET QUI REND CE FICHIER CRÉDIBLE ────────────────
// Chaque famille est une FONCTION PURE `assertWired(src)` appelée DEUX FOIS:
// une fois sur le vrai fichier (VERT), une fois sur une copie EN MÉMOIRE dont
// le bloc a été retiré (ROUGE ATTENDU). Sans le second appel, on ne distingue
// pas « le câblage est là » de « mon `indexOf` cherche une chaîne qui n'existe
// plus depuis un renommage » — et les deux rendent vert. Une garde a besoin
// d'un cas qui passe ET d'un cas qui échoue.
//
// ⚠️ CE QUE CE FICHIER NE COUVRE PAS, EXPRÈS: le 7ᵉ argument d'`envelopeFor`,
// l'état d'âge de la lane individuelle et le compteur `portion_applied` sont
// tenus par `retained_portion_wiring_test.ts` (lot 1G). Doubler une assertion
// la fait diverger le jour où l'une des deux bouge.
// ═══════════════════════════════════════════════════════════════════════════

import {
  assert,
  assertEquals,
  assertStringIncludes,
  assertThrows,
} from "jsr:@std/assert@1";

const FUNCTIONS_DIR = new URL("../../", import.meta.url);

/**
 * ⚠️ LES COMMENTAIRES PARTENT D'ABORD, ET C'EST UNE CICATRICE DU DÉPÔT
 * (« Audit d'appelants: retirer les commentaires »). Les trois fichiers visés
 * ici CITENT `routeRetainedItems`, `retainedNextPlan`, `speaksFor` et
 * `retainedComposition` en toutes lettres dans leurs blocs de tête: un grep
 * naïf serait VERT sur un produit entièrement débranché, sur la seule foi de
 * sa prose.
 *
 * Même fonction que `retained_portion_wiring_test.ts` — recopiée, pas
 * importée: un test qui dépend d'un autre test se casse pour des raisons qui
 * n'ont rien à voir avec ce qu'il garde.
 */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(
    /(^|[^:])\/\/[^\n]*/g,
    "$1",
  );
}

async function source(rel: string): Promise<string> {
  return stripComments(await Deno.readTextFile(new URL(rel, FUNCTIONS_DIR)));
}

// ---------------------------------------------------------------------------
// LIRE UN APPEL — délimiteurs ÉQUILIBRÉS, jamais une expression régulière
// ---------------------------------------------------------------------------

/**
 * ── POURQUOI PAS UNE REGEX (même motif que le lot 1G) ─────────────────────
 * Les appels visés portent des arguments qui contiennent eux-mêmes des
 * virgules, des parenthèses et des accolades
 * (`goalRow.practical_constraints as Record<string, unknown> | null`,
 * `members.map((m) => ({ memberId: m.memberId, ageState: m.ageState }))`).
 * Une regex qui « trouve `retainedComposition` quelque part dans l'appel »
 * serait verte sur un appel où il est passé en PREMIER argument, c'est-à-dire
 * verte sur un produit faux.
 *
 * On rend donc les BORNES de chaque argument: elles servent à lire ET à
 * muter, ce qui garantit que la mutation frappe exactement ce que
 * l'assertion lit.
 */
type ArgSpan = { readonly start: number; readonly end: number };
type Call = {
  readonly open: number;
  readonly close: number;
  readonly args: ArgSpan[];
};

function callAt(src: string, callee: string, from = 0): Call | null {
  const open = src.indexOf(`${callee}(`, from);
  if (open === -1) return null;
  let depth = 0;
  // ⚠️ LES CHEVRONS SE COMPTENT À PART, ET C'EST UN DÉFAUT MESURÉ DE LA
  // PREMIÈRE VERSION DE CE FICHIER. Le premier argument des trois lanes est
  // `goalRow.practical_constraints as Record<string, unknown> | null`: la
  // virgule de `Record<string, unknown>` est au niveau supérieur pour un
  // compteur qui n'a que `()[]{}`, et l'appel se lisait avec TROIS arguments
  // au lieu de deux. L'assertion rougissait sur un produit CORRECT — c'est-à-
  // dire le genre de test qu'on « répare » en le retirant.
  //
  // `<` n'ouvre que collé derrière un identifiant (`Record<`), jamais après un
  // espace (`i < n`); `>` ne ferme jamais derrière `=` ou `-` (`=>`, `->`).
  let angle = 0;
  let start = open + callee.length + 1;
  const args: ArgSpan[] = [];
  for (let i = start; i < src.length; i += 1) {
    const c = src[i];
    if (c === "<" && /[A-Za-z0-9_$]/.test(src[i - 1] ?? "")) angle += 1;
    else if (c === ">" && angle > 0 && !"=-".includes(src[i - 1] ?? "")) {
      angle -= 1;
    } else if (c === "(" || c === "[" || c === "{") depth += 1;
    else if (c === ")" || c === "]" || c === "}") {
      if (depth === 0 && c === ")") {
        args.push({ start, end: i });
        // La virgule finale du style du dépôt laisse un argument VIDE: une
        // position d'argument qui dépendrait d'un détail de formatage serait
        // fausse le jour où `deno fmt` change d'avis.
        if (src.slice(start, i).trim() === "") args.pop();
        return { open, close: i, args };
      }
      depth -= 1;
    } else if (c === "," && depth === 0 && angle === 0) {
      args.push({ start, end: i });
      start = i + 1;
    }
  }
  return null;
}

function mustCall(src: string, callee: string, from = 0): Call {
  const call = callAt(src, callee, from);
  if (call === null) {
    throw new Error(`appel introuvable ou non refermé: ${callee}(`);
  }
  return call;
}

function argText(src: string, span: ArgSpan): string {
  return src.slice(span.start, span.end).trim();
}

/**
 * LES SITES D'APPEL D'UN SYMBOLE, LA DÉCLARATION EXCLUE.
 *
 * ⚠️ ADAPTATION MESURÉE (lot 1J). La spécification demandait
 * `indexOf("readCookingCapacity(") > indexOf("routeRetainedItems(")`. C'est
 * FAUX dans ce dépôt: `readCookingCapacity` et `readFoodPreferences` sont
 * DÉCLARÉES en tête de `generate-meal-v1` (l. ~331 et ~369), très au-dessus
 * du câblage. Un `indexOf` naïf pointerait la déclaration, et l'assertion
 * d'ordre serait rouge sur un produit correct — puis « réparée » en la
 * retirant. On compare donc au PREMIER SITE D'APPEL.
 */
function callSites(src: string, callee: string): number[] {
  const out: number[] = [];
  for (
    let i = src.indexOf(`${callee}(`);
    i !== -1;
    i = src.indexOf(`${callee}(`, i + 1)
  ) {
    if (!/\bfunction\s+$/.test(src.slice(Math.max(0, i - 24), i))) out.push(i);
  }
  return out;
}

function firstCallSite(src: string, callee: string): number {
  const sites = callSites(src, callee);
  if (sites.length === 0) throw new Error(`aucun site d'appel: ${callee}(`);
  return sites[0];
}

/** Le texte entre deux jalons — pour interroger UN bloc et pas le fichier. */
function between(src: string, from: string, to: string): string {
  const a = src.indexOf(from);
  if (a === -1) throw new Error(`jalon de début introuvable: ${from}`);
  const b = src.indexOf(to, a + from.length);
  if (b === -1) throw new Error(`jalon de fin introuvable: ${to}`);
  return src.slice(a, b);
}

// ---------------------------------------------------------------------------
// LES ASSERTIONS COMMUNES AUX LANES
// ---------------------------------------------------------------------------

/**
 * L'ancre d'ordre d'une lane: le PREMIER lecteur de `practical_constraints`
 * que le correctif logistique doit précéder. Une lane, un lecteur nommé.
 */
type Anchor = { readonly label: string; readonly at: (src: string) => number };

function assertBothStores(src: string, lane: string): void {
  const call = mustCall(src, "routeRetainedItems");
  assertEquals(
    call.args.length,
    1,
    `lane ${lane}: \`routeRetainedItems\` n'est plus appelée avec une seule liste.`,
  );
  const items = argText(src, call.args[0]);
  assert(
    items.includes("...retainedDurable.items"),
    `LANE ${lane.toUpperCase()} — LE MAGASIN DURABLE N'ENTRE PLUS DANS LE ROUTAGE. ` +
      `Tous les seaux sont vides, donc le prompt est celui d'avant le chantier, ` +
      `et RIEN d'autre ne le dit.`,
  );
  assert(
    items.includes("...retainedNextPlan"),
    `LANE ${lane.toUpperCase()} — LE SECOND MAGASIN A DISPARU DE L'APPEL. ` +
      `Les \`craving\` et les retours sur brouillon (\`practical_constraints.` +
      `retained_next_plan\`) ne remontent plus: mesuré, ce retrait laissait ` +
      `3544 tests verts.`,
  );
}

/**
 * ⚠️ LA GARDE QUI SE DÉSARME PAR `[]` (défaut 3b). Le module de routage n'est
 * pas modifiable par ce lot; la garde se ferme donc CHEZ LES APPELANTS. Un
 * `speaksFor: []` compile (`readonly RetainedSubject[]`), ne journalise rien,
 * et verse TOUT dans `otherSubjects` — c'est-à-dire le prompt d'avant le
 * chantier, obtenu en changeant deux caractères.
 */
function assertSpeaksForIsNeverEmpty(src: string, lane: string): void {
  const uses = [...src.matchAll(/speaksFor:\s*([^,\n]+)/g)].map((m) =>
    m[1].trim()
  );
  assert(
    uses.length > 0,
    `lane ${lane}: plus aucun \`speaksFor:\` — les surcouches ne reçoivent plus d'audience.`,
  );
  for (const use of uses) {
    assertEquals(
      use,
      "retainedSpeaksFor",
      `LANE ${lane.toUpperCase()} — UN \`speaksFor:\` NE PORTE PLUS L'AUDIENCE DE ` +
        `LA LANE (\`${use}\`). Un \`[]\` compile, ne casse rien, ne journalise ` +
        `rien, et verse TOUT dans \`otherSubjects\`: le produit d'avant le ` +
        `chantier, en silence.`,
    );
  }
  const assignment = between(src, "const retainedSpeaksFor =", ";");
  assert(
    assignment.includes("HOUSEHOLD_SUBJECT"),
    `LANE ${lane.toUpperCase()} — \`retainedSpeaksFor\` ne porte plus ` +
      `\`HOUSEHOLD_SUBJECT\`: aucun item non attribué ne serait plus appliqué ` +
      `à personne, et le magasin entier tomberait dans \`otherSubjects\`.`,
  );
}

/**
 * L'ORDRE — LA SEULE FAMILLE QUI ATTRAPE LE DÉFAUT DE FOND.
 *
 * `logistics.set` CORRIGE `practical_constraints`. Posé APRÈS son lecteur, le
 * correctif ne change que la trace: le plan est composé sur l'ancienne
 * cuisine, la trace dit qu'il l'a été sur la neuve, et les deux se lisent
 * comme un succès. Les trois fichiers PROMETTENT cet ordre en commentaire
 * (« AVANT `constraintsForPrompt` », « AVANT `const pc` »); aucune ligne ne le
 * tenait.
 */
function assertReadPrecedesReaders(
  src: string,
  lane: string,
  anchors: readonly Anchor[],
): void {
  const routed = src.indexOf("routeRetainedItems(");
  assert(
    routed !== -1,
    `lane ${lane}: plus aucun appel à \`routeRetainedItems\`.`,
  );
  const patch = src.indexOf("...retainedLogistics.patch");
  assert(
    patch !== -1,
    `lane ${lane}: le correctif logistique n'est plus appliqué.`,
  );
  for (const anchor of anchors) {
    const reader = anchor.at(src);
    assert(
      routed < reader,
      `LANE ${lane.toUpperCase()} — LA LECTURE DU MAGASIN EST PASSÉE SOUS ` +
        `\`${anchor.label}\`. Le correctif arrive après son lecteur: il ne ` +
        `change plus que la TRACE, et la trace dira le contraire du prompt.`,
    );
    assert(
      patch < reader,
      `LANE ${lane.toUpperCase()} — LE CORRECTIF \`logistics.set\` EST POSÉ ` +
        `APRÈS \`${anchor.label}\`. Le plan est composé sur l'ancienne cuisine ` +
        `pendant que la trace annonce la neuve.`,
    );
  }
}

/**
 * LA TRACE QUI MENTAIT (défaut 3a), ÉPINGLÉE À SON ABSENCE.
 *
 * `next_plan_channel: householdId ? "household" : "none"` distinguait « aucun
 * canal » de « canal vide ». Depuis que les `next_plan` vivent dans
 * `practical_constraints` (contrat §7.2), le premier cas N'EXISTE PLUS: un
 * solo POSSÈDE un canal, et le champ lui répondait `"none"`. La distinction
 * était exactement inversée — un lecteur de trace concluait « `craving: 0`
 * est structurel » là où la personne n'avait simplement rien demandé.
 */
function assertNoChannelLie(src: string, lane: string): void {
  assert(
    !src.includes("next_plan_channel"),
    `LANE ${lane.toUpperCase()} — \`next_plan_channel\` EST REVENU. Il n'y a ` +
      `plus deux vides: le magasin \`next_plan\` vit dans ` +
      `\`practical_constraints.retained_next_plan\`, lu PAR \`user_id\` seul, ` +
      `et le solo est servi comme tout le monde. Ce champ rendait \`"none"\` ` +
      `pour un compte qui a bel et bien un canal.`,
  );
}

// ---------------------------------------------------------------------------
// LES MUTATIONS — chacune retire UNE moitié, et doit faire rougir UNE famille
// ---------------------------------------------------------------------------

/**
 * ⚠️ `expects` EST OBLIGATOIRE, ET C'EST UN DÉFAUT MESURÉ DE LA PREMIÈRE
 * VERSION DE CE FICHIER. Un `assertThrows` nu se contente de « quelque chose a
 * levé »: la lane individuelle est passée au VERT alors que TOUTES ses
 * mutations levaient la même erreur parasite (l'appel mal découpé ci-dessus),
 * y compris celles qui ne cassaient rien. Un test de mutation qui accepte
 * n'importe quel échec ne prouve pas que la garde a mordu — il prouve que le
 * fichier est cassé.
 */
type Cut = {
  readonly name: string;
  /** Un fragment DISTINCTIF du message que la garde visée doit rendre. */
  readonly expects: string;
  readonly apply: (src: string) => string;
};

/** Remplace le contenu d'un argument. La mutation frappe ce que l'assertion lit. */
function blankArg(
  src: string,
  callee: string,
  argIndex: number,
  replacement: string,
  occurrence = 0,
): string {
  const site = callSites(src, callee)[occurrence];
  if (site === undefined) {
    throw new Error(`site ${occurrence} introuvable: ${callee}(`);
  }
  const call = mustCall(src, callee, site);
  const span = call.args[argIndex];
  if (span === undefined) {
    throw new Error(`argument ${argIndex} absent de ${callee}(`);
  }
  return src.slice(0, span.start) + replacement + src.slice(span.end);
}

const PATCH_BLOCK =
  /if \(Object\.keys\(retainedLogistics\.patch\)\.length > 0\) \{[\s\S]*?\n    \}\n/;

/**
 * DÉPLACE LE CORRECTIF LOGISTIQUE SOUS SON LECTEUR — la régression EXACTE que
 * l'assertion d'ordre existe pour attraper. Elle compile: c'est ce qui la rend
 * dangereuse, et c'est pour ça qu'aucun `deno check` ne la verra jamais.
 */
function movePatchUnder(anchor: string): (src: string) => string {
  return (src) => {
    const m = src.match(PATCH_BLOCK);
    if (m === null) throw new Error("bloc de correctif logistique introuvable");
    const without = src.replace(m[0], "");
    const at = without.indexOf(anchor);
    if (at === -1) {
      throw new Error(`ancre introuvable pour le déplacement: ${anchor}`);
    }
    const cut = at + anchor.length;
    return `${without.slice(0, cut)}\n${m[0]}${without.slice(cut)}`;
  };
}

/** La mutation EXACTE du vérificateur: le routage reçoit une liste vide. */
const EMPTY_STORE: Cut = {
  name: "le vérificateur vide les deux magasins",
  expects: "LE MAGASIN DURABLE N'ENTRE PLUS DANS LE ROUTAGE",
  apply: (src) =>
    src.replace(/routeRetainedItems\(\[[\s\S]*?\]\)/, "routeRetainedItems([])"),
};

const DROP_NEXT_PLAN: Cut = {
  name: "le second magasin est retiré de l'appel",
  expects: "LE SECOND MAGASIN A DISPARU DE L'APPEL",
  apply: (src) => src.replace(/\s*\.\.\.retainedNextPlan,/, ""),
};

const EMPTY_SPEAKS_FOR: Cut = {
  name: "`speaksFor` est vidé par un `[]`",
  expects: "NE PORTE PLUS L'AUDIENCE DE LA LANE",
  apply: (src) => src.replace("speaksFor: retainedSpeaksFor", "speaksFor: []"),
};

const CHANNEL_LIE_RETURNS: Cut = {
  name: "la trace `next_plan_channel` revient",
  expects: "`next_plan_channel` EST REVENU",
  apply: (src) =>
    src.replace(
      "      refused: retainedDurable.refused.total,",
      '      next_plan_channel: householdId ? "household" : "none",\n' +
        "      refused: retainedDurable.refused.total,",
    ),
};

/** Le message que l'assertion d'ordre rend quand le correctif passe dessous. */
const ORDER_BITES = "EST POSÉ APRÈS";

// ---------------------------------------------------------------------------
// LES LANES
// ---------------------------------------------------------------------------

type Lane = {
  readonly lane: string;
  readonly rel: string;
  readonly assertWired: (src: string) => void;
  readonly cuts: readonly Cut[];
};

// ---------------------------------------------------------------------------
// LA LANE WEEK-PLAN EST PARTIE LE 2026-08-19, AVEC SA FONCTION EDGE
// ---------------------------------------------------------------------------
//
// Il y avait ici un troisième objet `Lane` pointant
// `generate-week-plan-v1/index.ts`. La fonction a été retirée: elle n'avait
// aucun appelant vivant, donc `source()` ne pouvait plus l'ouvrir et les deux
// tests générés pour elle levaient sur un fichier absent — pas sur la
// propriété qu'ils gardaient.
//
// ⚠️ LE CÂBLAGE QU'ELLE ÉPINGLAIT (les DEUX magasins, `speaksFor` non vide,
// la lecture avant ses lecteurs, l'absence de trace `next_plan_channel`) est
// gardé à l'identique sur les deux lanes restantes, par les mêmes assertions
// partagées. Ce sont les mêmes fonctions, appelées deux fois au lieu de trois.

const MEAL: Lane = {
  lane: "meal",
  rel: "generate-meal-v1/index.ts",
  assertWired(src) {
    assertBothStores(src, "meal");
    assertSpeaksForIsNeverEmpty(src, "meal");
    assertReadPrecedesReaders(src, "meal", [
      {
        label: "parseEatingRhythm(",
        at: (s) => firstCallSite(s, "parseEatingRhythm"),
      },
      // ⚠️ SITE D'APPEL, PAS DÉCLARATION: `readCookingCapacity` est déclarée
      // ~800 lignes AU-DESSUS du câblage. Voir `callSites`.
      {
        label: "readCookingCapacity(",
        at: (s) => firstCallSite(s, "readCookingCapacity"),
      },
    ]);
    assertNoChannelLie(src, "meal");

    // ── DESTINATION 1 · LES TROIS LECTURES DE PRÉFÉRENCES ────────────────
    // TROIS, et le nombre est le sujet: `foodPreferences` (ce qui part au
    // modèle), `writtenInstructions` (ce que la personne a tapé) et
    // `writtenForCheck` (LA CEINTURE, qui vérifie que le plan n'a pas avalé
    // une consigne en silence). Un call site oublié servirait au modèle une
    // consigne que la ceinture ne verrait jamais — deux régimes de contrôle
    // pour une seule promesse. La 4ᵉ occurrence du symbole est la
    // DÉCLARATION, exclue par `callSites`.
    const sites = callSites(src, "readFoodPreferences");
    assertEquals(
      sites.length,
      3,
      "LANE MEAL — `readFoodPreferences` n'a plus ses TROIS sites d'appel " +
        "(prompt, consignes écrites, ceinture). Un site en moins est une " +
        "consigne servie au modèle et jamais vérifiée, ou l'inverse.",
    );
    for (const site of sites) {
      const call = mustCall(src, "readFoodPreferences", site);
      assertEquals(
        call.args.length,
        2,
        "LANE MEAL — un appel à `readFoodPreferences` a perdu son second " +
          "paramètre. `retained` est REQUIS, jamais optionnel: facultatif, il " +
          "laisserait un call site oublié rendre exactement le produit d'hier.",
      );
      assertEquals(
        argText(src, call.args[1]),
        "retainedComposition",
        "LANE MEAL — un appel à `readFoodPreferences` ne reçoit plus le " +
          "magasin structuré: cette lecture-là ne rend que les phrases plates " +
          "de la colonne, c'est-à-dire le produit d'avant le chantier.",
      );
    }

    // ── DESTINATION 2 · LE BLOC D'ENVIES ─────────────────────────────────
    const preferences = between(src, "const preferencesForPrompt =", ";");
    assert(
      preferences.includes("retainedCravings.lines"),
      "LANE MEAL — les `craving` retenus ne rejoignent plus `preferences`: " +
        "c'est le SEUL bloc d'envies de cette lane, donc leur unique lecteur.",
    );

    // ── DESTINATION 3 · LES SIX MOMENTS ──────────────────────────────────
    const rhythm = between(src, "const eatingRhythm =", "const declaredAway =");
    assert(
      rhythm.includes("retainedRhythm.absent"),
      "LANE MEAL — un moment déclaré ABSENT n'est plus retiré de la grille: " +
        "la personne dit « je ne déjeune pas », c'est écrit en base, affiché à " +
        "l'écran, et sans le moindre effet.",
    );
    assert(
      rhythm.includes("retainedRhythm.present"),
      "LANE MEAL — un moment déclaré PRÉSENT n'est plus ajouté à la grille: " +
        "un créneau absent d'ici n'existe nulle part dans le plan.",
    );
  },
  cuts: [
    EMPTY_STORE,
    DROP_NEXT_PLAN,
    EMPTY_SPEAKS_FOR,
    CHANNEL_LIE_RETURNS,
    {
      name: "le correctif logistique passe sous `parseEatingRhythm`",
      expects: ORDER_BITES,
      apply: movePatchUnder(
        "const bySlot = new Map<EatingOccasion, EatingOccasionSlot>();",
      ),
    },
    {
      name: "le 1ᵉʳ des trois `readFoodPreferences` perd le magasin",
      expects: "ne reçoit plus le magasin structuré",
      apply: (src) => blankArg(src, "readFoodPreferences", 1, " null", 0),
    },
    {
      // LA CEINTURE, et c'est le site qu'on oublie: le modèle recevrait la
      // consigne retenue pendant que le contrôle ne la verrait jamais.
      name: "la ceinture (3ᵉ site) perd le magasin",
      expects: "ne reçoit plus le magasin structuré",
      apply: (src) => blankArg(src, "readFoodPreferences", 1, " null", 2),
    },
    {
      name: "un site d'appel disparaît",
      expects: "n'a plus ses TROIS sites d'appel",
      apply: (src) =>
        src.replace(
          "const writtenForCheck = readFoodPreferences(",
          "const writtenForCheck = readFlatFoodPreferences(",
        ),
    },
    {
      name: "les envies retenues ne rejoignent plus `preferences`",
      expects: "ne rejoignent plus `preferences`",
      apply: (src) => src.replace("...retainedCravings.lines,", ""),
    },
    {
      // ⚠️ TOUTES LES OCCURRENCES, pas la boucle seule: la garde de vacuité
      // (`retainedRhythm.absent.length === 0`) mentionne le symbole elle aussi,
      // et une mutation qui ne retirerait que la boucle laisserait l'assertion
      // verte sur un rythme entièrement débranché.
      name: "un moment déclaré ABSENT ne se retire plus de la grille",
      expects: "n'est plus retiré de la grille",
      apply: (src) => src.replaceAll("retainedRhythm.absent", "[]"),
    },
    {
      name: "un moment déclaré PRÉSENT ne s'ajoute plus à la grille",
      expects: "n'est plus ajouté à la grille",
      apply: (src) => src.replaceAll("retainedRhythm.present", "[]"),
    },
  ],
};

const HOUSEHOLD: Lane = {
  lane: "foyer",
  rel: "generate-household-meal-v1/index.ts",
  assertWired(src) {
    assertBothStores(src, "foyer");
    assertSpeaksForIsNeverEmpty(src, "foyer");
    assertReadPrecedesReaders(src, "foyer", [{
      label: "const pc = goalRow.practical_constraints",
      at: (s) => {
        const at = s.indexOf("const pc = goalRow.practical_constraints");
        if (at === -1) {
          throw new Error("`const pc` introuvable sur la lane foyer");
        }
        return at;
      },
    }]);
    // ⚠️ PAS de `next_plan_channel` à épingler ici: cette lane ne l'a jamais
    // porté — elle avait un foyer par construction. C'est la seule des trois
    // dont la trace ne mentait pas.

    // ── DESTINATION 1 · LES VOIX, ET PAS LE TRONC ────────────────────────
    // La porte des `food.*` / `method.*` de cette lane est le bloc DES VOIX
    // (D4/L6): le plafond par membre et la garde de non-divulgation y vivent.
    // Les faire entrer par le tronc ferait un SECOND chemin, sans garde.
    const lines = between(src, "const retainedVoiceLines = [", "];");
    assert(
      lines.includes("retainedComposition.written") &&
        lines.includes("retainedComposition.remembered"),
      "LANE FOYER — `retainedVoiceLines` ne porte plus les deux rangs de la " +
        "composition retenue.",
    );
    // ⚠️ LES DEUX POINTS D'INJECTION, PAS UNE MENTION. Un premier jet
    // n'exigeait que « le bloc `voices` parle de `retainedVoiceLines` »: la
    // garde de vacuité en tête de l'IIFE (`retainedVoiceLines.length === 0`)
    // suffisait à la satisfaire, donc l'assertion restait VERTE sur un bloc
    // dont les deux injections avaient été retirées. Une mention n'est pas un
    // câblage.
    const voices = between(
      src,
      "const voices = (() => {",
      "issues.push(...voices.issues);",
    );
    assert(
      voices.includes("...retainedVoiceLines, ...v.lines"),
      "LANE FOYER — les lignes retenues n'entrent plus dans la voix du " +
        "titulaire QUI EN A DÉJÀ UNE: elles sont lues, routées, comptées, et " +
        "le prompt est celui d'avant le chantier.",
    );
    assert(
      voices.includes("lines: retainedVoiceLines,"),
      "LANE FOYER — les lignes retenues disparaissent quand le titulaire " +
        "n'avait AUCUNE phrase plate: `loadHouseholdVoices` saute les listes " +
        "vides, donc c'est précisément le cas où le magasin structuré est la " +
        "seule chose qu'il ait dite.",
    );

    // ── DESTINATION 2 · LA LIGNE D'ENVIES DU FOYER ───────────────────────
    const envy = between(src, "envyLine: [", "].join");
    assert(
      envy.includes("retainedCravings.lines"),
      "LANE FOYER — les `craving` retenus ne rejoignent plus la ligne " +
        "d'envies: c'est leur lecteur nommé par la nomenclature, et le seul " +
        "de cette lane.",
    );

    // ── DESTINATION 3 · L'AUDIENCE, SUR LE VRAI ROSTER ───────────────────
    // Le CONSTAT (qui est exclu, et pourquoi) se calcule sur les bouches
    // RÉELLES, avec leur `ageState`. Sur une liste vide, `portion_excluded`
    // serait vide et un mineur privé de nourriture ne laisserait aucune trace.
    const audience = mustCall(src, "portionAdjustsFor");
    assertEquals(
      argText(src, audience.args[0]),
      "routedRetained.portion",
      "LANE FOYER — le constat d'audience ne part plus du magasin routé.",
    );
    assert(
      argText(src, audience.args[1]).includes("members.map("),
      "LANE FOYER — `portionAdjustsFor` ne reçoit plus le VRAI roster: sans " +
        "les bouches et leur `ageState`, `portion_excluded` est vide et une " +
        "exclusion de mineur ne laisse plus aucune trace.",
    );
  },
  cuts: [
    EMPTY_STORE,
    DROP_NEXT_PLAN,
    EMPTY_SPEAKS_FOR,
    {
      name: "le correctif logistique passe sous `const pc`",
      expects: ORDER_BITES,
      apply: movePatchUnder(
        "const pc = goalRow.practical_constraints as Record<string, unknown> | null;",
      ),
    },
    {
      name: "`retainedVoiceLines` ne porte plus la composition",
      expects: "ne porte plus les deux rangs",
      apply: (src) => src.replace("...retainedComposition.written,", ""),
    },
    {
      name: "le titulaire qui a déjà une voix n'y reçoit plus rien",
      expects: "QUI EN A DÉJÀ UNE",
      apply: (src) =>
        src.replace("[...retainedVoiceLines, ...v.lines]", "[...v.lines]"),
    },
    {
      name: "le titulaire sans phrase plate perd ses items structurés",
      expects: "n'avait AUCUNE phrase plate",
      apply: (src) => src.replace("lines: retainedVoiceLines,", "lines: [],"),
    },
    {
      name: "la ligne d'envies perd les `craving`",
      expects: "ne rejoignent plus la ligne d'envies",
      apply: (src) => src.replace("...retainedCravings.lines,", ""),
    },
    {
      name: "l'audience n'est plus calculée sur le vrai roster",
      expects: "ne reçoit plus le VRAI roster",
      apply: (src) => blankArg(src, "portionAdjustsFor", 1, " []"),
    },
  ],
};

const LANES: readonly Lane[] = [MEAL, HOUSEHOLD];

// ---------------------------------------------------------------------------
// LES DEUX APPELS — le vrai fichier, puis la copie amputée
// ---------------------------------------------------------------------------

for (const lane of LANES) {
  Deno.test(`LANE ${lane.lane.toUpperCase()} — LE CÂBLAGE EST LÀ`, async () => {
    lane.assertWired(await source(lane.rel));
  });

  Deno.test(
    `LANE ${lane.lane.toUpperCase()} — ET L'ÉPINGLE ROUGIT QUAND ON LE RETIRE`,
    async () => {
      // ⚠️ SANS CE TEST, LE PRÉCÉDENT EST INDISCERNABLE D'UN `indexOf` QUI
      // CHERCHE UNE CHAÎNE DISPARUE: les deux rendent vert. C'est la preuve
      // CENTRALE de ce lot, et elle tourne à chaque run — pas une fois, dans
      // un rapport, sur une machine.
      const real = await source(lane.rel);
      // LE TÉMOIN, DANS CE TEST-CI. Sans lui, un `assertWired` cassé rendrait
      // ce test VERT (tout lève, donc tout « mord »): c'est arrivé pendant
      // l'écriture du fichier, sur la lane individuelle.
      lane.assertWired(real);
      for (const cut of lane.cuts) {
        const mutated = cut.apply(real);
        assert(
          mutated !== real,
          `MUTATION INOPÉRANTE (« ${cut.name} »): la chaîne visée n'existe ` +
            `plus dans ${lane.rel}. L'assertion correspondante est donc verte ` +
            `pour la MAUVAISE raison — elle garde un symbole renommé.`,
        );
        const error = assertThrows(
          () => lane.assertWired(mutated),
          Error,
          undefined,
          `L'ÉPINGLE NE MORD PAS: « ${cut.name} » laisse ${lane.rel} VERT. ` +
            `C'est exactement l'état mesuré au début du lot 1J — 3544 tests ` +
            `verts sur un câblage entièrement neutralisé.`,
        );
        assertStringIncludes(
          error.message,
          cut.expects,
          `LA MAUVAISE GARDE A MORDU sur « ${cut.name} » (${lane.rel}). ` +
            `Quelque chose a levé, mais pas l'assertion que cette mutation ` +
            `existe pour prouver: « quelque chose a échoué » ne dit pas que ` +
            `la propriété est tenue.`,
        );
      }
    },
  );
}

// ---------------------------------------------------------------------------
// CE QUE LES LANES RESTANTES PARTAGENT, ÉPINGLÉ UNE FOIS
// ---------------------------------------------------------------------------

Deno.test("LES LANES — aucune ne relit `household_envy_submissions` pour ses `next_plan`", async () => {
  // Le magasin a DÉMÉNAGÉ (contrat §7.2): il vit dans
  // `practical_constraints.retained_next_plan`, lu par `user_id` SEUL, et le
  // solo est servi comme tout le monde. Un générateur qui rebrancherait le
  // canal d'envies dessus rendrait `[]` pour toujours à un compte sans foyer
  // — et le vide serait indiscernable d'une personne qui n'a rien demandé.
  for (const lane of LANES) {
    const src = await source(lane.rel);
    const call = mustCall(src, "nextPlanItemsFor");
    const args = argText(src, call.args[0]);
    assert(
      args.includes("userId"),
      `lane ${lane.lane}: \`nextPlanItemsFor\` n'est plus appelée par \`userId\`.`,
    );
    assert(
      !args.includes("householdId"),
      `LANE ${lane.lane.toUpperCase()} — \`nextPlanItemsFor\` reçoit de nouveau ` +
        `un \`householdId\`. Le magasin est clé sur \`user_id\` seul depuis le ` +
        `§7.2, et le refaire dépendre d'un foyer rendrait \`[]\` POUR TOUJOURS ` +
        `à une personne seule.`,
    );
  }
});
