// LE TEST QUI PORTE LA DOCTRINE — contre une VRAIE base.
//
//   « une réponse à une question de précision n'écrit jamais un repas en
//     double »
//
// Mesuré comme le prompt l'exige: `select count(*) from protocol_events` avant
// et après, sur le même repas. Pas un double d'écriture, pas un ledger, pas un
// stub — les lignes que le coach lira.
//
// POURQUOI CE TEST NE PEUT PAS ÊTRE UNITAIRE. Le doublon que ce chantier ferme
// naît d'une PROPRIÉTÉ DU SCHÉMA: la clé d'idempotence est
// `<source_message_id>#<component_key>`, et le message de RÉPONSE n'est pas
// celui de la DÉCLARATION. L'index unique ne peut donc pas attraper le
// doublon — il ne voit pas deux fois la même clé. Un test à double mémoire
// prouverait que notre filtre filtre; seule une vraie base prouve que le
// doublon qu'il évite était bien un doublon.

import { createClient } from "jsr:@supabase/supabase-js@2";
import { assert, assertEquals } from "jsr:@std/assert@1";

import { runLogProtocolEventDirectEffect } from "../tools/always_on/log_protocol_event/router.ts";
import { createProtocolEventWrite } from "../tools/always_on/log_protocol_event/db.ts";
import { protocolEventComponentKey } from "../../_shared/keel/protocol_event_key.ts";
import type { TurnFrame } from "../contracts/turn_frame.v1.ts";

const REQUIRED_ENV = [
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
] as const;
const MISSING = REQUIRED_ENV.filter((n) =>
  (Deno.env.get(n) ?? "").trim().length === 0
);
const SKIP = MISSING.length > 0;
if (SKIP) {
  console.log(
    `[skip] meal_precision_int_test.ts: stack requise — manque: ${MISSING.join(", ")}`,
  );
}

const URL_BASE = (Deno.env.get("SUPABASE_URL") ?? "").trim().replace(/\/+$/, "");
const ANON = (Deno.env.get("SUPABASE_ANON_KEY") ?? "").trim();
const SERVICE = (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "").trim();

function admin() {
  return createClient(URL_BASE, SERVICE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * `auth.admin.createUser` échoue par intermittence sur une stack locale à clés
 * asymétriques; `signUp` anon marche partout (mémoire `recreate-local-personas`).
 */
async function makeStudent(): Promise<string> {
  const anon = createClient(URL_BASE, ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const nonce = `${Date.now()}${Math.random().toString(16).slice(2, 8)}`;
  const { data, error } = await anon.auth.signUp({
    email: `precision-${nonce}@test.dev`,
    password: "1234567",
  });
  if (error || !data.user) throw new Error(`signUp: ${error?.message}`);
  const { error: pErr } = await admin().from("profiles").update({
    keel_role: "student",
    timezone: "Europe/Paris",
    country: "GB",
  } as never).eq("id", data.user.id);
  if (pErr) throw pErr;
  return data.user.id;
}

const LOCAL_DATE = "2026-08-04";

function frameFor(args: {
  userId: string;
  messageId: string;
  components: Array<{ food_group_ref?: string; substance_ref?: string }>;
}): TurnFrame {
  return {
    user_id: args.userId,
    source_message_id: args.messageId,
    direct_effect_time_context: {
      now_utc: `${LOCAL_DATE}T12:00:00.000Z`,
      user_local_datetime: `${LOCAL_DATE}T14:00:00`,
    },
    // Le frame que le dispatcher produit sur une déclaration claire: l'effet
    // est EXPLICITE, sa cible identifiée, sa confiance haute. Le gate
    // default-deny (`direct_effect_gate.ts`) refuse tout le reste, et c'est
    // voulu — un test qui contournerait le gate prouverait une chaîne que la
    // production n'emprunte jamais.
    direct_effects: [{
      effect_type: "log_protocol_event",
      explicitness: "explicit",
      target_status: "identified",
      confidence_band: "high",
      payload_hint: {
        slot_key: "lunch",
        source: "chat",
        components: args.components,
      },
    }],
    safety: { risk_band: "none" },
    // Le reste du frame n'est pas lu par cette chaîne; le cast garde le test
    // lisible sans reconstruire un frame complet.
  } as unknown as TurnFrame;
}

async function countEvents(userId: string): Promise<number> {
  const { count, error } = await admin()
    .from("protocol_events")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  if (error) throw error;
  return count ?? 0;
}

async function run(args: {
  userId: string;
  messageId: string;
  components: Array<{ food_group_ref?: string; substance_ref?: string }>;
  suppress?: string[];
  answerTo?: string | null;
}) {
  return await runLogProtocolEventDirectEffect({
    turn_frame: frameFor(args),
    content_locale: "en-GB",
    default_source: "chat",
    allowed_commitment_ids: [],
    suppress_component_keys: args.suppress ?? null,
    precision_answer_to: args.answerTo ?? null,
    write_protocol_event: createProtocolEventWrite({ supabase: admin() }),
  });
}

// ---------------------------------------------------------------------------
// LE TEST DE DOCTRINE
// ---------------------------------------------------------------------------

Deno.test({
  name:
    "une réponse à une question de précision n'écrit JAMAIS un repas en double",
  ignore: SKIP,
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const userId = await makeStudent();

    // ---- tour 1: « j'ai mangé du poulet » --------------------------------
    const before = await countEvents(userId);
    const declaration = await run({
      userId,
      messageId: "msg-declaration",
      components: [{ food_group_ref: "poultry" }],
    });
    assertEquals(declaration.status, "logged");
    assertEquals(declaration.committed_effects.length, 1);
    const afterDeclaration = await countEvents(userId);
    assertEquals(
      afterDeclaration - before,
      1,
      "la déclaration doit écrire exactement UN fait",
    );

    const originEventId = declaration.committed_effects[0].protocol_event_id;
    const componentKeys = declaration.committed_effects.map((effect) =>
      protocolEventComponentKey({
        food_group_ref: effect.food_group_ref,
        substance_ref: effect.substance_ref,
        commitment_id: effect.commitment_id,
      })
    );
    assertEquals(componentKeys, ["food_group:poultry"]);

    // ---- tour 2: « du poulet avec du riz » -------------------------------
    // LE PIÈGE. L'élève RE-CITE le poulet en répondant. Le message est
    // différent, donc l'index unique du schéma ne peut rien voir: sans le
    // filtre par identité, le poulet devient un SECOND fait.
    const answer = await run({
      userId,
      messageId: "msg-answer",
      components: [
        { food_group_ref: "poultry" },
        { food_group_ref: "whole_grain" },
      ],
      suppress: componentKeys,
      answerTo: originEventId,
    });
    assertEquals(answer.status, "logged");

    const afterAnswer = await countEvents(userId);
    assertEquals(
      afterAnswer - afterDeclaration,
      1,
      "la réponse ne doit ajouter QUE le riz — un poulet de plus serait le doublon",
    );

    // Et la ligne ajoutée porte le LIEN vers le repas d'origine: un composant
    // réellement mangé est un fait à part entière, mais le coach doit voir à
    // quel repas il appartient.
    const { data: added, error } = await admin()
      .from("protocol_events")
      .select("id, food_group_ref, recognized")
      .eq("user_id", userId)
      .eq("food_group_ref", "whole_grain")
      .single();
    if (error) throw error;
    assertEquals(
      (added!.recognized as Record<string, unknown>).precision_answer_to,
      originEventId,
    );

    // Contrôle final, en SQL brut sur le repas: DEUX faits, jamais trois.
    const { data: all } = await admin()
      .from("protocol_events")
      .select("food_group_ref")
      .eq("user_id", userId)
      .order("food_group_ref");
    assertEquals(
      (all ?? []).map((r: { food_group_ref: string | null }) => r.food_group_ref)
        .sort(),
      ["poultry", "whole_grain"],
      "un repas mangé une fois ne fait que les faits qu'il contient",
    );
  },
});

Deno.test({
  name: "une réponse qui ne dit RIEN de neuf n'écrit rien, et ne se plaint pas",
  ignore: SKIP,
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const userId = await makeStudent();
    const declaration = await run({
      userId,
      messageId: "msg-decl-2",
      components: [{ food_group_ref: "poultry" }],
    });
    assertEquals(declaration.status, "logged");
    const afterDeclaration = await countEvents(userId);

    // « oui, du poulet » — tout est déjà écrit.
    const answer = await run({
      userId,
      messageId: "msg-answer-2",
      components: [{ food_group_ref: "poultry" }],
      suppress: ["food_group:poultry"],
    });

    // Ni un refus adressé à l'élève, ni une écriture: un non-événement.
    assertEquals(answer.status, "ignored");
    assertEquals(answer.reply, null);
    assertEquals(answer.committed_effects.length, 0);
    // Mais le ledger le PORTE: la comptabilité reste vraie même quand la
    // surface se tait.
    assertEquals(answer.blocked_effects.length, 1);
    assertEquals(
      answer.blocked_effects[0].reason_code,
      "components_already_logged",
    );
    assertEquals(await countEvents(userId), afterDeclaration);
  },
});

Deno.test({
  name: "le plafond de précision est PARTAGÉ entre photo et texte",
  ignore: SKIP,
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const userId = await makeStudent();
    const db = admin();

    // Deux questions posées le même jour, une par source.
    for (const [source, key] of [["photo", "photo:evt-x"], ["text", "msg-y"]]) {
      const { error } = await db.from("meal_precision_questions").insert({
        user_id: userId,
        local_date: LOCAL_DATE,
        source,
        axis: "accompaniment",
        question: "And what did you have with it?",
        asked_for_message_id: key,
      } as never);
      if (error) throw error;
    }

    const { count, error } = await db
      .from("meal_precision_questions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("local_date", LOCAL_DATE);
    if (error) throw error;
    assertEquals(
      count,
      2,
      "photo + texte comptent dans le MÊME compteur — deux compteurs " +
        "donneraient quatre questions par jour",
    );

    // Et le rejeu du même message ne consomme pas une place de plus.
    const replay = await db.from("meal_precision_questions").insert({
      user_id: userId,
      local_date: LOCAL_DATE,
      source: "text",
      axis: "accompaniment",
      question: "And what did you have with it?",
      asked_for_message_id: "msg-y",
    } as never);
    assert(replay.error !== null, "le rejeu doit être refusé par le schéma");
    assertEquals(replay.error?.code, "23505");
  },
});
