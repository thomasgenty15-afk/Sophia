// « DÉCRIRE » UN CRÉNEAU LOUPÉ — le chemin TEXTE de la page de suivi (D7.7).
//
// ══════════════════════════════════════════════════════════════════════════
// ⛔ CE CHEMIN CONTOURNE `meal_precision.ts`, ET C'EST DÉLIBÉRÉ
// ══════════════════════════════════════════════════════════════════════════
//
// `meal_precision.ts` refuse qu'une question de précision porte une mesure:
// « une question de précision ne demande JAMAIS une quantité », ses gabarits
// sont FERMÉS et un test les passe au crible d'un lexique de quantité dans les
// deux langues. La règle est juste, et elle vaut pour les QUESTIONS.
//
// Ici, on ne pose aucune question. La page ouvre un champ libre sur un créneau
// que la personne a déclaré et que rien n'a rempli. Si elle y écrit « 150 g de
// riz », c'est ELLE qui a mesuré — le produit n'a rien demandé, et refuser de
// lire ce qu'elle écrit serait de la pudeur, pas de la sécurité. D7.7 nomme le
// contournement pour qu'il ne se lise pas comme un oubli.
//
// ══════════════════════════════════════════════════════════════════════════
// ⟳ 2026-09-09 — CE MODULE VALIDE, IL N'ÉCRIT PLUS. UN SEUL ÉCRIVAIN.
// ══════════════════════════════════════════════════════════════════════════
//
// Ce qu'il écrivait: un fait `slot_meal:<date>:<slot>` sans `meal_context` et
// sans chiffre — `energy` était câblé à `null`, avec ce commentaire: « le
// produire demanderait le chemin modèle […] tant que ce chemin n'existe pas ».
//
// CE CHEMIN EXISTE. `analyzeJournalText` (`tracking_mutations_io.ts`) lit une
// description écrite et en tire un `energy_estimate` de base `text_estimate`,
// et c'est ce que fait déjà « Décrire » sur `/app/progress`. Deux écrans
// posaient donc la même question à la même personne, et un seul comptait la
// réponse — celui qu'elle n'avait pas ouvert.
//
// Ce module garde ce que lui seul portait: ses huit refus NOMMÉS, le plancher
// déterministe (`detectDeclaredMeal`) et la garde de fuseau. Il résout ensuite
// le repas du journal que ce créneau désigne et délègue l'écriture à
// `mutateJournal`. Deux écrivains sur la même table divergent au premier
// correctif; celui qu'on relit le moins écrit le fait faux.
//
// ⛔ CE QUE LE CLIENT NE PASSE TOUJOURS PAS: un identifiant de repas. La
// conversation connaît une date et un créneau. Savoir QUEL repas du journal
// porte ce créneau — le plat prévu qu'on remplace, ou rien du tout — est une
// question de base.

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2.87.3";

import { loadEnergyGate } from "./energy_gate_io.ts";
import { detectDeclaredMeal } from "./meal_declaration_floor.ts";
import { slotMealFactKey } from "./slot_meal_io.ts";
import { EATING_OCCASIONS } from "./meal_generation.ts";
import { loadJournal } from "./tracking_v2_io.ts";
import { mutateJournal } from "./tracking_mutations_io.ts";

type Db = SupabaseClient;

/** La longueur au-delà de laquelle ce n'est plus une description mais un collage. */
export const DESCRIBE_MAX_CHARS = 600;

/**
 * Jusqu'où on peut remonter pour décrire. Au-delà, la personne ne se souvient
 * plus de ce qu'elle a mangé, et un fait daté d'il y a un mois pèse dans la
 * couverture que son coach lit comme s'il était frais.
 */
export const DESCRIBE_MAX_BACKFILL_DAYS = 14;

/** Les refus NOMMÉS. Un jeton, jamais une phrase — la phrase vit dans le pack. */
export const DESCRIBE_REFUSALS = [
  "bad_slot",
  "bad_date",
  "future_date",
  "too_old",
  "empty_text",
  "text_too_long",
  "not_a_meal",
  "already_declared",
] as const;
export type DescribeRefusal = (typeof DESCRIBE_REFUSALS)[number];

export interface DescribeOutcome {
  ok: boolean;
  reason: DescribeRefusal | null;
  /**
   * LE CHIFFRE ET SA BASE, ENSEMBLE — jamais l'un sans l'autre.
   *
   * ⟳ IL N'EST PLUS TOUJOURS `null` (2026-09-09). `null` reste la réponse
   * NORMALE dans trois cas: la porte d'énergie était fermée à l'écriture
   * (plancher TCA, mineur, affichage éteint), la description n'était pas assez
   * précise pour que le modèle en tire un chiffre, ou la lecture a échoué. Les
   * trois sont indiscernables ici, et c'est voulu: l'écran n'a pas à savoir
   * pourquoi il n'y a pas de chiffre — il n'en montre pas, point.
   *
   * `basis` vaut `text_estimate` quand il y en a un. Ce n'est PAS
   * `declared_quantities`: personne n'a pesé quoi que ce soit.
   */
  energy: { kcal: number; basis: string } | null;
}

function refuse(reason: DescribeRefusal): DescribeOutcome {
  return { ok: false, reason, energy: null };
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function daysBetween(from: string, to: string): number {
  return (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) /
    86_400_000;
}

/**
 * ⚠️ `admin` est un client `service_role`, et `userId` vient du JWT. Toutes les
 * écritures portent leur `user_id` en clair: RLS ne s'applique pas ici, et une
 * écriture sans propriétaire explicite est le même défaut qu'une lecture sans
 * `.eq("user_id")`, vu de l'autre côté.
 */
export async function describeMissedSlot(
  admin: Db,
  args: {
    userId: string;
    localDate: string;
    slot: string;
    text: string;
    requestId: string;
  },
): Promise<DescribeOutcome> {
  const userId = String(args.userId ?? "").trim();
  if (!userId) return refuse("bad_date");

  const slot = String(args.slot ?? "").trim();
  if (!(EATING_OCCASIONS as readonly string[]).includes(slot)) {
    return refuse("bad_slot");
  }

  const localDate = String(args.localDate ?? "").trim();
  if (!ISO_DATE.test(localDate)) return refuse("bad_date");

  const text = String(args.text ?? "").trim();
  if (!text) return refuse("empty_text");
  if (text.length > DESCRIBE_MAX_CHARS) return refuse("text_too_long");

  // ══ LA PORTE, AVANT L'ÉCRITURE ══════════════════════════════════════════
  // ⚠️ ELLE SERT DEUX CHOSES, ET LA SECONDE EST NEUVE (2026-09-09).
  // ① LE FUSEAU: `loadEnergyGate` résout « aujourd'hui » chez la personne, et
  //    sans lui les deux bornes ci-dessous seraient celles du serveur. Un élève
  //    à Auckland pourrait décrire son dîner « dans le futur ».
  // ② LE CHIFFRE: ce chemin en écrit un maintenant, par l'écrivain du journal.
  //    La porte n'est pas rejouée ici — `analyzeJournalText` lit la MÊME
  //    (`loadEnergyGate`) et n'écrit aucune énergie quand elle est fermée.
  // Et elle jette quand elle est illisible, ce qui est le bon comportement:
  // écrire un fait daté d'un jour qu'on n'a pas su résoudre est pire que
  // refuser.
  const loaded = await loadEnergyGate(admin, { userId, localDate });
  const today = loaded.today;

  // ⛔ PAS DE FAIT DANS LE FUTUR. « J'ai mangé » daté de vendredi, tapé lundi,
  // est une preuve fabriquée dans la table qui nourrit la couverture du coach.
  // C'est la règle d'`isReportable`, tenue ici aussi.
  if (localDate > today) return refuse("future_date");
  if (daysBetween(localDate, today) > DESCRIBE_MAX_BACKFILL_DAYS) {
    return refuse("too_old");
  }

  // ══ LE PLANCHER DÉTERMINISTE ════════════════════════════════════════════
  // ⛔ AUCUN MATCHER MAISON. `detectDeclaredMeal` est le plancher du dépôt, avec
  // ses portes, ses désarmements et ses ligatures dépliées (« des œufs » ⇒
  // `oeufs`, pas `ufs`). Le créneau lui est NOMMÉ: la page sait de quel repas
  // elle parle, et le lui dire ouvre la porte « groupe nominal + créneau » sans
  // exiger un verbe au passé — « une salade et du pain » est une réponse
  // complète à « décris ton déjeuner ».
  const hit = detectDeclaredMeal(text, slot);
  if (!hit) return refuse("not_a_meal");

  // ══ L'IDEMPOTENCE, AVANT TOUT LE RESTE ═════════════════════════════════
  // ⚠️ DEUX CLÉS, ET LES DEUX COMPTENT. `slot_meal:<date>:<slot>` est celle
  // qu'écrivaient ce module et le canal C1 jusqu'au 2026-09-09; `journal:…`
  // est celle du journal. Ne relire que la neuve ferait redemander un créneau
  // qu'une ligne d'avant ce lot couvre déjà — et écraserait ce que la personne
  // a dit ailleurs.
  const mutationId = `slotmeal-${localDate}-${slot}`;
  const already = await admin
    .from("protocol_events")
    .select("id")
    .eq("user_id", userId)
    .in("source_message_id", [
      slotMealFactKey(localDate, slot),
      `journal:${mutationId}`,
    ])
    .limit(1)
    .maybeSingle();
  if (already.error) throw already.error;
  if (already.data) return refuse("already_declared");

  // ══ LE REPAS QUE CE CRÉNEAU DÉSIGNE ═════════════════════════════════════
  // ⛔ ON NE PREND PAS UN `extra`: ce sont les repas AJOUTÉS à la main sur la
  // journée, et en attraper un ferait écrire la description d'un déjeuner sur
  // le carré de chocolat de 16 h.
  //
  // ⚠️ AUCUN REPAS TROUVÉ N'EST LE CAS NORMAL, pas une panne: une journée sans
  // plan et sans rythme déclaré n'a rien à ce créneau-là. On fabrique alors un
  // `outside:` — la même forme que le bouton « + » de `/app/progress`.
  const day = await loadJournal(admin, {
    userId,
    from: localDate,
    to: localDate,
    requestId: args.requestId,
  });
  const sameSlot = (day.days[0]?.meals ?? []).filter((m) =>
    m.slot === slot && m.origin !== "extra"
  );
  if (sameSlot.some((m) => m.state === "reported" || m.state === "skipped")) {
    return refuse("already_declared");
  }
  const mealId = sameSlot[0]?.id ?? `outside:${localDate}:${slot}:${mutationId}`;

  // ══ L'ÉCRITURE, PAR L'ÉCRIVAIN DU JOURNAL ═══════════════════════════════
  // ⛔ `relation: "outside"` N'EST PAS LE DERNIER MOT. `resolveJournalContext`
  // le RECALCULE: si le repas trouvé porte des `planRefs`, la relation devient
  // `replacement` — « le plan composait quelque chose, j'ai mangé autre
  // chose ». Passer `planned` d'ici serait affirmer que la personne a mangé ce
  // qui était prévu, ce que ce chemin ne sait pas.
  const written = await mutateJournal(admin, userId, {
    action: "journal_describe",
    local_date: localDate,
    slot,
    meal_id: mealId,
    text: hit.studentNote,
    relation: "outside",
    mutation_id: mutationId,
  }, args.requestId) as { ok?: boolean; eventId?: string };

  const eventId = String(written?.eventId ?? "");
  if (!eventId) return { ok: true, reason: null, energy: null };

  // ══ CE QUE LE JOURNAL N'ÉCRIT PAS, ET QUE LE PLANCHER SAIT ══════════════
  // `plan_relation` (FF-009 R5: `off_plan` ou rien, JAMAIS `as_planned`) et le
  // groupe alimentaire reconnu. Ce sont les deux colonnes que la couverture du
  // coach lit, et les perdre rendrait ce chemin muet pour lui — un défaut
  // invisible depuis l'écran qui vient d'écrire.
  const patch = await admin
    .from("protocol_events")
    .update({
      plan_relation: hit.planRelation,
      food_group_ref: hit.components[0]?.food_group_ref ?? null,
    })
    .eq("user_id", userId)
    .eq("id", eventId);
  if (patch.error) throw patch.error;

  // ══ LE CHIFFRE, RELU SUR LA LIGNE ═══════════════════════════════════════
  // ⚠️ ON RELIT PLUTÔT QUE DE FAIRE CONFIANCE AU RETOUR: `analyzeJournalText`
  // rend `{ok, eventId}` que le modèle ait répondu ou non. Ce qui est en base
  // est ce que l'écran doit annoncer.
  const read = await admin
    .from("protocol_events")
    .select("recognized")
    .eq("user_id", userId)
    .eq("id", eventId)
    .maybeSingle();
  if (read.error) throw read.error;
  const recognized = (read.data?.recognized ?? {}) as Record<string, unknown>;
  const journalText = (recognized.journal_text ?? null) as
    | { status?: unknown; energy?: { kcal?: unknown; basis?: unknown } | null }
    | null;
  const kcal = Number(journalText?.energy?.kcal);
  const basis = String(journalText?.energy?.basis ?? "").trim();
  const energy = journalText?.status === "ready" && Number.isFinite(kcal) &&
      basis
    ? { kcal: Math.round(kcal), basis }
    : null;

  return { ok: true, reason: null, energy };
}
