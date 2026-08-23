// ═══════════════════════════════════════════════════════════════════════════
// LOT 2C — LE CÂBLAGE DU RENVOI DU SIZING, ÉPINGLÉ
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
export function assertSizingRedirectWiring(rawSource: string): void {
  const src = stripComments(rawSource);

  // ── ① L'AJOUT EXISTE, ET IL REÇOIT LE CHAMP DU TOUR ─────────────────────
  const appendAt = src.indexOf("appendSizingRedirect(");
  assert(
    appendAt !== -1,
    "RENVOI DÉBRANCHÉ: `appendSizingRedirect` n'est plus appelée dans " +
      "`run.ts`. Un retour de sizing est alors refusé par la matrice ET " +
      "silencieux pour la personne — c'est-à-dire le geste exact que ce lot " +
      "existe pour empêcher.",
  );
  const appendArgs = callArgs(src, "appendSizingRedirect");
  assertEquals(
    appendArgs.length,
    2,
    "`appendSizingRedirect` n'est plus appelée avec ses deux paramètres",
  );
  assertEquals(
    appendArgs[1],
    "keel.sizing_redirect",
    "L'AJOUT NE LIT PLUS LE CHAMP DU TOUR: il reçoit autre chose que " +
      "`keel.sizing_redirect`, donc soit un littéral (la phrase sortirait sur " +
      "TOUS les tours), soit `null` (elle ne sortirait jamais).",
  );

  // ── ② L'AJOUT EST DANS `finalVisibleText`, ET C'EST TOUT LE LOT ─────────
  // C'est le SEUL entonnoir que tous les chemins de sortie traversent. Posé
  // ailleurs, le renvoi serait avalé par la première lane qui rend sa propre
  // réponse — `plan_question` en capture une part importante.
  const belt = src.indexOf("export function finalVisibleText(");
  assert(belt !== -1, "`finalVisibleText` a disparu de `run.ts`");
  assert(
    appendAt > belt,
    "L'AJOUT A QUITTÉ `finalVisibleText`: il est posé AVANT la ceinture de " +
      "sortie, donc sur un seul chemin. Une lane voisine qui rend sa propre " +
      "réponse l'avalerait sans laisser de trace — « rendu » n'est pas « dit ».",
  );

  // ── ③ L'ARMEMENT EXISTE, ET IL LIT LA PERSONNE ──────────────────────────
  const armAt = src.indexOf("keelTurn.sizing_redirect = sizingRedirectFor(");
  assert(
    armAt !== -1,
    "ARMEMENT DÉBRANCHÉ: `keelTurn.sizing_redirect` n'est plus posé. " +
      "`appendSizingRedirect` recevrait `undefined` à chaque tour, et le lot " +
      "serait indiscernable d'un lot qui marche.",
  );
  const armArgs = callArgs(src, "sizingRedirectFor");
  assertEquals(armArgs.length, 1, "`sizingRedirectFor` prend un seul objet");
  const arm = armArgs[0];
  // ⛔ AUCUN MATCHER MAISON: la détection vient du signal du dispatcher.
  assert(
    arm.includes("signal: dispatcherSignals.plan_feedback"),
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
    src.includes('tag: "keel/sizing_redirect"'),
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
    src.includes("out !== beforeSizingRedirect"),
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

Deno.test("LE CÂBLAGE — `run.ts` arme le renvoi et le DIT dans `finalVisibleText`", async () => {
  const src = await Deno.readTextFile(RUN_TS);
  assertSizingRedirectWiring(src);
});

Deno.test("ET L'ASSERTION MORD — sept mutations en mémoire, sept rouges", async () => {
  // ⚠️ C'EST LA MOITIÉ QUI REND LE TEST CI-DESSUS UTILE. Sans elle, une
  // assertion dont les chaînes ne correspondent plus à rien passerait pour un
  // câblage sain.
  //
  // ⚠️ ET CHAQUE MUTATION EST JOUÉE SEULE. Un lot voisin a mesuré deux mutations
  // VERTES parce qu'elles se doublaient l'une l'autre: seule la troisième
  // mordait, et aucune des deux premières n'était donc prouvée. Une mutation
  // par propriété, et chacune doit rougir toute seule.
  const src = await Deno.readTextFile(RUN_TS);

  const mutations: Array<[string, string, string]> = [
    // ① l'appel retiré — « quelqu'un supprime la ligne »
    [
      "l'ajout retiré",
      "out = appendSizingRedirect(out, keel.sizing_redirect);",
      "",
    ],
    // ② l'ajout débranché du champ du tour — la forme la plus vraisemblable
    //    d'un débranchement « en attendant »
    [
      "l'ajout reçoit null",
      "appendSizingRedirect(out, keel.sizing_redirect)",
      "appendSizingRedirect(out, null)",
    ],
    // ③ la langue figée — la cicatrice mesurée du dépôt
    [
      "la langue figée",
      "locale: keelTurn.content_locale,",
      'locale: "en-GB",',
    ],
    // ④ la garde élève figée
    [
      "la garde élève figée",
      "isKeelStudent: keelTurn.is_student === true,",
      "isKeelStudent: true,",
    ],
    // ⑤ le dénominateur retiré — la panne SOUS LAQUELLE ce lot était
    //    invisible: un compteur qui ne compte que les succès
    [
      "le dénominateur retiré",
      'event: "seen",',
      'event: "plan_feedback_seen",',
    ],
    // ⑥ le troisième nombre débranché de la sortie — « armé » revendiqué
    //    comme « dit »
    [
      "le troisième nombre déduit au lieu d'être mesuré",
      "if (out !== beforeSizingRedirect) {",
      "if (keel.sizing_redirect) {",
    ],
    // ⑦ la preuve de non-capture retirée
    [
      "la preuve de non-capture retirée",
      "plan_question_detected:",
      "plan_question_unmeasured:",
    ],
  ];

  for (const [label, from, to] of mutations) {
    assert(
      src.includes(from),
      `la mutation « ${label} » ne trouve plus sa cible: \`${from}\``,
    );
    const mutated = src.replace(from, to);
    assert(mutated !== src, `la mutation « ${label} » n'a rien changé`);
    assertThrows(
      () => assertSizingRedirectWiring(mutated),
      Error,
      undefined,
      `LA MUTATION « ${label} » EST RESTÉE VERTE. Soit l'assertion ne tient ` +
        `pas cette propriété, soit une autre la couvre — et alors aucune des ` +
        `deux n'est prouvée.`,
    );
  }
});

Deno.test("LE TROU EST FERMÉ — le SIGNAL `plan_feedback` a un PRODUCTEUR", async () => {
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
    () => assertSizingRedirectWiring(moved),
    Error,
    undefined,
    "L'ARMEMENT DÉPLACÉ SOUS UNE SORTIE EST RESTÉ VERT: le test ne tient pas " +
      "l'ordre, donc il ne tient pas la seule chose qui fait sortir la phrase.",
  );
});
