// ═══════════════════════════════════════════════════════════════════════════
// LOT 2C — LE MEMORIZER PRODUCTEUR, ET LA REDIRECTION DU SIZING
//
// Ce que ces tests tiennent, dans l'ordre de ce qui coûte le plus cher:
//
//   * ⛔ UN `portion.adjust` PROPOSÉ PAR LA CONVERSATION EST REFUSÉ, et le
//     RENVOI est dit à la place — DANS LES DEUX LANGUES. C'est le point central
//     du chantier: une mesure a besoin d'un sujet, et la conversation ne sait
//     pas l'attribuer. Chaque garde a son cas qui MORD **et** son cas qui
//     PASSE: « une garde sans cas passant est une garde cassée qui ressemble à
//     une garde qui marche ».
//   * ⛔ RIEN N'ENTRE SANS UN « KEEP ». Un `memory_id` que la personne n'a pas
//     confirmé est refusé et COMPTÉ, jamais sauvé.
//   * ⚠️ UNE LIGNE SANS `item` N'EST PAS RÉCLAMÉE PAR LE MEMORIZER. Le vide
//     protège l'entrée: elle appartient à la personne.
//   * LA POLARITÉ, DANS LES DEUX SENS. Un lot voisin a mesuré en run réel
//     « Plus de poisson cette semaine » sorti en `food.prefer` au lieu de
//     `food.exclude`. Ce chemin-ci part de souvenirs déjà classés, mais rien ne
//     le prouvait: on le prouve.
//   * LE SEUIL 0,70 N'EST PAS DUPLIQUÉ ICI — prouvé SUR LE DISQUE.
//
// ⚠️ LES VALEURS ATTENDUES SONT ÉCRITES EN DUR, jamais dérivées des constantes
// qu'elles épinglent: un test paramétré par sa propre constante reste vert
// quand on change la constante.
// ═══════════════════════════════════════════════════════════════════════════

import { assert, assertEquals } from "jsr:@std/assert@1";

import {
  appendSizingRedirect,
  buildConversationClassifyPrompt,
  CONVERSATION_CLASSIFY_SYSTEM_PROMPT,
  CONVERSATION_FORBIDDEN_KINDS,
  CONVERSATION_KINDS,
  CONVERSATION_PRODUCER,
  conversationClassifyTrace,
  type KeptMemoryLine,
  keptMemoryLinesFrom,
  readConversationClassification,
  SIZING_REDIRECT_SENTENCES,
  sizingFeedbackDetected,
  sizingRedirectFor,
  sizingRedirectSentence,
} from "./conversation_retained.ts";
import { applyFoodPreferenceDecision } from "./food_preference_promotion.ts";
import { canProduce, defaultScopeFor } from "./retained_item.ts";

const MEM_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const MEM_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const MEMBER = "11111111-1111-4111-8111-111111111111";
const OUTSIDER = "99999999-9999-4999-8999-999999999999";

/** Une ligne confirmée, telle que le `_io` la présente à la relecture. */
function kept(over: Partial<KeptMemoryLine> = {}): KeptMemoryLine {
  return {
    memoryItemId: MEM_A,
    text: "N'aime pas le brocoli.",
    at: "2026-08-17",
    confidence: 0.82,
    ...over,
  };
}

function read(rows: unknown[], lines: KeptMemoryLine[] = [kept()]) {
  return readConversationClassification({
    raw: { items: rows },
    kept: lines,
    members: [{ memberId: MEMBER, label: "Zoé" }],
    targetWeek: "2026-08-19",
  });
}

// ---------------------------------------------------------------------------
// LE JETON DE LA MATRICE, ET LES DEUX LISTES DÉRIVÉES
// ---------------------------------------------------------------------------

Deno.test("LE PRODUCTEUR EST `conversation`, ÉPINGLÉ À SON LITTÉRAL", () => {
  // ⚠️ Le jumeau de ce mot est lu par `canProduce`, par `parseRetainedItem` À
  // LA LECTURE, par le port serveur et par la carte. Une constante qui a un
  // jumeau ailleurs et que rien ne relie laisse les tests verts pendant que
  // l'écriture part dans un mot que plus personne ne lit.
  assertEquals(CONVERSATION_PRODUCER, "conversation");
  // ⛔ ET SURTOUT PAS `written`: `canProduce("written", …)` rend `true` pour les
  // huit familles, donc se déclarer ainsi contournerait la matrice ENTIÈRE par
  // un seul mot — et la carte afficherait « tu l'as écrit », ce qui serait faux.
  // ⚠️ COMPARÉ SUR UN `string` ÉLARGI, ET C'EST UNE INFORMATION: le type est si
  // étroit que `CONVERSATION_PRODUCER !== "written"` ne COMPILE pas (TS2367,
  // « no overlap »). Le compilateur tient donc déjà l'interdit; cette ligne
  // tient le jour où quelqu'un élargirait la constante en `string`.
  const producer: string = CONVERSATION_PRODUCER;
  assertEquals(producer === "written", false);
  // Et voici POURQUOI ce mot-là serait une porte dérobée: `written` peut tout.
  assertEquals(canProduce("written", "portion.adjust"), true);
});

Deno.test("LES DEUX LISTES SONT DÉRIVÉES DE `canProduce`, et l'égalité est prouvée", () => {
  assertEquals([...CONVERSATION_KINDS], [
    "food.exclude",
    "food.prefer",
    "method.avoid",
    "method.prefer",
    "rhythm.set",
    "logistics.set",
    "craving",
  ]);
  assertEquals([...CONVERSATION_FORBIDDEN_KINDS], ["portion.adjust"]);
});

// ---------------------------------------------------------------------------
// ⛔ LE CŒUR DU LOT — `portion.adjust` REFUSÉ, ET LE RENVOI DIT À LA PLACE
// ---------------------------------------------------------------------------

Deno.test("LES DEUX PRÉMISSES DU REFUS, ÉPINGLÉES CHACUNE À SON LITTÉRAL", () => {
  // ⚠️ CE TEST EXISTE À CAUSE D'UNE MUTATION RESTÉE VERTE, et il faut le dire:
  // `readConversationClassification` porte DEUX portes pour le même interdit —
  // `canProduce`, puis le `null` de `defaultScopeFor`. Elles se DOUBLENT: la
  // seconde appelle la première, donc désarmer l'une laisse l'autre attraper
  // l'item, et la mutation ne rougit pas. « Ceinture et bretelles, une seule
  // des deux prouvée » — et alors AUCUNE des deux ne l'est.
  //
  // La redondance reste voulue (le module l'écrit: le jour où la nomenclature
  // séparerait les deux fonctions, le repli aurait réarmé l'interdit en
  // silence). Ce qu'on prouve ici, c'est donc la PRÉMISSE que les deux portes
  // partagent, épinglée à ses deux littéraux: si la matrice change d'avis,
  // c'est cette ligne qui rougit — avant que le memorizer ne se mette à écrire
  // des portions.
  assertEquals(canProduce("conversation", "portion.adjust"), false);
  assertEquals(defaultScopeFor("conversation", "portion.adjust"), null);
  // ⛔ ET LE `null` NE SE REPLIE PAS. Un `?? "durable"` chez un appelant
  // réarmerait exactement l'interdit que `canProduce` vient de poser.
  assertEquals(defaultScopeFor("questionnaire", "portion.adjust"), "durable");
});

Deno.test("⛔ UN `portion.adjust` PROPOSÉ PAR LA CONVERSATION EST REFUSÉ ET COMPTÉ", () => {
  const out = read([{
    memory_id: MEM_A,
    kind: "portion.adjust",
    text: "Les portions étaient trop grosses.",
    member_id: null,
    value: { direction: "down", magnitude: "clear" },
  }]);
  assert(out.ok);
  assertEquals(out.classification.durable.length, 0);
  assertEquals(out.classification.nextPlan.length, 0);
  assertEquals(out.classification.kept, 0);
  // ⚠️ COMPTÉ, ET SOUS SON PROPRE MOTIF. Sans ce nombre, une matrice désarmée
  // ressemble trait pour trait à un modèle qui n'a rien proposé.
  assertEquals(out.classification.refused.forbiddenKind, 1);
  assertEquals(out.classification.refused.total, 1);
  assertEquals(out.classification.proposed, 1);
});

Deno.test("⛔ ET IL NE PASSE PAS DAVANTAGE EN SE DÉCLARANT `next_plan` OU SANS `value`", () => {
  // Les deux échappatoires vraisemblables: enlever la `value` pour ressembler à
  // une famille sans structure, ou réclamer l'autre magasin. La matrice mord
  // AVANT le socle, donc les deux tombent au même endroit.
  for (
    const row of [
      { memory_id: MEM_A, kind: "portion.adjust", text: "Trop gros.", value: null },
      {
        memory_id: MEM_A,
        kind: "PORTION.ADJUST",
        text: "Trop gros.",
        value: { direction: "down", magnitude: "slight" },
      },
    ]
  ) {
    const out = read([row]);
    assertEquals(out.classification.kept, 0);
    assertEquals(out.classification.refused.forbiddenKind, 1);
  }
});

Deno.test("LE CAS QUI PASSE — une famille autorisée entre, avec sa confiance et SON jour", () => {
  // ⚠️ SANS CETTE MOITIÉ, le test précédent resterait vert sur un module qui
  // refuse TOUT: une garde cassée bloque tout et ressemble à une garde qui
  // marche.
  const out = read([{
    memory_id: MEM_A,
    kind: "food.exclude",
    text: "Pas de brocoli.",
    member_id: null,
    value: null,
  }]);
  assert(out.ok);
  assertEquals(out.classification.kept, 1);
  assertEquals(out.classification.refused.total, 0);
  const item = out.classification.durable[0];
  assertEquals(item.kind, "food.exclude");
  assertEquals(item.scope, "durable");
  assertEquals(item.source, "conversation");
  assertEquals(item.subject, "household");
  // L'UUID DU SOUVENIR: c'est lui qui rend la ligne traçable et rétractable.
  assertEquals(item.item, MEM_A);
  // ⚠️ LE JOUR OÙ ELLE L'A DIT, pas le jour du traitement. Le memorizer tourne
  // à minuit sur les 30 dernières heures: dater sur son passage ferait dire
  // « je l'ai retenu de mercredi » d'une phrase de mardi soir.
  assertEquals(item.at, "2026-08-17");
  // PORTÉE, PAS SEUILLÉE — le socle l'exige pour cette source, et la refuse
  // pour toutes les autres.
  assertEquals(item.confidence, 0.82);
});

// ---------------------------------------------------------------------------
// B · LE RENVOI — DIT, ET DANS LES DEUX LANGUES
// ---------------------------------------------------------------------------

Deno.test("LE RENVOI SORT DANS LA LANGUE DE LA PERSONNE — les DEUX", () => {
  // ⚠️ LES DEUX LANGUES, ET C'EST UNE CICATRICE CHIFFRÉE DE CE DÉPÔT: une garde
  // testée dans une seule langue ne mord pas dans l'autre (`not` ne couvre pas
  // `doesn't`), et une doctrine `fr-FR` est déjà sortie en anglais.
  const signal = { detected: true, kind: "portion", sentiment: "negative" };

  const fr = sizingRedirectFor({ signal, locale: "fr-FR", isKeelStudent: true });
  const en = sizingRedirectFor({ signal, locale: "en-GB", isKeelStudent: true });
  assertEquals(fr, SIZING_REDIRECT_SENTENCES.fr);
  assertEquals(en, SIZING_REDIRECT_SENTENCES.en);
  // Deux packs ENTIERS, jamais un repli mot à mot: les deux phrases diffèrent.
  assert(fr !== en);
  // Et chacune NOMME sa destination — c'est tout l'objet du renvoi.
  assert(SIZING_REDIRECT_SENTENCES.fr.includes("bilan de fin de plan"));
  assert(SIZING_REDIRECT_SENTENCES.en.includes("end-of-plan review"));
  // ⛔ AUCUN POINT D'INTERROGATION: la question fermée appartient au
  // questionnaire, qui a la liste du foyer sous les yeux. Poser la question ici
  // serait précisément l'inférence que ce lot refuse.
  assert(!SIZING_REDIRECT_SENTENCES.fr.includes("?"));
  assert(!SIZING_REDIRECT_SENTENCES.en.includes("?"));
});

Deno.test("LA LANGUE NE FAIT JAMAIS TOMBER UN TOUR — une locale non livrée rend l'anglais", () => {
  // ⚠️ `isFrenchLocale` ET PAS `localePackKey`: celui-là LÈVE sur une langue non
  // livrée, et une phrase d'accompagnement ne doit jamais faire tomber un tour.
  assertEquals(sizingRedirectSentence("de-DE"), SIZING_REDIRECT_SENTENCES.en);
  assertEquals(sizingRedirectSentence(null), SIZING_REDIRECT_SENTENCES.en);
  assertEquals(sizingRedirectSentence("fr"), SIZING_REDIRECT_SENTENCES.fr);
  assertEquals(sizingRedirectSentence("FR-ca"), SIZING_REDIRECT_SENTENCES.fr);
});

Deno.test("LE RENVOI NE SORT QUE SUR UN RETOUR DE PART — les trois cas qui NE l'arment pas", () => {
  // ⚠️ LES TROIS MOITIÉS QUI PASSENT. Sans elles, un module qui rend TOUJOURS la
  // phrase serait vert sur le test précédent — et la personne recevrait une
  // remarque sur ses portions à chaque compliment.
  const base = { locale: "fr-FR", isKeelStudent: true } as const;
  // ① rien détecté
  assertEquals(
    sizingRedirectFor({ ...base, signal: { detected: false, kind: "portion" } }),
    null,
  );
  // ② détecté, mais le tour ne parle pas d'une part
  assertEquals(
    sizingRedirectFor({ ...base, signal: { detected: true, kind: "taste" } }),
    null,
  );
  // ③ détecté sur une part, mais hors élève KEEL: il n'y a ni plan ni bilan
  assertEquals(
    sizingRedirectFor({
      signal: { detected: true, kind: "portion" },
      locale: "fr-FR",
      isKeelStudent: false,
    }),
    null,
  );
  // ⚠️ ET `detected` SEUL NE SUFFIT PAS. `plan_feedback` couvre tout retour sur
  // une ligne de plan; renvoyer dessus ferait sortir la phrase sur des
  // compliments.
  assertEquals(sizingFeedbackDetected({ detected: true, kind: null }), false);
  assertEquals(sizingFeedbackDetected({ detected: true, kind: "portion" }), true);
  assertEquals(sizingFeedbackDetected({ detected: true, kind: "serving" }), true);
});

Deno.test("L'AJOUT EST FAIT SUR LE TEXTE VISIBLE, et il ne retire jamais rien", () => {
  const reply = "Noté pour ce soir.";
  // ① DÉSARMÉ ⇒ TEXTE INCHANGÉ. Au pire il n'ajoute rien; il ne peut pas
  //    appauvrir une réponse.
  assertEquals(appendSizingRedirect(reply, null), reply);
  assertEquals(appendSizingRedirect(reply, ""), reply);
  // ② ARMÉ ⇒ LA PHRASE EST BIEN DANS LE TEXTE QUE LA PERSONNE LIT.
  for (const sentence of [SIZING_REDIRECT_SENTENCES.fr, SIZING_REDIRECT_SENTENCES.en]) {
    const out = appendSizingRedirect(reply, sentence);
    assert(out.includes(reply), "la réponse d'origine a été mangée");
    assert(out.includes(sentence), "LE RENVOI N'EST PAS DIT");
    // ③ PAS DE DOUBLON sur un rejeu — égalité de chaîne sur un gabarit fermé,
    //    pas une heuristique de sens.
    assertEquals(appendSizingRedirect(out, sentence), out);
  }
  // ④ SUR UNE RÉPONSE VIDE, la phrase est TOUT le message: mieux vaut ça qu'un
  //    silence sur un retour que la personne vient de donner.
  assertEquals(
    appendSizingRedirect("", SIZING_REDIRECT_SENTENCES.en),
    SIZING_REDIRECT_SENTENCES.en,
  );
});

// ---------------------------------------------------------------------------
// ⛔ LE « KEEP » — la porte du consentement
// ---------------------------------------------------------------------------

Deno.test("⛔ RIEN N'ENTRE SANS UN « KEEP » — un souvenir non confirmé est refusé et COMPTÉ", () => {
  const out = read([{
    memory_id: MEM_B, // confirmé: MEM_A seulement
    kind: "food.exclude",
    text: "Pas de poisson.",
    value: null,
  }]);
  assert(out.ok);
  assertEquals(out.classification.kept, 0);
  assertEquals(out.classification.refused.notKept, 1);
  // ⚠️ ET IL N'EST PAS REPLIÉ SUR LA PREMIÈRE LIGNE CONFIRMÉE. Un repli ferait
  // entrer une phrase sous l'identité d'un souvenir que la personne a gardé
  // pour autre chose — c'est-à-dire un faux reçu de consentement.
  assertEquals(out.classification.durable.length, 0);
});

Deno.test("⚠️ UNE LIGNE SANS `item` N'EST PAS RÉCLAMÉE PAR LE MEMORIZER", () => {
  // La ligne que la personne a TAPÉE elle-même: `applyFoodPreferenceDecision`
  // lui écrit une origine `{ item: "", source: "written" }`, et ce vide est ce
  // qui la protège.
  const written = applyFoodPreferenceDecision({}, {
    kind: "write",
    text: "Je cuisine surtout le dimanche.",
  });
  const both = applyFoodPreferenceDecision(written, {
    kind: "keep",
    text: "N'aime pas le brocoli.",
    memoryItemId: MEM_A,
    seenAt: "2026-08-17",
  });

  const lines = keptMemoryLinesFrom(both);
  // ⚠️ LA LIGNE ÉCRITE EST ABSENTE, et la ligne gardée est là. Les deux moitiés
  // dans la même assertion: une garde qui rendrait `[]` passerait la première.
  assertEquals(lines.length, 1);
  assertEquals(lines[0].memoryItemId, MEM_A);
  assertEquals(lines[0].text, "N'aime pas le brocoli.");
  assertEquals(lines[0].at, "2026-08-17");
  assert(
    !lines.some((l) => l.text === "Je cuisine surtout le dimanche."),
    "LE MEMORIZER RÉCLAME UNE LIGNE ÉCRITE À LA MAIN: `item` vide ne protège " +
      "plus l'entrée, et la carte l'afficherait « je l'ai retenu de mardi » " +
      "sur une phrase que la personne a tapée.",
  );

  // ── ET LA CONSÉQUENCE, DE BOUT EN BOUT ──────────────────────────────────
  // Puisqu'elle n'entre pas dans les lignes confirmées, aucun item ne peut la
  // désigner, même si le modèle la réclamait avec un id vide.
  const out = readConversationClassification({
    raw: {
      items: [{
        memory_id: "",
        kind: "logistics.set",
        text: "Je cuisine surtout le dimanche.",
        value: { field: "cook_days", value: ["sunday"] },
      }],
    },
    // Le reçu de « Keep », joint à son souvenir comme le `_io` le fait. La
    // ligne écrite à la main n'y est pas — c'est tout le point.
    kept: lines.map((l) => ({ ...l, at: l.at ?? "2026-08-17", confidence: 0.82 })),
    members: [],
    targetWeek: "2026-08-19",
  });
  assertEquals(out.classification.kept, 0);
  assertEquals(out.classification.refused.notKept, 1);
});

Deno.test("UNE LIGNE SANS ORIGINE DU TOUT N'ENTRE PAS NON PLUS", () => {
  // Provenance inconnue ⇒ pas un « Keep » qu'on puisse citer. On ne devine pas.
  assertEquals(keptMemoryLinesFrom({ food_preferences: ["Pas de brocoli."] }), []);
  assertEquals(keptMemoryLinesFrom(null), []);
  assertEquals(keptMemoryLinesFrom({}), []);
});

Deno.test("UN MÊME SOUVENIR NE SE CLASSE QU'UNE FOIS", () => {
  const constraints = {
    food_preferences: ["Pas de brocoli.", "Vraiment pas de brocoli."],
    food_preferences_origin: {
      "pas de brocoli.": { item: MEM_A, at: "2026-08-17", source: "memory" },
      "vraiment pas de brocoli.": { item: MEM_A, at: "2026-08-17", source: "memory" },
    },
  };
  assertEquals(keptMemoryLinesFrom(constraints).length, 1);
});

// ---------------------------------------------------------------------------
// LA POLARITÉ — dans les DEUX sens
// ---------------------------------------------------------------------------

Deno.test("LA POLARITÉ SURVIT AU TRAJET — `exclude` et `prefer` ne se confondent pas", () => {
  // Un lot voisin a mesuré en run modèle réel « Plus de poisson cette semaine »
  // rendu en `food.prefer` au lieu de `food.exclude`. Ce chemin-ci part de
  // souvenirs DÉJÀ classés, donc il est moins exposé — mais rien ne le
  // prouvait. Les deux sens, sur les deux couples de familles.
  const lines = [kept({ memoryItemId: MEM_A }), kept({ memoryItemId: MEM_B })];
  for (
    const [a, b] of [
      ["food.exclude", "food.prefer"],
      ["method.avoid", "method.prefer"],
    ] as const
  ) {
    const out = readConversationClassification({
      raw: {
        items: [
          { memory_id: MEM_A, kind: a, text: "Non.", value: null },
          { memory_id: MEM_B, kind: b, text: "Oui.", value: null },
        ],
      },
      kept: lines,
      members: [],
      targetWeek: "2026-08-19",
    });
    assertEquals(out.classification.kept, 2);
    // ⚠️ L'ORDRE N'EST PAS LA PREUVE: on relit la famille SUR L'ITEM, joint par
    // l'uuid du souvenir. Deux items qui auraient échangé leur `kind` seraient
    // verts sur un simple compte.
    const byItem = new Map(out.classification.durable.map((i) => [i.item, i.kind]));
    assertEquals(byItem.get(MEM_A), a);
    assertEquals(byItem.get(MEM_B), b);
  }
});

// ---------------------------------------------------------------------------
// LE SUJET, LES MAGASINS, ET LES REFUS RESTANTS
// ---------------------------------------------------------------------------

Deno.test("LE SUJET EST JOINT PAR IDENTIFIANT — un id hors rôle est un REFUS, pas un repli", () => {
  const named = read([{
    memory_id: MEM_A,
    kind: "food.exclude",
    text: "Pas de brocoli.",
    member_id: MEMBER,
    value: null,
  }]);
  assertEquals(named.classification.durable[0].subject, `member:${MEMBER}`);

  const foreign = read([{
    memory_id: MEM_A,
    kind: "food.exclude",
    text: "Pas de brocoli.",
    member_id: OUTSIDER,
    value: null,
  }]);
  // ⛔ REFUS, ET SURTOUT PAS `household`: replier appliquerait à toute la table
  // ce qui visait une bouche (§2 axe 3).
  assertEquals(foreign.classification.kept, 0);
  assertEquals(foreign.classification.refused.unknownMember, 1);
});

Deno.test("CHAQUE FAMILLE VA DANS SON MAGASIN — `craving` est PROVISOIRE et ancré au lundi", () => {
  const out = read([
    { memory_id: MEM_A, kind: "craving", text: "Des fajitas.", value: null },
  ]);
  assertEquals(out.classification.durable.length, 0);
  assertEquals(out.classification.nextPlan.length, 1);
  assertEquals(out.classification.nextPlan[0].item.scope, "next_plan");
  // `2026-08-19` est un mercredi; son lundi ISO est le 17. L'ancre est la
  // SEMAINE VISÉE, jamais `item.at` — écrite en dur, pas recalculée.
  assertEquals(out.classification.nextPlan[0].anchor, "2026-08-17");
});

Deno.test("UN `text` PLUS LONG QUE LA LIGNE CONFIRMÉE EST REFUSÉ", () => {
  // Une phrase plus longue n'est plus « ce qu'elle a gardé »: c'est une phrase
  // que le modèle a écrite par-dessus.
  const out = read([{
    memory_id: MEM_A,
    kind: "food.exclude",
    text: "N'aime pas le brocoli, ni les choux, ni rien de vert en général.",
    value: null,
  }]);
  assertEquals(out.classification.kept, 0);
  assertEquals(out.classification.refused.badText, 1);
});

Deno.test("UNE CHARGE ILLISIBLE N'EST PAS UNE LISTE VIDE", () => {
  // ⚠️ `null` ET `[]` NE SONT PAS LA MÊME CHOSE: les confondre ferait ressembler
  // un prompt cassé à un produit calme.
  for (const raw of [null, "pas du json", { rien: 1 }, []]) {
    const out = readConversationClassification({
      raw,
      kept: [kept()],
      members: [],
      targetWeek: "2026-08-19",
    });
    if (Array.isArray(raw)) {
      assertEquals(out.ok, false);
      assertEquals(out.refusal, "unreadable_payload");
      continue;
    }
    assertEquals(out.ok, false);
    assertEquals(out.refusal, "unreadable_payload");
  }
  // Une ancre illisible est un refus À PART: sans elle un `craving` ne peut pas
  // mourir, et on ne saurait pas afficher sa date d'expiration.
  const bad = readConversationClassification({
    raw: { items: [] },
    kept: [kept()],
    members: [],
    targetWeek: "pas-un-jour",
  });
  assertEquals(bad.ok, false);
  assertEquals(bad.refusal, "bad_anchor");
});

Deno.test("LA TRACE PORTE LES TROIS NOMBRES ET LE MOTIF QU'ON SUIT", () => {
  const out = read([
    { memory_id: MEM_A, kind: "food.exclude", text: "Pas de brocoli.", value: null },
    { memory_id: MEM_A, kind: "portion.adjust", text: "Trop gros.", value: null },
    { memory_id: MEM_B, kind: "food.prefer", text: "Oui.", value: null },
  ]);
  const trace = conversationClassifyTrace(out.classification);
  assertEquals(trace.proposed, 3);
  assertEquals(trace.kept, 1);
  assertEquals(trace.refused, 2);
  assertEquals(trace.refused_forbidden_kind, 1);
  assertEquals(trace.refused_not_kept, 1);
});

// ---------------------------------------------------------------------------
// LE PROMPT — la promesse touche la clé de schéma, et le seuil n'est PAS ici
// ---------------------------------------------------------------------------

Deno.test("L'INTERDIT EST ÉCRIT SUR LA LIGNE DE `kind`, ET PAS DANS UNE SECTION PLUS BAS", () => {
  // Cicatrice chiffrée: 0 % de conformité quand la promesse et la clé de schéma
  // sont éloignées dans le prompt.
  const kindLine = CONVERSATION_CLASSIFY_SYSTEM_PROMPT
    .split("\n")
    .find((line) => line.includes('"kind"'));
  assert(kindLine, "le prompt ne porte plus de ligne `kind`");
  assert(
    kindLine.includes("NEVER portion.adjust"),
    "L'INTERDIT A QUITTÉ LA LIGNE DE `kind`: la promesse et la clé de schéma ne " +
      "se touchent plus, et ce dépôt a mesuré 0 % de conformité dans ce cas.",
  );
  // Et il DIT le motif — « une mesure a besoin de savoir QUI ».
  assert(kindLine.includes("WHO"));
});

Deno.test("LE PROMPT NE DEMANDE NI `scope`, NI `source`, NI `confidence`, NI `at`", () => {
  // Chacun est une règle qu'un modèle ne doit pas pouvoir écrire: le `scope`
  // vient de `defaultScopeFor`, la `source` est le jeton de la matrice, et
  // `at`/`confidence`/`item` viennent du souvenir. Les lui demander
  // fabriquerait la traçabilité au lieu de la porter.
  for (const forbidden of ['"scope"', '"source"', '"confidence"', '"at"', '"item"']) {
    assert(
      !CONVERSATION_CLASSIFY_SYSTEM_PROMPT.includes(forbidden),
      `le prompt demande ${forbidden} au modèle`,
    );
  }
});

Deno.test("LE PROMPT NE DONNE QUE LES LIGNES CONFIRMÉES, AVEC LEUR ID", () => {
  const prompt = buildConversationClassifyPrompt({
    kept: [kept()],
    contentLocale: "fr-FR",
    members: [],
  });
  assert(prompt.includes(MEM_A), "l'id du souvenir n'est pas donné à recopier");
  assert(prompt.includes("N'aime pas le brocoli."));
  assert(prompt.includes("fr-FR"), "la langue de la personne n'est pas dite");
  // ⚠️ UN RÔLE VIDE SE DIT, IL NE S'OMET PAS: un rôle absent laisserait le
  // modèle supposer des convives dont on ne lui a pas donné la liste.
  assert(prompt.includes("nobody else at this table"));
});

Deno.test("⛔ LE SEUIL 0,70 N'EST PAS DUPLIQUÉ DANS CE MODULE — prouvé sur le disque", async () => {
  // « Un second seuil dans un second fichier est un seuil qui divergera »
  // (`retained_item.ts`). Le seuil a mordu EN AMONT: une ligne ne peut porter
  // une origine `memory` que parce que `proposeFoodPreferences` l'a proposée.
  // Ce module PORTE la confiance, il ne la SEUILLE pas.
  const src = await Deno.readTextFile(
    new URL("./conversation_retained.ts", import.meta.url),
  );
  const code = src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
  for (const literal of ["0.7", "0.70", "MIN_CONFIDENCE"]) {
    assert(
      !code.includes(literal),
      `UN SECOND SEUIL EST APPARU DANS CE MODULE (\`${literal}\`). Il divergera ` +
        `de \`MIN_CONFIDENCE\` sans que rien ne rougisse.`,
    );
  }
  // Et la confiance est bien PORTÉE: elle voyage jusqu'à l'item.
  const out = read([{
    memory_id: MEM_A,
    kind: "food.prefer",
    text: "Oui.",
    value: null,
  }], [kept({ confidence: 0.71 })]);
  assertEquals(out.classification.durable[0].confidence, 0.71);
});
