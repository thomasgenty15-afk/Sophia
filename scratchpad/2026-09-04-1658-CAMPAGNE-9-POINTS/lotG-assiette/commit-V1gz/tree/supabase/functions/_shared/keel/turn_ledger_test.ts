/**
 * LA CEINTURE DU CANAL — et d'abord LE CAS QUI PASSE.
 *
 * ⚠️ Cicatrice `guards-need-a-passing-case`: une garde cassée bloque TOUT, et
 * c'est indiscernable d'une garde qui marche si on ne teste que le cas bloqué.
 * Le premier bloc de ce fichier est donc entièrement consacré aux tours qui
 * doivent traverser INTACTS — ledger vide, ledger nominal, deux langues.
 *
 * ⚠️ Cicatrice `guard-tested-in-one-language-only`: chaque règle est jouée en
 * français ET en anglais. `not` ne couvre pas `doesn't`, et `\b` ne mord pas
 * après « é ».
 *
 * ⚠️ Cicatrice `test-parameterized-by-its-own-constant`: aucune assertion ne
 * lit une constante du module pour se comparer à elle-même. Les valeurs
 * attendues sont écrites en clair.
 */
import { assert, assertEquals } from "jsr:@std/assert@1";
import {
  EMPTY_TURN_LEDGER,
  enforceTurnLedger,
  massQuantitiesSi,
  recordTurnLedger,
  solicitsAPhoto,
  statesANutrientFigure,
  type TurnLedger,
  type TurnLedgerEntry,
} from "./turn_ledger.ts";

function belt(args: {
  text: string;
  ledger?: TurnLedgerEntry[];
  isMinor?: boolean;
  userMessage?: string;
  locale?: string;
  isKeelStudent?: boolean;
}) {
  return enforceTurnLedger({
    text: args.text,
    ledger: args.ledger ?? [],
    isKeelStudent: args.isKeelStudent ?? true,
    isMinor: args.isMinor ?? false,
    userMessage: args.userMessage ?? "",
    locale: args.locale ?? "en-GB",
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. LE CAS QUI PASSE — la moitié du fichier, et ce n'est pas de trop
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("PASSE — ledger vide: le texte ressort au caractère près", () => {
  const text =
    "Nice one. Tonight is roast chicken with brown rice. Your share is the larger protein portion.";
  const result = belt({ text });
  assertEquals(result.text, text);
  assertEquals(result.reasons, []);
  assertEquals(result.stripped_sentences, 0);
});

Deno.test("PASSE — ledger vide, en français, avec accents et coche", () => {
  const text =
    "C'est noté ✅ Ce soir c'est poulet rôti et riz complet. Ta part est la plus grosse en protéines.";
  const result = belt({ text, locale: "fr-FR" });
  assertEquals(result.text, text);
  assertEquals(result.reasons, []);
});

Deno.test("PASSE — un tour NOMINAL avec effets écrits ne bouge pas", () => {
  // Le ledger porte des lignes, mais toutes en `written` sans contradiction:
  // c'est le régime normal du produit, et la ceinture doit y être inerte.
  const ledger: TurnLedgerEntry[] = [
    {
      subject: "body_measure",
      outcome: "written",
      reason_code: "inserted",
      stored_value_si: 78,
    },
    {
      subject: "photo_invitation",
      outcome: "written",
      reason_code: "armed_off_plan",
      stored_value_si: null,
    },
  ];
  const text =
    "Got it — 78 kg is in. Want to snap a photo of tonight's plate? It helps me see the whole thing.";
  const result = belt({ text, ledger });
  assertEquals(result.text, text);
  assertEquals(result.reasons, []);
});

Deno.test("PASSE — hors élève KEEL, la ceinture est au fourreau", () => {
  const text = "78 kg is now your current weight. Send me a photo.";
  const result = belt({
    text,
    isKeelStudent: false,
    isMinor: true,
    ledger: [{
      subject: "body_measure",
      outcome: "refused",
      reason_code: "minor_no_weight_tracking",
      stored_value_si: null,
    }],
  });
  assertEquals(result.text, text);
  assertEquals(result.reasons, []);
});

Deno.test("PASSE — un adulte garde ses chiffres de nutriment", () => {
  const text = "A tablespoon is about 100 calories and 10 g of sugar.";
  assertEquals(belt({ text }).text, text);
});

Deno.test("PASSE — une quantité de CUISINE traverse chez un mineur", () => {
  // « 200 g de riz » n'est pas un compte nutritionnel: c'est une recette. La
  // règle exige la PROXIMITÉ d'un nom de nutriment, sauf pour l'énergie.
  const fr = "Pour ce soir, compte 200 g de riz et 150 g de poulet.";
  assertEquals(belt({ text: fr, isMinor: true, locale: "fr-FR" }).text, fr);
  const en = "Tonight, that's 200 g of rice and two eggs.";
  assertEquals(belt({ text: en, isMinor: true }).text, en);
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. R1 — PAS D'ACCUSÉ D'UN FAIT NON ÉCRIT (T-1)
// ═══════════════════════════════════════════════════════════════════════════

const MEASURE_REFUSED: TurnLedgerEntry = {
  subject: "body_measure",
  outcome: "refused",
  reason_code: "minor_no_weight_tracking",
  stored_value_si: null,
};

Deno.test("T-1 EN — « 78 kg is now your current weight » à un mineur tombe", () => {
  // La phrase mesurée 3/3 par FF-008. Ce n'est PAS un accusé au sens du
  // lexique — d'où une règle qui ne dépend pas de lui.
  const result = belt({
    text:
      "78 kg is now your current weight. Let's look at what you had for lunch.",
    ledger: [MEASURE_REFUSED],
    isMinor: true,
  });
  assertEquals(result.reasons, ["ack_of_unwritten_fact"]);
  assertEquals(result.text, "Let's look at what you had for lunch.");
});

Deno.test("T-1 FR — la même phrase en français tombe aussi", () => {
  const result = belt({
    text: "Ton poids est bien enregistré. On regarde ton déjeuner ?",
    ledger: [MEASURE_REFUSED],
    isMinor: true,
    locale: "fr-FR",
  });
  assertEquals(result.reasons, ["ack_of_unwritten_fact"]);
  assertEquals(result.text, "On regarde ton déjeuner ?");
});

Deno.test("T-1 — une écriture RATÉE tait l'accusé comme un refus", () => {
  const result = belt({
    text: "Noted, 72 kg. Anything else?",
    ledger: [{
      subject: "body_measure",
      outcome: "failed",
      reason_code: "write_failed",
      stored_value_si: null,
    }],
  });
  assertEquals(result.reasons, ["ack_of_unwritten_fact"]);
  assertEquals(result.text, "Anything else?");
});

Deno.test("T-1 — tout emporté: le repli existe, dans la bonne langue", () => {
  const en = belt({
    text: "78 kg is now your current weight.",
    ledger: [MEASURE_REFUSED],
  });
  assert(en.text.length > 0, "un tour vide est le seul résultat interdit");
  assertEquals(en.text.includes("kg"), false);
  const fr = belt({
    text: "Ton poids est enregistré.",
    ledger: [MEASURE_REFUSED],
    locale: "fr-FR",
  });
  assert(fr.text.startsWith("Je te réponds"), fr.text);
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. R2 — LE CHIFFRE QUI CONTREDIT LA BASE (T-1)
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("T-1 — « Got it — 78, not 87 » pendant que la base porte 87", () => {
  const result = belt({
    text: "Got it — 78 kg, not 87 kg. Anything else today?",
    ledger: [{
      subject: "body_measure",
      outcome: "written",
      reason_code: "updated",
      stored_value_si: 87,
    }],
  });
  assertEquals(result.reasons, ["number_contradicts_stored_fact"]);
  assertEquals(result.text, "Anything else today?");
});

Deno.test("T-1 — le chiffre JUSTE traverse (le cas qui passe de la règle)", () => {
  const text = "Got it — 87 kg is in. Anything else today?";
  const result = belt({
    text,
    ledger: [{
      subject: "body_measure",
      outcome: "written",
      reason_code: "updated",
      stored_value_si: 87,
    }],
  });
  assertEquals(result.text, text);
  assertEquals(result.reasons, []);
});

Deno.test("T-1 — un DELTA sans accusé n'est pas une contradiction", () => {
  // « tu as pris 3 kg cette semaine » est vrai ET porte un nombre qui n'est pas
  // la valeur stockée. Sans la garde `isAck`, le repli deviendrait nominal.
  const text = "You're 3 kg up from last week, and that's normal after a break.";
  const result = belt({
    text,
    ledger: [{
      subject: "body_measure",
      outcome: "written",
      reason_code: "updated",
      stored_value_si: 87,
    }],
  });
  assertEquals(result.text, text);
});

Deno.test("T-1 — les livres sont converties avant comparaison", () => {
  // 192 lbs ≈ 87,09 kg: au-delà de la tolérance de 0,05 kg, donc contradiction.
  const contradicts = belt({
    text: "Got it — 192 lbs recorded.",
    ledger: [{
      subject: "body_measure",
      outcome: "written",
      reason_code: "updated",
      stored_value_si: 87,
    }],
  });
  assertEquals(contradicts.reasons, ["number_contradicts_stored_fact"]);

  // 191,8 lbs = 87,000... kg: la même mesure, dans l'unité de l'élève.
  const agrees = belt({
    text: "Got it — 191.8 lbs recorded. Anything else?",
    ledger: [{
      subject: "body_measure",
      outcome: "written",
      reason_code: "updated",
      stored_value_si: 87,
    }],
  });
  assertEquals(agrees.reasons, []);
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. R3 — LE SILENCE DU PLANCHER (T-7)
// ═══════════════════════════════════════════════════════════════════════════

const MEAL_SILENCED: TurnLedgerEntry = {
  subject: "meal_declaration",
  outcome: "written_silently",
  reason_code: "restriction_flag_priority",
  stored_value_si: null,
};

Deno.test("T-7 EN — sous plancher, l'accusé tombe même si le fait est écrit", () => {
  const result = belt({
    text: "Logged your lunch. I'm here, and I want to stay with how you're feeling.",
    ledger: [MEAL_SILENCED],
  });
  assertEquals(result.reasons, ["ack_under_floor_silence"]);
  assertEquals(
    result.text,
    "I'm here, and I want to stay with how you're feeling.",
  );
});

Deno.test("T-7 FR — même chose en français", () => {
  const result = belt({
    text: "C'est noté ✅ Je reste avec toi sur ce que tu ressens.",
    ledger: [MEAL_SILENCED],
    locale: "fr-FR",
  });
  assertEquals(result.reasons, ["ack_under_floor_silence"]);
  assertEquals(result.text, "Je reste avec toi sur ce que tu ressens.");
});

Deno.test("T-7 — sous plancher, une réponse SANS accusé traverse", () => {
  const text = "I'm here. Tell me more about how today has been.";
  assertEquals(belt({ text, ledger: [MEAL_SILENCED] }).text, text);
});

// ═══════════════════════════════════════════════════════════════════════════
// 5. R4 — PAS DE DEMANDE DE PHOTO HORS BUDGET (T-6)
// ═══════════════════════════════════════════════════════════════════════════

const INVITATION_REFUSED: TurnLedgerEntry = {
  subject: "photo_invitation",
  outcome: "refused",
  reason_code: "budget_spent",
  stored_value_si: null,
};

Deno.test("T-6 EN — la sollicitation du composeur tombe quand le budget a refusé", () => {
  const result = belt({
    text: "That sounds like a solid lunch. Could you send me a photo next time?",
    ledger: [INVITATION_REFUSED],
  });
  assertEquals(result.reasons, ["unbudgeted_photo_request"]);
  assertEquals(result.text, "That sounds like a solid lunch.");
});

Deno.test("T-6 FR — « envoie-moi une photo » tombe aussi", () => {
  const result = belt({
    text: "Bien joué. Envoie-moi une photo la prochaine fois !",
    ledger: [INVITATION_REFUSED],
    locale: "fr-FR",
  });
  assertEquals(result.reasons, ["unbudgeted_photo_request"]);
  assertEquals(result.text, "Bien joué.");
});

Deno.test("T-6 — l'invitation ARMÉE par le compteur traverse", () => {
  const text = "Nice. Want to snap a photo of it? It tells me more than words.";
  const result = belt({
    text,
    ledger: [{
      subject: "photo_invitation",
      outcome: "written",
      reason_code: "armed_off_plan",
      stored_value_si: null,
    }],
  });
  assertEquals(result.text, text);
});

Deno.test("T-6 — DÉSARMEMENT: l'élève a parlé de photo lui-même", () => {
  // Sa question mérite une réponse. Une explication n'est pas une sollicitation.
  const text = "Yes — you can send a photo from the meals screen.";
  const result = belt({
    text,
    ledger: [INVITATION_REFUSED],
    userMessage: "how do I send a photo of my meal?",
  });
  assertEquals(result.text, text);
});

Deno.test("T-6 — le budget refuse aussi quand la lane n'a pas tourné du tout", () => {
  // Aucune ligne `photo_invitation` au ledger ⇒ aucune demande n'a été armée
  // ⇒ toute sollicitation du composeur est hors compteur, par construction.
  const result = belt({
    text: "Great. Send me a picture of your plate tonight.",
    ledger: [],
  });
  assertEquals(result.reasons, ["unbudgeted_photo_request"]);
});

// ═══════════════════════════════════════════════════════════════════════════
// 6. R5 — AUCUN CHIFFRE DE NUTRIMENT CHEZ UN MINEUR (T-16)
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("T-16 EN — « 56.3 g of sugar per 100 g » à un mineur tombe", () => {
  // La phrase EXACTE mesurée 2/3 par FF-010 (RED O1). Et c'est un chiffre
  // INVENTÉ, pas un `target`: c'est le RED résiduel que `minor_quantity` du
  // message du soir ne couvre pas.
  const result = belt({
    text: "Nutella has 56.3 g of sugar per 100 g. It's a household choice here.",
    isMinor: true,
  });
  assertEquals(result.reasons, ["minor_nutrient_figure"]);
  assertEquals(result.text, "It's a household choice here.");
});

Deno.test("T-16 EN — l'énergie mord sans nom de nutriment", () => {
  const result = belt({
    text: "A serving is about 200 calories. Ana chose to keep it at home.",
    isMinor: true,
  });
  assertEquals(result.reasons, ["minor_nutrient_figure"]);
  assertEquals(result.text, "Ana chose to keep it at home.");
});

Deno.test("T-16 FR — « 21 g de sucre » et « 200 kcal » mordent", () => {
  const sucre = belt({
    text: "Une portion, c'est 21 g de sucre. C'est un choix de la maison.",
    isMinor: true,
    locale: "fr-FR",
  });
  assertEquals(sucre.reasons, ["minor_nutrient_figure"]);
  assertEquals(sucre.text, "C'est un choix de la maison.");

  const kcal = belt({
    text: "Ça fait environ 200 kcal. C'est un choix de la maison.",
    isMinor: true,
    locale: "fr-FR",
  });
  assertEquals(kcal.reasons, ["minor_nutrient_figure"]);
});

Deno.test("T-16 FR — le pourcentage de matière grasse mord", () => {
  const result = belt({
    text: "Ce fromage est à 30 % de matière grasse.",
    isMinor: true,
    locale: "fr-FR",
  });
  assertEquals(result.reasons, ["minor_nutrient_figure"]);
});

// ═══════════════════════════════════════════════════════════════════════════
// 6bis. LES DEUX DÉFAUTS TROUVÉS EN RUN RÉEL (2026-08-12) — épinglés ici
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("RUN RÉEL — l'anaphore: le nutriment est dans la QUESTION, pas la phrase", () => {
  // Élève de 13 ans, « Il y a combien de sucre dans le Nutella ? », run 3/3.
  // Le modèle renvoie au sucre par « en »: aucune règle par phrase seule ne
  // pouvait mordre.
  const sentence =
    "Donc une cuillère à soupe, autour de 15 g, en apporte à peu près 8 à 9 g.";
  assertEquals(statesANutrientFigure(sentence), false, "sans contexte de tour");
  assert(
    statesANutrientFigure(sentence, {
      userMessage: "Il y a combien de sucre dans le Nutella ?",
    }),
    "avec la question de l'élève",
  );
  const result = belt({
    text: sentence,
    isMinor: true,
    userMessage: "Il y a combien de sucre dans le Nutella ?",
    locale: "fr-FR",
  });
  assertEquals(result.reasons, ["minor_nutrient_figure"]);
});

Deno.test("RUN RÉEL — deux nombres: le plancher s'abstient, R6 prend le relais", () => {
  // « I'm 78 kg now, down from 87. » porte DEUX nombres, donc
  // `detectDeclaredBodyMeasure` rend `null` (FF-008 §7, « deux nombres = pas de
  // mesure sûre »). Le ledger est VIDE, et R1 n'a rien à faire respecter. Ce
  // que l'élève de 13 ans a lu, 2 runs sur 3:
  const result = belt({
    text:
      "That's a 9 kg drop. At your current weight, that's about 10.3% of 87 kg. Tell me how you're doing.",
    ledger: [],
    isMinor: true,
    userMessage: "I'm 78 kg now, down from 87.",
  });
  assertEquals(result.reasons, ["minor_body_measure_figure"]);
  assertEquals(result.text, "Tell me how you're doing.");
});

Deno.test("RUN RÉEL FR — la même phrase en français", () => {
  const result = belt({
    text:
      "Tu es à 78 kg maintenant, contre 87 avant : ça fait 9 kg de moins. On regarde ta journée ?",
    isMinor: true,
    userMessage: "Je fais 78 kg maintenant, j'étais à 87.",
    locale: "fr-FR",
  });
  assertEquals(result.reasons, ["minor_body_measure_figure"]);
  assertEquals(result.text, "On regarde ta journée ?");
});

Deno.test("R6 — LE CAS QUI PASSE: la liste de courses d'un mineur garde ses kilos", () => {
  // Le désarmement par le tour. Sans lui, « 1 kg de pommes de terre » tombait
  // chez tous les mineurs du produit, sur le chemin foyer.
  const text = "You need 1 kg of potatoes, chicken thighs, and green beans.";
  const result = belt({
    text,
    isMinor: true,
    userMessage: "What do I need to buy?",
  });
  assertEquals(result.text, text);
  assertEquals(result.reasons, []);
});

Deno.test("R6 — un ADULTE garde son arithmétique de poids", () => {
  const text = "That's a 9 kg drop from 87 kg. Steady pace.";
  assertEquals(
    belt({ text, isMinor: false, userMessage: "I'm 78 kg now, down from 87." })
      .text,
    text,
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// 7. LES DÉTECTEURS, PRIS SÉPARÉMENT
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("massQuantitiesSi — kg, kilos, lbs, virgule décimale", () => {
  assertEquals(massQuantitiesSi("78 kg"), [78]);
  assertEquals(massQuantitiesSi("78,4 kilos"), [78.4]);
  assertEquals(massQuantitiesSi("j'ai perdu 2 kg"), [2]);
  const pounds = massQuantitiesSi("172 lbs");
  assertEquals(Math.round(pounds[0] * 100) / 100, 78.02);
  // Un nombre sans unité de masse n'est pas une masse.
  assertEquals(massQuantitiesSi("78 minutes de marche"), []);
  // Bornes de mot: « 5 kgm » n'est pas « 5 kg ».
  assertEquals(massQuantitiesSi("5 kgm"), []);
});

Deno.test("solicitsAPhoto — la forme de DEMANDE est nécessaire", () => {
  assert(solicitsAPhoto("Envoie-moi une photo."));
  assert(solicitsAPhoto("Can you send a picture?"));
  assert(solicitsAPhoto("Une photo ?"));
  assert(solicitsAPhoto("N'hésite pas à me montrer une photo."));
  // Un simple constat n'est pas une demande.
  assertEquals(solicitsAPhoto("Ta photo d'hier était nette."), false);
  assertEquals(solicitsAPhoto("The photo went through."), false);
  // Un mot qui CONTIENT « pic » n'est pas « pic ».
  assertEquals(solicitsAPhoto("Send me your epicurean notes."), false);
});

Deno.test("statesANutrientFigure — la proximité au nutriment est la règle", () => {
  assert(statesANutrientFigure("56.3 g of sugar"));
  assert(statesANutrientFigure("21 g de sucre"));
  assert(statesANutrientFigure("about 200 calories"));
  assert(statesANutrientFigure("30 % de matière grasse"));
  // Cuisine, pas nutrition.
  assertEquals(statesANutrientFigure("200 g de riz"), false);
  assertEquals(statesANutrientFigure("two eggs and 150 g of chicken"), false);
  // Un nutriment SANS chiffre reste dicible.
  assertEquals(statesANutrientFigure("it's high in sugar"), false);
});

// ═══════════════════════════════════════════════════════════════════════════
// 8. LE CANAL LUI-MÊME
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("recordTurnLedger — refuse d'écrire hors élève KEEL", () => {
  const ledger: TurnLedger = [];
  recordTurnLedger({
    ledger,
    isKeelStudent: false,
    entry: MEASURE_REFUSED,
  });
  assertEquals(ledger.length, 0);
  recordTurnLedger({ ledger, isKeelStudent: true, entry: MEASURE_REFUSED });
  assertEquals(ledger.length, 1);
});

Deno.test("recordTurnLedger — le ledger legacy est gelé et ne fuit pas", () => {
  // `LEGACY_KEEL_TURN_CONTEXT` est un const de module: un tableau mutable
  // partagé y fuirait d'un tour à l'autre.
  recordTurnLedger({
    ledger: EMPTY_TURN_LEDGER,
    isKeelStudent: true,
    entry: MEASURE_REFUSED,
  });
  assertEquals(EMPTY_TURN_LEDGER.length, 0);
});

Deno.test("le canal N'EXPOSE que des jetons — aucune prose ne peut fuir", () => {
  // La ceinture RETIRE du texte; elle n'en écrit jamais depuis le ledger. Un
  // motif de plancher (« refus TCA ») ne doit atteindre aucune bulle.
  const result = belt({
    text: "78 kg is now your current weight.",
    ledger: [{
      subject: "body_measure",
      outcome: "refused",
      reason_code: "restriction_flag_priority",
      stored_value_si: null,
    }],
  });
  assertEquals(result.text.includes("restriction"), false);
  assertEquals(result.text.includes("refus"), false);
  assertEquals(result.text.includes("body_measure"), false);
});

Deno.test("extra-hard — trois planchers sur le même tour, chacun sa morsure", () => {
  const result = belt({
    text: [
      "Got it — 78 kg, not 87 kg.",
      "Logged your lunch too.",
      "Could you send me a photo tonight?",
      "You're doing the work, and it shows.",
    ].join(" "),
    ledger: [
      {
        subject: "body_measure",
        outcome: "written",
        reason_code: "updated",
        stored_value_si: 87,
      },
      MEAL_SILENCED,
      INVITATION_REFUSED,
    ],
  });
  assertEquals(result.stripped_sentences, 3);
  assertEquals(result.text, "You're doing the work, and it shows.");
  assertEquals(result.reasons.length, 3);
});
