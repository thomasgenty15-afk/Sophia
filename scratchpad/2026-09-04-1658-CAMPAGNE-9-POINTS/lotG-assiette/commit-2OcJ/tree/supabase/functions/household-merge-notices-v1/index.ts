/// <reference path="../tsserver-shims.d.ts" />
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2.87.3";

import { enforceCors, handleCorsOptions } from "../_shared/cors.ts";
import { getRequestId, jsonResponse } from "../_shared/http.ts";
import { logEdgeFunctionError } from "../_shared/error-log.ts";
import { localDateInZone } from "../_shared/keel/local_date.ts";
import { parseOwnPlans } from "../_shared/keel/household_hand.ts";
import { parseMemberAway } from "../_shared/keel/household_presence.ts";
import {
  DEFAULT_EATING_RHYTHM,
  type EatingOccasionSlot,
  parseEatingRhythm,
} from "../_shared/keel/meal_generation.ts";
import {
  buildMergeNotices,
  type MergeSettingRow,
  type NoticeMember,
  proposalSentence,
} from "../_shared/keel/household_merge_notice.ts";
import {
  loadLiveHouseholdPlans,
  loadMergeSettings,
} from "../_shared/keel/household_merge_notice_io.ts";
import {
  type MergeQuotaState,
  parseMergeQuota,
} from "../_shared/keel/household_merge_quota.ts";

/**
 * `household-merge-notices-v1` — CE QUE LE MAÎTRE DOIT VOIR, ET RIEN D'AUTRE.
 *
 * Autorité produit: docs/keel/CHANTIER-PLANS-INDIVIDUELS-ET-FUSION.md, D8 (la
 * validation APRÈS la fusion, et ses trois sorties), D10 (la fusion est
 * manuelle, SUR PROPOSITION), D17 (le réglage discret). Lot L5.
 *
 * ── UN LECTEUR, ET ÇA SE VÉRIFIE ─────────────────────────────────────────
 * Aucun appel modèle, aucune écriture, aucune RPC d'écriture. Elle répond à
 * une question — « de qui peut-on proposer la fusion, et qui a validé un plan
 * après qu'on l'a fusionné » — et à elle seule.
 *
 * ── POURQUOI UNE FONCTION À ELLE, ALORS QUE LA FUSION VIT DANS LE GÉNÉRATEUR
 * L4 a mis `operation: "merge"` dans `generate-household-meal-v1` parce que la
 * fusion exige EXACTEMENT les préconditions de la composition: le gel 402,
 * l'union des allergies, le plafond de bouches, les deux axes de version de
 * prompt. Un LECTEUR n'en exige aucune. Il lui faut trois choses — un jeton, un
 * foyer, et le droit du maître — et rien de ce que le générateur protège.
 *
 * L'y greffer aurait fait d'un générateur une porte qui parfois n'écrit pas,
 * c'est-à-dire une fonction dont on ne peut plus dire « elle compose ». C'est
 * la même règle que L4 a appliquée dans l'autre sens, et pour la même raison:
 * on regroupe ce qui partage des GARDES, pas ce qui partage un sujet.
 *
 * ── LE FOYER GELÉ EST LU, PAS REFUSÉ ─────────────────────────────────────
 * D13 gèle la PRODUCTION, jamais la consultation (L1, en toutes lettres). Un
 * foyer impayé garde donc ses propositions lisibles — mais la réponse porte
 * `frozen`, parce qu'un écran qui proposerait un bouton menant tout droit à un
 * 402 serait pire qu'un écran qui explique. L'arbitrage entre les deux
 * appartient à L8; ce qui appartient au serveur, c'est de dire le fait.
 */

const FN_NAME = "household-merge-notices-v1";

function requireEnv(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`[${FN_NAME}] missing env ${name}`);
  return v;
}

function adminClient(): SupabaseClient {
  return createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Une ligne de `keel_household_roster_for`, telle que la base la rend. */
interface RosterRow {
  member_id: string;
  user_id: string | null;
  first_name: string;
  role: string;
  own_plans: unknown;
  /**
   * C3 ④ — L'UNION DES DEUX SOURCES D'ABSENCE, déjà faite par la RPC
   * (`keel_away_tagged(self) || keel_away_tagged(household)`). Elle était
   * rendue et jamais lue par cette fonction: c'est ce silence qui laissait la
   * proposition offrir un bouton que le geste refusait.
   */
  away_days: unknown;
}

Deno.serve(async (req) => {
  const requestId = getRequestId(req);
  if (req.method === "OPTIONS") return handleCorsOptions(req);
  const corsError = enforceCors(req);
  if (corsError) return corsError;

  try {
    const admin = adminClient();

    // --- identité: le JWT, jamais un user_id du client --------------------
    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_ANON_KEY"), {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) {
      return jsonResponse(req, { error: "Unauthorized", request_id: requestId }, { status: 401 });
    }
    const userId = user.id;

    // ── LE FOYER, ET LE DROIT DE VOIR CES PROPOSITIONS ──────────────────
    //
    // SEUL LE MAÎTRE. Ce n'est pas une hiérarchie de confort: la proposition
    // dit « X a validé son plan, voulez-vous le fusionner » — c'est-à-dire
    // qu'elle rend visible, à qui la lit, le fait qu'un tiers a pris la main.
    // Un secondaire n'a pas à apprendre ça d'un écran, et il n'a de toute façon
    // aucun geste à faire: la fusion est déclenchée par le maître (D10).
    const meRes = await admin
      .from("household_members")
      .select("household_id, role")
      .eq("user_id", userId)
      .maybeSingle();
    if (meRes.error) throw meRes.error;
    const me = meRes.data as { household_id?: string; role?: string } | null;
    if (!me?.household_id) {
      return jsonResponse(req, { error: "no_household", request_id: requestId }, { status: 409 });
    }
    if (me.role !== "owner") {
      return jsonResponse(req, { error: "not_owner", request_id: requestId }, { status: 403 });
    }
    const householdId = me.household_id;

    // ── LE JOUR LOCAL DU MAÎTRE ─────────────────────────────────────────
    // LE MÊME que celui du générateur, et pour la même raison: le pivot de D16
    // est « le premier jour non encore consommé », et une proposition calculée
    // sur l'horloge du serveur promettrait des jours déjà mangés à qui vit à
    // l'est. `local_day_unresolved` plutôt qu'un repli sur UTC — un repli
    // silencieux ferait exactement l'erreur qu'on cherche à éviter.
    const profileRes = await admin
      .from("profiles")
      .select("id, timezone")
      .eq("id", userId)
      .maybeSingle();
    if (profileRes.error) throw profileRes.error;
    const timezone = String(
      (profileRes.data as Record<string, unknown> | null)?.timezone ?? "",
    ).trim();
    if (!timezone) {
      return jsonResponse(req, {
        error: "local_day_unresolved",
        detail: "We could not tell what day it is where you are, and these " +
          "proposals are counted in days.",
        request_id: requestId,
      }, { status: 409 });
    }
    const todayDate = localDateInZone(timezone, new Date());

    // ── LE ROSTER, PAR LA MÊME PORTE QUE LE GÉNÉRATEUR ET QUE LE CHAT ────
    // `keel_household_roster_for` est LE résolveur du foyer: il porte D1
    // (l'objectif effectif), D14 (l'absence effective) et le prédicat de D7 sur
    // `own_plans` — personnel · vivant · validé · rattaché à CE foyer. Un
    // second `select` ferait un second avis sur « qui a un plan validé », et la
    // proposition cesserait de décrire ce que la fusion voit.
    const rosterRes = await admin.rpc("keel_household_roster_for", { p_user: userId });
    if (rosterRes.error) throw rosterRes.error;
    const roster = (rosterRes.data ?? []) as RosterRow[];

    const householdPlans = await loadLiveHouseholdPlans(admin, {
      ownerUserId: userId,
      householdId,
    });

    // ⚠️ LES REPRISES NE SONT PLUS APLATIES ICI, ET C'ÉTAIT UN DÉFAUT MESURÉ.
    // Ce bloc dédoublonnait par bouche en gardant « la première entrée
    // trouvée », c'est-à-dire celle du plan le PLUS ANCIEN — `loadLiveHouseholdPlans`
    // trie `starts_on` croissant, et deux plans du foyer sont vivants en même
    // temps par contrat. Le maître recevait donc la `validated_at` d'un plan
    // périmé (2026-08-05T10:00:00 au lieu du geste réel du jour) et un bouton
    // `unmerge` que le geste refusait, puisque le geste, lui, visait encore un
    // autre plan. Le choix vit désormais dans `mergeCarriers`, appelé par
    // `buildMergeNotices` ET par le générateur: une seule règle, un seul plan.

    // ── D17 · LE RÉGLAGE, FAIL-OPEN ET NOMMÉ ────────────────────────────
    // Une lecture en panne rend « aucun réglage », donc toutes les
    // propositions. C'est le bon sens de l'échec pour un FILTRE D'AFFICHAGE:
    // se tromper dans l'autre sens masquerait en silence des propositions que
    // le maître attend, et rien ne le lui dirait. L'incident est journalisé, et
    // la réponse porte `settings_unreadable` — une garde muette ressemble trait
    // pour trait à une garde qui ne mord jamais.
    const issues: string[] = [];
    let settings: MergeSettingRow[] = [];
    try {
      settings = await loadMergeSettings(admin, householdId);
    } catch (error) {
      await logEdgeFunctionError({
        functionName: FN_NAME,
        requestId,
        error,
        metadata: { source: "merge_settings", household: householdId },
      });
      issues.push("settings_unreadable");
    }

    const members: NoticeMember[] = roster.map((r) => ({
      memberId: r.member_id,
      userId: r.user_id,
      displayName: String(r.first_name ?? "").trim() || "Member",
      isOwner: r.role === "owner",
      // LA MÊME LECTURE QUE LE GÉNÉRATEUR, par la même fonction: la ceinture de
      // D7 (`validated_at` non nulle) est appliquée là-bas et nulle part
      // ailleurs. La relire ici ferait une seconde définition de « plan
      // validé ».
      ownPlans: parseOwnPlans(r.own_plans).map((p) => ({
        id: p.id,
        startsOn: p.startsOn,
        durationDays: p.durationDays,
        validatedAt: p.validatedAt,
      })),
      // C3 ④ — LA MÊME LECTURE QUE LE GÉNÉRATEUR, par la même fonction. Une
      // seconde idée de « qui est absent » aurait divergé au premier
      // ajustement, et c'est le défaut que ce chantier a fermé quatre fois.
      away: parseMemberAway(r.away_days),
    }));

    // ── C3 ④ · LE RYTHME DE REPAS DU FOYER, POUR PRÉDIRE LA PRÉSENCE ─────
    //
    // ⚠️ CELUI DU MAÎTRE, ET C'EST CE QUE LE GÉNÉRATEUR LIT AUSSI (`pc
    // ?.eating_rhythm` sur SA ligne `student_goals`, avec le même repli sur
    // `DEFAULT_EATING_RHYTHM`). Lire ailleurs, ou retomber sur autre chose,
    // ferait dire au lecteur qu'une personne est absente d'un repas que le
    // générateur composera quand même — c'est-à-dire remplacerait un bouton
    // qui refuse par une proposition qui manque.
    //
    // FAIL-OPEN, comme tout ce qui filtre un AFFICHAGE ici: une lecture en
    // panne rend le rythme par défaut, donc la présence la plus probable, donc
    // la proposition. Se tromper dans l'autre sens masquerait en silence des
    // fusions parfaitement valides.
    let rhythm: readonly EatingOccasionSlot[] = DEFAULT_EATING_RHYTHM;
    const rhythmRes = await admin
      .from("student_goals")
      .select("practical_constraints")
      .eq("user_id", userId)
      .maybeSingle();
    if (rhythmRes.error) {
      await logEdgeFunctionError({
        functionName: FN_NAME,
        requestId,
        error: rhythmRes.error,
        metadata: { source: "eating_rhythm", household: householdId },
      });
      issues.push("eating_rhythm_unreadable");
    } else {
      const pc = (rhythmRes.data as { practical_constraints?: unknown } | null)
        ?.practical_constraints as Record<string, unknown> | null;
      const declared = parseEatingRhythm(pc?.eating_rhythm);
      if (declared.length > 0) rhythm = declared;
    }

    // ── L7/D11 — LE PLAFOND, LU POUR NE PAS PROMETTRE ───────────────────
    //
    // L5 avait laissé ce point d'accroche en toutes lettres: « quand le
    // plafond sera posé, la proposition devra le lire — sinon elle proposera
    // une fusion que le quota refuse ». C'est ici.
    //
    // ⚠️ LE MÊME PLAFOND QUE LA GARDE, PAR LA MÊME FONCTION. Recompter `N + 3`
    // ici aurait fait deux nombres plausibles et un seul vrai — c'est
    // exactement le défaut que `bestMergePair` a fermé sur les fenêtres.
    //
    // FAIL-OPEN, comme le réglage juste au-dessus: une lecture en panne
    // propose. Se tromper dans l'autre sens masquerait des propositions
    // valides sans rien dire, et le serveur refusera de toute façon si la
    // semaine est vraiment pleine.
    let quota: MergeQuotaState | null = null;
    const quotaRes = await admin.rpc("keel_household_merge_quota_state", {
      p_household: householdId,
      p_local_date: todayDate,
    });
    if (quotaRes.error) {
      await logEdgeFunctionError({
        functionName: FN_NAME,
        requestId,
        error: quotaRes.error,
        metadata: { source: "merge_quota_state", household: householdId },
      });
      issues.push("merge_quota_unreadable");
    } else {
      quota = parseMergeQuota(quotaRes.data);
      if (quota === null) issues.push("merge_quota_unreadable");
    }

    const result = buildMergeNotices({
      members,
      householdPlans,
      settings,
      today: todayDate,
      quota,
      rhythm,
    });

    // ── D13 — LE GEL SE DIT, IL NE REFUSE PAS ────────────────────────────
    // Fail-open comme partout sur ce chemin: une lecture de facturation en
    // panne laisse passer. Se tromper dans l'autre sens couperait un client qui
    // paie, ce qu'aucun nouvel essai ne répare.
    let frozen = false;
    const coverRes = await admin.rpc("keel_household_is_covered", {
      p_household: householdId,
    });
    if (coverRes.error) {
      await logEdgeFunctionError({
        functionName: FN_NAME,
        requestId,
        error: coverRes.error,
        metadata: { source: "household_coverage", household: householdId },
      });
      issues.push("household_coverage_unreadable");
    } else {
      frozen = coverRes.data === false;
    }

    console.log(JSON.stringify({
      tag: "keel.household_merge.notices",
      user_id: userId,
      household_id: householdId,
      notices: result.notices.length,
      warnings: result.notices.filter((n) => n.merged !== null).length,
      skipped: result.skipped.length,
      held: result.held.length,
      frozen,
      quota_used: quota?.used ?? null,
      quota_limit: quota?.limit ?? null,
    }));

    return jsonResponse(req, {
      ok: true,
      household: { id: householdId, frozen },
      // ── L7/D11 — CE QU'IL RESTE CETTE SEMAINE ───────────────────────────
      // RENDU MÊME QUAND IL RESTE DE LA PLACE, et c'est délibéré: une clé qui
      // n'apparaît qu'au moment du refus ne se distingue pas d'un lot
      // débranché, et ce dépôt paie en boucle la garde construite puis
      // silencieusement débranchée. `null` ⇒ lecture ratée (voir `issues`),
      // pas « pas de plafond ».
      merge_quota: quota === null ? null : {
        used: quota.used,
        limit: quota.limit,
        remaining: quota.remaining,
        exhausted: quota.exhausted,
        week_start: quota.weekStart,
        resets_on: quota.resetsOn,
      },
      // LES PROPOSITIONS ET LES AVERTISSEMENTS, DANS LA MÊME LISTE, distingués
      // par `kind`. Deux listes auraient fait deux écrans, et D8 comme D10
      // demandent la même chose au maître: un geste sur une personne.
      notices: result.notices.map((n) => ({
        kind: n.kind,
        member_id: n.memberId,
        user_id: n.userId,
        display_name: n.displayName,
        // LE PLAN QU'UNE FUSION PRENDRAIT — pas « le dernier validé ». Une
        // bouche peut porter deux plans adjacents, et c'est celui qui croise le
        // plan du foyer que la fusion reprendra.
        plan: {
          id: n.planId,
          starts_on: n.planStartsOn,
          duration_days: n.planDurationDays,
          validated_at: n.validatedAt,
        },
        // ⚠️ CE QUE `keel_household_dismiss_merge_notice` ATTEND, et ce n'est
        // PAS `plan.validated_at`. Envoyer l'autre ferait refuser
        // `notice_moved_on` en boucle: « refuser » porte sur l'état des plans de
        // cette personne, donc sur sa validation la plus récente.
        dismiss_validated_at: n.dismissValidatedAt,
        // D16 mot pour mot. La phrase est calculée SERVEUR parce que ses trois
        // nombres viennent de l'arithmétique de la fusion; l'écran la traduit,
        // il ne la recompose pas.
        sentence: proposalSentence(n),
        mergeable: n.mergeable === null ? null : {
          window: {
            starts_on: n.mergeable.window.startsOn,
            duration_days: n.mergeable.window.durationDays,
          },
          // D1 — CE QUE LE GESTE RECOMPOSERAIT, à côté de ce qu'il reprend. Les
          // deux sont égaux dans le cas nominal; ils divergent quand le plan
          // personnel s'arrête avant la fin de la semaine du foyer.
          recomposed: {
            starts_on: n.mergeable.recomposed.startsOn,
            duration_days: n.mergeable.recomposed.durationDays,
          },
          intersection: {
            starts_on: n.mergeable.intersection.startsOn,
            duration_days: n.mergeable.intersection.durationDays,
          },
          pivot: n.mergeable.pivot,
          days_already_past: n.mergeable.daysAlreadyPast,
          into_plan_id: n.mergeable.intoPlanId,
        },
        mergeable_refusal: n.mergeableRefusal,
        // ⚠️ `household_plan_id` NOMME LA LIGNE QUE LA DÉFUSION RECOMPOSERA, et
        // `unmerge_window` ce qu'elle en refera. Sans eux, la proposition
        // parlait d'une reprise sans dire de quel plan — et deux plans du foyer
        // vivants peuvent la porter.
        merged: n.merged === null ? null : {
          plan_id: n.merged.planId,
          validated_at: n.merged.validatedAt,
          household_plan_id: n.merged.householdPlanId,
          unmerge_window: n.merged.unmergeWindow === null ? null : {
            starts_on: n.merged.unmergeWindow.startsOn,
            duration_days: n.merged.unmergeWindow.durationDays,
          },
        },
        exits: n.exits,
      })),
      // POURQUOI LES AUTRES BOUCHES N'ONT RIEN. Jamais un silence: sans cette
      // liste, « pourquoi Zoé n'apparaît-elle pas ? » n'a de réponse que dans
      // une base de production.
      skipped: result.skipped.map((s) => ({
        member_id: s.memberId,
        display_name: s.displayName,
        reason: s.reason,
      })),
      // CE QUE LA PROCHAINE COMPOSITION RE-REPRENDRA D'OFFICE (la fusion est
      // collante). L'écran en a besoin pour dire « ce plan cuisine aussi pour
      // Tom » sans relire la provenance.
      //
      // ⚠️ CHAQUE ENTRÉE PORTE SA PORTÉE, ET CE N'EST PAS UN ORNEMENT. Le
      // générateur ne relit `merged_from` que sur les plans qui MORDENT sur la
      // fenêtre qu'il recompose; annoncer une liste d'ids nus promettait donc
      // une reprise que toute composition d'une autre semaine n'allait pas
      // faire. `window` est la fenêtre du plan porteur: hors d'elle, la reprise
      // ne colle pas, et l'écran doit le dire plutôt que de le taire.
      held: result.held.map((h) => ({
        member_id: h.memberId,
        plan_id: h.planId,
        window: {
          starts_on: h.window.startsOn,
          duration_days: h.window.durationDays,
        },
      })),
      issues,
      request_id: requestId,
    });
  } catch (error) {
    await logEdgeFunctionError({
      functionName: FN_NAME,
      requestId,
      error,
      metadata: { source: "edge" },
    });
    return jsonResponse(req, {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      request_id: requestId,
    }, { status: 500 });
  }
});
