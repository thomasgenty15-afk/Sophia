/**
 * LE RAPPEL DE LA VEILLE — LA COQUILLE D'I/O. `thaw_reminder.ts` décide et
 * rend; ce module lit le plan, relit ce qu'on a envoyé, et livre.
 *
 * ── CE QU'IL LIT, ET PAR QUI ──────────────────────────────────────────────
 *   · le plan qui POSSÈDE DEMAIN — `loadPlanRowOwningDay`, la seule écriture
 *     de « quel plan couvre ce jour » (personnel d'abord, foyer ensuite);
 *   · ce que les sessions de demain sortent du congélateur —
 *     `frozenLinesForPreparations`, la MÊME lecture que la carte de session et
 *     le PDF: le chat ne dit jamais autre chose que l'écran;
 *   · le dernier envoi pour ce jour — `chat_messages.metadata.for_date`;
 *   · L'HORLOGE DU MUR (`new Date()`), et elle seule sert à autoriser
 *     l'écriture: `args.now` peut venir du corps de la requête, pas elle.
 *     Le pavé qui dit pourquoi est sur `isEveOfCookDay`.
 *
 * ⛔ AUCUN LLM. La phrase est un pack, et le coût du balayage horaire est une
 * page de `profiles` plus une requête par élève dans la fenêtre.
 */
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2.87.3";
import { CHAT_SCOPE, deliverChatMessage } from "../chat/delivery.ts";
import { frozenLinesForPreparations, wavePreparationsFromRows } from "./grocery_waves.ts";
import { addDays, dayTokenOfDate, localDateInZone } from "./local_date.ts";
import { loadPlanRowOwningDay } from "./planned_dish_io.ts";
import {
  decideThawReminder,
  isEveOfCookDay,
  renderThawReminder,
  THAW_NOT_THE_EVE,
  THAW_REMINDER_PURPOSE,
  type ThawItem,
  type ThawVerdict,
} from "./thaw_reminder.ts";

export interface ThawStepOutcome {
  verdict: ThawVerdict;
  delivered: boolean;
  deliveryReason?: string;
}

/** Le rappel est-il déjà parti pour CE jour de cuisine ? Fail-closed: oui. */
export async function thawReminderAlreadySent(
  admin: SupabaseClient,
  args: { userId: string; forDate: string },
): Promise<boolean> {
  try {
    const since = addDays(args.forDate, -3);
    const { data, error } = await admin
      .from("chat_messages")
      .select("metadata")
      .eq("user_id", args.userId)
      .eq("scope", CHAT_SCOPE)
      .eq("role", "assistant")
      .gte("created_at", `${since}T00:00:00Z`)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw error;
    const rows = (data ?? []) as Array<{ metadata?: Record<string, unknown> | null }>;
    return rows.some((r) =>
      String(r.metadata?.purpose ?? "") === THAW_REMINDER_PURPOSE &&
      String(r.metadata?.for_date ?? "") === args.forDate
    );
  } catch (error) {
    console.warn(JSON.stringify({
      tag: "keel.thaw_reminder.last_send_unreadable",
      user_id: args.userId,
      error: error instanceof Error ? error.message : String(error),
      effect: "fail-closed: on suppose qu'on vient d'envoyer",
    }));
    return true;
  }
}

export async function runThawReminderStep(
  admin: SupabaseClient,
  args: {
    userId: string;
    timezone: string | null;
    locale: string | null;
    muted: boolean;
    now: Date;
    dryRun?: boolean;
    requestId?: string;
  },
): Promise<ThawStepOutcome> {
  const zone = String(args.timezone ?? "").trim();
  if (!zone) return { verdict: { ask: false, reason: "outside_window" }, delivered: false };
  const localHour = Number(
    new Intl.DateTimeFormat("en-US", { timeZone: zone, hour: "numeric", hour12: false })
      .format(args.now),
  );
  // ── LA FENÊTRE D'ABORD, PARCE QU'ELLE EST GRATUITE ─────────────────────
  const early = decideThawReminder({ localHour, muted: args.muted, plan: null, alreadySent: false });
  if (!early.ask && (early.reason === "outside_window" || early.reason === "muted")) {
    return { verdict: early, delivered: false };
  }

  const today = localDateInZone(zone, args.now);
  const tomorrow = addDays(today, 1);
  /**
   * ⛔ L'HORLOGE DU MUR, LUE ICI ET NULLE PART AILLEURS. `args.now` peut venir
   * du corps de la requête (`body.now`); celle-ci, non. La comparaison des deux
   * est la seule chose qui distingue « la veille » d'« un tir de banc qui a
   * avancé l'horloge ». Voir le pavé de `isEveOfCookDay`.
   */
  const realToday = localDateInZone(zone, new Date());
  const tomorrowToken = dayTokenOfDate(tomorrow);
  const row = await loadPlanRowOwningDay(admin, {
    userId: args.userId,
    localDate: tomorrow,
    columns: "id, starts_on, duration_days, cooking_sessions, preparations, shopping_list",
  });

  let plan: Parameters<typeof decideThawReminder>[0]["plan"] = null;
  if (row) {
    const sessions = (Array.isArray(row.cooking_sessions) ? row.cooking_sessions : [])
      .map((s) => s as Record<string, unknown>)
      .filter((s) => String(s.day ?? "") === tomorrowToken)
      .map((s) => ({
        preparationIds: (Array.isArray(s.preparation_ids) ? s.preparation_ids : []).map(String),
      }));
    const preparations = wavePreparationsFromRows(
      Array.isArray(row.preparations) ? (row.preparations as Array<Record<string, unknown>>) : [],
    );
    const shoppingList = (Array.isArray(row.shopping_list) ? row.shopping_list : [])
      .map((l) => l as Record<string, unknown>)
      .map((l) => ({
        term: String(l.term ?? ""),
        quantity: l.quantity === null || l.quantity === undefined ? null : String(l.quantity),
        freeze_on_purchase: l.freeze_on_purchase === true,
      }));
    const frozen: ThawItem[] = frozenLinesForPreparations({
      shoppingList,
      preparations,
      preparationIds: sessions.flatMap((s) => s.preparationIds),
    }).map((l) => ({ term: l.term, quantity: l.quantity }));
    plan = { sessionsTomorrow: sessions, frozen, cookDay: tomorrowToken };
  }

  const alreadySent = plan !== null && plan.frozen.length > 0
    ? await thawReminderAlreadySent(admin, { userId: args.userId, forDate: tomorrow })
    : false;
  const verdict = decideThawReminder({ localHour, muted: args.muted, plan, alreadySent });
  if (!verdict.ask) return { verdict, delivered: false };
  if (args.dryRun) return { verdict, delivered: false, deliveryReason: "dry_run" };
  /**
   * ⚠️ APRÈS LE `dry_run`, ET C'EST LE SUJET. Le banc doit pouvoir éprouver la
   * décision à n'importe quelle date; ce qu'on refuse ici est l'ÉCRITURE dans
   * une conversation lue par une personne. Le verdict reste `ask: true`, donc
   * l'appelant le compte en `blocked.not_the_eve` — un rappel décidé dont la
   * livraison a été refusée, pas un rappel qui n'avait pas lieu d'être.
   */
  if (!isEveOfCookDay({ realLocalDate: realToday, cookDate: tomorrow })) {
    console.warn(JSON.stringify({
      tag: "keel.thaw_reminder.clock_ahead",
      user_id: args.userId,
      real_local_date: realToday,
      cook_date: tomorrow,
      effect: "écriture refusée: le rappel serait lu loin de la cuisson",
    }));
    return { verdict, delivered: false, deliveryReason: THAW_NOT_THE_EVE };
  }

  const res = await deliverChatMessage(admin, {
    userId: args.userId,
    content: renderThawReminder({ locale: String(args.locale ?? "") || "en-US", items: verdict.items }),
    purpose: THAW_REMINDER_PURPOSE,
    requestId: args.requestId,
    now: args.now,
    metadata: { meal_id: String(row?.id ?? ""), for_date: tomorrow },
  });
  return { verdict, delivered: Boolean(res.chatMessageId), deliveryReason: res.reason };
}
