// LE COMPTEUR DU REPLI DE SÉCURITÉ — lot M7.
//
// Ce que ces tests existent pour empêcher, dans l'ordre où ça coûte:
//
//   1. QUE LE COMPTEUR DEVIENNE UNE GARDE. Il ne décide rien. Le jour où un
//      appelant lit `shaped` comme « allergie détectée », le produit a une
//      seconde autorité de sécurité — plus faible que la vraie, parce qu'elle
//      ne lit que du texte et ne vérifie rien en sortie. Une protection qu'on
//      croit avoir est pire que pas de protection.
//   2. QU'IL SOIT AVEUGLE À CE QU'IL COMPTE. La formulation la plus courante
//      d'une déclaration est une NÉGATION (« je ne mange pas d'arachides »).
//      Compté en mode ceinture, il ne verrait rien et rendrait 0 — c'est-à-dire
//      exactement la lecture « tout va bien ».
//   3. QU'IL SOUS-COMPTE EN SILENCE. Il part de la table des formes de surface,
//      pas du catalogue du formulaire: dix ALIAS (`lactose`, `fruits_de_mer`…)
//      sont des slugs réellement écrits en base, et les manquer rendrait un
//      taux flatteur.
//   4. QU'UN MATCHER MAISON REPOUSSE ICI. « laitue » ≠ « lait », 12 faux
//      positifs sur 12 mesurés dans ce dépôt.
//
// env purgé: env -u SUPABASE_URL -u SUPABASE_ANON_KEY -u SUPABASE_SERVICE_ROLE_KEY \
//   deno test --allow-read --allow-env --no-check \
//   supabase/functions/_shared/keel/safety_fallback_counter_test.ts

import { assert, assertEquals } from "jsr:@std/assert@1";

import {
  observeSafetyFallback,
  SAFETY_FALLBACK_TAG,
  SAFETY_TERM_SLUGS,
  SAFETY_TERMS_MISSING_FROM_FORMS,
  safetyShapeOf,
} from "./safety_fallback_counter.ts";
import { ALLERGEN_CATALOG } from "./allergen_catalog.ts";
import { surfaceFormsFor } from "./allergen_surface_forms.ts";
import { findForbiddenMatches } from "./forbidden_matcher.ts";

// ===========================================================================
// 1. CE QU'IL VOIT — et dans les DEUX langues
// ===========================================================================

Deno.test("il voit une substance connue, y compris NIÉE, dans les deux langues", () => {
  // ⚠️ LES NÉGATIONS SONT LE CŒUR DU LOT. Une déclaration s'écrit presque
  // toujours au négatif; un compteur qui les blanchit ne compte rien.
  const shaped = [
    // FR
    "je ne mange pas d'arachides",
    "je suis allergique aux cacahuètes",
    "je ne supporte pas le lactose",
    "pas de gluten pour moi",
    "plus jamais de fruits de mer",
    // EN
    "I don't eat peanuts",
    "I'm allergic to peanuts, badly",
    "no shellfish for me",
    "I'm lactose intolerant",
  ];
  for (const text of shaped) {
    const out = safetyShapeOf(text);
    assert(out.shaped, `NON VU: ${JSON.stringify(text)}`);
    assert(out.slugs.length > 0, `vu sans slug: ${JSON.stringify(text)}`);
  }
});

Deno.test("il ne voit RIEN dans une préférence ordinaire", () => {
  // ⚠️ LE CAS QUI NE PASSE PAS EST AUSSI NÉCESSAIRE QUE CELUI QUI PASSE. Un
  // compteur qui mord sur tout rendrait un taux de 100 % et ne dirait rien —
  // il ressemblerait pourtant à un compteur qui marche.
  const ordinary = [
    "je n'aime pas le poulet",
    "je déteste le brocoli",
    "je n'ai pas de four",
    "plus jamais de topinambour",
    "I hate broccoli",
    "I don't have an oven",
    "we have dinner very late",
  ];
  for (const text of ordinary) {
    const out = safetyShapeOf(text);
    assertEquals(out.shaped, false, `FAUX POSITIF: ${JSON.stringify(text)}`);
    assertEquals(out.slugs, []);
  }
});

Deno.test("un texte vide ou absent ne mord pas, et ne jette pas", () => {
  for (const empty of ["", "   ", null, undefined, 42, {}]) {
    const out = safetyShapeOf(empty);
    assertEquals(out.shaped, false, `${JSON.stringify(empty)}`);
    assertEquals(out.slugs, []);
  }
});

// ===========================================================================
// 2. ⛔ LE MODE AUDIT — la prémisse, PROUVÉE et pas affirmée
// ===========================================================================

Deno.test("⛔ en mode CEINTURE, le compteur serait aveugle — mesuré", () => {
  // C'EST LA PRÉMISSE DU CHOIX `allowNegatedMentions: false`, et elle se
  // MESURE. Sans ce test, « on a mis le mode audit » est une affirmation dans
  // un commentaire; avec lui, on sait ce que l'autre mode coûterait.
  const terms = [{
    ruleId: "peanut",
    token: "peanut",
    surfaceForms: surfaceFormsFor("peanut"),
  }];
  const declaration = "je ne mange pas d'arachides";

  // Mode CEINTURE (le défaut): la négation blanchit la mention.
  const asBelt = findForbiddenMatches(declaration, terms);
  assertEquals(
    asBelt.length,
    0,
    "la ceinture ne blanchit plus les négations: la prémisse de ce lot a changé",
  );

  // Mode AUDIT (ce que le compteur utilise): la mention est vue.
  assert(
    safetyShapeOf(declaration).shaped,
    "LE COMPTEUR EST PASSÉ EN MODE CEINTURE. Il est désormais aveugle à la " +
      "formulation la plus courante d'une déclaration, et rendra 0 — " +
      "c'est-à-dire « tout va bien ».",
  );
});

// ===========================================================================
// 3. LA COUVERTURE — il part de la table LA PLUS LARGE
// ===========================================================================

Deno.test("les slugs du formulaire sont TOUS couverts par des formes", () => {
  // Non vide, ce tableau dit qu'un allergène proposé à l'écran n'est reconnu
  // que sous son seul mot — et ce compteur le manquerait.
  assertEquals(
    SAFETY_TERMS_MISSING_FROM_FORMS,
    [],
    "un slug du formulaire n'a aucune forme de surface",
  );
});

Deno.test("il compte les ALIAS, pas seulement le catalogue du formulaire", () => {
  // ⛔ LA CORRECTION MESURÉE DU LOT. La première version partait du catalogue
  // et manquait `lactose` — donc « je ne supporte pas le lactose », la
  // formulation française la plus courante d'une intolérance au lait, alors que
  // le plancher d'intake écrit précisément `allergen_ref: 'lactose'`.
  const catalog = ALLERGEN_CATALOG.map((e) => e.slug);
  const aliases = SAFETY_TERM_SLUGS.filter((s) => !catalog.includes(s));
  assert(
    aliases.length > 0,
    "LE COMPTEUR EST REVENU AU CATALOGUE: il sous-compte, et un taux qui " +
      "sous-compte se lit comme un taux qui va bien.",
  );
  assert(aliases.includes("lactose"), "l'alias mesuré du lot a disparu");
  assertEquals(safetyShapeOf("je ne supporte pas le lactose").slugs, ["lactose"]);
});

// ===========================================================================
// 4. L'OBSERVATION — `fellBack` est une CONJONCTION
// ===========================================================================

Deno.test("`fellBack` n'est pas un synonyme de `shaped`", () => {
  // ⚠️ SI LES DEUX ÉTAIENT ÉGAUX, LE COMPTEUR COMPTERAIT LES SUCCÈS COMME DES
  // ÉCHECS: un tour où la personne déclare une allergie ET où l'outil part est
  // le cas NOMINAL. Le noyer dans le numérateur rendrait le vrai signal
  // illisible.
  const declaration = "je suis allergique aux arachides";

  const caught = observeSafetyFallback({
    text: declaration,
    safetyRequested: true,
  });
  assertEquals(caught.shaped, true);
  assertEquals(caught.safetyRequested, true);
  assertEquals(caught.fellBack, false, "le cas NOMINAL est compté en repli");

  const missed = observeSafetyFallback({
    text: declaration,
    safetyRequested: false,
  });
  assertEquals(missed.shaped, true);
  assertEquals(missed.fellBack, true, "le repli réel n'est PAS compté");

  // Et une préférence ordinaire ne devient jamais un repli, même sans outil.
  const ordinary = observeSafetyFallback({
    text: "je n'aime pas le poulet",
    safetyRequested: false,
  });
  assertEquals(ordinary.shaped, false);
  assertEquals(ordinary.fellBack, false);
});

Deno.test("`safetyRequested` n'a pas de défaut permissif", () => {
  // Cicatrice « paramètre de garde optionnel = garde désarmée ». Ici l'erreur
  // symétrique serait pire: un défaut `true` ferait rendre `fellBack: false`
  // partout, c'est-à-dire un compteur qui ne compte JAMAIS rien tout en ayant
  // l'air de tourner.
  for (const truthy of [1, "true", {}, [] as unknown]) {
    const out = observeSafetyFallback({
      text: "je suis allergique aux arachides",
      safetyRequested: truthy as unknown as boolean,
    });
    assertEquals(
      out.safetyRequested,
      false,
      `une valeur non booléenne (${JSON.stringify(truthy)}) a désarmé le compteur`,
    );
    assertEquals(out.fellBack, true);
  }
});

// ===========================================================================
// 5. ⛔ CE QU'IL NE DEVIENT PAS
// ===========================================================================

Deno.test("⛔ il ne LÈVE JAMAIS — et le zéro qui en résulte est ÉTIQUETÉ", () => {
  // ⛔ LA PROMESSE CENTRALE DU MODULE. Une exception remontant d'ici tuerait
  // le tour qu'il observe — un compteur qui casse la conversation qu'il mesure,
  // sur un chemin qui parle d'allergies.
  //
  // ⚠️ CE TEST A TROUVÉ LE DÉFAUT, IL NE LE DÉCORE PAS. La première version
  // faisait `String(text)` sans filet: une valeur dont `toString` lève faisait
  // remonter l'erreur jusqu'au tour.
  const trap = { toString() { throw new Error("piège"); } } as unknown;
  const out = safetyShapeOf(trap);
  assertEquals(out.shaped, false);
  assertEquals(out.slugs, []);
  // ⚠️ ET LE ZÉRO DIT POURQUOI. Sans `unreadable`, un compteur qui n'arrive
  // plus à lire rendrait « aucun repli » — la lecture la plus rassurante et la
  // plus fausse.
  assertEquals(
    out.unreadable,
    true,
    "L'ÉCHEC EST AVALÉ: le zéro de ce compteur ne se distingue plus d'un zéro " +
      "mesuré. C'est la cicatrice du `catch` muet.",
  );

  // Un texte lisible n'est JAMAIS marqué illisible — sans quoi le champ
  // dirait « cassé » en permanence et ne signalerait plus rien.
  const before = "je suis allergique aux arachides";
  const ok = safetyShapeOf(before);
  assertEquals(ok.unreadable, false);
  assertEquals(before, "je suis allergique aux arachides", "l'entrée a bougé");
  // Pur: même entrée, même sortie.
  assertEquals(safetyShapeOf(before), ok);
});

Deno.test("⛔ aucun matcher maison, aucune table recopiée", () => {
  const source = Deno.readTextFileSync(
    new URL("./safety_fallback_counter.ts", import.meta.url),
  );
  const code = source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((line) => line.replace(/(^|[^:])\/\/.*$/, "$1"))
    .join("\n");
  assert(!/new RegExp\(/.test(code), "un matcher maison est apparu");
  assert(!/\/.*\/[gimsuy]*\.test\(/.test(code), "un matcher maison est apparu");
  // ⚠️ ET AUCUN NOM D'ALLERGÈNE EN DUR. Une troisième copie des tables
  // divergerait de la ceinture — la liste des négations est la partie qu'on
  // édite, et une édition qui atterrit dans une copie et pas l'autre est
  // invisible jusqu'au jour où un allergène passe.
  for (const slug of ["peanut", "gluten", "shellfish", "sesame"]) {
    assert(
      !code.includes(`"${slug}"`),
      `le slug "${slug}" est écrit en dur: une table est en train d'être recopiée`,
    );
  }
  // Le matcher et les tables viennent bien d'ailleurs.
  assert(code.includes("findForbiddenMatches"), "le moteur n'est plus utilisé");
  assert(code.includes("ALLERGEN_SURFACE_FORMS"), "la table n'est plus lue");
});

// ===========================================================================
// 6. LE CÂBLAGE — un compteur débranché ressemble à un compteur qui marche
// ===========================================================================

const SURFACES = [
  { rel: "../../sophia-brain/router/run.ts", label: "conversation" },
  { rel: "./retained_items_io.ts", label: "magasin retenu" },
] as const;

function sourceOf(rel: string): string {
  return Deno.readTextFileSync(new URL(rel, import.meta.url))
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((line) => line.replace(/(^|[^:])\/\/.*$/, "$1"))
    .join("\n");
}

Deno.test("le tag est UNIQUE et partagé par les deux surfaces", () => {
  assertEquals(SAFETY_FALLBACK_TAG, "keel/safety_fallback");
  // Deux littéraux jumeaux que rien ne relie sont la panne §7.4: on renomme
  // d'un côté, tout reste vert, et le tableau de bord perd la moitié des lignes.
  for (const { rel } of SURFACES) {
    const src = sourceOf(rel);
    assert(
      src.includes("SAFETY_FALLBACK_TAG"),
      `${rel} n'importe plus la constante: il a recopié le littéral`,
    );
    assert(
      !src.includes(`"${SAFETY_FALLBACK_TAG}"`),
      `${rel} écrit le tag en dur au lieu de l'importer`,
    );
  }
});

Deno.test("LE CÂBLAGE — les deux surfaces comptent, avec un DÉNOMINATEUR", () => {
  // ⚠️ CE FICHIER EXISTE À CAUSE D'UN DÉFAUT NOMMÉ: un module parfait à N tests
  // et ZÉRO test sur son câblage se retire sans qu'un seul test rougisse. Un
  // lot débranché est INDISCERNABLE d'un lot qui marche — et pour un compteur,
  // c'est pire: débranché, il rend 0, et 0 se lit « aucun repli ».
  for (const { rel, label } of SURFACES) {
    const src = sourceOf(rel);
    assert(
      src.includes("safetyShapeOf(") || src.includes("observeSafetyFallback("),
      `COMPTEUR DÉBRANCHÉ (${label}): plus aucun appel au module.`,
    );
    // ⛔ LE DÉNOMINATEUR. La ligne doit partir à CHAQUE passage, pas seulement
    // quand ça mord: sinon « 0 repli » ne se distingue pas de « 0 observé »,
    // et c'est la forme sous laquelle le lot 4A est resté invisible.
    const tagAt = src.indexOf("tag: SAFETY_FALLBACK_TAG");
    assert(tagAt !== -1, `${label}: la ligne de journal a disparu`);
    const line = src.slice(tagAt, tagAt + 900);
    assert(
      line.includes('event: "seen"'),
      `LE DÉNOMINATEUR A DISPARU (${label}): la ligne ne part plus à chaque ` +
        `passage, donc « 0 repli » se confond avec « 0 tour observé ».`,
    );
    for (const field of ["shaped:", "unreadable:", "fell_back:", "filed_as_preference:"]) {
      assert(
        line.includes(field),
        `LE CHAMP \`${field}\` A DISPARU DE LA LIGNE (${label}).`,
      );
    }
  }
});

Deno.test("⛔ AUCUNE SURFACE NE FAIT DÉPENDRE UNE DÉCISION DU COMPTEUR", () => {
  // ⛔ LA GARDE LA PLUS IMPORTANTE DU LOT, ET ELLE PORTE SUR LES APPELANTS.
  // Le module ne décide rien; c'est aux points de comptage de ne pas le
  // transformer en juge. Le jour où un `if (shaped)` gouverne une sortie, le
  // produit a une SECONDE autorité de sécurité — qui ne lit que du texte et ne
  // vérifie rien en sortie. Une protection qu'on croit avoir est pire que pas
  // de protection.
  //
  // ── LA PROPRIÉTÉ, ÉNONCÉE SANS HEURISTIQUE ──────────────────────────────
  // Tout ce que le compteur produit reste ENFERMÉ entre sa déclaration et la
  // fin de sa ligne de journal. Une occurrence hors de cet intervalle est, par
  // construction, quelque chose qui lit le compteur pour autre chose que le
  // journaliser — donc quelque chose qui en DÉPEND.
  //
  // C'est aussi ce qui rend le bloc RETIRABLE: supprimer l'intervalle laisse un
  // fichier entier, et c'est la définition opérationnelle de « il ne change
  // rien ».
  const REGIONS: ReadonlyArray<
    { rel: string; label: string; open: string; symbols: readonly string[] }
  > = [
    {
      rel: "../../sophia-brain/router/run.ts",
      label: "conversation",
      open: "const safetyFallback = observeSafetyFallback(",
      symbols: ["safetyFallback"],
    },
    {
      rel: "./retained_items_io.ts",
      label: "magasin retenu",
      open: "const safetyShapes = ",
      symbols: ["safetyShapes", "safetyShaped"],
    },
  ];

  for (const { rel, label, open, symbols } of REGIONS) {
    const src = sourceOf(rel);
    const from = src.indexOf(open);
    assert(from !== -1, `${label}: le bloc du compteur a disparu (\`${open}\`)`);
    const tagAt = src.indexOf("tag: SAFETY_FALLBACK_TAG", from);
    assert(tagAt !== -1, `${label}: la ligne de journal a disparu`);
    const to = src.indexOf("}));", tagAt) + "}));".length;
    assert(to > from, `${label}: ligne de journal non refermée`);

    for (const symbol of symbols) {
      const pattern = new RegExp(`\\b${symbol}\\b`, "g");
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(src)) !== null) {
        assert(
          match.index >= from && match.index < to,
          `LE COMPTEUR EST LU HORS DE SON BLOC (${label}, \`${symbol}\` à ` +
            `l'offset ${match.index}): quelque chose en DÉPEND, donc ce n'est ` +
            `plus un compteur mais une garde — et une garde plus faible que la ` +
            `vraie, puisqu'elle ne vérifie rien en sortie.`,
        );
      }
    }
  }
});

Deno.test("⛔ ET LA GARDE MORD — une lecture hors bloc est ROUGE", () => {
  // LA CEINTURE DE LA CEINTURE. Sans elle, une garde dont les chaînes ne
  // correspondent plus à rien passerait pour un câblage sain.
  const src = sourceOf("../../sophia-brain/router/run.ts");
  const from = src.indexOf("const safetyFallback = observeSafetyFallback(");
  assert(from !== -1);
  const to = src.indexOf("}));", src.indexOf("tag: SAFETY_FALLBACK_TAG", from));

  // On simule EXACTEMENT le geste qu'on redoute: quelqu'un fait dépendre une
  // sortie du compteur, bien plus bas dans le fichier.
  const mutated = src.slice(0, to) +
    "\n  if (safetyFallback.shaped) { out = null; }\n" +
    src.slice(to);
  const pattern = /\bsafetyFallback\b/g;
  let outside = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(mutated)) !== null) {
    if (match.index < from || match.index >= to) outside += 1;
  }
  assert(
    outside > 0,
    "LA GARDE NE VOIT PAS UNE LECTURE HORS BLOC: elle est verte quoi qu'il " +
      "arrive, donc elle ne tient rien.",
  );
});
