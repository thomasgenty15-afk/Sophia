import { assert, assertEquals } from "jsr:@std/assert@1";

import {
  buildHouseholdVoices,
  estimateVoiceTokens,
  FORBIDDEN_VOICE_TERMS,
  VOICE_DISCLOSURE_TERMS,
  VOICE_GUARD_DROPPED_TOKENS,
  VOICE_TOKEN_CAP_PER_MEMBER,
} from "./household_voices.ts";
import { FORBIDDEN_PORTION_TERMS } from "./household_portions.ts";

// ───────────────────────────────────────────────────────────────────────────
// D4 — CHAQUE TITULAIRE EST LU
// ───────────────────────────────────────────────────────────────────────────

Deno.test("D4 — les mots de CHAQUE titulaire entrent, pas seulement ceux du maître", () => {
  // ⚠️ LE DÉFAUT QUE CE LOT RÉPARE, ET IL SE MESURE EN EUROS. Avant L6, seul le
  // propriétaire du foyer était lu: le « about you » d'un secondaire ne
  // touchait jamais la casserole. Un siège payé qui n'atteint pas l'assiette
  // n'achète rien.
  const { block, heard } = buildHouseholdVoices([
    { memberId: "m-dad", displayName: "Marc", lines: ["hates broccoli"] },
    { memberId: "m-wife", displayName: "Zoé", lines: ["no porridge in the morning"] },
    { memberId: "m-son", displayName: "Tom", lines: ["batch cooks on Sundays"] },
  ]);
  assertEquals(heard.length, 3);
  for (const name of ["Marc", "Zoé", "Tom"]) {
    assert(block.includes(`${name}:`), `${name} n'est pas entendu`);
  }
  for (const line of ["hates broccoli", "no porridge in the morning", "batch cooks on Sundays"]) {
    assert(block.includes(`- ${line}`), `« ${line} » n'entre pas dans le prompt`);
  }
});

Deno.test("l'ordre reçu est l'ordre rendu, et un membre muet n'a pas d'en-tête", () => {
  // L'ordre du roster, comme `buildPortionBrief`: l'écran et le prompt doivent
  // lister le foyer pareil d'un repas à l'autre.
  const { block, heard } = buildHouseholdVoices([
    { memberId: "m-a", displayName: "Anna", lines: ["likes lentils"] },
    // Une bouche AVEC compte qui n'a rien confirmé: pas d'en-tête vide. Un
    // « Bruno: » suivi de rien apprendrait au modèle qu'il y a quelque chose à
    // deviner sur Bruno.
    { memberId: "m-b", displayName: "Bruno", lines: [] },
    { memberId: "m-c", displayName: "Chloé", lines: ["no mushrooms"] },
  ]);
  assertEquals(heard.map((h) => h.displayName), ["Anna", "Chloé"]);
  assert(!block.includes("Bruno"), "un membre sans ligne ne doit pas être nommé");
  assert(block.indexOf("Anna:") < block.indexOf("Chloé:"), "l'ordre reçu a bougé");
});

Deno.test("personne n'a rien confirmé ⇒ AUCUN bloc", () => {
  // Le cas majoritaire du produit (« l'entrée est à 1 »). Un bloc vide filtré
  // en amont est ce qui rend le prompt byte-identique à celui d'avant ce lot.
  const { block, heard, issues } = buildHouseholdVoices([
    { memberId: "m-a", displayName: "Anna", lines: [] },
  ]);
  assertEquals(block, "");
  assertEquals(heard.length, 0);
  assertEquals(issues, []);
  assertEquals(buildHouseholdVoices([]).block, "");
});

// ───────────────────────────────────────────────────────────────────────────
// D4 — LA GARDE DE NON-DIVULGATION, ÉTENDUE
// ───────────────────────────────────────────────────────────────────────────

/**
 * LE BANC ADVERSE — 17 lignes à couper (9 fr / 8 en), 15 à laisser passer
 * (7 fr / 8 en), une ligne par appel.
 *
 * ⚠️ LES DEUX LANGUES, PARTOUT. Ce dépôt a déjà payé une garde écrite et testée
 * dans une seule: `not` ne couvre pas `doesn't`, et le produit a basculé en
 * anglais après que le test a été écrit en français.
 *
 * MESURE AVANT CE LOT: 8 des 17 lignes divulgantes PASSAIENT (tout le registre
 * TCA), et 1 des 15 lignes légitimes TOMBAIT (« Végétarien depuis 5 ans », sur
 * la forme de surface `ans`). Après: 17/17 et 15/15.
 */
const MUST_CUT: ReadonlyArray<[string, string]> = [
  // ── objectif · régime · calories · corps (couvert avant ce lot) ──────────
  ["en", "Wants to lose weight before the summer."],
  ["fr", "Veut perdre du poids avant l'été."],
  ["fr", "Son objectif est la prise de masse."],
  ["en", "She is cutting and wants to stay under 1800 calories a day."],
  ["fr", "Ne mange plus de pain le soir depuis qu'il a repris son régime."],
  ["fr", "Il compte ses calories tous les jours."],
  ["en", "He tracks his kcal every single day."],
  ["fr", "Son tour de taille a beaucoup baissé."],
  ["en", "Her waist has changed a lot this year."],
  // ── LE REGISTRE TCA — les trois familles, mesurées PASSANTES avant ───────
  ["fr", "Elle mange peu le soir parce qu'elle se trouve trop grosse."],
  ["en", "She eats less at dinner because she feels too fat."],
  ["en", "She skips dinner when she feels she has eaten too much at lunch."],
  ["fr", "Elle saute le dîner quand elle a trop mangé le midi."],
  ["fr", "Il se prive de dessert pour se rattraper le lendemain."],
  ["en", "He makes up for it the next day by fasting."],
  ["fr", "Elle pèse ses portions de riz au gramme près."],
  ["en", "She weighs her rice portions to the gram."],
];

const MUST_PASS: ReadonlyArray<[string, string]> = [
  ["fr", "Il n'aime pas le poisson."],
  ["en", "Theo doesn't like fish."],
  ["en", "Theo hates broccoli and says the roasted version was only a one-time exception."],
  ["fr", "Batch cooking le dimanche, pour toute la semaine."],
  ["en", "Student can only batch cook on Sundays due to sharing a kitchen with four flatmates."],
  ["fr", "Habitude de sauter le petit-déjeuner par manque d'appétit matinal."],
  ["en", "Skips breakfast, no morning appetite."],
  ["fr", "Travaille de nuit trois fois par semaine."],
  ["en", "Works night shifts three times a week."],
  ["fr", "Préfère les lentilles à midi plutôt que le soir."],
  ["en", "Prefers lentils at lunch rather than at dinner."],
  // ── LA LIGNE QUE LA GARDE PERDAIT, ET SA JUMELLE ────────────────────────
  // C'est l'ASYMÉTRIE qui était le défaut: la version FR tombait sur `ans`, la
  // version EN passait. Les deux disent la même chose, et les deux sont des
  // préférences alimentaires parfaitement légitimes.
  ["fr", "Végétarien depuis 5 ans."],
  ["en", "Vegetarian for five years."],
  // ── CE QUE LE REGISTRE TCA NE DOIT PAS EMPORTER AVEC LUI ────────────────
  ["fr", "Coupe les morceaux trop gros en deux avant de servir."],
  ["en", "Uses a kitchen scale for bread dough."],
];

/** Le verdict de la garde sur UNE ligne, et les catégories tracées. */
function guard(line: string): { passed: boolean; categories: string[] } {
  const { block, issues } = buildHouseholdVoices([
    { memberId: "m-x", displayName: "Zoé", lines: [line] },
  ]);
  return {
    passed: block.includes(`- ${line}`),
    categories: issues
      .filter((i) => i.startsWith("voice_line_withheld:m-x:"))
      .map((i) => i.slice("voice_line_withheld:m-x:".length)),
  };
}

Deno.test("LA GARDE COUPE CE QUI DIRAIT POURQUOI QUELQU'UN MANGE AUTREMENT — 17 lignes, deux langues", () => {
  // ⚠️ LE PLAN DU FOYER EST LU PAR TOUT LE FOYER, À TABLE. Si la mémoire d'un
  // membre remonte à la composition, la garde remonte avec elle — sinon le menu
  // de la semaine devient l'endroit où le foyer apprend que quelqu'un a repris
  // un régime, ou qu'il pèse ses portions au gramme près.
  for (const [lang, line] of MUST_CUT) {
    const { passed, categories } = guard(line);
    assert(!passed, `[${lang}] cette ligne est entrée dans le prompt: ${line}`);
    assert(categories.length > 0, `[${lang}] ligne coupée sans trace: ${line}`);
  }
  // LE BANC EST ÉQUILIBRÉ, et ce n'est pas cosmétique: un banc à 16 lignes EN
  // et 1 FR prouverait la garde dans une seule langue en ayant l'air complet.
  const fr = MUST_CUT.filter(([l]) => l === "fr").length;
  assertEquals([fr, MUST_CUT.length - fr], [9, 8]);
});

Deno.test("LE CAS QUI PASSE — 15 préférences ORDINAIRES arrivent, dans les deux langues", () => {
  // ⚠️ SANS CETTE MOITIÉ, LA GARDE EST INDISCERNABLE D'UNE GARDE QUI COUPE
  // TOUT, et D4 serait décoratif: on aurait câblé la lecture de tout le monde
  // pour n'en rien servir au modèle. C'est le défaut que ce lot répare — il ne
  // faut pas le remplacer par son symétrique en élargissant la garde.
  for (const [lang, line] of MUST_PASS) {
    const { passed, categories } = guard(line);
    assert(
      passed,
      `[${lang}] préférence légitime coupée (${categories.join(",")}): ${line}`,
    );
  }
  const fr = MUST_PASS.filter(([l]) => l === "fr").length;
  assertEquals([fr, MUST_PASS.length - fr], [7, 8]);
});

Deno.test("LES TROUS CONNUS SONT TOUJOURS LÀ, ET ILS SONT ÉCRITS", () => {
  // ⚠️ CE TEST N'APPROUVE RIEN, IL CONSTATE. L'écho numérique nu n'est mordu
  // par personne — le commentaire de `FORBIDDEN_PORTION_TERMS` le dit déjà, et
  // le corps de chaque membre est de toute façon DÉJÀ donné au modèle par le
  // brief de portions. Le figer ici fait qu'un lot qui le refermerait devra
  // venir le RÉÉCRIRE, au lieu de le refermer par accident sans que personne
  // ne sache que le comportement documenté a changé.
  for (const line of [
    "Elle fait 1m90 et pèse 95 kg.",
    "He is 1.90 m tall and weighs 95 kg.",
    // ÂGE NU: `age` a été retiré de la garde des voix (voir
    // `VOICE_GUARD_DROPPED_TOKENS`), donc celle-ci passe désormais PAR CHOIX et
    // plus par accident de forme de surface.
    "Zoe is 32 and eats late.",
  ]) {
    assert(guard(line).passed, `ce trou s'est refermé sans être documenté: ${line}`);
  }
});

// ───────────────────────────────────────────────────────────────────────────
// LA TRACE — UNE CATÉGORIE, PAS L'AIGUILLE QUI A MORDU
// ───────────────────────────────────────────────────────────────────────────

Deno.test("LA TRACE NOMME LA CATÉGORIE, ET SON VOCABULAIRE EST FERMÉ", () => {
  // ⚠️ LE DÉFAUT MESURÉ. `findForbiddenMatches` rend `token: needle.
  // toLowerCase()` — l'AIGUILLE. La trace disait donc `:kcal`, `:tour de
  // taille`, `:prise de masse`, `:ans`, `:lose weight`… un vocabulaire OUVERT
  // qui grandit à chaque forme de surface ajoutée, pendant que le commentaire
  // du module promettait `:age`. Un commentaire qui ment est pire qu'une
  // absence de commentaire.
  const vocabulary = new Set(FORBIDDEN_VOICE_TERMS.map((t) => t.token));
  for (const [lang, line] of MUST_CUT) {
    for (const category of guard(line).categories) {
      assert(
        vocabulary.has(category),
        `[${lang}] la trace nomme « ${category} », qui n'est le token d'aucun ` +
          `terme: c'est une forme de surface. Ligne: ${line}`,
      );
    }
  }
  // ⚠️ LE CAS QUI SÉPARE VRAIMENT LES DEUX. L'assertion ci-dessus resterait
  // verte si `kcal` était par hasard aussi un token. Ces deux lignes-là
  // mordent sur des formes de surface dont le nom DIFFÈRE de leur catégorie.
  assertEquals(guard("He tracks his kcal every single day.").categories, ["calories"]);
  assertEquals(guard("Son tour de taille a beaucoup baissé.").categories, ["height"]);
});

// ───────────────────────────────────────────────────────────────────────────
// LA GARDE DES VOIX EST *DÉRIVÉE* DE CELLE DES PORTIONS
// ───────────────────────────────────────────────────────────────────────────

Deno.test("UN SEUL TERME DE LA SORTIE NE GARDE PAS L'ENTRÉE, ET IL EST NOMMÉ", () => {
  // ⚠️ PAS DE SECONDE LISTE. La comparaison porte sur l'IDENTITÉ des objets
  // (`includes` sur des références), donc un terme RECOPIÉ — même à la virgule
  // près — fait tomber ce test. C'est ce qui garantit qu'une correction faite
  // sur la liste de sortie arrive ici sans que personne n'y pense.
  assertEquals(VOICE_GUARD_DROPPED_TOKENS, ["age"]);
  for (const term of FORBIDDEN_PORTION_TERMS) {
    const dropped = VOICE_GUARD_DROPPED_TOKENS.includes(term.token);
    assertEquals(
      FORBIDDEN_VOICE_TERMS.includes(term),
      !dropped,
      dropped
        ? `« ${term.token} » garde encore les voix: « Végétarien depuis 5 ans » retombe.`
        : `« ${term.token} » ne garde plus les voix, et personne ne l'a décidé.`,
    );
  }
  // ET L'AJOUT EST NOMMÉ AUSSI: le registre TCA n'existe pas dans la liste de
  // sortie, il est déclaré à part, et il est BIEN dans la liste des voix.
  for (const term of VOICE_DISCLOSURE_TERMS) {
    assert(FORBIDDEN_VOICE_TERMS.includes(term), `« ${term.token} » manque`);
    assert(
      !FORBIDDEN_PORTION_TERMS.includes(term),
      `« ${term.token} » a fui vers la liste de SORTIE: ce lot ne touche pas ` +
        `\`sanitizePortionNote\`, et la lane individuelle doit rester intacte.`,
    );
  }
  // AUCUNE AIGUILLE EN DOUBLE entre deux termes: la table catégorie-par-aiguille
  // est un `Map`, et une collision ferait taire silencieusement une catégorie.
  const needles = FORBIDDEN_VOICE_TERMS.flatMap((t) =>
    [t.token, ...(t.surfaceForms ?? [])].map((n) => n.toLowerCase())
  );
  assertEquals(
    needles.length,
    new Set(needles).size,
    "deux termes partagent une forme de surface: la catégorie tracée dépend " +
      "alors de l'ordre de la liste.",
  );
});

// ───────────────────────────────────────────────────────────────────────────
// LES COMPTEURS — DES LIGNES, PAS DES `issues`
// ───────────────────────────────────────────────────────────────────────────

Deno.test("LES COMPTEURS COMPTENT DES LIGNES, PAS DES MOTIFS NI DES `issues`", () => {
  // ⚠️ LE DÉFAUT MESURÉ, ET IL ÉTAIT DOUBLE ET EN SENS INVERSES. La trace du
  // plan dérivait ses nombres des `issues`, en comptant des CHAÎNES:
  //
  //     1 ligne retenue par la garde ⇒ « withheld: 3 » (trois motifs)
  //     2 lignes tombées au plafond  ⇒ « over_cap: 1 » (une `issue` `:2`)
  //
  // Ici la ligne divulgante mord sur QUATRE catégories, et les deux lignes du
  // plafond tombent ensemble. Si un jour quelqu'un redérive ces nombres des
  // `issues`, ce test le dit.
  const fat = (n: number) =>
    `${String(n).padStart(2, "0")} ${"aubergine ".repeat(30)}`.slice(0, 200);
  const leak = "She is cutting to lose weight and stays under 1800 calories.";
  assertEquals(
    guard(leak).categories,
    ["calories", "cutting", "maigrir", "weight"],
    "le décor ne mord plus sur quatre catégories: `withheld: 1` et " +
      "`withheld: 4` redeviennent indiscernables, et ce test un faux-vert.",
  );

  const { issues, counts } = buildHouseholdVoices([
    // 200 car. ⇒ 202 rendus ⇒ 51 tokens. Deux tiennent (102), la troisième
    // déborde (153 > 150) et arrête la lecture: 2 lignes tombent.
    { memberId: "m-a", displayName: "Anna", lines: [fat(1), fat(2), fat(3), fat(4)] },
    { memberId: "m-b", displayName: "Bruno", lines: [leak, "no mushrooms"] },
  ]);

  assertEquals(counts.linesIn, 6);
  assertEquals(counts.linesUsed, 3, "ce que le modèle a vu");
  assertEquals(counts.linesWithheld, 1, "1 LIGNE retenue, pas 4 motifs");
  assertEquals(counts.linesOverCap, 2, "2 LIGNES tombées, pas 1 `issue`");
  assertEquals(counts.perMember, [
    { memberId: "m-a", in: 4, used: 2, withheld: 0, over_cap: 2 },
    { memberId: "m-b", in: 2, used: 1, withheld: 1, over_cap: 0 },
  ]);
  // LES `issues` RESTENT LA TRACE NOMMÉE, et leurs comptes ne coïncident PAS
  // avec ceux des lignes — c'est exactement pour ça que les dériver mentait.
  assertEquals(issues.filter((i) => i.startsWith("voice_line_withheld:")).length, 4);
  assertEquals(issues.filter((i) => i.startsWith("voice_over_cap:")).length, 1);
});

Deno.test("UN MEMBRE DONT TOUT EST TOMBÉ FIGURE DANS LES COMPTES — `heard` ne le porte pas", () => {
  // « son about-you n'a servi à rien » et « il n'avait rien confirmé » doivent
  // laisser deux traces DIFFÉRENTES: c'est la question même que D4 tranche.
  const { heard, counts } = buildHouseholdVoices([
    { memberId: "m-a", displayName: "Anna", lines: ["Veut perdre du poids."] },
    { memberId: "m-b", displayName: "Bruno", lines: [] },
  ]);
  assertEquals(heard.length, 0);
  assertEquals(counts.perMember, [
    { memberId: "m-a", in: 1, used: 0, withheld: 1, over_cap: 0 },
  ]);
  assertEquals(counts.linesIn, 1);
  assertEquals(counts.linesUsed, 0);
});

Deno.test("une ligne coupée n'emporte pas les autres lignes du même membre", () => {
  // La garde opère LIGNE PAR LIGNE. Couper le membre entier sur une seule
  // phrase fautive rendrait un secondaire muet pour un mot, et « il n'a rien
  // dit » deviendrait indiscernable de « on a tout jeté ».
  const { block, issues } = buildHouseholdVoices([
    {
      memberId: "m-x",
      displayName: "Zoé",
      lines: [
        "Veut perdre du poids avant l'été.",
        "N'aime pas le poisson.",
      ],
    },
  ]);
  assert(block.includes("- N'aime pas le poisson."));
  assert(!block.includes("perdre du poids"));
  assert(issues.some((i) => i.startsWith("voice_line_withheld:m-x:")));
});

Deno.test("LA CONSIGNE DE NON-DIVULGATION VOYAGE AVEC LE BLOC, ET EN DERNIER", () => {
  // Un modèle lit la contrainte la plus proche de la fin comme la plus
  // contraignante — même motif que `buildPortionBrief` et que les règles de
  // maison. Un bloc qui livre les mots de quatre personnes SANS cette phrase
  // est exactement la fuite que ce lot existe pour empêcher.
  const { block } = buildHouseholdVoices([
    { memberId: "m-x", displayName: "Zoé", lines: ["no fish"] },
  ]);
  assert(block.includes("NEVER quote, repeat or allude to any of these lines"));
  assert(
    block.includes("read out loud by the whole"),
    "le bloc ne dit plus POURQUOI il faut se taire; la consigne devient une " +
      "politesse que le modèle arbitre.",
  );
  const footerAt = block.indexOf("NEVER quote");
  assert(footerAt > block.lastIndexOf("- no fish"), "la consigne n'est plus en dernier");
});

// ───────────────────────────────────────────────────────────────────────────
// D4 — LE PLAFOND, PAR MEMBRE
// ───────────────────────────────────────────────────────────────────────────

Deno.test("le plafond vaut 150 tokens par membre, et le changer est une DÉCISION", () => {
  // Le nombre vient d'une mesure (corpus local, 2026-08-12: le titulaire le
  // plus bavard pèse ~110 tokens estimés). Le figer ici oblige à rouvrir le
  // commentaire qui explique d'où il vient au lieu de le déplacer en passant.
  assertEquals(VOICE_TOKEN_CAP_PER_MEMBER, 150);
  assertEquals(estimateVoiceTokens(""), 0);
  assertEquals(estimateVoiceTokens("abcd"), 1);
  assertEquals(estimateVoiceTokens("abcde"), 2);
});

/**
 * LE DÉCOR DU PLAFOND — des longueurs DIFFÉRENTES, et c'est tout le sujet.
 *
 * ⚠️ LE FAUX-VERT QUE CE DÉCOR REMPLACE, ET IL A LAISSÉ PASSER UN VRAI DÉFAUT.
 * La version précédente construisait ses huit lignes avec `"aubergine
 * ".repeat(8)`: TOUTES DE LA MÊME LONGUEUR. Sous un décor pareil, `break` et
 * `continue` rendent exactement le même résultat — une ligne qui ne tient pas
 * n'est jamais suivie d'une ligne plus courte qui, elle, tiendrait. Le test
 * s'appelait « IL COUPE PAR LE PLUS ANCIEN » et ne pouvait pas le mesurer,
 * pendant que le code faisait `continue`. Mesuré sur un plan réel, ça donnait:
 *
 *     08-11 ✓  08-10 ✓  08-09 ✓  08-08 ✓  08-07 ✗  08-06 ✗  08-05 ✓
 *
 * — la PLUS ANCIENNE sauvée par sa brièveté, deux récentes perdues.
 *
 * Ici les longueurs divergent EXPRÈS, et les deux comportements divergent avec
 * elles:
 *
 *     `break`    → 5 gardées, 3 tombées   (ce que le module doit faire)
 *     `continue` → 7 gardées, 1 tombée    (les deux courtes de la fin passent)
 *
 * ⚠️ AUCUN NOMBRE N'EST DÉRIVÉ DE `VOICE_TOKEN_CAP_PER_MEMBER`. Ils sont
 * calculés à la main, sinon le test resterait vert le jour où quelqu'un met le
 * plafond à 5 000:
 *
 *     100 car. → `- ` + 100 = 102 → ceil(102/4) = 26 tokens
 *     5 × 26 = 130 ≤ 150 ; la 6ᵉ porte le total à 156 > 150 ⇒ ARRÊT
 *     la 7ᵉ (30 car. ⇒ 8 tokens) tiendrait: 130 + 8 = 138 ≤ 150
 *     la 8ᵉ (20 car. ⇒ 6 tokens) aussi:     138 + 6 = 144 ≤ 150
 */
const capLine = (n: number, len: number) =>
  `${String(n).padStart(2, "0")} ${"aubergine ".repeat(30)}`.slice(0, len);

Deno.test("LE PLAFOND COUPE, ET IL S'ARRÊTE — il ne repêche pas une ligne plus vieille parce qu'elle est plus courte", () => {
  const lens = [100, 100, 100, 100, 100, 100, 30, 20];
  const lines = lens.map((len, i) => capLine(i + 1, len));
  // LE DÉCOR EST VÉRIFIÉ AVANT DE SERVIR: un `slice` qui rendrait autre chose
  // que la longueur voulue ferait un test qui mesure autre chose que ce qu'il
  // annonce, et personne ne s'en apercevrait.
  assertEquals(lines.map((l) => l.length), lens);
  assert(
    lines[6].length < lines[0].length && lines[7].length < lines[6].length,
    "les longueurs ne divergent plus: `break` et `continue` redeviennent " +
      "indiscernables, et ce test redevient un faux-vert.",
  );

  const { heard, issues, block, counts } = buildHouseholdVoices([
    { memberId: "m-x", displayName: "Zoé", lines },
  ]);

  assertEquals(
    heard[0].lines.length,
    5,
    "le plafond ne s'arrête plus au premier dépassement: 7 lignes gardées = " +
      "il a repris `continue` et repêché les deux courtes de la fin.",
  );
  assertEquals(issues, ["voice_over_cap:m-x:3"]);
  // COUPÉ PAR LA QUEUE: la liste arrive du plus RÉCENT au plus ancien
  // (`foodPreferencesForPrompt`), donc ce qu'on perd est le plus vieux.
  assert(block.includes(lines[0]), "la ligne la plus récente est tombée");
  assert(
    !block.includes(lines[5]),
    "la ligne qui fait déborder le plafond est entrée quand même",
  );
  // ⚠️ LES DEUX ASSERTIONS QUI SÉPARENT `break` DE `continue`. Ces deux
  // lignes-là tiendraient dans le budget restant; les garder serait faire
  // passer du VIEUX devant du RÉCENT, c'est-à-dire rendre un ordre que
  // personne ne peut relire.
  assert(
    !block.includes(lines[6]),
    "une ligne PLUS ANCIENNE a doublé une ligne récente parce qu'elle est " +
      "plus courte: le plafond a repris `continue`.",
  );
  assert(
    !block.includes(lines[7]),
    "la ligne la PLUS ANCIENNE a survécu au plafond parce qu'elle est la plus " +
      "courte — exactement le défaut mesuré sur un plan réel.",
  );
  assertEquals(counts.perMember, [{
    memberId: "m-x",
    in: 8,
    used: 5,
    withheld: 0,
    over_cap: 3,
  }]);
});

Deno.test("LE PLAFOND EST PAR MEMBRE — le premier lu ne mange pas le budget des autres", () => {
  // ⚠️ C'EST LA MOITIÉ QUI COMPTE. Un plafond seulement GLOBAL se ferait manger
  // par la première personne du roster, et les suivantes disparaîtraient en
  // silence: le siège payé d'un secondaire dépendrait alors de l'ordre des
  // lignes en base.
  //
  // ⚠️ LES NOMBRES SONT CHOISIS POUR QUE LE PREMIER MEMBRE ÉPUISE EXACTEMENT LE
  // BUDGET, ET UNE MUTATION A MONTRÉ POURQUOI. Avec des lignes qui laissaient
  // 6 tokens de rab, un plafond rendu GLOBAL restait VERT: la ligne courte du
  // second membre passait quand même. Ici la ligne fait 96 caractères, soit 98
  // rendus, soit 25 tokens; six lignes valent 150 pile. Sous un plafond global,
  // il ne reste rien pour Bruno — et le test tombe.
  const fat = Array.from(
    { length: 40 },
    (_, i) => `${String(i).padStart(2, "0")} ${"courgette ".repeat(9)}cou`,
  );
  assertEquals(fat[0].length, 96);
  const { heard, block } = buildHouseholdVoices([
    { memberId: "m-a", displayName: "Anna", lines: fat },
    { memberId: "m-b", displayName: "Bruno", lines: ["no mushrooms"] },
  ]);
  assertEquals(heard.length, 2);
  assertEquals(heard[0].lines.length, 6, "le premier membre n'est pas plafonné à 150");
  assert(block.includes("- no mushrooms"), "le second membre a été effacé par le premier");
});

Deno.test("une ligne PLUS LONGUE QUE LE PLAFOND fait taire la suite, et c'est tracé", () => {
  // On ne tronque pas une préférence: une phrase amputée peut INVERSER son sens
  // (« ne mange pas de porc, sauf … »). Même posture que `sanitizePortionNote`,
  // qui met à `null` plutôt que de bricoler du texte.
  //
  // ⚠️ CE QUE CE TEST A CHANGÉ DE SENS, ET C'EST ASSUMÉ. Il affirmait avant que
  // « no fish » survivait à la ligne monstre qui la précède — c'est-à-dire
  // exactement le `continue` que le module promettait de ne pas faire. Le
  // plafond s'arrête maintenant: une ligne qui dépasse à elle seule fait taire
  // tout ce qui la suit, et le compte le dit (`:2`, pas `:1`).
  //
  // CE QUE ÇA COÛTE, MESURÉ: il faut ~598 caractères pour saturer 150 tokens à
  // soi seul. Sur le corpus local, la plus longue préférence réelle fait 120
  // caractères et le plus long texte de `memory_items` 126. Le cas n'existe pas
  // dans les données; s'il apparaissait, il est tracé, et le retour arrière est
  // un mot (`break` → `continue`).
  const monster = "tomate ".repeat(200);
  const { heard, issues, block, counts } = buildHouseholdVoices([
    { memberId: "m-x", displayName: "Zoé", lines: [monster, "no fish"] },
  ]);
  assertEquals(issues, ["voice_over_cap:m-x:2"]);
  assertEquals(heard.length, 0);
  assertEquals(block, "");
  assert(!block.includes("tomate tomate"));
  assertEquals(counts.perMember, [{
    memberId: "m-x",
    in: 2,
    used: 0,
    withheld: 0,
    over_cap: 2,
  }]);
});

// ───────────────────────────────────────────────────────────────────────────
// LES TESTS DE POSITION — ce que la SOURCE doit dire
//
// « Audit d'appelants: retirer les commentaires » est une cicatrice de ce
// dépôt: les gros commentaires d'ici citent tous les noms qu'on cherche, et un
// grep naïf rendrait vert n'importe quoi.
// ───────────────────────────────────────────────────────────────────────────

const FUNCTIONS_DIR = new URL("../../", import.meta.url);

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

async function source(rel: string): Promise<string> {
  return stripComments(await Deno.readTextFile(new URL(rel, FUNCTIONS_DIR)));
}

Deno.test("SUR LA LANE FOYER, LES PRÉFÉRENCES N'ONT QU'UN CHEMIN — ET IL GARDE", async () => {
  // ⚠️ LE DÉFAUT QUE CE TEST EMPÊCHE. Le plafond par membre et la garde de
  // non-divulgation vivent dans `household_voices.ts`. Si le générateur du
  // foyer rouvrait le chemin direct — `foodPreferences: foodPreferencesForPrompt
  // (pc)` — les mots du maître repartiraient dans le prompt SANS garde et SANS
  // plafond, et rien n'échouerait.
  const household = await source("generate-household-meal-v1/index.ts");
  assert(
    !household.includes("foodPreferencesForPrompt"),
    "le générateur du foyer rouvre le chemin direct des préférences: c'est un " +
      "second chemin, et il n'est ni plafonné ni gardé.",
  );
  assert(
    /foodPreferences: \[\]/.test(household),
    "le générateur du foyer ne passe plus `foodPreferences: []` au tronc: soit " +
      "les mots du maître ont disparu, soit ils passent deux fois.",
  );
  assert(
    household.includes("loadHouseholdVoices("),
    "le générateur du foyer ne charge plus les voix: D4 est débranché, et " +
      "l'assertion ci-dessus resterait verte sur un produit qui n'écoute plus " +
      "personne.",
  );
  assert(
    /voices: voices\.voices/.test(household),
    "les voix chargées ne sont plus passées au constructeur de prompt.",
  );
});

Deno.test("LA LANE INDIVIDUELLE N'A PAS BOUGÉ — le cas qui passe", async () => {
  // ⚠️ SANS CETTE MOITIÉ, LE TEST DU DESSUS SERAIT VERT SUR UN PRODUIT OÙ PLUS
  // AUCUN GÉNÉRATEUR NE LIT LES PRÉFÉRENCES. La lane individuelle n'a qu'un
  // titulaire et son plan n'est lu par personne d'autre: ni le plafond par
  // membre ni la garde de table n'y ont d'objet, et elle continue donc de
  // passer ses préférences au tronc, exactement comme avant L6.
  const individual = await source("generate-meal-v1/index.ts");
  // ⚠️ PAS `includes("foodPreferencesForPrompt")`, ET C'EST UNE MUTATION QUI
  // L'A MONTRÉ. Vider le corps de `readFoodPreferences` (`return [];`) laisse
  // la LIGNE D'IMPORT intacte: le test restait vert sur une lane individuelle
  // débranchée. On tient donc les deux bouts — l'appel réel, et le passage au
  // tronc avec autre chose qu'une liste vide.
  assert(
    /return foodPreferencesForPrompt\(/.test(individual),
    "la lane individuelle ne lit plus les préférences de son titulaire.",
  );
  assert(
    /foodPreferences: readFoodPreferences\(/.test(individual),
    "la lane individuelle ne passe plus ses préférences au tronc: le test du " +
      "dessus garderait alors un chemin sans destination.",
  );
  assert(
    !individual.includes("household_voices"),
    "la lane individuelle a été branchée sur le bloc des voix: elle n'a qu'un " +
      "convive, et le bloc y ajouterait une consigne de non-divulgation qui " +
      "ne s'adresse à personne.",
  );
});

Deno.test("LES VOIX SE LISENT SUR `platedMembers`, PAS SUR TOUT LE ROSTER", async () => {
  // Les deux filtres du chantier se composent en cascade — L3 (`composedMembers`,
  // qui a pris la main) puis L2 (`platedMembers`, qui est là). Qui n'est pas à
  // cette table n'a pas à être lu: faire pencher la casserole du foyer vers le
  // goût de quelqu'un qui mange son propre plan est exactement le défaut que L3
  // a fermé sur les portions.
  const household = await source("generate-household-meal-v1/index.ts");
  assert(
    /const voiceMembers[^=]*=\s*platedMembers/.test(household),
    "les voix ne partent plus de `platedMembers`: une bouche qui a pris la " +
      "main ou qui est absente toute la fenêtre est de nouveau lue.",
  );
});

Deno.test("LA LECTURE D'UNE LIGNE QUI N'EST PAS CELLE DE L'APPELANT EST SCOPÉE", async () => {
  // ⚠️ « RLS NE REMPLACE PAS UN `.eq(user_id)` » — ce dépôt a déjà rendu la
  // ligne d'un élève à son coach. Ce lot lit `student_goals` de personnes qui ne
  // sont PAS l'appelant, sous `service_role`, donc sans RLS. Le scope est la
  // seule chose qui tient.
  const io = await source("_shared/keel/household_voices_io.ts");
  assert(
    /\.in\("user_id", toLoad\)/.test(io),
    "la lecture des lignes `student_goals` n'est plus scopée sur les comptes " +
      "du roster: sous service_role, rien d'autre ne la borne.",
  );
  // UNE SEULE LECTURE DE TABLE DANS CE MODULE, et c'est celle qu'on vient de
  // vérifier. Une seconde `.from(...)` serait une lecture dont personne n'a
  // encore regardé le scope — et sous `service_role` c'est tout ce qui sépare
  // « la ligne du foyer » de « la ligne de n'importe qui ».
  assertEquals(
    io.split(".from(").length - 1,
    1,
    "une seconde lecture de table est apparue dans le chargeur des voix: son " +
      "scope n'est vérifié par personne.",
  );
});

Deno.test("AUCUN SECOND PONT VERS LA MÉMOIRE", async () => {
  // ⚠️ LE PIÈGE NOMMÉ DU LOT. Le pont mémoire → générateurs est unique, il exige
  // un « Keep » explicite de l'élève et il a cinq clés de domaine. En brancher
  // un second ici ferait entrer un magasin PROBABILISTE dans la composition —
  // exactement ce que l'architecture s'interdit (`safety-constraints`, la
  // cicatrice de l'allergie restée en `candidate`).
  for (const rel of ["_shared/keel/household_voices.ts", "_shared/keel/household_voices_io.ts"]) {
    const src = await source(rel);
    for (const forbidden of ["memory_items", "memory_v2", "recall"]) {
      assert(
        !src.includes(forbidden),
        `${rel} nomme \`${forbidden}\`: c'est un second pont vers la mémoire.`,
      );
    }
  }
  // LE CAS QUI PASSE: le module d'I/O DOIT passer par le pont existant, sans
  // quoi la garde ci-dessus serait verte sur un lot qui n'entend personne.
  const io = await source("_shared/keel/household_voices_io.ts");
  assert(io.includes("reconcileFoodPreferencesFor("));
  assert(io.includes("foodPreferencesForPrompt("));
});

Deno.test("LA GARDE DÉRIVE LA LISTE DES PORTIONS, ELLE N'EN RECOPIE PAS UNE SECONDE", async () => {
  // « Jamais de matcher maison » sur du texte alimentaire, et jamais deux
  // listes: `forbidden_matcher.ts` documente en tête de fichier que sa raison
  // d'être est d'empêcher exactement ce doublon. Une seconde liste divergerait
  // à la première correction, et la divergence serait invisible.
  //
  // ⚠️ CE TEST A CHANGÉ DE FORME AVEC CE LOT. Il interdisait le MOT
  // `surfaceForms:` dans le module — ce qui interdisait aussi d'AJOUTER un
  // terme que la liste de sortie ne connaît pas, alors que le registre TCA
  // devait l'être. La non-duplication est maintenant prouvée par l'IDENTITÉ des
  // objets (voir « UN SEUL TERME DE LA SORTIE… »), ce qui est plus fort qu'un
  // grep: un terme recopié à la virgule près y tombe, alors qu'il passait ici.
  const pure = await source("_shared/keel/household_voices.ts");
  assert(pure.includes("FORBIDDEN_PORTION_TERMS.filter("));
  assert(pure.includes("findForbiddenMatches("));
  assert(
    pure.includes("allowNegatedMentions: false"),
    "la garde des voix blanchit les mentions niées: « une part sans perte de " +
      "poids » parle encore de perte de poids devant toute la table.",
  );
  // LA LISTE DE SORTIE N'A PAS BOUGÉ. Le lot ne touche pas
  // `household_portions.ts`: `sanitizePortionNote` continue de refuser un âge
  // dans une consigne de service, et la lane individuelle est intacte.
  const portions = await source("_shared/keel/household_portions.ts");
  assert(
    /token: "age"/.test(portions),
    "le terme `age` a été retiré de la liste de SORTIE: ce lot ne l'a retiré " +
      "que de la garde des ENTRÉES, et `sanitizePortionNote` doit continuer " +
      "de refuser un âge dans une consigne lue à table.",
  );
});

Deno.test("CE QUI EST COUPÉ ARRIVE DANS LES `issues` DU PLAN", async () => {
  // ⚠️ « Une troncature muette est un mensonge sur ce que le modèle a vu. » Le
  // module rend ses coupes; encore faut-il que le générateur les ÉCRIVE. Sans
  // ça, « pourquoi ce plan ignore-t-il ce que j'ai dit ? » n'a aucune réponse
  // trois jours plus tard, et un plafond mal calibré est indiscernable d'un
  // modèle distrait.
  const household = await source("generate-household-meal-v1/index.ts");
  assert(
    /issues\.push\(\.\.\.household\.voiceIssues\)/.test(household),
    "les coupes des voix ne sont plus écrites dans les `issues` du plan.",
  );
  assert(
    /issues\.push\(\.\.\.voices\.issues\)/.test(household),
    "l'échec de lecture des voix n'est plus écrit dans les `issues` du plan.",
  );
});

Deno.test("LES NOMBRES DE LA TRACE NE SE REDÉRIVENT PAS DES `issues`", async () => {
  // ⚠️ LE DÉFAUT MESURÉ, ET IL ÉTAIT DANS L'APPELANT. `generated_from.household
  // .voices` comptait des CHAÎNES: `household.voiceIssues.filter(i =>
  // i.startsWith("voice_line_withheld:")).length` rendait 3 pour UNE ligne
  // retenue sur trois formes de surface, et le pendant `voice_over_cap:`
  // rendait 1 pour DEUX lignes tombées (une seule `issue`, qui portait `:2`
  // dans son texte). Gonflé et dégonflé, en sens inverses, dans le même objet.
  //
  // Le module compte des LIGNES là où elles passent; l'appelant les recopie.
  const household = await source("generate-household-meal-v1/index.ts");
  assert(
    !/voiceIssues\.filter\(/.test(household),
    "la trace redérive ses nombres des `issues`: un compteur dérivé d'un " +
      "format de trace ment dès que le format bouge.",
  );
  assert(
    /lines_used: household\.voiceCounts\.linesUsed/.test(household),
    "`lines_used` a disparu de la trace: plus rien ne dit combien de lignes le " +
      "modèle a réellement vues, qui est la seule question pour relire une " +
      "composition.",
  );
  assert(
    /per_member: household\.voiceCounts\.perMember/.test(household),
    "le détail par bouche a disparu: « son about-you n'a servi à rien » et " +
      "« il n'avait rien confirmé » redeviennent la même trace.",
  );
});
