/**
 * L'ÉTAPE QUI REND LA MAIN SUR UN REPAS TAPÉ DANS LE FIL.
 *
 * Le pourquoi est dans le module pur (`_shared/keel/meal_text_redirect.ts`).
 * Ici vit le CÂBLAGE, et il tient en une phrase: cette étape s'insère entre
 * les boutons déterministes et le moteur de tour, donc le message n'atteint
 * jamais le modèle — et le plancher de déclaration, qui vit DANS le modèle,
 * ne tourne pas.
 *
 * ⛔ C'EST CE PLACEMENT QUI ARRÊTE L'ÉCRITURE MUETTE, ET RIEN D'AUTRE. On n'a
 * désarmé aucune garde, retiré aucun appel, touché à aucune ligne de
 * `meal_declaration_floor.ts`: le plancher reste entier et reste le seul
 * juge de « est-ce une déclaration de repas ». Il garde donc ses désarmes
 * (négation, tiers, hypothèse, consigne rapportée, plus de 600 caractères) et
 * sa porte étroite (passé, ou nom + créneau nommé) — et cette étape hérite
 * des deux gratuitement. Réécrire ici une détection « plus simple » en
 * ferait une seconde, et c'est celle qu'on relit le moins qui se tromperait.
 *
 * ⚠️ LE PLANCHER N'EST PAS MORT POUR AUTANT. Il reste le chemin du tour où le
 * dispatcher a déjà demandé le log, des surfaces qui ne passent pas par
 * `chat-inbound-v1`, et de tout message que cette étape laisse passer (voir
 * les trois `PASS` ci-dessous). Le retirer serait un autre chantier, et il
 * n'est pas demandé.
 *
 * ── TOUTE INCERTITUDE REDESCEND AU MODÈLE ────────────────────────────────
 * Chaque refus rend `PASS`, c'est-à-dire le comportement d'avant ce lot:
 * Sophia répond, le plancher écrit sa ligne muette. C'est la direction sûre —
 * une lecture en panne ne doit pas transformer une conversation en bulle de
 * boutons, et surtout pas faire perdre le repas à quelqu'un.
 */

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2.87.3";

import type { InboundMessage } from "./inbound_message.ts";
import { handled, type InboundStepOutcome, PASS } from "./inbound_pipeline.ts";
import { CHAT_SCOPE, deliverChatMessage } from "./delivery.ts";
import { slotKeyNamedIn } from "../keel/slot_from_message.ts";
import { inferSlotFromLocalHour } from "../keel/photo_slot_inference.ts";
import { type EatingOccasion, EATING_OCCASIONS } from "../keel/meal_generation.ts";
import { localDateInZone } from "../keel/local_date.ts";
import {
  blocksDurableWrite,
  readLastTurnSafetyBand,
} from "../keel/safety_band_io.ts";
import { resolveArtifactLocale } from "../keel/locale.ts";
import {
  MEAL_TEXT_REDIRECT_PURPOSE,
  renderMealTextRedirect,
  typedMealNeedsRedirect,
} from "../keel/meal_text_redirect.ts";

function isEatingOccasion(value: unknown): value is EatingOccasion {
  return (EATING_OCCASIONS as readonly string[]).includes(String(value ?? ""));
}

/**
 * L'heure pleine de la personne, chez elle.
 *
 * `hour12: false` rend « 24 » à minuit sur plusieurs runtimes au lieu de
 * « 0 » — et `inferSlotFromLocalHour` refuse tout ce qui dépasse 23. Sans le
 * modulo, la tranche de minuit tomberait donc dans un refus qui n'a rien à
 * voir avec la nuit.
 */
function localHourIn(zone: string, at: Date): number {
  const raw = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      hour: "numeric",
      hour12: false,
    }).format(at),
  );
  return Number.isFinite(raw) ? raw % 24 : Number.NaN;
}

/** `practical_constraints.eating_rhythm` — une CLÉ du jsonb, pas une colonne. */
async function eatingRhythmOf(
  admin: SupabaseClient,
  userId: string,
): Promise<unknown> {
  const { data, error } = await admin
    .from("student_goals")
    .select("practical_constraints")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  const constraints = (data as Record<string, unknown> | null)
    ?.practical_constraints as Record<string, unknown> | null | undefined;
  return constraints?.eating_rhythm;
}

/**
 * Un repas tapé en texte libre: on ne l'écrit pas, on offre les deux chemins
 * qui aboutissent.
 *
 * Rend `handled` quand la bulle est partie — le tour s'arrête là et le moteur
 * n'est jamais appelé.
 */
export async function redirectTypedMealDeclaration(
  admin: SupabaseClient,
  args: { message: InboundMessage; requestId: string },
): Promise<InboundStepOutcome> {
  const message = args.message;
  // Une légende de photo est déjà sur le bon chemin, et un tap a son
  // gestionnaire. Seul le texte nu est concerné.
  if (message.kind !== "text") return PASS;
  const text = String(message.text ?? "").trim();
  if (!text) return PASS;

  try {
    const namedSlot = slotKeyNamedIn(text);

    // ⛔ LA DÉCISION EST PURE, ET ELLE EST AILLEURS. Question, désarmes du
    // plancher, portes: tout est dans `typedMealNeedsRedirect`, avec son
    // tableau de phrases en épreuve. Ce fichier ne fait que des lectures.
    const verdict = typedMealNeedsRedirect(text, namedSlot);
    if (!verdict.redirect) return PASS;

    // ── LA GARDE DE SÉCURITÉ, AVANT TOUT LE RESTE ───────────────────────
    //
    // « j'ai mangé toute la boîte » est une déclaration de repas pour le
    // plancher ET, parfois, autre chose. Répondre deux boutons à quelqu'un que
    // le tour précédent a placé sous bande serait remplacer une conversation
    // par un formulaire, au pire moment. Sous bande, on redescend au modèle,
    // qui sait quoi faire de cette phrase.
    const band = await readLastTurnSafetyBand(admin, {
      userId: message.user_id,
      scope: CHAT_SCOPE,
    });
    if (blocksDurableWrite(band)) return PASS;

    const profileRes = await admin
      .from("profiles")
      .select("timezone, locale")
      .eq("id", message.user_id)
      .maybeSingle();
    if (profileRes.error) throw profileRes.error;
    const profile = (profileRes.data ?? null) as Record<string, unknown> | null;

    // Sans fuseau, le jeton du bouton ne peut pas porter de date locale — et
    // une date fausse rangerait le repas le mauvais jour.
    const zone = String(profile?.timezone ?? "").trim();
    if (!zone) return PASS;

    const now = new Date(message.received_at);
    if (Number.isNaN(now.getTime())) return PASS;
    const localDate = localDateInZone(zone, now);

    // ── LE CRÉNEAU: LES MOTS D'ABORD, L'HEURE ENSUITE ───────────────────
    //
    // ⚠️ L'ORDRE EST LA RÈGLE, ET C'EST CELLE DE TOUT LE DÉPÔT. Ce que la
    // personne a NOMMÉ (« ce midi ») bat ce que l'horloge suggère. Sans ça,
    // « j'ai déjeuné d'une salade », tapé à 21 h, partirait au dîner.
    //
    // `slotKeyNamedIn` peut rendre des jetons qui ne sont pas des occasions
    // datables (`on_waking`, `any_meal`…): ils ne peuvent pas voyager dans un
    // jeton de bouton, et on retombe alors sur l'heure.
    let slot: EatingOccasion | null = null;
    let slotInferred = false;
    if (isEatingOccasion(namedSlot)) {
      slot = namedSlot;
    } else {
      const localHour = localHourIn(zone, now);
      const guess = inferSlotFromLocalHour(
        localHour,
        await eatingRhythmOf(admin, message.user_id),
      );
      // `null` est la RÉPONSE de la nuit: entre minuit et 5 h, aucune fenêtre
      // ne revendique l'heure, et coller un repas à ce moment-là serait la
      // déduction sans fondement que `photo_slot_inference.ts` refuse. On
      // redescend au modèle plutôt que d'inventer.
      if (guess && isEatingOccasion(guess.slot)) {
        slot = guess.slot;
        slotInferred = true;
      }
    }
    if (!slot) return PASS;

    const bubble = renderMealTextRedirect({
      locale: resolveArtifactLocale({
        studentProfile: String(profile?.locale ?? "").trim() || null,
        tenantDefault: null,
      }),
      localDate,
      slot,
      slotInferred,
    });

    const res = await deliverChatMessage(admin, {
      userId: message.user_id,
      content: bubble.body,
      buttons: bubble.buttons,
      purpose: MEAL_TEXT_REDIRECT_PURPOSE,
      // C'est l'autre moitié d'un échange: elle ne traverse aucun plafond
      // quotidien et n'en consomme aucun.
      isReply: true,
      requestId: args.requestId,
      now,
    });

    // ⚠️ UNE LIVRAISON REFUSÉE N'EST PAS UN TOUR TRAITÉ. Rendre `handled` ici
    // laisserait la personne sans réponse ET sans ligne: le message aurait
    // disparu dans les deux sens. On redescend au modèle, qui parlera.
    if (!res.chatMessageId) return PASS;

    console.log(JSON.stringify({
      tag: "keel.meal_text_redirect.sent",
      request_id: args.requestId,
      user_id: message.user_id,
      slot,
      slot_inferred: slotInferred,
      local_date: localDate,
    }));
    return handled("keel_meal_text_redirect");
  } catch (error) {
    console.warn(JSON.stringify({
      tag: "keel.meal_text_redirect.failed",
      request_id: args.requestId,
      user_id: message.user_id,
      error: error instanceof Error ? error.message : String(error),
      effect: "le tour redescend au modele, comme avant ce lot",
    }));
    return PASS;
  }
}
