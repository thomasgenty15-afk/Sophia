/**
 * ══════════════════════════════════════════════════════════════════════════
 * `D3′` — LA HIÉRARCHIE, ÉCRITE UNE FOIS, ET POSÉE LÀ OÙ ELLE EST LUE.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Plan: `scratchpad/2026-08-21-PLAN-DE-MISE-EN-OEUVRE.md`, fiche `D3′`.
 *
 * ⛔ CE MODULE N'IMPORTE RIEN, ET C'EST UNE RÈGLE, PAS UN STYLE (§⑨ n° 92).
 * Une garde livrée dans un fichier neuf et commitable ne vaut que si elle
 * type-checke DEPUIS UN CLONE. Neuf lots de cette campagne ont livré une garde
 * qui importait le module qu'elle gardait — un fichier `M` — et le dépôt a
 * gagné neuf gardes qu'un clone ne peut pas exécuter. Ici: zéro import, des
 * formes locales minimales, des entrées en paramètres.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * ① CE QUE LA `mesure AVANT` A TROUVÉ, ET QUI RENVERSE LE LOT
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⛔ LA PHRASE DE RANG 1 ÉTAIT FACTUELLEMENT FAUSSE SUR LA LANE FOYER.
 *
 * Elle disait: « The hard constraints and the diet at the VERY TOP of this
 * message ». Or sur la lane foyer, le régime (`== WHAT THE SHARED DISH MUST
 * RESPECT ==`), les règles de maison (`HOUSE RULES —`) et la contamination
 * croisée (`== THE SAME KITCHEN, TWO DISHES ==`) sont **SOUS** ce bloc:
 * mesuré à 63 lignes plus bas sur un foyer nominal, 101 sur un foyer complet
 * (`scripts/keel_d3_position_du_bloc_20260822.ts`, 2026-08-22).
 *
 * ⇒ le bloc envoyait le modèle chercher le régime là où il n'est pas. C'est
 * PIRE que sa position: une règle mal placée est lue tard, un pointeur faux
 * vers une règle de sécurité n'est pas lu du tout. Le rang 1 de la lane foyer
 * ne désigne donc plus une POSITION, il NOMME ses blocs.
 *
 * ⚠️ ET LA LANE SOLO GARDE SA PHRASE, À L'OCTET PRÈS. Elle n'est pas fausse
 * là-bas: `buildMealPrompt` pose `args.dietBlock` à ~50 lignes du début du
 * message (`meal_generation.ts:3458`), et la mesure rend 0 bloc après
 * l'arbitrage sur 74 prompts archivés. Le périmètre de `D3′` est le FOYER, et
 * un test de ce module tient le texte solo octet pour octet.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * ② LA DERNIÈRE PLACE EST PRISE À `crossContact.block`, ET ÇA S'ÉCRIT
 * ══════════════════════════════════════════════════════════════════════════
 *
 * « La contrainte la plus proche de la fin est lue comme la plus
 * contraignante » est l'invariant fondateur de `household_meal_generation.ts`.
 * CINQ blocs ont refusé la dernière place pour cette raison (le régime, la
 * cuisine, les traditions, les plats dédiés, les `why`), et `crossContact` l'a
 * PRISE avec trois raisons écrites — dont « c'est la seule règle de ce prompt
 * dont la violation envoie quelqu'un à l'hôpital ».
 *
 * ⛔ CE BLOC-CI LA REPREND, ET IL EST LE SEUL QUI PUISSE LE FAIRE SANS
 * DÉMOTER PERSONNE — parce que son CONTENU EST LEUR RANG.
 *
 *   · N'importe quel autre bloc placé après les verrous les démote: il occupe
 *     le cran de récence avec autre chose qu'eux.
 *   · Celui-ci occupe ce cran POUR LE LEUR DONNER. Son rang 1 nomme les trois
 *     blocs de verrou par leur en-tête littéral, et sa dernière phrase parle
 *     encore d'allergie et de liste médicale.
 *
 * ⚠️ L'ÉPREUVE EST MÉCANIQUE, PAS UNE PROMESSE: `precedenceTailVerdict` rend
 * `lastContentBlock`, et un test exige que le dernier paragraphe de contenu du
 * message parle encore d'allergie ET de liste médicale. Si une réécriture
 * future terminait le bloc sur l'envie du soir, ce test rougit.
 *
 * ⚠️ ET IL PREND AUSSI LA PLACE DU BLOC GROSSESSE (`pregnancySuffix`, collé
 * après le suffixe de foyer à `generate-household-meal-v1/index.ts:4437`).
 * Même raisonnement, et il est écrit ici pour qu'on ne le redécouvre pas.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * ③ CE QUE CE MODULE NE FAIT PAS — PORTE `G-disclosure`, NON TRANCHÉE
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⛔ IL N'EXISTE AUCUNE SURFACE DE SORTIE LÉGALE POUR CET ARBITRAGE.
 * Les deux seules candidates portent déjà un interdit d'énonciation écrit par
 * des lots antérieurs:
 *   · `dishes[].why` — « It NEVER says whose diet, whose allergy, whose
 *     medical list or whose house rule made you pick it »;
 *   · `member_portions[].portion_note` — « Serving instructions only — never a
 *     reason, a goal … or anything about a person's body ».
 *
 * ⇒ sous la loi de `L6′-b` (« une consigne absente du squelette de sortie est
 * une consigne que le modèle comprend et n'exécute pas »), `D3′` ne peut être
 * qu'un lot d'ENTRÉE. La question ouverte — ⛔ QUI, À CETTE TABLE, A LE DROIT
 * D'APPRENDRE QUE SON BESOIN A PERDU ? — est une PORTE (`G-disclosure`), elle
 * appartient au propriétaire, et ce module ne la tranche pas.
 *
 * ⚠️ CONSÉQUENCE DIRECTE SUR LE TEXTE: l'ancienne queue du bloc ordonnait
 * « say what you did instead in that dish's "why" ». Sur la lane foyer, quand
 * la règle supérieure est le régime ou l'allergie de quelqu'un, cette phrase
 * DEMANDE très exactement ce que le bloc des `why` INTERDIT. Deux consignes
 * opposées dans le même message. La variante foyer la remplace par une règle
 * qui tient les deux: on dit ce qu'on a fait comme un fait sur L'ALIMENT,
 * jamais comme un fait sur une personne.
 */

// ---------------------------------------------------------------------------
// Les formes locales minimales — §⑨ n° 92
// ---------------------------------------------------------------------------

/**
 * Les deux lanes, et il n'y en aura pas de troisième sans une décision.
 *
 * ⛔ JETONS ASCII ANGLAIS (R1), et chacun a une branche NOMMÉE dans
 * `buildPrecedenceBlock` (R6). Un `default` silencieux rendrait le texte solo
 * sur un foyer, ce qui est très exactement le défaut que ce lot répare.
 */
export const PRECEDENCE_LANES = ["solo", "household"] as const;
export type PrecedenceLane = (typeof PRECEDENCE_LANES)[number];

/**
 * L'EN-TÊTE, IDENTIQUE SUR LES DEUX LANES ET SUR LES DEUX MILLÉSIMES.
 *
 * ⛔ NE PAS LE FAIRE VARIER PAR LANE. C'est lui qui permet à
 * `movePrecedenceToTail` de retirer une occurrence antérieure et à
 * `precedenceTailVerdict` de la retrouver dans un prompt ARCHIVÉ. Deux
 * en-têtes voudraient dire qu'un prompt d'hier n'est plus comparable à un
 * prompt d'aujourd'hui.
 *
 * ⚠️ « ABOVE » EST DEVENU LITTÉRALEMENT VRAI. Le bloc étant désormais en
 * queue, tout ce qu'il arbitre est effectivement au-dessus de lui — ce qui
 * n'était pas le cas quand il était enterré sous 2 à 9 blocs.
 */
export const PRECEDENCE_HEADER =
  "-- WHEN TWO OF THE LINES ABOVE WANT DIFFERENT THINGS --";

/**
 * LE MARQUEUR DU BLOC DE LANGUE, RECOPIÉ EN LITTÉRAL ET PAS IMPORTÉ.
 *
 * `locale.ts` ne l'exporte pas, et l'importer ferait de ce module un module
 * qui dépend d'un autre — la règle n° 92 l'interdit. Le coût du littéral est
 * borné et il tombe DU BON CÔTÉ: si `locale.ts` changeait cette première
 * ligne, `precedenceTailVerdict` cesserait de reconnaître le bloc de langue,
 * le compterait comme du contenu, et rendrait `buried`. Une garde qui hurle,
 * pas une garde qui se tait.
 */
export const LANGUAGE_BLOCK_MARKER = "CONTENT_LANGUAGE:";

/**
 * LE TAG DE JOURNAL DU COMPTEUR — nommé ici, à côté de ce qu'il compte.
 */
export const PRECEDENCE_COUNTER_TAG = "keel.household_meal.precedence";

// ---------------------------------------------------------------------------
// ① Le texte
// ---------------------------------------------------------------------------

/**
 * LA VARIANTE SOLO — GELÉE, OCTET POUR OCTET.
 *
 * ⛔ NE PAS « HARMONISER » AVEC LA VARIANTE FOYER. Le périmètre de `D3′` est
 * le foyer: sur la lane solo la mesure rend 0 bloc après l'arbitrage sur 74
 * prompts archivés, et la phrase « at the VERY TOP » y est vraie. La toucher
 * changerait un prompt que rien n'a mesuré comme défaillant. Un test tient ce
 * texte caractère par caractère.
 */
const SOLO_LINES: readonly string[] = [
  PRECEDENCE_HEADER,
  "They will. This order decides, and nothing in this message outranks it.",
  "1. The hard constraints and the diet at the VERY TOP of this message. They",
  "   are absolute. No craving, no coach line, no budget and no cooking time",
  "   ever touches them, and \"a small amount\" is not an exception.",
  "2. This coach's method and red lines.",
  "3. What this kitchen and this week can ACTUALLY do — the cooking days, the",
  "   equipment they do not have, the minutes, the money. A plan they cannot",
  "   execute is not a smaller plan, it is no plan. When the method asks for a",
  "   gesture this kitchen cannot make, keep the method's INTENT and change the",
  "   gesture, and say so.",
  "4. What they wrote themselves.",
  "5. What they feel like eating this time, what came up in conversation, and",
  "   the season. These RANK your choices among the dishes 1 to 4 already",
  "   allow. They never veto, and they never override.",
  "When something lower cannot be honoured because something higher forbids it,",
  "compose the nearest dish the higher rule DOES allow, and say what you did",
  "instead in that dish's \"why\". Never drop the meal, and never honour it",
  "quietly by halves.",
];

/**
 * LES TROIS EN-TÊTES DE VERROU DU FOYER, CITÉS PAR LE RANG 1.
 *
 * ⛔ RECOPIÉS EN LITTÉRAL DEPUIS LES MODULES QUI LES ÉCRIVENT
 * (`household_diet.ts:308`, `household_meal_generation.ts:934`,
 * `cross_contact.ts`). Les importer ferait dépendre ce module de trois
 * fichiers `M`.
 *
 * ⚠️ ET CE SONT DES CITATIONS, PAS DES CONDITIONS. Le rang 1 les nomme même
 * quand ils ne sortent pas: nommer un bloc absent coûte une ligne inutile,
 * taire un bloc présent coûte la règle. Le COMPTEUR, lui, distingue les deux
 * (`ranksWithoutObject`), et c'est sa raison d'être.
 */
export const HOUSEHOLD_LOCK_HEADERS: readonly string[] = [
  "WHAT THE SHARED DISH MUST RESPECT",
  "HOUSE RULES",
  "THE SAME KITCHEN, TWO DISHES",
];

/**
 * LA VARIANTE FOYER — trois choses de plus que la solo, et pas une de plus.
 *
 * ① Le rang 1 nomme ses blocs au lieu de désigner une position fausse.
 * ② Un arbitrage INTER-BOUCHES, qui est le sujet entier de la fiche: le rang
 *    ne se lisait qu'entre les FAMILLES de désirs, jamais entre deux
 *    personnes.
 * ③ Une queue qui ne contredit plus le bloc des `why` (voir ③ de l'en-tête).
 */
const HOUSEHOLD_LINES: readonly string[] = [
  PRECEDENCE_HEADER,
  "They will. This order decides, and nothing in this message outranks it.",
  "1. Every hard constraint and every declared diet in this message, WHEREVER",
  "   it sits. They are NOT all at the top: the allergies and the medical",
  "   lines are near the beginning, and the blocks headed \"WHAT THE SHARED",
  "   DISH MUST RESPECT\", \"HOUSE RULES\" and \"THE SAME KITCHEN, TWO DISHES\"",
  "   are further down, between that beginning and this line. All of them are",
  "   absolute. No craving, no coach line, no budget and no cooking time ever",
  "   touches them, and \"a small amount\" is not an exception.",
  "2. This coach's method and red lines.",
  "3. What this kitchen and this week can ACTUALLY do — the cooking days, the",
  "   equipment they do not have, the minutes, the money. A plan they cannot",
  "   execute is not a smaller plan, it is no plan. When the method asks for a",
  "   gesture this kitchen cannot make, keep the method's INTENT and change the",
  "   gesture, and say so.",
  "4. What the people at this table wrote themselves.",
  "5. What they feel like eating this time, what came up in conversation, and",
  "   the season. These RANK your choices among the dishes 1 to 4 already",
  "   allow. They never veto, and they never override.",
  "",
  "AND WHEN TWO MOUTHS AT THIS TABLE WANT OPPOSITE THINGS:",
  "The same order decides, mouth by mouth. Never average two mouths, and never",
  "settle it by whose name came first or by whose plan this is.",
  "- A rank 1 line of ANY mouth beats a rank 2 to 5 line of EVERY other mouth,",
  "  including the person this plan was asked by. Nobody at this table",
  "  outranks anybody else's allergy, medical line or declared diet.",
  "- Two rank 1 lines never cancel each other. Compose the shared dish so that",
  "  BOTH hold. If no single dish can hold both, the shared dish follows the",
  "  STRICTER line, and a second dish exists only where the blocks above",
  "  already allow one. Serving a forbidden food in a smaller amount is not a",
  "  way of holding both.",
  "- Below rank 1, how much of the shared dish goes on one plate is not an",
  "  arbitration at all. It lives in \"member_portions\", one entry per person,",
  "  and it never changes what the shared dish IS.",
  "",
  "AND YOU DECIDE IT WITHOUT SAYING WHO LOST:",
  "When something lower cannot be honoured because something higher forbids",
  "it, compose the nearest dish the higher rule DOES allow. Never drop the",
  "meal, and never honour it quietly by halves.",
  "Say what you did in that dish's \"why\" as a fact about the FOOD, never as a",
  "fact about a person: not whose diet, whose allergy, whose medical list or",
  "whose house rule decided it, and not whose wish gave way. \"This one is",
  "dairy-free\" is a fact about the dish; naming the person it is dairy-free",
  "FOR is a fact about them, and it is read out loud at this table.",
  "",
  // ⛔ LE DERNIER MOT, ET IL EST LÀ POUR UNE RAISON MESURÉE.
  //
  // Ce bloc PREND la dernière place à `crossContact.block` (voir ② de
  // l'en-tête). La seule chose qui rend cet échange honnête, c'est que le cran
  // de récence — la toute dernière ligne de contenu que le modèle lit — parle
  // ENCORE de la règle qui envoie quelqu'un à l'hôpital quand on la viole.
  //
  // ⚠️ CETTE LIGNE N'EST PAS UNE REDONDANCE DE STYLE. `precedenceTailVerdict`
  // rend `lastContentBlock`, et un test EXIGE qu'il nomme l'allergie et la
  // liste médicale. La retirer « parce qu'elle répète le rang 1 » fait rougir
  // la garde, et c'est le point: sans elle, le lot aurait démoté la sécurité
  // d'un cran pour y poser un classement.
  "THE LAST WORD, AND IT IS THE FIRST RULE: an allergy, a medical line or a",
  "declared diet at this table is never traded against anything else in this",
  "message. Everything above is a ranking; that one is a floor.",
];

/**
 * Le bloc d'arbitrage de cette lane.
 *
 * ⛔ R6: chaque jeton de `PRECEDENCE_LANES` a sa branche NOMMÉE, et l'absence
 * de `default` est délibérée — un jeton neuf doit faire rougir la compilation,
 * jamais retomber en silence sur le texte de l'autre lane.
 */
export function buildPrecedenceBlock(lane: PrecedenceLane): string {
  if (lane === "solo") return SOLO_LINES.join("\n");
  if (lane === "household") return HOUSEHOLD_LINES.join("\n");
  // Inatteignable si le type tient; présent pour que le runtime ne rende
  // jamais une chaîne vide silencieuse (R7).
  throw new Error(`buildPrecedenceBlock: lane inconnue (${String(lane)})`);
}

// ---------------------------------------------------------------------------
// ② Le déplacement — le patron de `appendContentLanguageBlock`, à la lettre
// ---------------------------------------------------------------------------

/**
 * POSER LE BLOC D'ARBITRAGE EN QUEUE DU MESSAGE UTILISATEUR.
 *
 * ⛔ « IDEMPOTENT » NE SUFFIT PAS, IL FAUT « DÉPLAÇABLE ». C'est la cicatrice
 * exacte de `appendContentLanguageBlock` (`locale.ts:388-403`): une garde
 * écrite `if (msg.endsWith(block)) return msg` n'est vraie que tant que le
 * bloc est DÉJÀ dernier. Or ici il ne l'est jamais — `buildMealPrompt` le pose
 * au milieu du tronc, et la lane foyer colle 2 à 9 blocs après lui.
 *
 * ⇒ on RETIRE toute occurrence antérieure — des DEUX lanes, parce que le
 * tronc porte la variante solo et qu'on veut poser la variante foyer — puis on
 * réécrit en queue.
 *
 * ⚠️ LE BLOC DE LANGUE PASSE APRÈS, ET C'EST VOULU. L'appelant enchaîne
 * `appendContentLanguageBlock`, qui est lui aussi déplaçable: l'arbitrage finit
 * avant-dernier, la langue dernière. C'est l'ordre que
 * `household_meal_generation.ts` déclare déjà pour `crossContact.block` — une
 * consigne de LANGUE ne concurrence pas une consigne de CONTENU.
 */
export function movePrecedenceToTail(message: string, lane: PrecedenceLane): string {
  let body = String(message ?? "");
  for (const known of PRECEDENCE_LANES) {
    body = body.split(buildPrecedenceBlock(known)).join("");
  }
  body = body.trimEnd();
  const block = buildPrecedenceBlock(lane);
  return body ? `${body}\n\n${block}` : block;
}

// ---------------------------------------------------------------------------
// ③ Le verdict de position — la `mesure APRÈS`, sans aucune génération
// ---------------------------------------------------------------------------

/** Ce qu'on sait de la place du bloc dans un message assemblé. */
export interface PrecedenceTailVerdict {
  /** `absent` = le bloc n'est pas dans ce message du tout. */
  verdict: "tail" | "buried" | "absent";
  /**
   * ⛔ LE BLOC A-T-IL ÉTÉ RECONNU EN ENTIER, OU SEULEMENT PAR SON EN-TÊTE ?
   *
   * Un prompt ARCHIVÉ porte le texte du jour où il a été écrit. Quand le corps
   * ne correspond plus, on retombe sur l'en-tête seul et on ne connaît la fin
   * du bloc qu'au premier saut de paragraphe — ce qui compte les paragraphes
   * SUIVANTS du bloc lui-même comme s'ils venaient après. Le repli erre donc
   * vers `buried`, jamais vers `tail`: il ne peut pas déclarer un succès qu'il
   * n'a pas mesuré. `exact: false` est le drapeau qui empêche de lire un
   * chiffre de repli comme un chiffre de mesure.
   */
  exact: boolean;
  /**
   * Combien de morceaux de CONTENU suivent le bloc. Le bloc de langue n'en
   * est pas un: le dépôt le déclare « consigne de LANGUE, pas de contenu ».
   */
  contentBlocksAfter: number;
  /** Les premières lignes de ces morceaux, dans l'ordre. Pour la trace. */
  headersAfter: readonly string[];
  /**
   * ⛔ LE DERNIER PARAGRAPHE DE CONTENU DU MESSAGE, APLATI — l'épreuve que la
   * dernière place n'a pas été prise à la sécurité pour rien. Il doit encore
   * parler d'allergie et de liste médicale (voir ② de l'en-tête).
   *
   * ⚠️ UN PARAGRAPHE, PAS UNE LIGNE, ET C'EST UNE MESURE QUI A CORRIGÉ CE
   * FICHIER. Une première version lisait la dernière LIGNE PHYSIQUE et rendait
   * « message. Everything above is a ranking; that one is a floor. » — la
   * queue d'une phrase coupée à la colonne 78. La ligne physique n'est pas une
   * unité de sens ici: c'est un retour à la ligne de mise en page, et une
   * garde branchée dessus se casse au premier reformatage.
   */
  lastContentBlock: string;
}

/**
 * Où est le bloc d'arbitrage dans ce message, et qu'y a-t-il après lui.
 *
 * ⛔ MÉCANIQUE, AUCUN MATCHER. On découpe sur `\n\n` — le séparateur que les
 * deux générateurs utilisent pour joindre leurs blocs — et on compare des
 * chaînes littérales. Ce dépôt a mesuré douze faux positifs sur douze le jour
 * où il a écrit un matcher à la main.
 */
export function precedenceTailVerdict(
  message: string,
  options?: { trailingAllowed?: readonly string[] },
): PrecedenceTailVerdict {
  const trailing = options?.trailingAllowed ?? [LANGUAGE_BLOCK_MARKER];
  const text = String(message ?? "");
  const isTrailing = (chunk: string): boolean => {
    const first = chunk.split("\n")[0]?.trim() ?? "";
    return trailing.some((t) => first === t);
  };
  const keep = (chunks: readonly string[]): string[] =>
    chunks.filter((c) => c.trim().length > 0 && !isTrailing(c));

  const contentChunks = keep(text.split("\n\n"));
  const last = contentChunks[contentChunks.length - 1] ?? "";
  const lastContentBlock = last.split("\n").map((l) => l.trim()).filter((l) =>
    l.length > 0
  ).join(" ");

  // ⛔ LA FIN DU BLOC SE TROUVE PAR SON TEXTE, PAS PAR UN DÉCOUPAGE.
  // Le bloc du foyer porte des lignes vides à l'intérieur (trois paragraphes),
  // et `split("\n\n")` le couperait en morceaux: ses propres paragraphes
  // seraient alors comptés « après lui ». C'est le premier défaut mesuré de
  // cette garde, et il rendait `buried` sur un message parfaitement en queue.
  let end = -1;
  for (const lane of PRECEDENCE_LANES) {
    const block = buildPrecedenceBlock(lane);
    const at = text.lastIndexOf(block);
    if (at >= 0) end = Math.max(end, at + block.length);
  }
  let exact = end >= 0;
  if (!exact) {
    // Repli pour un prompt ARCHIVÉ, dont le corps est celui d'un autre jour.
    const h = text.lastIndexOf(PRECEDENCE_HEADER);
    if (h < 0) {
      return {
        verdict: "absent",
        exact: false,
        contentBlocksAfter: 0,
        headersAfter: [],
        lastContentBlock,
      };
    }
    const nextBreak = text.indexOf("\n\n", h);
    end = nextBreak < 0 ? text.length : nextBreak;
    exact = false;
  }
  const after = keep(text.slice(end).split("\n\n"));
  return {
    verdict: after.length === 0 ? "tail" : "buried",
    exact,
    contentBlocksAfter: after.length,
    headersAfter: after.map((c) => c.split("\n")[0]?.trim() ?? ""),
    lastContentBlock,
  };
}

// ---------------------------------------------------------------------------
// ④ Le compteur — DEUX populations, et il est armé par une prémisse
// ---------------------------------------------------------------------------

/**
 * COMBIEN D'OBJETS DE CHAQUE RANG CE PROMPT PORTE RÉELLEMENT.
 *
 * ⛔ DES NOMBRES, PAS DES BOOLÉENS. `false` ne dit pas si le rang est vide ou
 * si l'appelant a oublié de le remplir; `0` à côté de `3` le dit. C'est la
 * même discipline que `regime_belt.mouths` et que `why_rule.holders`.
 *
 * ⛔ ET CHAQUE CHAMP EST REQUIS. Un `?` ferait une garde désarmée en silence
 * — la cicatrice `safetyBand`, jamais passé, jamais vu.
 */
export interface PrecedenceObjects {
  /** rang 1 — verrous: allergies + médical + régimes déclarés + règles de maison. */
  locks: number;
  /** rang 2 — lignes de doctrine du coach servies dans ce prompt. */
  coachLines: number;
  /** rang 3 — contraintes de cuisine, de semaine, d'argent. */
  kitchenAndWeek: number;
  /** rang 4 — ce que les bouches ont écrit elles-mêmes (voix retenues). */
  writtenBySelf: number;
  /** rang 5 — envie de la semaine, conversation, saison. */
  wantedThisTime: number;
}

/** Les deux populations, plus le détail par rang. */
export interface PrecedenceRankCounts {
  /** Toujours 5. Le dénominateur, écrit et pas déduit. */
  ranks: number;
  /** Les rangs que ce prompt peut réellement arbitrer. */
  withObject: number;
  /**
   * ⛔ LES RANGS QUE LE BLOC NOMME ET QUE LE MESSAGE NE PEUT PAS HONORER.
   * C'est le nombre qui compte: un bloc qui promet cinq rangs sur un prompt
   * qui n'en porte qu'un dit au modèle d'arbitrer entre des choses absentes.
   * Sans ce compteur, « le rang n'a pas mordu » et « le rang n'avait rien à
   * mordre » rendent le même zéro.
   */
  withoutObject: number;
  /** Le détail, rang par rang, pour que le zéro se nomme. */
  byRank: Readonly<Record<"rank_1" | "rank_2" | "rank_3" | "rank_4" | "rank_5", number>>;
}

/**
 * Les deux populations de rangs, comptées sur les objets réellement servis.
 *
 * ⚠️ UN COMPTE NÉGATIF OU NON FINI COMPTE POUR ZÉRO, jamais pour « présent ».
 * Un `NaN` remonté d'un appelant ferait sinon monter `withObject` sur un rang
 * vide — un compteur qui monte pendant que le produit régresse est la
 * cicatrice `L26-0`, et elle se revérifie ici.
 */
export function countPrecedenceRanks(objects: PrecedenceObjects): PrecedenceRankCounts {
  const safe = (n: number): number =>
    Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  const byRank = {
    rank_1: safe(objects.locks),
    rank_2: safe(objects.coachLines),
    rank_3: safe(objects.kitchenAndWeek),
    rank_4: safe(objects.writtenBySelf),
    rank_5: safe(objects.wantedThisTime),
  } as const;
  const values = Object.values(byRank);
  const withObject = values.filter((n) => n > 0).length;
  return {
    ranks: values.length,
    withObject,
    withoutObject: values.length - withObject,
    byRank,
  };
}

/**
 * COMBIEN D'EN-TÊTES DE VERROU LE BLOC DE CETTE LANE CITE RÉELLEMENT.
 *
 * ⛔ C'EST LA MOITIÉ MESURABLE DU CORRECTIF DE TEXTE. « Le rang 1 nomme ses
 * blocs » est une affirmation; ce nombre est ce qui la rend falsifiable. Une
 * réécriture qui retirerait une citation le fait descendre, et un test le
 * voit.
 */
export function lockHeadersNamed(lane: PrecedenceLane): number {
  const block = buildPrecedenceBlock(lane);
  // ⚠️ Les en-têtes sont coupés sur plusieurs lignes dans le bloc (largeur 78).
  // On compare donc sur le texte APLATI, sinon la garde rendrait 0 sur un bloc
  // qui les cite parfaitement — un faux négatif qui ferait « réparer » le
  // texte au lieu de la mesure.
  const flat = block.replace(/\s+/g, " ");
  return HOUSEHOLD_LOCK_HEADERS.filter((h) => flat.includes(h)).length;
}
