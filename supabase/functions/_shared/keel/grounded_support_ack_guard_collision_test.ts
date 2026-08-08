/**
 * FF-011 × `ack_guard` — LA COLLISION, MESURÉE ET ÉPINGLÉE.
 *
 * ── POURQUOI CE FICHIER EXISTE ──────────────────────────────────────────────
 * La note de mémoire `ack-guard-eats-grounded-citations` affirmait qu'une
 * citation groundée est « TOUJOURS supprimée » sur un tour de découragement.
 * Vérifié le 2026-08-08: c'est FAUX en cette généralité, et VRAI dans une
 * forme précise. Ce fichier fixe la mesure, pour que la prochaine session
 * hérite d'une PREUVE et non d'une affirmation — et pour qu'elle voie
 * immédiatement si le comportement a bougé.
 *
 * ── CE QUI SE PASSE VRAIMENT ────────────────────────────────────────────────
 * `ack_guard` s'arme sur l'INTERSECTION de deux détecteurs indépendants:
 *   1. `detectCompletedFactReport(message)` — le message rapporte un fait
 *      accompli. « j'ai rien tenu » en est un (« j ai » + « rien » + « tenu »),
 *      et c'est LA phrase d'ouverture de la fiche FF-011 elle-même;
 *   2. zéro effet committé — ce qui est TOUJOURS le cas sur un tour de
 *      découragement, qui n'écrit rien par nature.
 * Il retire alors les phrases du rendu qui portent une formule d'accusé — À LA
 * PHRASE, donc une citation groundée SOUDÉE à un marqueur d'accusé part avec.
 *
 * ── CE QUI EST À LA CHARGE DE QUI ───────────────────────────────────────────
 * Ce n'est PAS la ceinture de FF-011 (`grounded_support belt bit` reste à 0).
 * Le correctif — apprendre à `ack_guard` qu'une phrase dont les nombres sont
 * dans `day_facts` CITE le passé au lieu d'accuser le tour — touche « la garde
 * la plus importante du produit », adossée à `fanout-reminder-phantom-commit`
 * et `p0-write-through-reminders`. C'est un LOT À PART, délibérément non fait
 * ici: rouvrir le trou de l'accusé fantôme coûte plus cher qu'une citation
 * perdue, et ce fichier est là pour que l'arbitrage se fasse sur des chiffres.
 */
import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import {
  guardKeelAckWithoutCommittedEffect,
  keelUnboundReportClarifyQuestion,
} from "../../sophia-brain/skills/_shared/keel_ack_without_effect_guard.ts";
import { detectDiscouragementTurn } from "./grounded_support.ts";

/** Un tour de découragement: zéro effet committé, hors crise, hors plancher. */
function onDiscouragementTurn(text: string, userMessage: string) {
  return guardKeelAckWithoutCommittedEffect({
    text,
    userMessage,
    isKeelStudent: true,
    committedEffectCount: 0,
    isSafetyTurn: false,
    isRestrictionFloorTurn: false,
  });
}

Deno.test("l'INTERSECTION existe: la phrase d'ouverture de la fiche arme LES DEUX gardes", () => {
  // C'est tout le problème en une ligne: l'exemple canonique de FF-011 est
  // aussi un rapport de fait accompli pour `ack_guard`.
  const message = "cette semaine a été horrible, j'ai rien tenu";
  assert(detectDiscouragementTurn(message), "FF-011 doit reconnaître le découragement");
  const out = onDiscouragementTurn("Noté ✅", message);
  assertEquals(out.reason_code, "ack_without_committed_effect");
});

Deno.test("une citation groundée NUE survit — la note de mémoire surgénéralisait", () => {
  const message = "cette semaine a été horrible, j'ai rien tenu";
  for (
    const citation of [
      "Tu as coché 5 plats sur les 7 que le plan portait.",
      "5 plats cochés cette semaine, sur 7 prévus.",
      "Le plan portait 7 plats, tu en as coché 5.",
      "Tu as envoyé 2 photos de repas aujourd'hui.",
      "Ce que je vois : 5 plats cochés, 2 repas hors plan.",
    ]
  ) {
    const out = onDiscouragementTurn(citation, message);
    assertEquals(
      out.text,
      citation,
      `la citation nue doit traverser INTACTE: ${citation}`,
    );
  }
});

Deno.test("⚠️ une citation DÉCORÉE d'un marqueur d'accusé est mangée — FR", () => {
  const message = "cette semaine a été horrible, j'ai rien tenu";
  // Le glyphe de coche EST une formule d'accusé (`ACK_GLYPH_PATTERN`), et le
  // composeur en pose spontanément en fin de phrase factuelle.
  const eaten = onDiscouragementTurn("Tu as coché 5 plats cette semaine ✅", message);
  assert(eaten.triggered, "la ceinture doit mordre");
  assert(!eaten.text.includes("5"), "la citation groundée disparaît avec l'accusé");
  assertStringIncludes(eaten.text, "quelle ligne de ton plan");
});

Deno.test("⚠️ …et EN — la garde n'est pas un accident de grammaire française", () => {
  // T9 du README: toute garde se teste dans les deux langues. Ici la collision
  // existe des deux côtés, à condition que le message ARME la garde: « I
  // haven't managed anything » ne l'arme PAS (« managed » n'est pas une base
  // verbale après auxiliaire nié), et un test bâti dessus rendrait un VERT FAUX.
  const message = "this week has been awful, I skipped every lunch";
  const eaten = onDiscouragementTurn(
    "You ticked 5 dishes off the plan this week ✅",
    message,
  );
  assert(eaten.triggered, "la ceinture doit mordre en anglais aussi");
  assert(!eaten.text.includes("5"), "la citation groundée disparaît");
  assertStringIncludes(eaten.text, "which line of your plan");
});

Deno.test("le REPLI d'ack_guard est une SOLLICITATION — ce que FF-011 §3 interdit", () => {
  // Le dégradé demande « à quelle ligne de ton plan je rattache ça ? ». Sur un
  // tour de découragement c'est exactement « raconte-moi ta journée »: de la
  // COLLECTE (T3 du README), servie à quelqu'un qui vient de dire que ça va
  // mal. Mesuré en run réel le 2026-08-08 (1 élève sur 3, message « this week
  // has been horrible, I missed all my meals this week », rendu final:
  // « …I couldn't tell which line of your plan to attach that to — is it
  // "all my meals this week"? Tell me which one and I'll log it. »).
  const question = keelUnboundReportClarifyQuestion("en", "all my meals this week");
  assertStringIncludes(question, "Tell me which one");
  assertStringIncludes(keelUnboundReportClarifyQuestion("fr", null), "c'est laquelle ?");
});

Deno.test("CONDITIONS DE DÉSARMEMENT: crise et plancher TCA ne sont jamais traversés", () => {
  const message = "cette semaine a été horrible, j'ai rien tenu";
  const text = "Tu as coché 5 plats cette semaine ✅";
  assertEquals(
    guardKeelAckWithoutCommittedEffect({
      text, userMessage: message, isKeelStudent: true,
      committedEffectCount: 0, isSafetyTurn: true, isRestrictionFloorTurn: false,
    }).reason_code,
    "disarmed_safety_turn",
  );
  assertEquals(
    guardKeelAckWithoutCommittedEffect({
      text, userMessage: message, isKeelStudent: true,
      committedEffectCount: 0, isSafetyTurn: false, isRestrictionFloorTurn: true,
    }).reason_code,
    "disarmed_restriction_floor_turn",
  );
});

Deno.test("un découragement SANS marqueur de fait accompli ne réveille pas la garde", () => {
  // La moitié rassurante de la mesure: « cette semaine a été horrible » tout
  // court ne rapporte aucun fait accompli, donc `ack_guard` reste au fourreau
  // et la citation groundée sort intacte, décorée ou non.
  const message = "cette semaine a été horrible";
  const out = onDiscouragementTurn("Tu as coché 5 plats cette semaine ✅", message);
  assertEquals(out.triggered, false);
  assertEquals(out.reason_code, "disarmed_no_completed_fact");
});
