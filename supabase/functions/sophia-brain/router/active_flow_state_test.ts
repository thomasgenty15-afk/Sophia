import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  type ActiveLocalConversationFlowSkillId,
  buildLastLocalFlowExitContext,
  clearActiveConversationSkillState,
  clearLastLocalFlowExitContext,
  clearLegacyRuntimeState,
  clearLegacyRuntimeStateForDirectEffect,
  readActiveFlowState,
  shouldSkipGlobalDispatcherForActiveLocalFlow,
} from "./active_flow_state.ts";
import { ACTIVE_CONVERSATION_SKILL_KEY } from "../skills/_shared/active_skill_state.ts";

function legacyKey(...parts: string[]): string {
  return parts.join("_");
}

/**
 * Les flows qui portent LEUR PROPRE classifieur, donc qui sautent le dispatcher
 * global. `safety_crisis` a `skills/safety_crisis/local_dispatcher.ts`.
 */
const FLOWS_THAT_SKIP_THE_GLOBAL_DISPATCHER:
  ActiveLocalConversationFlowSkillId[] = [
    "safety_crisis",
  ];

/**
 * Les flows SANS classifieur propre. Eux DOIVENT payer le dispatcher global,
 * sinon plus personne ne classe le tour.
 *
 * ── LE DÉFAUT QUE CETTE SECONDE LISTE EMPÊCHE DE REVENIR ─────────────────────
 * Ce fichier n'avait qu'UNE liste, `RETAINED_LOCAL_FLOW_IDS`, et un test qui
 * bouclait dessus en asseyant `true` partout. Quand la phase B a ajouté
 * `keel_reengagement_resume_v1`, personne n'a étendu la liste: le test est
 * resté vert en ne parlant tout simplement pas du flow neuf.
 *
 * MESURÉ en run réel: pendant la reprise, « j'ai repris le magnésium hier soir »
 * n'écrivait AUCUNE ligne `protocol_events` — le dispatcher étant sauté, le
 * `turn_frame` était vide et il n'y avait aucun effet direct à exécuter. Le
 * même message, une fois le flow purgé, écrivait bien sa ligne.
 *
 * D'où DEUX listes et une assertion d'exhaustivité: un flow neuf tombe en rouge
 * tant que quelqu'un ne l'a pas rangé, explicitement, dans l'une des deux.
 */
/**
 * ⟳ 2026-09-09 — CETTE LISTE EST VIDE, et il faut le dire plutôt que de la
 * supprimer. Son seul membre était `keel_reengagement_resume_v1`, dont le flow
 * ne possède plus aucun tour (voir `chat-inbound-v1`). La liste RESTE parce
 * que c'est elle qui met un flow neuf en rouge tant que personne n'a tranché.
 *
 * ⚠️ ET SA VACUITÉ DÉSARME LA BOUCLE QU'ELLE ARMAIT: un `shouldSkip` qui
 * renverrait TOUJOURS `true` passerait de nouveau, exactement le défaut décrit
 * au-dessus. Le cas négatif est donc réarmé autrement, plus bas, sur un id qui
 * n'est PAS au registre.
 */
const FLOWS_THAT_NEED_THE_GLOBAL_DISPATCHER:
  ActiveLocalConversationFlowSkillId[] = [];

const RETAINED_LOCAL_FLOW_IDS: ActiveLocalConversationFlowSkillId[] = [
  ...FLOWS_THAT_SKIP_THE_GLOBAL_DISPATCHER,
  ...FLOWS_THAT_NEED_THE_GLOBAL_DISPATCHER,
];

Deno.test("active_flow_state resumes only retained conversation skills", () => {
  assertEquals(
    (readActiveFlowState({
      __active_skill_state: { skill_id: "safety_crisis" },
    }).activeSkillState as any)?.skill_id,
    "safety_crisis",
  );
  assertEquals(
    (readActiveFlowState({
      __active_skill_state: { skill_id: "safety_crisis" },
    }).activeSkillState as any)?.skill_id,
    "safety_crisis",
  );
  assertEquals(
    readActiveFlowState({
      __active_skill_state: { skill_id: legacyKey("removed", "flow") },
    }).activeSkillState,
    null,
  );
});

Deno.test("active_flow_state canonical active conversation key wins over aliases", () => {
  const active = readActiveFlowState({
    [ACTIVE_CONVERSATION_SKILL_KEY]: {
      skill_id: "safety_crisis",
      status: "active",
    },
    __active_skill_state: { skill_id: "safety_crisis", status: "active" },
  });

  assertEquals(
    (active.activeSkillState as any)?.skill_id,
    "safety_crisis",
  );
});

Deno.test("active_flow_state skips the global dispatcher ONLY for flows that classify their own turn", () => {
  const skipFor = (skillId: string) => {
    const active = readActiveFlowState({
      __active_skill_state: { skill_id: skillId, status: "active" },
    });
    assertEquals((active.activeSkillState as any)?.skill_id, skillId);
    return shouldSkipGlobalDispatcherForActiveLocalFlow({
      activeSkillState: active.activeSkillState,
    });
  };

  for (const skillId of FLOWS_THAT_SKIP_THE_GLOBAL_DISPATCHER) {
    assertEquals(skipFor(skillId), true, `${skillId} doit sauter`);
  }
  // La moitié qui manquait, et sans laquelle la boucle ci-dessus est une
  // tautologie: un `shouldSkip` qui renvoie TOUJOURS `true` la passerait.
  for (const skillId of FLOWS_THAT_NEED_THE_GLOBAL_DISPATCHER) {
    assertEquals(skipFor(skillId), false, `${skillId} ne doit PAS sauter`);
  }
  // ⟳ 2026-09-09 — LE CAS NÉGATIF, RÉARMÉ SUR UN NON-MEMBRE. La liste
  // ci-dessus est vide depuis le retrait du réengagement; sans cette ligne, la
  // boucle du dessus redevient la tautologie que ce fichier existe pour
  // empêcher — un `shouldSkip` qui renvoie TOUJOURS `true` la passerait.
  //
  // ⚠️ IL NE PASSE PAS PAR `skipFor`, ET C'EST LE POINT. `readActiveFlowState`
  // ne RETIENT que les flows du registre: un non-membre en ressort à `null`, et
  // l'assertion interne de `skipFor` rougirait avant d'avoir rien prouvé sur le
  // saut. On interroge donc directement la fonction sous test, avec un état
  // brut — c'est le seul moyen de lui poser la question « et pour un id que tu
  // ne connais pas ? ».
  const skipForRaw = (skillId: string) =>
    shouldSkipGlobalDispatcherForActiveLocalFlow({
      activeSkillState: { skill_id: skillId, status: "active" },
    });
  assertEquals(skipForRaw("keel_reengagement_resume_v1"), false);
  assertEquals(skipForRaw("weight_divergence"), false);
  assertEquals(skipForRaw(""), false);
});

Deno.test("active_flow_state: tout flow local retenu est range dans exactement une des deux listes", () => {
  // EXHAUSTIVITÉ. C'est cette assertion, et elle seule, qui met un flow neuf en
  // rouge tant que personne n'a tranché s'il porte son propre classifieur.
  // Source de vérité: l'union de types du module, pas une copie locale.
  const declared: ActiveLocalConversationFlowSkillId[] = [
    "safety_crisis",
  ];
  assertEquals(
    [...RETAINED_LOCAL_FLOW_IDS].sort(),
    [...declared].sort(),
  );
  assertEquals(
    new Set(RETAINED_LOCAL_FLOW_IDS).size,
    RETAINED_LOCAL_FLOW_IDS.length,
    "un flow ne peut pas etre dans les deux listes",
  );
});

Deno.test("active_flow_state ignores retained local flows with terminal status", () => {
  for (
    const status of [
      "completed",
      "done",
      "closed",
      "stopped",
      "cancelled",
      "deferred",
      "exit_to_global",
      "exiting",
    ]
  ) {
    const active = readActiveFlowState({
      __active_skill_state: {
        skill_id: "safety_crisis",
        status,
      },
    });

    assertEquals(active.activeSkillState, null);
    assertEquals(
      shouldSkipGlobalDispatcherForActiveLocalFlow({
        activeSkillState: {
          skill_id: "safety_crisis",
          status,
        },
      }),
      false,
    );
  }
});

Deno.test("active_flow_state does not skip global dispatcher for unknown legacy flow", () => {
  assertEquals(
    shouldSkipGlobalDispatcherForActiveLocalFlow({
      activeSkillState: { skill_id: "removed_legacy_flow", status: "active" },
    }),
    false,
  );
  assertEquals(
    shouldSkipGlobalDispatcherForActiveLocalFlow({ activeSkillState: null }),
    false,
  );
});

Deno.test("active_flow_state clears all active conversation aliases after local exit", () => {
  const cleaned = clearActiveConversationSkillState({
    [ACTIVE_CONVERSATION_SKILL_KEY]: {
      skill_id: "safety_crisis",
      status: "active",
    },
    __active_skill_state: { skill_id: "safety_crisis" },
    active_skill_state: { skill_id: "safety_crisis" },
    __last_safety_crisis_exit_memo: { reason: "topic_change" },
    kept: true,
  });

  assertEquals(cleaned[ACTIVE_CONVERSATION_SKILL_KEY], undefined);
  assertEquals(cleaned.__active_skill_state, undefined);
  assertEquals(cleaned.active_skill_state, undefined);
  assertEquals(cleaned.__last_safety_crisis_exit_memo, {
    reason: "topic_change",
  });
  assertEquals(cleaned.kept, true);
});

Deno.test("active_flow_state clears legacy runtime state without resuming it", () => {
  const activeIntakeKey = legacyKey("__active", "tool", "skill", "intake");
  const pendingConfirmationKey = legacyKey(
    "__pending",
    "tool",
    "skill",
    "confirmation",
  );
  const removedConversationKey = legacyKey(
    "__status",
    "recap",
    "flow",
    "state",
    "v1",
  );
  const cleaned = clearLegacyRuntimeState({
    [activeIntakeKey]: { operation_type: "old" },
    [pendingConfirmationKey]: { operation_type: "old" },
    [removedConversationKey]: { skill_id: "old" },
    __active_skill_state: { skill_id: "daily_action_review_v1" },
  });

  assertEquals(cleaned[activeIntakeKey], undefined);
  assertEquals(cleaned[pendingConfirmationKey], undefined);
  assertEquals(cleaned[removedConversationKey], undefined);
  assertEquals(
    (cleaned.__active_skill_state as any).skill_id,
    "daily_action_review_v1",
  );
});

Deno.test("active_flow_state direct-effect cleanup also clears followup consent keys", () => {
  const cleaned = clearLegacyRuntimeStateForDirectEffect({
    __followup_consent_v1: { offered: true },
    kept: true,
  });

  assertEquals(cleaned.__followup_consent_v1, undefined);
  assertEquals(cleaned.kept, true);
});

Deno.test("active_flow_state keeps only retained local exit memos", () => {
  const removedMemoKey = legacyKey("__last", "status", "recap", "exit", "memo");
  const cleaned = clearLastLocalFlowExitContext({
    [removedMemoKey]: { reason: "topic_change" },
    __last_safety_crisis_exit_memo: { reason: "done" },
    kept: true,
  });

  assertEquals(cleaned[removedMemoKey], undefined);
  assertEquals(cleaned.__last_safety_crisis_exit_memo, undefined);
  assertEquals(cleaned.kept, true);
});

Deno.test("active_flow_state releases local flows stale for more than 4 hours", async () => {
  const { isStaleActiveLocalFlowState } = await import(
    "./active_flow_state.ts"
  );
  const now = Date.now();
  const fiveHoursAgo = new Date(now - 5 * 60 * 60 * 1000).toISOString();
  const tenMinutesAgo = new Date(now - 10 * 60 * 1000).toISOString();

  // Flow périmé (dernier tour il y a 5h): relâché avant arbitration.
  const stale = {
    __active_skill_state: {
      skill_id: "safety_crisis",
      status: "active",
      updated_at: fiveHoursAgo,
    },
  };
  assertEquals(readActiveFlowState(stale).activeSkillState, null);
  assertEquals(
    shouldSkipGlobalDispatcherForActiveLocalFlow({
      activeSkillState: stale.__active_skill_state,
    }),
    false,
  );

  // Anti-régression: flow récent (10 min) toujours actif.
  const fresh = {
    __active_skill_state: {
      skill_id: "safety_crisis",
      status: "active",
      updated_at: tenMinutesAgo,
    },
  };
  assertEquals(
    (readActiveFlowState(fresh).activeSkillState as any)?.skill_id,
    "safety_crisis",
  );

  // Anti-régression: state sans timestamp exploitable conservé (state partiel
  // ou legacy — la fraîcheur ne casse jamais un flow légitime).
  assertEquals(
    isStaleActiveLocalFlowState({ skill_id: "safety_crisis", status: "active" }),
    false,
  );
  // started_at sert de repli quand updated_at manque.
  assertEquals(
    isStaleActiveLocalFlowState({
      skill_id: "safety_crisis",
      status: "active",
      started_at: fiveHoursAgo,
    }),
    true,
  );
});

// W2.B will delete this: le sas d'admission potion est débranché en W2.A
// (skill_id retiré du registre des flows locaux), le skill part en W2.B.
Deno.test({
  name:
    "potion admission keeps exactly the semantic first reply beyond four hours",
  ignore: true,
}, () => {
  const staleAt = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();
  const state = {
    skill_id: "potion_support_admission_v1",
    status: "active",
    started_at: staleAt,
    updated_at: staleAt,
    working_state: {
      potion_support_admission: { awaiting_first_reply: true },
    },
  };
  const active = readActiveFlowState({ __active_skill_state: state });
  assertEquals(
    (active.activeSkillState as any)?.skill_id,
    "potion_support_admission_v1",
  );
  assertEquals(
    shouldSkipGlobalDispatcherForActiveLocalFlow({
      activeSkillState: active.activeSkillState,
    }),
    true,
  );
});

Deno.test("active_flow_state safety crisis latch obeys the same staleness bound", async () => {
  const { isActiveSafetyCrisisSkillState } = await import(
    "./safety_crisis_runtime.ts"
  );
  const now = Date.now();
  const fiveHoursAgo = new Date(now - 5 * 60 * 60 * 1000).toISOString();
  const tenMinutesAgo = new Date(now - 10 * 60 * 1000).toISOString();

  // Flow safety abandonné depuis 5h: ne capture plus un tour neutre.
  assertEquals(
    isActiveSafetyCrisisSkillState({
      skill_id: "safety_crisis",
      status: "active",
      updated_at: fiveHoursAgo,
      working_state: { phase: "support_contact", risk_band: "high" },
    }),
    false,
  );

  // Anti-régression: vraie crise il y a 10 minutes, latch conservé.
  assertEquals(
    isActiveSafetyCrisisSkillState({
      skill_id: "safety_crisis",
      status: "active",
      updated_at: tenMinutesAgo,
      working_state: { phase: "support_contact", risk_band: "high" },
    }),
    true,
  );

  // Anti-régression: state sans timestamp conservé tel quel.
  assertEquals(
    isActiveSafetyCrisisSkillState({
      skill_id: "safety_crisis",
      status: "active",
      working_state: { phase: "support_contact" },
    }),
    true,
  );
});
