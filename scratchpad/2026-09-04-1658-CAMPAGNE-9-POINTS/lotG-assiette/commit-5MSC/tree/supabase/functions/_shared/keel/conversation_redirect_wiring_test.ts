// ═══════════════════════════════════════════════════════════════════════════
// LOT 2C + M1 — LE CÂBLAGE DES DEUX RENVOIS, ÉPINGLÉ
//
// ⚠️ DEUX RENVOIS, UNE SEULE ASSERTION, PARAMÉTRÉE. Le lot M1 a ajouté le
// renvoi vers un CHAMP à côté du renvoi vers le BILAN. Écrire une seconde
// assertion jumelle aurait garanti qu'elles divergent au premier changement —
// et la divergence ne se verrait que sur le renvoi le moins testé. La forme du
// câblage étant la MÊME (armer tôt, dire dans `finalVisibleText`, compter deux
// nombres), c'est un paramètre qui les sépare, pas un copier-coller.
//
// ⚠️ CE FICHIER EXISTE À CAUSE D'UN DÉFAUT NOMMÉ SUR LE LOT 1C: un module
// parfait à 22 tests, avec ZÉRO test sur son câblage — on pouvait le retirer
// des trois générateurs et 3507 tests restaient verts. Un lot débranché était
// INDISCERNABLE d'un lot qui marche.
//
// Ce que ces tests tiennent, dans l'ordre de ce qui coûte le plus cher:
//
//   * L'AJOUT EST DANS `finalVisibleText`. C'est LE point du lot: ce dépôt
//     distingue le texte visible du rendu d'un outil, et une lane voisine
//     (`plan_question`) rend sa PROPRE réponse. Une phrase posée ailleurs
//     serait « rendue » sans être DITE.
//   * L'ARMEMENT PRÉCÈDE LES SORTIES. Le renvoi est armé au calcul des
//     signaux; s'il passait sous un `finalVisibleText`, ce dernier lirait
//     `undefined` et la phrase ne sortirait jamais — en silence. C'est le même
//     défaut que la lane foyer du lot 1G: « le lecteur existait, la donnée
//     existait, et elle était lue 430 lignes trop tard ».
//   * LA LANGUE VIENT DE LA PERSONNE, pas d'un littéral. Une garde testée dans
//     une seule langue ne mord pas dans l'autre, et ce produit a `fr-FR` par
//     défaut.
//   * LA GARDE ÉLÈVE EST LUE, pas écrite `true`. « Paramètre de garde optionnel
//     = garde désarmée » — et un `true` en dur est la version courte.
//
// ⚠️ LA MOITIÉ QU'ON OUBLIE, ET ELLE EST LA RAISON DE CE FICHIER: l'assertion
// est une FONCTION PURE appelée DEUX FOIS — une sur le vrai fichier (verte), une
// sur une copie EN MÉMOIRE dont l'appel a été retiré (rouge attendu). Sans le
// second appel, on ne distingue pas « le câblage est là » de « ma recherche de
// chaîne ne correspond plus à rien ».
// ═══════════════════════════════════════════════════════════════════════════

import { assert, assertEquals, assertThrows } from "jsr:@std/assert@1";

const RUN_TS = new URL("../../sophia-brain/router/run.ts", import.meta.url);

/**
 * ⚠️ LES COMMENTAIRES PARTENT D'ABORD, ET C'EST UNE CICATRICE DU DÉPÔT
 * (« Audit d'appelants: retirer les commentaires »). `run.ts` PARLE
 * abondamment de `sizing_redirect`, de `appendSizingRedirect` et de
 * `plan_question` dans ses blocs de tête: un grep naïf rendrait vert un produit
 * entièrement débranché, sur la seule foi de sa prose.
 */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(
    /(^|[^:])\/\/[^\n]*/g,
    "$1",
  );
}

/**
 * LES ARGUMENTS D'UN APPEL, DÉCOUPÉS AU NIVEAU SUPÉRIEUR.
 *
 * Patron de `retained_portion_wiring_test.ts`: on équilibre les délimiteurs
 * plutôt que d'écrire une expression régulière. L'appel visé porte des
 * arguments qui contiennent eux-mêmes des virgules, des parenthèses et des
 * accolades; une regex serait verte sur le défaut exact qu'on tient ici.
 */
function callArgs(src: string, callee: string, from = 0): string[] {
  const open = src.indexOf(`${callee}(`, from);
  if (open === -1) throw new Error(`appel introuvable: ${callee}(`);
  let depth = 0;
  let start = open + callee.length + 1;
  const args: string[] = [];
  for (let i = start; i < src.length; i += 1) {
    const c = src[i];
    if (c === "(" || c === "[" || c === "{") depth += 1;
    else if (c === ")" || c === "]" || c === "}") {
      if (depth === 0 && c === ")") {
        args.push(src.slice(start, i).trim());
        if (args.length > 0 && args[args.length - 1] === "") args.pop();
        return args;
      }
      depth -= 1;
    } else if (c === "," && depth === 0) {
      args.push(src.slice(start, i).trim());
      start = i + 1;
    }
  }
  throw new Error(`appel non refermé: ${callee}(`);
}

function indexesOf(src: string, needle: string): number[] {
  const out: number[] = [];
  let at = src.indexOf(needle);
  while (at !== -1) {
    out.push(at);
    at = src.indexOf(needle, at + 1);
  }
  return out;
}

// ═══════════════════════════════════════════════════════════════════════════
// L'ASSERTION, PURE — appelée sur le vrai fichier ET sur des copies mutées
// ═══════════════════════════════════════════════════════════════════════════

/**
 * LE CÂBLAGE DU RENVOI, VÉRIFIÉ SUR UNE SOURCE. Lève à la première rupture.
 *
 * ⚠️ PURE, ET SANS I/O: c'est ce qui permet de la rejouer sur une copie en
 * mémoire. Une assertion qui lirait le disque elle-même ne pourrait jamais être
 * éprouvée par mutation, et on ne saurait pas si elle mord.
 */
/**
 * CE QUI SÉPARE LES DEUX RENVOIS. Tout le reste de la forme est identique.
 *
 * ⚠️ `signal` EST DANS LA SPEC, ET C'EST LA PROPRIÉTÉ LA PLUS IMPORTANTE: c'est
 * elle qui dit que la détection vient du VERDICT DU MODÈLE et pas d'une
 * relecture du message. « laitue » ≠ « lait », 12 faux positifs sur 12.
 */
interface RedirectSpec {
  /** Le nom lisible, pour les messages d'échec. */
  readonly label: string;
  /** Le champ du tour qui porte la phrase. */
  readonly field: string;
  /** La fonction d'armement. */
  readonly arm: string;
  /** Le signal du dispatcher qu'elle lit. */
  readonly signal: string;
  /** La variable qui capture le texte AVANT l'ajout. */
  readonly before: string;
  /** Le tag du compteur. */
  readonly tag: string;
}

export const SIZING_SPEC: RedirectSpec = {
  label: "renvoi du sizing",
  field: "keel.sizing_redirect",
  arm: "keelTurn.sizing_redirect = sizingRedirectFor(",
  signal: "signal: dispatcherSignals.plan_feedback",
  before: "beforeSizingRedirect",
  tag: 'tag: "keel/sizing_redirect"',
};

export const PROFILE_SPEC: RedirectSpec = {
  label: "renvoi vers un champ (lot M1)",
  field: "keel.profile_redirect",
  arm: "keelTurn.profile_redirect = profileRedirectFor(",
  signal: "signal: dispatcherSignals.profile_statement",
  before: "beforeProfileRedirect",
  tag: 'tag: "keel/profile_redirect"',
};

export function assertRedirectWiring(
  rawSource: string,
  spec: RedirectSpec,
): void {
  const src = stripComments(rawSource);

  // ── ① L'AJOUT EXISTE, ET IL REÇOIT LE CHAMP DU TOUR ─────────────────────
  //
  // ⚠️ ON CHERCHE L'APPEL QUI PORTE **CE** CHAMP, pas le premier `appendRedirect`
  // venu. Les deux renvois partagent la fonction d'ajout: viser le premier
  // appel rendrait le test du second VERT sur le câblage du premier — deux
  // assertions qui se doublent, donc aucune des deux prouvée.
  const appendAt = indexesOf(src, "appendRedirect(").find((at) => {
    const args = callArgs(src, "appendRedirect", at - "appendRedirect(".length + 1);
    return args.length === 2 && args[1] === spec.field;
  });
  assert(
    appendAt !== undefined,
    `RENVOI DÉBRANCHÉ (${spec.label}): aucun \`appendRedirect(out, ` +
      `${spec.field})\` dans \`run.ts\`. Ce que la personne vient de dire est ` +
      "alors refusé par la matrice ET silencieux pour elle — c'est-à-dire le " +
      "geste exact que ce lot existe pour empêcher.",
  );

  // ── ② L'AJOUT EST DANS `finalVisibleText`, ET C'EST TOUT LE LOT ─────────
  // C'est le SEUL entonnoir que tous les chemins de sortie traversent. Posé
  // ailleurs, le renvoi serait avalé par la première lane qui rend sa propre
  // réponse — `plan_question` en capture une part importante.
  const belt = src.indexOf("export function finalVisibleText(");
  assert(belt !== -1, "`finalVisibleText` a disparu de `run.ts`");
  assert(
    (appendAt as number) > belt,
    "L'AJOUT A QUITTÉ `finalVisibleText`: il est posé AVANT la ceinture de " +
      "sortie, donc sur un seul chemin. Une lane voisine qui rend sa propre " +
      "réponse l'avalerait sans laisser de trace — « rendu » n'est pas « dit ».",
  );

  // ── ③ L'ARMEMENT EXISTE, ET IL LIT LA PERSONNE ──────────────────────────
  const armAt = src.indexOf(spec.arm);
  assert(
    armAt !== -1,
    `ARMEMENT DÉBRANCHÉ (${spec.label}): \`${spec.field}\` n'est plus posé. ` +
      "`appendRedirect` recevrait `undefined` à chaque tour, et le lot " +
      "serait indiscernable d'un lot qui marche.",
  );
  const armArgs = callArgs(src, spec.arm.slice(0, -1).split(" = ")[1]);
  assertEquals(armArgs.length, 1, "la fonction d'armement prend un seul objet");
  const arm = armArgs[0];
  // ⛔ AUCUN MATCHER MAISON: la détection vient du signal du dispatcher.
  assert(
    arm.includes(spec.signal),
    "LE RENVOI NE LIT PLUS LE SIGNAL DU DISPATCHER. S'il relit le message, " +
      "c'est un matcher maison — « laitue » ≠ « lait », 12 faux positifs sur 12.",
  );
  // ⚠️ LA LANGUE VIENT DE LA PERSONNE. Un littéral ici sortirait la phrase en
  // anglais chez la majorité des élèves (`profiles.locale` vaut `fr-FR`).
  assert(
    arm.includes("locale: keelTurn.content_locale"),
    "LA LANGUE DU RENVOI N'EST PLUS CELLE DE LA PERSONNE: elle vient d'un " +
      "littéral ou d'un défaut. Une doctrine `fr-FR` est déjà sortie en " +
      "anglais dans ce dépôt.",
  );
  // ⚠️ LA GARDE ÉLÈVE EST LUE, PAS ÉCRITE. `true` en dur est la version courte
  // de « paramètre de garde optionnel = garde désarmée ».
  assert(
    arm.includes("isKeelStudent: keelTurn.is_student === true"),
    "LA GARDE ÉLÈVE EST FIGÉE: `isKeelStudent` ne vient plus de " +
      "`keelTurn.is_student`. Le renvoi partirait vers un bilan de fin de plan " +
      "qui n'existe pas pour ce compte.",
  );

  // ── ④ L'ARMEMENT PRÉCÈDE LES SORTIES QUI DOIVENT LE DIRE ────────────────
  // Sans ce nombre, ③ se « répare » en remontant la ceinture au-dessus de
  // l'armement: le fichier compilerait, et la phrase ne sortirait plus jamais.
  const exits = indexesOf(src, "= finalVisibleText(");
  assertEquals(
    exits.length,
    3,
    "LE NOMBRE DE CHEMINS DE SORTIE A CHANGÉ. Ce test tient une propriété " +
      "d'ORDRE: chaque chemin neuf doit être classé — avant l'armement (crise, " +
      "où le renvoi ne doit PAS sortir) ou après (où il doit sortir).",
  );
  const after = exits.filter((at) => at > armAt);
  assertEquals(
    after.length,
    2,
    "L'ARMEMENT EST PASSÉ SOUS UN CHEMIN DE SORTIE. Celui-ci lirait " +
      "`keelTurn.sizing_redirect` avant qu'il ne soit posé, donc `undefined`, " +
      "et le renvoi ne serait jamais dit sur ce chemin — en silence. C'est le " +
      "défaut de la lane foyer du lot 1G, repris à l'identique.",
  );

  // ── ⑤ LE COMPTEUR, parce qu'une lane jamais atteinte doit se VOIR ───────
  assert(
    src.includes(spec.tag),
    "LE COMPTEUR A DISPARU. « Champ déclaré = compteur obligatoire »: sans " +
      "lui, une lane que rien n'atteint ressemble trait pour trait à une lane " +
      "qui marche, et on ne peut le PROUVER que par une lecture — pas par un " +
      "nombre.",
  );

  // ── ⑥ ET IL COMPTE TROIS NOMBRES, PAS UN (lot 4A) ───────────────────────
  //
  // ⚠️ LE DÉFAUT DE LA PREMIÈRE VERSION: elle ne journalisait QUE les tours où
  // `plan_feedback` était détecté. Tant que le signal n'avait pas d'écrivain,
  // ce journal était VIDE — et un journal vide se lit exactement comme « la
  // lane marche, personne ne parle de ses portions ». Le DÉNOMINATEUR doit
  // exister avant le numérateur, sinon le compteur ne peut pas dire la panne
  // qu'il est là pour dire.
  assert(
    src.includes('event: "seen"'),
    "LE DÉNOMINATEUR A DISPARU: la ligne ne part plus à chaque tour, donc " +
      "« 0 renvoi » ne se distingue plus de « 0 tour observé ». C'est la " +
      "forme exacte sous laquelle ce lot était invisible avant d'être écrit.",
  );
  assert(
    src.includes('event: "said"'),
    "LE TROISIÈME NOMBRE A DISPARU: on ne compte plus les renvois RÉELLEMENT " +
      "DITS, seulement les armés. Or « armé » n'est pas « dit » — c'est la " +
      "distinction que ce dépôt paie le plus cher (reply visible ≠ rendu " +
      "d'un outil), et c'est celle que le troisième nombre mesure.",
  );
  // Et il est MESURÉ sur le texte, pas déduit de l'armement: sans la
  // comparaison avant/après, la ligne « said » partirait même sur un tour où
  // la ceinture n'a rien ajouté.
  assert(
    src.includes(`out !== ${spec.before}`),
    "LE TROISIÈME NOMBRE N'EST PLUS MESURÉ SUR LA SORTIE: il redevient une " +
      "copie de l'armement, donc il ne peut plus contredire l'armement — et " +
      "un compteur qui ne peut pas contredire ne prouve rien.",
  );
  // ⚠️ L'ANTI-CAPTURE, ET C'EST LA SEULE FAÇON DE LE PROUVER PAR UN NOMBRE.
  // `plan_question` capture une part importante des tours; savoir si elle a
  // mordu sur le MÊME tour est ce qui distingue « les deux coexistent » de
  // « la lane voisine a mangé le retour ». Sans ce champ, la question ne se
  // tranche que par une relecture du prompt — c'est-à-dire pas du tout.
  assert(
    src.includes("plan_question_detected:"),
    "LA PREUVE DE NON-CAPTURE A DISPARU DU COMPTEUR: on ne sait plus dire si " +
      "`plan_question` a mordu sur les tours où le retour s'est perdu.",
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// LES DEUX APPELS — le vrai fichier (vert), puis des copies mutées (rouges)
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("LE CÂBLAGE — `run.ts` arme LES DEUX renvois et les DIT", async () => {
  const src = await Deno.readTextFile(RUN_TS);
  assertRedirectWiring(src, SIZING_SPEC);
  // ⚠️ LE SECOND N'EST PAS UNE FORMALITÉ. Le renvoi vers un champ est celui
  // qui REMPLACE un producteur retiré: s'il est débranché, le chat ne range
  // plus rien ET ne dit plus rien — la personne parle dans le vide, ce qui est
  // strictement pire que l'état d'avant le lot.
  assertRedirectWiring(src, PROFILE_SPEC);
});

Deno.test("ET L'ASSERTION MORD — quatorze mutations, quatorze rouges", async () => {
  // ⚠️ C'EST LA MOITIÉ QUI REND LE TEST CI-DESSUS UTILE. Sans elle, une
  // assertion dont les chaînes ne correspondent plus à rien passerait pour un
  // câblage sain.
  //
  // ⚠️ ET CHAQUE MUTATION EST JOUÉE SEULE. Un lot voisin a mesuré deux mutations
  // VERTES parce qu'elles se doublaient l'une l'autre: seule la troisième
  // mordait, et aucune des deux premières n'était donc prouvée. Une mutation
  // par propriété, et chacune doit rougir toute seule.
  const src = await Deno.readTextFile(RUN_TS);

  // ⚠️ CHAQUE MUTATION EST JOUÉE CONTRE **SA** SPEC. Une mutation du renvoi du
  // sizing ne doit pas rougir sur l'assertion du renvoi vers un champ: si elle
  // le faisait, les deux assertions se doubleraient et aucune ne serait prouvée
  // séparément — le défaut exact que la note ci-dessus décrit.
  type Scope = "global" | "in-block";
  const mutations: Array<[RedirectSpec, string, string, string, Scope?]> = [
    // ① l'appel retiré — « quelqu'un supprime la ligne »
    [
      SIZING_SPEC,
      "l'ajout du sizing retiré",
      "out = appendRedirect(out, keel.sizing_redirect);",
      "",
    ],
    [
      PROFILE_SPEC,
      "l'ajout du champ retiré",
      "out = appendRedirect(out, keel.profile_redirect);",
      "",
    ],
    // ② l'ajout débranché du champ du tour — la forme la plus vraisemblable
    //    d'un débranchement « en attendant »
    [
      SIZING_SPEC,
      "l'ajout du sizing reçoit null",
      "appendRedirect(out, keel.sizing_redirect)",
      "appendRedirect(out, null)",
    ],
    [
      PROFILE_SPEC,
      "l'ajout du champ reçoit null",
      "appendRedirect(out, keel.profile_redirect)",
      "appendRedirect(out, null)",
    ],
    // ③ l'armement retiré
    [
      SIZING_SPEC,
      "l'armement du sizing retiré",
      "keelTurn.sizing_redirect = sizingRedirectFor(",
      "const unusedSizing = sizingRedirectFor(",
    ],
    [
      PROFILE_SPEC,
      "l'armement du champ retiré",
      "keelTurn.profile_redirect = profileRedirectFor(",
      "const unusedProfile = profileRedirectFor(",
    ],
    // ④ le signal remplacé par une relecture du message — LE MATCHER MAISON
    [
      SIZING_SPEC,
      "le sizing relit le message",
      "signal: dispatcherSignals.plan_feedback,",
      "signal: { detected: userMessage.includes(\"portion\") },",
    ],
    [
      PROFILE_SPEC,
      "le champ relit le message",
      "signal: dispatcherSignals.profile_statement,",
      "signal: { detected: userMessage.includes(\"four\") },",
    ],
    // ⑤ la langue figée — la cicatrice mesurée du dépôt
    //
    // ⚠️ MUTÉE **DANS LE BLOC D'ARMEMENT**, ET PAS PAR UN `replace` GLOBAL. Les
    // deux armements portent la MÊME ligne `locale: keelTurn.content_locale,`;
    // un remplacement global toucherait toujours le premier, et la mutation du
    // second serait verte en ayant muté l'autre — deux propriétés dont une
    // seule est prouvée, et on ne saurait pas laquelle.
    [
      SIZING_SPEC,
      "la langue du sizing figée",
      "locale: keelTurn.content_locale,",
      'locale: "en-GB",',
      "in-block",
    ],
    [
      PROFILE_SPEC,
      "la langue du champ figée",
      "locale: keelTurn.content_locale,",
      'locale: "en-GB",',
      "in-block",
    ],
    // ⑥ la garde élève figée
    [
      SIZING_SPEC,
      "la garde élève du sizing figée",
      "isKeelStudent: keelTurn.is_student === true,",
      "isKeelStudent: true,",
      "in-block",
    ],
    [
      PROFILE_SPEC,
      "la garde élève du champ figée",
      "isKeelStudent: keelTurn.is_student === true,",
      "isKeelStudent: true,",
      "in-block",
    ],
    // ⑦ le troisième nombre débranché de la sortie — « armé » revendiqué
    //    comme « dit »
    [
      SIZING_SPEC,
      "le sizing déduit au lieu d'être mesuré",
      "if (out !== beforeSizingRedirect) {",
      "if (keel.sizing_redirect) {",
    ],
    [
      PROFILE_SPEC,
      "le champ déduit au lieu d'être mesuré",
      "if (out !== beforeProfileRedirect) {",
      "if (keel.profile_redirect) {",
    ],
  ];

  for (const [spec, label, from, to, scope] of mutations) {
    assert(
      src.includes(from),
      `la mutation « ${label} » ne trouve plus sa cible: \`${from}\``,
    );
    let mutated: string;
    if (scope === "in-block") {
      // Le bloc d'armement de CE renvoi, et lui seul.
      const at = src.indexOf(spec.arm);
      assert(at !== -1, `${label}: bloc d'armement introuvable`);
      const end = src.indexOf("});", at) + "});".length;
      const block = src.slice(at, end);
      assert(
        block.includes(from),
        `la mutation « ${label} » ne trouve pas sa cible DANS le bloc de ` +
          `${spec.label}`,
      );
      mutated = src.slice(0, at) + block.replace(from, to) + src.slice(end);
    } else {
      mutated = src.replace(from, to);
    }
    assert(mutated !== src, `la mutation « ${label} » n'a rien changé`);
    assertThrows(
      () => assertRedirectWiring(mutated, spec),
      Error,
      undefined,
      `LA MUTATION « ${label} » EST RESTÉE VERTE. Soit l'assertion ne tient ` +
        `pas cette propriété, soit une autre la couvre — et alors aucune des ` +
        `deux n'est prouvée.`,
    );
  }
});

Deno.test("LE TROU EST FERMÉ — les DEUX signaux ont contrat ET mapper", async () => {
  // ═════════════════════════════════════════════════════════════════════════
  // ⚠️ CE TEST A CHANGÉ DE SIGNE, ET C'EST LE LOT 4A QUI L'A RETOURNÉ.
  //
  // Il tenait, jusqu'au 2026-08-19, la propriété INVERSE: « le signal n'a aucun
  // producteur ». C'était vrai, mesuré, et ça rendait tout le câblage ci-dessus
  // inerte — une ceinture parfaite sur un coffre vide. Son en-tête disait quoi
  // faire le jour où il rougirait: remesurer le renvoi de bout en bout dans les
  // deux langues, puis le supprimer. Le lot 4A a fait la mesure (run réel,
  // fr-FR et en-GB, dans la bulle) et remplace l'assertion par sa jumelle
  // positive, plutôt que de laisser un trou de test là où il y avait une garde.
  //
  // Ce qu'il tient maintenant, et c'est ce qui manquait vraiment: le chaînon
  // par lequel le verdict du modèle atteint l'armement. Il y en a DEUX, et
  // couper l'un ou l'autre suffit à tout désarmer en silence:
  //
  //   ① le CONTRAT: `TurnFrame.skill_signals.plan_feedback` — sans lui, le
  //      parseur n'a nulle part où poser ce que le modèle a émis;
  //   ② le MAPPER: `dispatcherSignalsFromTurnFrame` recopie ce champ dans
  //      `DispatcherSignals.plan_feedback` — sans lui, `run.ts` lit
  //      `DEFAULT_SIGNALS.plan_feedback`, c'est-à-dire `{detected:false}`, à
  //      chaque tour et pour toujours.
  //
  // ⚠️ ② EST LA LIGNE QUI MANQUAIT, littéralement. Le reste existait.
  // ═════════════════════════════════════════════════════════════════════════
  const frame = stripComments(
    await Deno.readTextFile(
      new URL("../../sophia-brain/contracts/turn_frame.v1.ts", import.meta.url),
    ),
  );
  assert(
    frame.includes("plan_feedback?: DispatcherPlanFeedbackSignal;"),
    "LE CONTRAT NE PORTE PLUS `plan_feedback` DANS `DispatcherSkillSignals`. " +
      "Le modèle n'a alors plus de case où l'écrire, le parseur n'a plus rien " +
      "à lire, et le renvoi du sizing redevient inatteignable — exactement " +
      "l'état que le lot 4A a fermé.",
  );

  const runtime = stripComments(
    await Deno.readTextFile(
      new URL(
        "../../sophia-brain/router/turn_context_runtime.ts",
        import.meta.url,
      ),
    ),
  );
  const mapperAt = runtime.indexOf(
    "export function dispatcherSignalsFromTurnFrame(",
  );
  assert(mapperAt !== -1, "`dispatcherSignalsFromTurnFrame` a disparu");
  const mapper = runtime.slice(mapperAt, mapperAt + 1400);
  assert(
    mapper.includes("plan_feedback: turnFrame?.skill_signals?.plan_feedback"),
    "LE MAPPER NE RECOPIE PLUS `plan_feedback` DU FRAME. `run.ts` lirait " +
      "`DEFAULT_SIGNALS.plan_feedback` — `{detected:false}` — à chaque tour, " +
      "et le renvoi ne partirait JAMAIS. C'est la panne d'origine, en une " +
      "seule ligne d'omission: rien ne compile en erreur, rien ne rougit " +
      "ailleurs, et le lot entier redevient indiscernable d'un lot qui marche.",
  );
  // ⛔ ET LE VERDICT NE VIENT PAS DU MESSAGE. Le mapper reçoit `userMessage`;
  // s'en servir ici serait le matcher maison que la consigne interdit.
  assert(
    mapper.includes("void args.userMessage;"),
    "LE MAPPER LIT MAINTENANT LE MESSAGE. La détection doit rester celle du " +
      "dispatcher: « laitue » ≠ « lait », 12 faux positifs sur 12 mesurés ici.",
  );

  // ── LOT M1 · LES DEUX MÊMES CHAÎNONS, POUR `profile_statement` ──────────
  //
  // ⚠️ ILS SONT VÉRIFIÉS SÉPARÉMENT, ET PAS « PAR SYMÉTRIE ». La ligne
  // d'omission du lot 4A était exactement celle-ci: le contrat portait le
  // champ, le parseur le sanitisait, quatre lecteurs l'attendaient, et le
  // mapper ne le recopiait pas. Rien ne compile en erreur, rien ne rougit
  // ailleurs, et le lot entier redevient indiscernable d'un lot qui marche.
  assert(
    frame.includes("profile_statement?: DispatcherProfileStatementSignal;"),
    "LE CONTRAT NE PORTE PLUS `profile_statement`. Le modèle n'a alors plus " +
      "de case où l'écrire, et le renvoi vers un champ redevient " +
      "inatteignable — alors qu'il REMPLACE un producteur retiré: la personne " +
      "parlerait dans le vide, ce qui est pire que l'état d'avant le lot.",
  );
  assert(
    mapper.includes(
      "profile_statement: turnFrame?.skill_signals?.profile_statement",
    ),
    "LE MAPPER NE RECOPIE PLUS `profile_statement` DU FRAME. `run.ts` lirait " +
      "`DEFAULT_SIGNALS.profile_statement` — `{detected:false}` — à chaque " +
      "tour et pour toujours. C'est la panne du lot 4A, à l'identique.",
  );

  // ── ET LE SANITIZER, qui est le troisième chaînon ───────────────────────
  //
  // Sans lui, `skill_signals.profile_statement` n'est jamais POSÉ dans le
  // frame: le contrat déclare une case que rien ne remplit, et le mapper
  // recopie fidèlement `undefined`.
  const parser = stripComments(
    await Deno.readTextFile(
      new URL("../../sophia-brain/dispatcher/dispatcher.v2.ts", import.meta.url),
    ),
  );
  assert(
    parser.includes("signals.profile_statement = profileStatement;"),
    "LE SANITIZER NE POSE PLUS `profile_statement` DANS LE FRAME: la case du " +
      "contrat reste vide quoi que le modèle émette.",
  );
  // ⚠️ ET IL LIT AUSSI `entry`. Le modèle a été mesuré capable de ranger ses
  // signaux sous `skill_signals.entry`; ne lire que la racine ferait un lot
  // désarmé un tour sur N, sans trace.
  assert(
    parser.includes("sanitizeProfileStatementSignal(entryRoot.profile_statement)"),
    "LE SANITIZER NE LIT PLUS `entry`: le signal se perdrait un tour sur N, " +
      "silencieusement, selon l'humeur du modèle.",
  );
});

Deno.test("ET L'ORDRE MORD AUSSI — l'armement déplacé sous une sortie est ROUGE", async () => {
  // La mutation la plus perverse, et celle que ③ seul ne verrait pas: le
  // câblage reste EN PLACE, mais il est lu trop tard. Le fichier compilerait
  // (le champ existe), et la phrase ne sortirait jamais.
  const src = await Deno.readTextFile(RUN_TS);
  const arming = "keelTurn.sizing_redirect = sizingRedirectFor({";
  const at = src.indexOf(arming);
  assert(at !== -1, "l'armement a disparu — voir le test de câblage");
  // On retire l'armement de sa place et on le recolle APRÈS le dernier chemin
  // de sortie, sans rien changer d'autre.
  const end = src.indexOf("});", at) + "});".length;
  const block = src.slice(at, end);
  const without = src.slice(0, at) + src.slice(end);
  const lastExit = without.lastIndexOf("= finalVisibleText(");
  assert(lastExit !== -1);
  const moved = without.slice(0, lastExit) + block + "\n  " +
    without.slice(lastExit);
  assertThrows(
    () => assertRedirectWiring(moved, SIZING_SPEC),
    Error,
    undefined,
    "L'ARMEMENT DÉPLACÉ SOUS UNE SORTIE EST RESTÉ VERT: le test ne tient pas " +
      "l'ordre, donc il ne tient pas la seule chose qui fait sortir la phrase.",
  );
});
