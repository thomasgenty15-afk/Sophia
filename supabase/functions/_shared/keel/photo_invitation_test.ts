import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";

import {
  allPhotoInvitationSentences,
  appendPhotoInvitation,
  gatePhotoInvitation,
  photoInvitationSentences,
} from "./photo_invitation.ts";
import { DAILY_ASK_BUDGET } from "./daily_ask_budget.ts";
import { MEAL_PRECISION_DAILY_CAP } from "./meal_precision.ts";

// ---------------------------------------------------------------------------
// Le gate — l'ordre des refus est le contrat
// ---------------------------------------------------------------------------

const NOMINAL = {
  locale: "fr-FR",
  planRelation: "off_plan",
  safetyBand: "none" as string | null | undefined,
  hasMedia: false,
  futureIntent: false,
  committedEventCount: 1,
  asksMadeToday: 0,
  alreadyInvitedEver: false,
  flowAlreadyOpen: false,
  budget: DAILY_ASK_BUDGET,
};

Deno.test("le cas nominal invite, et la première fois est éducative", () => {
  const result = gatePhotoInvitation(NOMINAL);
  assertEquals(result.invite, true);
  assertEquals(result.educating, true);
  assertEquals(result.reason_code, "invite");
  assertEquals(result.sentence, photoInvitationSentences("fr-FR").educating);
});

Deno.test("déjà invitée un jour: la variante nue, jamais l'éducation deux fois", () => {
  const result = gatePhotoInvitation({ ...NOMINAL, alreadyInvitedEver: true });
  assertEquals(result.invite, true);
  assertEquals(result.educating, false);
  assertEquals(result.sentence, photoInvitationSentences("fr-FR").bare);
});

Deno.test("R5 — toute bande de sécurité ferme, et elle ferme la PREMIÈRE", () => {
  for (const band of ["low", "medium", "high", "critical", "MEDIUM", " high "]) {
    const result = gatePhotoInvitation({
      ...NOMINAL,
      safetyBand: band,
      // Tous les autres motifs de refus sont armés en même temps: la safety
      // doit gagner, sinon la trace nommerait le mauvais refus.
      futureIntent: true,
      hasMedia: true,
      committedEventCount: 0,
      planRelation: null,
      asksMadeToday: 9,
    });
    assertEquals(result.invite, false, band);
    assertEquals(result.reason_code, "safety_band", band);
  }
});

Deno.test("une bande absente ou vide vaut `none` — elle n'invente pas un refus", () => {
  for (const band of [null, undefined, "", "  ", "none"]) {
    const result = gatePhotoInvitation({ ...NOMINAL, safetyBand: band });
    assertEquals(result.invite, true, String(band));
  }
});

Deno.test("une intention future n'ouvre aucune porte", () => {
  const result = gatePhotoInvitation({ ...NOMINAL, futureIntent: true });
  assertEquals(result.invite, false);
  assertEquals(result.reason_code, "future_intent");
});

Deno.test("une photo déjà jointe: il n'y a rien à inviter", () => {
  const result = gatePhotoInvitation({ ...NOMINAL, hasMedia: true });
  assertEquals(result.invite, false);
  assertEquals(result.reason_code, "photo_attached");
});

Deno.test("pas de parole sans ligne: zéro fait committé ferme", () => {
  for (const count of [0, -1]) {
    const result = gatePhotoInvitation({
      ...NOMINAL,
      committedEventCount: count,
    });
    assertEquals(result.invite, false, String(count));
    assertEquals(result.reason_code, "no_committed_fact", String(count));
  }
});

Deno.test("§3 — jamais sur un repas conforme au plan, ni sur une relation inconnue", () => {
  for (const relation of [null, "", "as_planned", "  ", "OFF_PLAN"]) {
    const result = gatePhotoInvitation({ ...NOMINAL, planRelation: relation });
    assertEquals(result.invite, false, String(relation));
    assertEquals(result.reason_code, "not_off_plan", String(relation));
  }
  // La valeur exacte, elle, passe.
  assertEquals(
    gatePhotoInvitation({ ...NOMINAL, planRelation: "off_plan" }).invite,
    true,
  );
});

Deno.test("un flow de précision ouvert ferme l'invitation", () => {
  const result = gatePhotoInvitation({ ...NOMINAL, flowAlreadyOpen: true });
  assertEquals(result.invite, false);
  assertEquals(result.reason_code, "flow_already_open");
});

Deno.test("T4 — le budget consommé par UNE AUTRE surface ferme l'invitation", () => {
  const result = gatePhotoInvitation({ ...NOMINAL, asksMadeToday: 1 });
  assertEquals(result.invite, false);
  assertEquals(result.reason_code, "budget_consumed");
});

Deno.test("le budget est UN, et le même que celui de la question de précision", () => {
  // Deux constantes pour un seul plafond finiraient par diverger, et la
  // divergence serait invisible: chacune plafonnerait correctement sa surface.
  assertEquals(DAILY_ASK_BUDGET, 1);
  assertEquals(DAILY_ASK_BUDGET, MEAL_PRECISION_DAILY_CAP);
});

// ---------------------------------------------------------------------------
// Le texte — R6 (l'utilité, jamais le contrôle) et R7 (les deux langues)
// ---------------------------------------------------------------------------

/** Le registre du CONTRÔLE. Chaque terme transforme l'app en surveillance. */
const CONTROL_LEXICON = [
  "verifier", "verifie", "verification", "verify", "check", "checking",
  "prove", "proof", "preuve", "controler", "controle", "control",
  "make sure", "assurer que", "montre moi", "show me", "il faut",
  "tu dois", "you must", "you need to", "envoie moi une photo",
  "send me a photo",
];
/** Le registre de la CULPABILISATION. §3: aucune. */
const GUILT_LEXICON = [
  "craquage", "ecart", "cheat", "guilt", "culpabil", "rattraper",
  "make up for", "tu aurais du", "you should have", "dommage",
];
/** Le lexique de QUANTITÉ. Le contrat (non-input #4) refuse toute mesure. */
const QUANTITY_LEXICON = [
  "combien", "how much", "how many", "gram", "gramme", "calorie", "kcal",
  "portion", "quantite", "quantity", "poids", "weight",
];
/** La RELANCE. Une invitation ne parle jamais d'un repas passé. */
const RELAPSE_LEXICON = [
  "hier", "yesterday", "l autre jour", "the other day", "tu m avais",
  "you didn t send", "tu n as pas envoye", "au fait", "by the way",
  "toujours pas", "still no",
];

function flatten(text: string): string {
  return String(text ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/['’]/g, " ")
    .replace(/\s+/g, " ");
}

Deno.test("R6 — aucune phrase livrée ne porte le registre du contrôle", () => {
  for (const sentence of allPhotoInvitationSentences()) {
    const flat = flatten(sentence);
    for (const term of CONTROL_LEXICON) {
      assert(
        !flat.includes(term),
        `« ${sentence} » porte le terme de contrôle « ${term} »`,
      );
    }
  }
});

Deno.test("§3 — aucune culpabilisation, aucune quantité, aucune relance", () => {
  for (const sentence of allPhotoInvitationSentences()) {
    const flat = flatten(sentence);
    for (const term of [...GUILT_LEXICON, ...QUANTITY_LEXICON, ...RELAPSE_LEXICON]) {
      assert(!flat.includes(term), `« ${sentence} » porte « ${term} »`);
    }
  }
});

Deno.test("UNE phrase — jamais deux, jamais un paragraphe", () => {
  for (const sentence of allPhotoInvitationSentences()) {
    // Un séparateur de phrase suivi d'une majuscule serait une seconde phrase.
    assert(
      !/[.!?]\s+[A-ZÀ-Ý]/.test(sentence),
      `« ${sentence} » contient plus d'une phrase`,
    );
    assert(!sentence.includes("\n"), `« ${sentence} » contient un saut de ligne`);
    assert(sentence.length <= 160, `« ${sentence} » est trop longue`);
  }
});

Deno.test("R7 — les deux langues sont livrées, et elles diffèrent", () => {
  const fr = photoInvitationSentences("fr-FR");
  const en = photoInvitationSentences("en-GB");
  assert(fr.bare !== en.bare);
  assert(fr.educating !== en.educating);
  // La variante éducative dit ce que la nue ne dit pas.
  assert(fr.educating.length > fr.bare.length);
  assert(en.educating.length > en.bare.length);
  // Les variantes françaises sont bien françaises, et pas un repli anglais.
  assertStringIncludes(fr.bare, "photo");
  assertStringIncludes(fr.educating, "approximative");
  assertStringIncludes(en.educating, "rough");
});

Deno.test("la famille de locale suffit: fr-CA prend le pack fr, en-US le pack en", () => {
  assertEquals(photoInvitationSentences("fr-CA").bare, photoInvitationSentences("fr-FR").bare);
  assertEquals(photoInvitationSentences("en-US").bare, photoInvitationSentences("en-GB").bare);
});

// ---------------------------------------------------------------------------
// L'ajout au texte
// ---------------------------------------------------------------------------

Deno.test("sans invitation armée, le texte est rendu tel quel", () => {
  for (const empty of [null, undefined, "", "   "]) {
    assertEquals(appendPhotoInvitation("Noté.", empty), "Noté.");
  }
});

Deno.test("l'invitation s'ajoute à la fin, séparée du corps", () => {
  const out = appendPhotoInvitation("Noté.", "Si tu as une photo, envoie-la.");
  assertEquals(out, "Noté.\n\nSi tu as une photo, envoie-la.");
});

Deno.test("elle ne se double jamais quand elle est déjà là", () => {
  const invite = "Si tu as une photo, envoie-la.";
  const body = `Noté.\n\n${invite}`;
  assertEquals(appendPhotoInvitation(body, invite), body);
});

Deno.test("une question déjà posée par le composeur ne la fait PAS tomber", () => {
  // Elle a déjà consommé sa place au budget: l'abandonner brûlerait la place
  // et la ligne d'éducation « une fois par personne » sans que rien ne soit lu.
  const out = appendPhotoInvitation("Tu veux qu'on ajuste demain ?", "Si tu as une photo, envoie-la.");
  assertStringIncludes(out, "Si tu as une photo, envoie-la.");
});

Deno.test("un corps vide rend l'invitation seule, sans saut de ligne en tête", () => {
  assertEquals(appendPhotoInvitation("", "Envoie."), "Envoie.");
  assertEquals(appendPhotoInvitation("   ", "Envoie."), "Envoie.");
});
