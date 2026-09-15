// ═══════════════════════════════════════════════════════════════════════════
// LOT 4A — L'ÉCRIVAIN DE `plan_feedback`, ÉPINGLÉ DE BOUT EN BOUT
//
// Le renvoi du sizing existait en entier — gabarit bilingue, garde élève,
// placement dans `finalVisibleText`, câblage testé — et il ne pouvait JAMAIS
// partir: le signal qui l'arme n'avait pas d'écrivain. Ce fichier tient la
// chaîne que ce lot a posée, dans l'ordre où elle se coupe:
//
//   ① LE PROMPT a le droit de l'émettre (l'interdiction est LEVÉE, pas
//      contournée) — et la case existe dans `expected_shape`, collée à la
//      règle qui la promet.
//   ② LE JETON que le prompt enseigne est CELUI que le runtime accepte.
//   ③ LE PARSEUR le laisse passer, avec ses champs.
//   ④ LE MAPPER le porte jusqu'à `DispatcherSignals`.
//   ⑤ LA PHRASE sort, DANS LES DEUX LANGUES.
//   ⑥ ET ELLE NE SORT PAS quand ce n'est pas un retour de part.
//
// ⚠️ ⑥ N'EST PAS DÉCORATIF. « Une garde a besoin d'un cas qui passe » — et
// d'un cas qui échoue. Une détection qui dirait oui à tout serait verte sur ①
// à ⑤ et catastrophique en réel.
// ═══════════════════════════════════════════════════════════════════════════

import { assert, assertEquals } from "jsr:@std/assert@1";
import {
  buildDispatcherPrompt,
  buildDispatcherSystemPrompt,
  DISPATCHER_V2_SYSTEM_PROMPT,
  PLAN_FEEDBACK_SIZING_KIND,
} from "./dispatcher.prompts.ts";
import { runDispatcher } from "./dispatcher.v2.ts";
import { dispatcherSignalsFromTurnFrame } from "../router/turn_context_runtime.ts";
import {
  appendSizingRedirect,
  SIZING_FEEDBACK_KINDS,
  SIZING_REDIRECT_SENTENCES,
  sizingRedirectFor,
} from "../../_shared/keel/conversation_redirect.ts";
import type { TurnFrame } from "../contracts/turn_frame.v1.ts";

const KEEL_STUDENT_PROMPT = buildDispatcherSystemPrompt({ keelStudent: true });

const memoryPlan = {
  response_intent: "acknowledge_feedback",
  reasoning_complexity: "low",
  context_need: "minimal",
  memory_mode: "none",
  model_tier_hint: "lite",
  context_budget_tier: "tiny",
  targets: [],
  retrieval_policy: "semantic_first",
  plan_confidence: 0.8,
};

/** Un tour d'élève KEEL dont la sortie du modèle est FOURNIE, pas devinée. */
function dispatcherInputWith(
  rawFrame: Record<string, unknown>,
  opts?: { riskBand?: "none" | "high"; keelStudent?: boolean },
) {
  return {
    user_message: "les portions du midi etaient trop grosses",
    recent_messages: [],
    user_id: "student-4a",
    channel: "web" as const,
    plan_snapshot: null,
    keel_plan_context: "=== KEEL PLAN ===",
    keel_student: opts?.keelStudent ?? true,
    safety_context_output: {
      risk_band: (opts?.riskBand ?? "none") as "none" | "high",
      reason_codes: [],
      evidence: [],
    },
    llm_runner: () => Promise.resolve(rawFrame),
  };
}

function sizingFrame(overrides: Record<string, unknown> = {}) {
  return {
    direct_effects: [],
    skill_signals: {
      plan_feedback: {
        detected: true,
        kind: PLAN_FEEDBACK_SIZING_KIND,
        confidence: 0.91,
        sentiment: "negative",
        detail: "portions du midi trop grosses",
        target_item_id: null,
        target_title: null,
        ...overrides,
      },
    },
    memory_plan: memoryPlan,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// ① LE PROMPT — l'interdiction est LEVÉE, et seulement pour un élève KEEL
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("① l'interdiction « aucun skill signal hors plan_question » est LEVÉE pour l'élève", () => {
  // ⚠️ LA PANNE QUE CE TEST TIENT: le contrat pouvait déclarer le signal, le
  // parseur pouvait le lire — le modèle avait l'ordre écrit de ne jamais
  // l'émettre. Une case ouverte sous une interdiction n'est pas une case
  // ouverte.
  // ⚠️ LOT M1 — LA LEVÉE PORTE MAINTENANT TROIS SIGNAUX. `profile_statement`
  // s'est ajouté; l'oublier dans cette phrase rouvrirait l'interdiction sur
  // lui seul, et une case ouverte sous une interdiction n'est pas une case
  // ouverte.
  assert(
    KEEL_STUDENT_PROMPT.includes(
      "Ne produis jamais de skill signal hors plan_question, plan_feedback, profile_statement et rule_question.",
    ),
    "L'INTERDICTION N'EST PLUS LEVÉE. Le modèle lit à nouveau l'ordre de ne " +
      "produire aucun signal hors plan_question, et `plan_feedback` redevient " +
      "un champ que personne n'a le droit d'écrire.",
  );
  assert(
    !KEEL_STUDENT_PROMPT.includes(
      "Ne produis jamais de skill signal hors plan_question.\n",
    ),
    "L'ANCIENNE PHRASE SURVIT À CÔTÉ DE LA NOUVELLE: le prompt donnerait au " +
      "modèle un ordre et son contraire.",
  );
  assert(
    !KEEL_STUDENT_PROMPT.includes(
      "Ne produis jamais de skill signal hors plan_question et plan_feedback.\n",
    ),
    "LA PHRASE DU LOT 4A SURVIT À CÔTÉ DE CELLE DE M1: le prompt interdirait " +
      "`profile_statement` d'un côté et le réclamerait de l'autre.",
  );
  // ⚠️ LOT M6 — et la phrase de M1 ne doit pas survivre non plus: elle
  // interdirait `rule_question` d'un côté pendant que 6-quinquies le réclame.
  assert(
    !KEEL_STUDENT_PROMPT.includes(
      "Ne produis jamais de skill signal hors plan_question, plan_feedback et profile_statement.\n",
    ),
    "LA PHRASE DE M1 SURVIT À CÔTÉ DE CELLE DE M6: un ordre et son contraire.",
  );
});

Deno.test("① le prompt LEGACY est intact — l'interdiction y tient toujours", () => {
  // Le produit grand public tourne encore depuis ce code sur un autre projet.
  // La levée est une décision KEEL; elle ne doit pas fuir.
  assert(
    DISPATCHER_V2_SYSTEM_PROMPT.includes(
      "Ne produis jamais de skill signal hors plan_question.",
    ),
  );
  assert(
    !DISPATCHER_V2_SYSTEM_PROMPT.includes("plan_feedback"),
    "LE SIGNAL KEEL A FUITÉ DANS LE PROMPT LEGACY: un utilisateur sans plan " +
      "ni bilan de fin de plan se verrait proposer une case qu'aucun runtime " +
      "ne peut servir.",
  );
});

Deno.test("① la règle 6-ter existe, elle est BILINGUE, et elle nomme sa frontière", () => {
  assert(KEEL_STUDENT_PROMPT.includes("6-ter. skill_signals.plan_feedback"));
  // ⚠️ LES DEUX LANGUES. « Une garde testée dans une seule langue ne mord pas
  // dans l'autre » — le gabarit de renvoi est bilingue, la détection doit
  // l'être, et un exemple enseigne autant qu'une règle.
  assert(
    KEEL_STUDENT_PROMPT.includes("Exemples FR:"),
    "LES EXEMPLES FRANÇAIS ONT DISPARU de la règle 6-ter.",
  );
  assert(
    KEEL_STUDENT_PROMPT.includes("Exemples EN:"),
    "LES EXEMPLES ANGLAIS ONT DISPARU: la détection ne serait apprise que " +
      "dans une langue, et le renvoi anglais existerait sans jamais partir.",
  );
  // La frontière avec la lane qui capture 38 % des tours, écrite là où le
  // modèle la lit — pas dans un commentaire de code.
  assert(
    KEEL_STUDENT_PROMPT.includes(
      "UN RETOUR N'EST PAS UNE QUESTION, ET C'EST LA FRONTIERE AVEC plan_question",
    ),
    "LA FRONTIÈRE AVEC `plan_question` A DISPARU DU PROMPT: c'est la lane qui " +
      "capture le plus de tours dans ce dépôt, et un retour de part lui " +
      "ressemble de loin.",
  );
  assert(
    KEEL_STUDENT_PROMPT.includes("emets LES DEUX signaux"),
    "LA COEXISTENCE N'EST PLUS AUTORISÉE: chaque tour qui pose une question " +
      "en même temps qu'un retour perdrait le retour.",
  );
});

Deno.test("① le cas MIXTE est enseigné par l'EXEMPLE, dans les DEUX langues", () => {
  // ═════════════════════════════════════════════════════════════════════════
  // ⚠️ CE TEST TIENT UN RÉSULTAT MESURÉ, PAS UNE PRÉFÉRENCE DE RÉDACTION.
  //
  // Sonde du 2026-08-19 (modèle réel, `keel_plan_context` présent), sur la
  // phrase mixte « la part d'hier était trop copieuse, du coup ce soir je peux
  // remplacer X par Y ? » — celle où le retour se perd derrière la question:
  //
  //   · règle 6-ter(1) SEULE ................ 1 passe sur 4 rendait les deux
  //   · + l'exemple FRANÇAIS ................ FR 3/3 · EN 1/3
  //   · + l'exemple ANGLAIS ................. FR 3/3 · EN 3/3
  //
  // La deuxième ligne est la cicatrice du dépôt, reproduite à l'identique:
  // « une garde testée dans une seule langue ne mord pas dans l'autre ». Le
  // modèle apprend la co-émission par la LANGUE de l'exemple. Retirer l'un des
  // deux exemples ne casse rien de visible — ça remet juste la moitié des
  // retours de part à la poubelle, en silence, dans une seule langue.
  // ═════════════════════════════════════════════════════════════════════════
  const prompt = JSON.parse(buildDispatcherPrompt({
    user_message: "peu importe",
    recent_messages: [],
    keel_plan_context: "=== KEEL PLAN ===",
    keel_student: true,
    // deno-lint-ignore no-explicit-any
  })) as { doctrine_examples: Array<any> };
  const mixed = prompt.doctrine_examples.filter((example) =>
    example?.expected?.skill_signals?.plan_feedback?.detected === true &&
    example?.expected?.skill_signals?.plan_question?.detected === true
  );
  assertEquals(
    mixed.length,
    2,
    "LE COUPLE D'EXEMPLES MIXTES N'EST PLUS COMPLET. Il en faut UN PAR LANGUE: " +
      "avec le seul exemple français, l'anglais retombait à 1 passe sur 3 et " +
      "perdait le retour de part derrière la question — mesuré, pas supposé.",
  );
  assert(
    mixed.some((example) => /du coup ce soir/.test(example.user_message)),
    "L'EXEMPLE MIXTE FRANÇAIS A DISPARU.",
  );
  assert(
    mixed.some((example) => /can I swap/.test(example.user_message)),
    "L'EXEMPLE MIXTE ANGLAIS A DISPARU: le cas mixte n'est plus enseigné " +
      "qu'en français, et l'anglais reperd son retour de part deux fois sur " +
      "trois.",
  );
});

Deno.test("① la CASE existe dans `expected_shape`, collée à la règle qui la promet", () => {
  // « Promesse et clé de schéma doivent se toucher »: une règle qui nomme un
  // champ absent de la forme attendue a été mesurée à 0 % dans ce dépôt.
  const student = JSON.parse(buildDispatcherPrompt({
    user_message: "les parts etaient trop grosses",
    recent_messages: [],
    keel_plan_context: "=== KEEL PLAN ===",
    keel_student: true,
  })) as { expected_shape: { skill_signals: Record<string, unknown> } };
  assert(
    student.expected_shape.skill_signals.plan_feedback,
    "LA CASE `plan_feedback` A QUITTÉ `expected_shape`. La règle 6-ter " +
      "promettrait un champ que la forme attendue ne montre pas.",
  );

  const legacy = JSON.parse(buildDispatcherPrompt({
    user_message: "les parts etaient trop grosses",
    recent_messages: [],
    keel_student: false,
  })) as { expected_shape: { skill_signals: Record<string, unknown> } };
  assertEquals(
    legacy.expected_shape.skill_signals.plan_feedback,
    undefined,
    "LA CASE EST OUVERTE HORS KEEL: le renvoi est gaté sur `isKeelStudent`, " +
      "un signal produit là ne pourrait jamais rien armer.",
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// ② LE JETON — celui du prompt est celui que le runtime accepte
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("② le jeton enseigné est CELUI que `sizingFeedbackDetected` accepte", () => {
  // ⚠️ CE TEST EST LA JOINTURE. Le prompt et la liste fermée sont deux jumeaux
  // dans deux fichiers; sans clou, renommer l'un laisse l'autre vert et produit
  // un signal détecté, parsé, compté — et sans effet.
  assert(
    SIZING_FEEDBACK_KINDS.includes(PLAN_FEEDBACK_SIZING_KIND),
    "LE PROMPT ENSEIGNE UN JETON QUE LE RUNTIME NE RECONNAÎT PAS.",
  );
  // ⚠️ ET LE LITTÉRAL EST ÉPINGLÉ. Sans cette ligne, réordonner
  // `SIZING_FEEDBACK_KINDS` ferait suivre la constante ET l'assertion
  // ci-dessus: « test paramétré par sa propre constante ».
  assertEquals(
    PLAN_FEEDBACK_SIZING_KIND,
    "portion",
    "LE JETON DE SIZING A CHANGÉ. Ce n'est pas forcément faux, mais ça se " +
      "décide: le prompt, le renvoi et ce test doivent bouger ensemble.",
  );
  assert(
    KEEL_STUDENT_PROMPT.includes(`"${PLAN_FEEDBACK_SIZING_KIND}"`),
    "LE PROMPT NE NOMME PLUS LE JETON À ÉMETTRE: le modèle choisirait un mot " +
      "et le renvoi ne partirait pas.",
  );
  // Toute la liste fermée est montrée, depuis SA source — jamais une copie.
  for (const kind of SIZING_FEEDBACK_KINDS) {
    assert(
      KEEL_STUDENT_PROMPT.includes(kind),
      `le jeton \`${kind}\` de la liste fermée n'est plus interpolé au prompt`,
    );
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// ③ LE PARSEUR
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("③ le parseur laisse passer `plan_feedback` avec ses champs", async () => {
  const frame: TurnFrame = await runDispatcher(
    dispatcherInputWith(sizingFrame()) as never,
  );
  const signal = frame.skill_signals.plan_feedback;
  assert(signal, "LE SANITIZER JETTE LE SIGNAL: la dernière porte est fermée.");
  assertEquals(signal.detected, true);
  assertEquals(signal.kind, PLAN_FEEDBACK_SIZING_KIND);
  assertEquals(signal.sentiment, "negative");
  assertEquals(signal.detail, "portions du midi trop grosses");
  assertEquals(signal.confidence, 0.91);
});

Deno.test("③ un signal NON détecté, vide ou malformé n'entre pas", async () => {
  for (
    const raw of [
      { detected: false, kind: PLAN_FEEDBACK_SIZING_KIND },
      { kind: PLAN_FEEDBACK_SIZING_KIND },
      "portion",
      [],
      null,
    ]
  ) {
    const frame: TurnFrame = await runDispatcher(
      dispatcherInputWith({
        direct_effects: [],
        skill_signals: { plan_feedback: raw },
        memory_plan: memoryPlan,
      }) as never,
    );
    assertEquals(
      frame.skill_signals.plan_feedback,
      undefined,
      `un \`plan_feedback\` ${JSON.stringify(raw)} est entré dans le frame`,
    );
  }
});

Deno.test("③ un tour de CRISE n'emporte aucun retour de part", async () => {
  // Le dernier endroit où l'on parle de la taille des portions. La ceinture
  // existe déjà (`safetyBlocksToolSkills`); on prouve qu'elle couvre le
  // signal neuf, et pas seulement `plan_question`.
  const frame: TurnFrame = await runDispatcher(
    dispatcherInputWith(sizingFrame(), { riskBand: "high" }) as never,
  );
  assertEquals(frame.skill_signals.plan_feedback, undefined);
});

// ═══════════════════════════════════════════════════════════════════════════
// ④ LE MAPPER + ⑤ LA PHRASE, DANS LES DEUX LANGUES
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("④⑤ du frame à la BULLE, en français puis en anglais", async () => {
  const frame: TurnFrame = await runDispatcher(
    dispatcherInputWith(sizingFrame()) as never,
  );
  const signals = dispatcherSignalsFromTurnFrame({
    turnFrame: frame,
    userMessage: "les portions du midi etaient trop grosses",
  });
  assertEquals(
    signals.plan_feedback.detected,
    true,
    "LE MAPPER NE PORTE PLUS LE SIGNAL: `run.ts` lirait `{detected:false}`.",
  );

  const fr = sizingRedirectFor({
    signal: signals.plan_feedback,
    locale: "fr-FR",
    isKeelStudent: true,
  });
  assertEquals(fr, SIZING_REDIRECT_SENTENCES.fr);
  const en = sizingRedirectFor({
    signal: signals.plan_feedback,
    locale: "en-GB",
    isKeelStudent: true,
  });
  assertEquals(en, SIZING_REDIRECT_SENTENCES.en);

  // Et la phrase atteint bien le texte visible, sans en retirer un mot.
  const bubbleFr = appendSizingRedirect("Je note.", fr);
  assert(bubbleFr.startsWith("Je note."));
  assert(bubbleFr.includes(SIZING_REDIRECT_SENTENCES.fr));
  const bubbleEn = appendSizingRedirect("Noted.", en);
  assert(bubbleEn.includes(SIZING_REDIRECT_SENTENCES.en));
});

Deno.test("④ hors élève KEEL, le même signal n'arme RIEN", () => {
  // « Paramètre de garde optionnel = garde désarmée »: la garde élève est la
  // seule chose entre ce signal et un renvoi vers un écran inexistant.
  assertEquals(
    sizingRedirectFor({
      signal: { detected: true, kind: PLAN_FEEDBACK_SIZING_KIND },
      locale: "fr-FR",
      isKeelStudent: false,
    }),
    null,
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// ⑥ LA CONTRE-ÉPREUVE — ce qui NE doit PAS déclencher le renvoi
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("⑥ CONTRE-ÉPREUVE — un retour de plan qui n'est PAS une part ne renvoie rien", async () => {
  // Le cas qui distingue une détection utile d'une détection qui dit oui à
  // tout: « le plat d'hier était bon » EST un `plan_feedback` — le signal sort,
  // il est parsé, il est compté — et le renvoi NE part PAS.
  const tasteInput = dispatcherInputWith(
    sizingFrame({ kind: "taste", sentiment: "positive" }),
  ) as never;
  const frame: TurnFrame = await runDispatcher(tasteInput);
  const signals = dispatcherSignalsFromTurnFrame({
    turnFrame: frame,
    userMessage: "le plat d'hier soir etait vraiment bon",
  });
  assertEquals(
    signals.plan_feedback.detected,
    true,
    "le signal doit exister — c'est bien un retour de plan",
  );
  for (const locale of ["fr-FR", "en-GB"]) {
    assertEquals(
      sizingRedirectFor({
        signal: signals.plan_feedback,
        locale,
        isKeelStudent: true,
      }),
      null,
      `LE RENVOI EST PARTI SUR UN COMPLIMENT (${locale}). La phrase dirait à ` +
        `quelqu'un qui trouve son plat bon qu'on garde ça pour le bilan des ` +
        `portions.`,
    );
  }
});

Deno.test("⑥ CONTRE-ÉPREUVE — un tour sans signal ne renvoie rien, et le texte est INTACT", async () => {
  const frame: TurnFrame = await runDispatcher(
    dispatcherInputWith({
      direct_effects: [],
      skill_signals: {},
      memory_plan: memoryPlan,
    }) as never,
  );
  const signals = dispatcherSignalsFromTurnFrame({
    turnFrame: frame,
    userMessage: "j'ai une faim de loup, je me fais quoi ce soir ?",
  });
  assertEquals(signals.plan_feedback.detected, false);
  const redirect = sizingRedirectFor({
    signal: signals.plan_feedback,
    locale: "fr-FR",
    isKeelStudent: true,
  });
  assertEquals(redirect, null);
  // La ceinture ne peut pas appauvrir une réponse: sans phrase armée, elle
  // rend le texte tel quel.
  assertEquals(appendSizingRedirect("Réponse normale.", redirect), "Réponse normale.");
});

// ═══════════════════════════════════════════════════════════════════════════
// LA NON-CAPTURE — `plan_question` ne mange pas le signal
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("`plan_question` N'AVALE PAS `plan_feedback`: les deux survivent au même tour", async () => {
  // ⚠️ LA PANNE MESURÉE DANS CE DÉPÔT: la lane voisine capture 38 % des tours
  // et rend sa propre réponse. Si le parseur laissait tomber le second signal
  // dès que le premier est là, tout tour qui pose une question EN MÊME TEMPS
  // qu'un retour perdrait le retour — en silence, et personne ne le verrait
  // puisque la réponse, elle, sortirait normalement.
  const frame: TurnFrame = await runDispatcher(
    dispatcherInputWith({
      direct_effects: [],
      skill_signals: {
        plan_question: {
          detected: true,
          confidence_band: "high",
          reason: "swap_request",
          context: {
            kind: "food_swap",
            requested_food_group: "white_fish",
            prescribed_food_group: "fatty_fish",
            reason: "remplacement demande",
          },
        },
        plan_feedback: {
          detected: true,
          kind: PLAN_FEEDBACK_SIZING_KIND,
          sentiment: "negative",
          detail: "c'etait trop copieux hier",
        },
      },
      memory_plan: memoryPlan,
    }) as never,
  );
  assertEquals(frame.skill_signals.plan_question?.detected, true);
  assertEquals(
    frame.skill_signals.plan_feedback?.detected,
    true,
    "`plan_question` A AVALÉ LE RETOUR: sur un tour qui porte les deux, seul " +
      "le premier signal survit et la personne perd son retour de part.",
  );
  // Et le renvoi est bien armé sur ce tour-là aussi: il sortira PAR-DESSUS la
  // réponse de `plan_question`, parce qu'il est ajouté dans `finalVisibleText`.
  const signals = dispatcherSignalsFromTurnFrame({
    turnFrame: frame,
    userMessage: "c'etait trop copieux hier, je peux prendre du cabillaud ?",
  });
  assertEquals(
    sizingRedirectFor({
      signal: signals.plan_feedback,
      locale: "fr-FR",
      isKeelStudent: true,
    }),
    SIZING_REDIRECT_SENTENCES.fr,
  );
});

Deno.test("le signal est PASSIF: il ne route rien, il informe le tour", async () => {
  // `routers/routers.ts` ne choisit un `response_owner` que sur
  // `plan_question`. C'est ce qui permet au renvoi de sortir PAR-DESSUS la
  // lane qui a parlé au lieu de la remplacer — et c'est une propriété, pas un
  // hasard: un lot qui router ait ce signal ferait de chaque retour de part un
  // tour volé.
  const routers = await Deno.readTextFile(
    new URL("../routers/routers.ts", import.meta.url),
  );
  assert(
    !routers.includes("plan_feedback"),
    "`routers.ts` LIT MAINTENANT `plan_feedback`: le signal est devenu une " +
      "LANE. Le renvoi ne s'ajoute plus à la réponse, il la remplace.",
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// L'EFFET DE BORD NOMMÉ — `__plan_feedback_addon`
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("`__plan_feedback_addon` NE SE RÉVEILLE PAS — son écrivain n'a aucun appelant", async () => {
  // ═════════════════════════════════════════════════════════════════════════
  // CE QUE LE LOT 4A A MESURÉ, ET QU'IL VAUT MIEUX NOMMER QUE DÉCOUVRIR.
  //
  // `context/loader.ts:919` lit `tempMemory.__plan_feedback_addon` et en fait
  // un bloc de prompt. On pouvait croire que produire `plan_feedback`
  // réveillerait ce lecteur. NON: son unique écrivain est
  // `handlePlanItemFeedback`, appelé seulement par `attachDynamicAddons` —
  // et `attachDynamicAddons` N'A AUCUN APPELANT dans tout le dépôt. Le lecteur
  // reste mort, indépendamment de ce lot.
  //
  // ⚠️ ET C'EST UNE BONNE NOUVELLE, parce que le bloc qu'il produit dit à
  // l'élève « propose ensuite le dashboard » — une surface du produit grand
  // public que l'élève d'un coach n'a pas. Le réveiller tel quel serait une
  // régression, pas une fonctionnalité.
  //
  // ⚠️ SI CE TEST ROUGIT: quelqu'un a rebranché `attachDynamicAddons`. Ce
  // n'est pas interdit — mais il faut alors gater `formatPlanFeedbackAddon`
  // sur `!opts.keelStudent`, comme `dashboardCapabilitiesLiteAddon` juste à
  // côté, AVANT de laisser le bloc partir.
  // ═════════════════════════════════════════════════════════════════════════
  const roots = ["supabase", "frontend/src", "scripts"];
  const callers: string[] = [];
  for (const root of roots) {
    const dir = new URL(`../../../../${root}/`, import.meta.url);
    for await (const entry of walk(dir)) {
      if (!entry.endsWith(".ts") && !entry.endsWith(".tsx")) continue;
      if (entry.includes("/node_modules/")) continue;
      const src = await Deno.readTextFile(entry);
      if (!src.includes("attachDynamicAddons(")) continue;
      // La déclaration elle-même n'est pas un appel.
      if (src.includes("export function attachDynamicAddons(")) continue;
      callers.push(entry);
    }
  }
  assertEquals(
    callers,
    [],
    "`attachDynamicAddons` A UN APPELANT MAINTENANT. `__plan_feedback_addon` " +
      "va donc être écrit, et le bloc de prompt qu'il produit propose à " +
      "l'élève d'un coach un « dashboard » qui n'existe pas pour lui. Gate " +
      "`formatPlanFeedbackAddon` sur `!opts.keelStudent` (context/loader.ts) " +
      "avant de brancher.",
  );
});

async function* walk(dir: URL): AsyncGenerator<string> {
  let entries: Deno.DirEntry[];
  try {
    entries = [...Deno.readDirSync(dir)];
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const child = new URL(
      `${entry.name}${entry.isDirectory ? "/" : ""}`,
      dir,
    );
    if (entry.isDirectory) yield* walk(child);
    else yield decodeURIComponent(child.pathname);
  }
}
