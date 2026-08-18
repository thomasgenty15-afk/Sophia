// FF-020 — LA LANGUE DU PROMPT DE CRISE.
//
// ── LE DÉFAUT ──────────────────────────────────────────────────────────────
// `safetyCrisisDeterministicVisibleMessage` avait DÉJÀ ses deux packs et sa
// locale requise: le repli déterministe parlait donc anglais à un anglophone.
// `STAGE_PROMPTS`, lui, était un `Record` ENTIÈREMENT FRANÇAIS consommé sans
// condition — comme les quinze consignes fixes autour, et comme les deux blocs
// de style, dont les jumelles anglaises existaient pourtant déjà dans
// `response_style_policy.ts` avec leurs sélecteurs.
//
// Un élève anglophone en crise voyait donc sa réponse GÉNÉRÉE depuis un prompt
// français, la langue de sortie ne tenant plus qu'au bloc RESPONSE_LANGUAGE en
// queue. Ce n'est pas une nuance de style: la consigne de stage décide QUELLE
// question de triage est posée.
//
// ── CE QUE CES ÉPREUVES REFUSENT DE LAISSER PASSER ─────────────────────────
//   1. une table de stages INCOMPLÈTE — une consigne manquante dans un pack
//      est une règle de sécurité qui ne s'applique qu'à la moitié des élèves;
//   2. une FUITE française dans un tour anglais, et réciproquement;
//   3. un JET sur une langue non livrée — un tour de crise qui lève est un
//      élève en danger à qui on ne répond pas.

import { assert, assertEquals, assertNotEquals } from "jsr:@std/assert@1";
import { visibleSystemPromptForSafetyCrisisTest } from "./visible_agent.ts";
import type {
  SafetyCrisisVisibleTask,
  SafetyCrisisVisibleTaskKind,
} from "./contract.ts";

const KINDS: SafetyCrisisVisibleTaskKind[] = [
  "immediate_risk_check",
  "acute_grounding",
  "support_contact",
  "stabilizing",
  "exit_check",
  "resolved_exit",
  "repeat_current_step",
  "product_tool_boundary",
  "stop_or_cancel",
  "safety_transition",
  "safety_escalation",
];

function task(kind: SafetyCrisisVisibleTaskKind): SafetyCrisisVisibleTask {
  return {
    kind,
    conversation_context: {
      state_summary: "Safety support active.",
      context_summary: "Support available.",
      next_focus: "stay_with_support",
      field_or_stage: kind,
      known_values: {
        phase: "stabilizing",
        risk_band: "medium",
        immediate_danger: false,
        has_means_nearby: false,
        user_not_alone: true,
        human_support_available: true,
        emergency_help_contacted: false,
      },
      missing_or_weak_values: [],
      evidence_used: [],
      user_words: [],
      selected_candidate: {},
      tone_constraints: ["short", "calm", "concrete"],
      max_questions: 1,
      safety_resources: {
        emergency_numbers: "999 or 112",
        suicide_prevention_number: "116 123",
        must_prioritize_human_support: true,
        must_include_emergency_numbers: false,
      },
      handoff_data: {
        inbound_note_summary: null,
        current_step: `safety_step=${kind}`,
        deferred_product_or_tool_request: "a card request deferred during safety",
      },
      do_not_say: [],
    },
  } as unknown as SafetyCrisisVisibleTask;
}

function promptFor(kind: SafetyCrisisVisibleTaskKind, locale: string): string {
  return visibleSystemPromptForSafetyCrisisTest({
    user_id: "user-safety",
    response_locale: locale,
    request_id: "req-safety",
    visible_task: task(kind),
  });
}

/**
 * Des fragments que SEUL le pack français produit, et qui ne peuvent pas
 * apparaître par hasard. Pas un détecteur de langue: une liste de fuites
 * précises.
 *
 * ⚠️ `oneShotReminderCanonicalVisiblePromptLines` reste FRANÇAIS dans les deux
 * langues — c'est un module partagé par plusieurs skills, sans jumelle, et il
 * se traduit avec tous ses appelants, pas depuis l'un d'eux. Aucun de ses
 * fragments n'est donc listé ici: le test dirait le contraire de la vérité.
 */
const FRENCH_ONLY_FRAGMENTS = [
  "Tu ecris le prochain message visible",
  "Tu ne routes pas",
  "Pas de produit, pas d'outil",
  "Ne mentionne jamais JSON",
  "Respecte max_questions strictement",
  "maximum 120 mots",
  "Retourne uniquement un JSON strict",
  "pas de mot coupe",
];

const ENGLISH_ONLY_FRAGMENTS = [
  "You are writing Sophia's next visible message",
  "You do not route",
  "No product, no tool",
  "Never mention JSON",
  "Respect max_questions strictly",
  "120 words maximum",
  "Return a strict JSON object only",
  "no cut-off word",
];

// ---------------------------------------------------------------------------
// 1. LES ONZE STAGES EXISTENT DANS LES DEUX PACKS
// ---------------------------------------------------------------------------

Deno.test("les onze stages rendent une consigne NON VIDE dans chaque langue", () => {
  for (const kind of KINDS) {
    for (const locale of ["en-US", "fr-FR"]) {
      const prompt = promptFor(kind, locale);
      // Le nom du stage est un JETON: il est le même dans les deux packs, et il
      // doit être là — c'est lui qui dit au modèle où il en est.
      assert(prompt.includes(`Stage ${kind}.`), `${locale}/${kind}`);
      assert(prompt.length > 800, `${locale}/${kind}: prompt suspicieusement court`);
      // Un `Record` incomplet rendrait `undefined`, que `join("\n")` écrirait
      // tel quel dans le prompt. Silencieux, et invisible au typecheck si le
      // `kind` arrive d'un état persisté.
      assert(!prompt.includes("undefined"), `${locale}/${kind}`);
    }
  }
});

Deno.test("les deux packs de stage DIFFÈRENT — la table n'est pas la même deux fois", () => {
  for (const kind of KINDS) {
    assertNotEquals(
      promptFor(kind, "fr-FR"),
      promptFor(kind, "en-US"),
      `${kind}: les deux locales rendent le MÊME prompt`,
    );
  }
});

// ---------------------------------------------------------------------------
// 2. AUCUNE FUITE, DANS AUCUN SENS
// ---------------------------------------------------------------------------

Deno.test("un tour anglais ne porte aucun fragment du pack français", () => {
  for (const kind of KINDS) {
    const prompt = promptFor(kind, "en-US");
    for (const fragment of FRENCH_ONLY_FRAGMENTS) {
      assert(!prompt.includes(fragment), `${kind}: fuite FR « ${fragment} »`);
    }
  }
});

Deno.test("un tour français ne porte aucun fragment du pack anglais — le pack FR est GELÉ", () => {
  for (const kind of KINDS) {
    const prompt = promptFor(kind, "fr-FR");
    for (const fragment of ENGLISH_ONLY_FRAGMENTS) {
      assert(!prompt.includes(fragment), `${kind}: fuite EN « ${fragment} »`);
    }
    for (const fragment of FRENCH_ONLY_FRAGMENTS) {
      assert(prompt.includes(fragment), `${kind}: le pack FR a perdu « ${fragment} »`);
    }
  }
});

// ---------------------------------------------------------------------------
// 3. LES DEUX BLOCS DE STYLE — livrés depuis un lot précédent, jamais atteints
// ---------------------------------------------------------------------------

Deno.test("les blocs de style suivent enfin la locale (les sélecteurs existaient déjà)", () => {
  const en = promptFor("stabilizing", "en-US");
  const fr = promptFor("stabilizing", "fr-FR");

  // Les MARQUEURS de bloc sont des clés de découpe: identiques dans les deux.
  for (const prompt of [en, fr]) {
    assert(prompt.includes("VISIBLE_SAFETY_CONVERSATION_FLOW_RULES:"));
    assert(prompt.includes("VISIBLE_OUTPUT_STYLE_RULES:"));
  }
  // Le CONTENU, lui, change. `VISIBLE_OUTPUT_STYLE_RULES_EN` existait et
  // n'était atteint par personne: ce module importait la constante française.
  assert(fr.includes("tutoiement"), "le pack FR de style a disparu");
  assert(!en.includes("tutoiement"), "le pack FR de style fuit en anglais");
  assert(en.includes("Plain, natural English"), "le pack EN de style n'est pas servi");
});

// ---------------------------------------------------------------------------
// 4. R7 NE S'APPLIQUE PAS ICI, ET C'EST UNE DÉCISION
// ---------------------------------------------------------------------------

Deno.test("une langue non livrée rend l'anglais — un tour de crise ne JETTE jamais", () => {
  // `localePackKey` jetterait, et c'est le bon comportement pour un écran: un
  // rendu à moitié traduit doit se découvrir en test. Ici non: le prix d'un
  // throw est un élève en danger à qui on ne répond pas. La dégradation a déjà
  // eu lieu en amont (`clampToDeliveredLocale`); ce module ne fait que ne pas
  // aggraver.
  const de = promptFor("immediate_risk_check", "de-DE");
  assertEquals(de, promptFor("immediate_risk_check", "en-US"));
  assert(de.includes("Stage immediate_risk_check."));
});

// ---------------------------------------------------------------------------
// 5. CE QUI NE SE TRADUIT PAS — les chemins de contexte (R1)
// ---------------------------------------------------------------------------

Deno.test("les chemins de contexte sont des JETONS et survivent aux deux packs", () => {
  for (const locale of ["en-US", "fr-FR"]) {
    const risk = promptFor("immediate_risk_check", locale);
    assert(risk.includes("known_values.immediate_danger"), locale);
    assert(risk.includes("known_values.user_not_alone"), locale);

    const boundary = promptFor("product_tool_boundary", locale);
    assert(
      boundary.includes(
        "conversation_context.handoff_data.deferred_product_or_tool_request",
      ),
      locale,
    );

    const step = promptFor("repeat_current_step", locale);
    assert(step.includes("conversation_context.handoff_data.current_step"), locale);

    const escalation = promptFor("safety_escalation", locale);
    assert(escalation.includes("conversation_context.safety_resources"), locale);

    // La consigne qui décide de la hotline nomme les deux champs, littéralement.
    assert(risk.includes("emergency_numbers"), locale);
    assert(risk.includes("suicide_prevention_number"), locale);
  }
});
