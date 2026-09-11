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
  // ⟳ 2026-09-06 — ARBITRAGE 6: le correctif logistique (`logisticsOverlayFor`) est
  // RETIRÉ des deux lanes (0/0 en campagne). L'ordre lecture → lecteurs reste épinglé
  // sur les lecteurs vivants (composition, envies, voix).
  for (const anchor of anchors) {
    const reader = anchor.at(src);
    assert(
      routed < reader,
      `LANE ${lane.toUpperCase()} — LA LECTURE DU MAGASIN EST PASSÉE SOUS ` +
        `\`${anchor.label}\`. Le correctif arrive après son lecteur: il ne ` +
        `change plus que la TRACE, et la trace dira le contraire du prompt.`,
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

// deno-lint-ignore no-unused-vars
const MEAL: Lane = {
  lane: "meal",
  rel: "generate-household-meal-v1/index.ts",
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
      // ⟳ LOT C — UN SEUL ARGUMENT, ET C'EST LE LOT. La fonction en prenait
      // DEUX: la colonne plate (`pc`) et le magasin structuré. Le magasin plat
      // est fermé (nomenclature §2.6), donc le paramètre qui le portait a
      // disparu — et avec lui la façon dont un call site oublié rendait « le
      // produit d'hier ». Le nombre reste épinglé: un second paramètre qui
      // réapparaîtrait serait une seconde source, et c'est ce qu'on ferme.
      assertEquals(
        call.args.length,
        1,
        "LANE MEAL — `readFoodPreferences` a repris un second paramètre: le " +
          "magasin plat est fermé, et un second argument ici serait une " +
          "SECONDE source de préférences (nomenclature §2.1).",
      );
      assertEquals(
        argText(src, call.args[0]),
        "retainedComposition",
        "LANE MEAL — un appel à `readFoodPreferences` ne reçoit plus le " +
          "magasin structuré: c'est le seul qui reste, donc cette lecture-là " +
          "ne rend plus rien du tout.",
      );
    }

    // ── DESTINATION 2 · LE BLOC D'ENVIES ─────────────────────────────────
    const preferences = between(src, "const preferencesForPrompt =", ";");
    assert(
      preferences.includes("retainedCravings.lines"),
      "LANE MEAL — les `craving` retenus ne rejoignent plus `preferences`: " +
        "c'est le SEUL bloc d'envies de cette lane, donc leur unique lecteur.",
    );

    // ── DESTINATION 3 · LES SIX MOMENTS — ⟳ 2026-09-06, ARBITRAGE 6 ──────
    // Les lecteurs `rhythmOverlayFor` / `logisticsOverlayFor` ont rendu 0/0
    // sur toute la campagne du 05/09 : ils sont RETIRÉS. L'épingle est
    // désormais leur ABSENCE.
    assert(!src.includes("rhythmOverlayFor("), "LANE MEAL — le lecteur de rythme retiré est revenu");
    assert(!src.includes("logisticsOverlayFor("), "LANE MEAL — le lecteur logistique retiré est revenu");
  },
  cuts: [
    EMPTY_STORE,
    DROP_NEXT_PLAN,
    EMPTY_SPEAKS_FOR,
    CHANNEL_LIE_RETURNS,
    {
      name: "le 1ᵉʳ des trois `readFoodPreferences` perd le magasin",
      expects: "ne reçoit plus le magasin structuré",
      apply: (src) => blankArg(src, "readFoodPreferences", 0, " null", 0),
    },
    {
      // LA CEINTURE, et c'est le site qu'on oublie: le modèle recevrait la
      // consigne retenue pendant que le contrôle ne la verrait jamais.
      name: "la ceinture (3ᵉ site) perd le magasin",
      expects: "ne reçoit plus le magasin structuré",
      apply: (src) => blankArg(src, "readFoodPreferences", 0, " null", 2),
    },
    {
      name: "un site d'appel disparaît",
      expects: "n'a plus ses TROIS sites d'appel",
      apply: (src) =>
        src.replace(
          "const writtenForCheck = readFoodPreferences(",
          // ⚠️ UN NOM QUI N'EXISTE PAS, EXPRÈS. La mutation ne fait que casser
          // le COMPTE des sites d'appel; viser un vrai symbole (c'était
          // `readFlatFoodPreferences`, supprimé au lot C) ferait croire qu'un
          // second lecteur est encore atteignable.
          "const writtenForCheck = readFoodPreferencesRENAMED(",
        ),
    },
    {
      name: "les envies retenues ne rejoignent plus `preferences`",
      expects: "ne rejoignent plus `preferences`",
      apply: (src) => src.replace("...retainedCravings.lines,", ""),
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
    // ⟳ 2026-09-04 — LA COMPOSITION N'A PLUS D'AUDIENCE, ELLE A UN ROSTER.
    //
    // C'était `compositionLinesFor({ speaksFor })`, donc `[household,
    // titulaire]`, donc tout ce qui portait le nom d'une AUTRE bouche partait
    // dans `otherSubjects` — compté, jamais servi. Deux plans vivants l'ont
    // payé: quatre plats de lentilles pour qui les évite, puis du cabillaud
    // pour deux bouches qui évitent le poisson.
    //
    // ⛔ ON ÉPINGLE LES DEUX ENTRÉES, PAS L'APPEL. `compositionLinesByMouth(`
    // seul resterait vert sur un appel qui ne passerait qu'une bouche — c'est
    // très exactement la mutation qui a montré que « une mention n'est pas un
    // câblage », deux paragraphes plus bas.
    const lines = between(src, "const retainedComposition = compositionLinesByMouth({", "});");
    assert(
      lines.includes("items: routedRetained.composition"),
      "LANE FOYER — la composition retenue n'entre plus dans les voix.",
    );
    assert(
      lines.includes("mouths: members"),
      "LANE FOYER — LES VOIX NE PARTENT PLUS DU ROSTER ENTIER. Une bouche " +
        "nommée redevient invisible au modèle, et sa ligne n'est plus " +
        "appliquée que par la ceinture, APRÈS coup.",
    );
    assert(
      lines.includes("ownerMemberId"),
      "LANE FOYER — personne ne porte plus les lignes de la TABLE.",
    );
    assert(
      !src.includes("compositionLinesFor("),
      "LANE FOYER — le lecteur à audience UNIQUE est revenu: il ne rend que " +
        "les lignes de la table et du composeur.",
    );
    // ⚠️ LES DEUX POINTS D'INJECTION, PAS UNE MENTION. Un premier jet
    // n'exigeait que « le bloc `voices` parle de `retainedVoiceLines` »: la
    // garde de vacuité en tête de l'IIFE (`retainedVoiceLines.length === 0`)
    // suffisait à la satisfaire, donc l'assertion restait VERTE sur un bloc
    // dont les deux injections avaient été retirées. Une mention n'est pas un
    // câblage.
    //
    // ⟳ LOT C — IL Y AVAIT DEUX POINTS D'INJECTION, IL N'EN RESTE QU'UN, ET
    // C'EST LE LOT. Le bloc fusionnait les items structurés avec les phrases
    // PLATES que `loadHouseholdVoices` allait chercher sur la ligne de chaque
    // titulaire (`[...retainedVoiceLines, ...v.lines]`), et un second cas
    // servait le titulaire qui n'avait AUCUNE phrase plate. Ce chargeur est
    // supprimé: il n'y a plus de seconde liste avec quoi fusionner, donc plus
    // qu'un chemin — celui des items structurés.
    const voices = between(
      src,
      "const voices: { voices: RawMemberVoice[]",
      "issues.push(...voices.issues);",
    );
    // ⟳ 2026-09-04 — UNE VOIX PAR BOUCHE, PLUS UNE POUR TOUT LE MONDE.
    // C'était `lines: retainedVoiceLines`, la liste unique empilée sous le
    // composeur. Ce qu'il faut tenir n'a pas changé — que les lignes lues,
    // routées et comptées atteignent VRAIMENT le prompt.
    assert(
      voices.includes("lines: [...v.written, ...v.remembered],"),
      "LANE FOYER — les lignes retenues n'entrent plus dans les voix: elles " +
        "sont lues, routées, comptées, et le prompt ne les voit jamais.",
    );
    assert(
      voices.includes("retainedComposition.byMouth"),
      "LANE FOYER — les voix ne partent plus des lignes PAR BOUCHE: une " +
        "bouche nommée redevient muette pour le modèle.",
    );
    // ⛔ ET LE FILTRE DES BOUCHES À TABLE RESTE. Sans lui, le modèle compose
    // pour quelqu'un qui n'est pas là.
    // ⚠️ LE FILTRE ENTIER, PAS LE PRÉDICAT. `platedIds.has(v.memberId)` apparaît
    // AUSSI dans la boucle qui compte les bouches absentes, deux lignes plus
    // bas: chercher le prédicat seul laissait la coupe verte — mesuré.
    assert(
      voices.includes(".filter((v) => platedIds.has(v.memberId))"),
      "LANE FOYER — les voix ne sont plus bornées aux bouches à table.",
    );
    assert(
      !voices.includes("loadHouseholdVoices"),
      "LANE FOYER — le chargeur des phrases plates est de retour: c'est une " +
        "SECONDE source de préférences, celle que le lot C a fermée.",
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
      // ⟳ 2026-09-04 — LA COUPE VISE MAINTENANT LE ROSTER, pas une liste
      // unique. `mouths: []` est la forme exacte de la régression: le lecteur
      // est appelé, il rend une structure valide, et elle est VIDE — donc plus
      // aucune bouche nommée n'atteint le prompt, en silence.
      name: "les voix ne partent plus du roster entier",
      expects: "NE PARTENT PLUS DU ROSTER ENTIER",
      apply: (src) => src.replace("mouths: members,", "mouths: [],"),
    },
    {
      name: "le lecteur à audience unique revient",
      expects: "le lecteur à audience UNIQUE est revenu",
      apply: (src) =>
        // ⚠️ UNE MUTATION QUI **AJOUTE**: on rouvre le chemin d'avant à côté du
        // bon. Le retirer ferait mordre une autre garde, et le harnais refuse
        // qu'une mutation soit attrapée par la mauvaise.
        // ⚠️ SUR PLUSIEURS LIGNES, ET C'EST OBLIGATOIRE. `assertSpeaksForIsNeverEmpty`
        // capture `/speaksFor:\s*([^,\n]+)/`: écrit sur une seule ligne, l'appel
        // rendrait « retainedSpeaksFor });\u0020» et ferait mordre CETTE garde-là.
        // Le harnais refuse alors la mutation — « la mauvaise garde a mordu » —
        // et il a raison: une mutation doit prouver UNE assertion, pas une autre.
        src.replace(
          "    const retainedCravings = cravingLinesFor({",
          "    const legacyLines = compositionLinesFor({\n" +
            "      items: [],\n" +
            "      speaksFor: retainedSpeaksFor,\n" +
            "    });\n" +
            "    const retainedCravings = cravingLinesFor({",
        ),
    },
    {
      name: "les bouches perdent leurs lignes dans la voix",
      expects: "n'entrent plus dans les voix",
      apply: (src) =>
        src.replace("lines: [...v.written, ...v.remembered],", "lines: [],"),
    },
    {
      // ⛔ LA GARDE DU FILTRE. Sans elle, une bouche absente toute la fenêtre
      // serait servie au modèle, qui composerait pour quelqu'un qui n'est pas là.
      name: "les voix ne sont plus bornées aux bouches à table",
      expects: "plus bornées aux bouches à table",
      apply: (src) =>
        src.replace(".filter((v) => platedIds.has(v.memberId))", ""),
    },
    {
      name: "le chargeur des phrases plates revient",
      expects: "SECONDE source de préférences",
      apply: (src) =>
        // ⚠️ UNE MUTATION QUI **AJOUTE**, jamais qui retire: retirer
        // `lines: retainedVoiceLines` ferait mordre la garde du DESSUS, et le
        // harnais refuserait (« la mauvaise garde a mordu »). Ce qu'on veut
        // prouver ici est qu'une SECONDE source rajoutée à côté de la bonne se
        // fait voir — c'est exactement la forme qu'aurait la régression.
        src.replace("      reads: 0,", "      reads: loadHouseholdVoices(),"),
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

// ⟳ 2026-09-11 · LOT 7 — LA LANE `MEAL` A ÉTÉ RETIRÉE DE LA LISTE avec la
// fonction `generate-meal-v1`. Sa définition reste juste au-dessus, inerte,
// pour que le jour où une seconde lane revient on la rebranche au lieu de
// la réécrire. La propriété, elle, continue d'être éprouvée sur le foyer.
const LANES: readonly Lane[] = [HOUSEHOLD];

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
