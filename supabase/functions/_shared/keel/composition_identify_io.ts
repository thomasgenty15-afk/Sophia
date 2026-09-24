/**
 * ⟳ 2026-09-24 — L'APPEL QUI RETROUVE UN ALIMENT, ET LA TABLE DES NOMS RETENUS.
 * Le côté IMPUR de `composition_identify.ts`.
 *
 * ── ⛔ LA RÈGLE DU SAS, TENUE ICI AUSSI ──────────────────────────────────
 * « Cet appel ne peut JAMAIS faire tomber le plan. » Aucune fonction de ce
 * fichier ne lève : un modèle en erreur, un délai dépassé, une sortie
 * illisible ou une base qui refuse l'écriture rendent une table vide, et
 * chaque ligne garde l'état qu'elle avait avant cet appel.
 *
 * ⚠️ UN SEUL APPEL PAR PLAN, et aucun quand tout se lit déjà : la table des
 * noms retenus répond d'abord, le modèle seulement pour ce qu'elle ignore.
 */

import { generateWithGemini } from "../gemini.ts";
import type { ComposablePredicate } from "./composition_contract.ts";
import type { PendingDbClient } from "./composition_fill_io.ts";
import {
  applyIdentifications,
  COMPOSITION_IDENTIFY_SYSTEM_PROMPT,
  forgetModelRefs,
  type IdentifiableLine,
  identifyCandidateLines,
  type IdentifyRequest,
  identifyRequestsFor,
  type IdentifyVerdict,
  identifyUserMessage,
  parseIdentifyAnswers,
} from "./composition_identify.ts";
import type { CompositionIndex } from "./food_composition.ts";
import { PLAN_SERVICE_TIER } from "./generation_model.ts";

/**
 * LE TEMPS QUE CET APPEL A LE DROIT DE PRENDRE.
 *
 * ⚠️ PLUS LONG QUE LE SAS (12 s), ET C'EST LA TAILLE DE L'ENTRÉE : la table
 * entière part avec les noms (~41 000 caractères, ~950 aliments). La sortie,
 * elle, reste de quelques lignes. Au-delà, chaque ligne garde son état d'avant
 * — le sas prend les noms, les codes refusés restent refusés et comptés.
 */
export const COMPOSITION_IDENTIFY_TIMEOUT_MS = 20_000;

/**
 * LE MODÈLE DE CET APPEL — réglable sans redéploiement, comme le sas.
 *
 * ⚠️ PAS LE PETIT MODÈLE DU SAS, ET C'EST MESURÉ. Décrire la composition d'un
 * aliment nommé (le sas) est une question fermée ; choisir LE même aliment
 * parmi ~950 lignes ne l'est pas. Au premier banc réel (2026-09-24, 10 noms),
 * `gpt-5.4-nano` a rendu « farine complète → wholemeal_bread » (du pain),
 * « lait écrémé → milk_semi » et « edamames surgelés → absent » alors que
 * `edamame` existe — trois fautes sur dix, dont deux qui pèsent un autre
 * aliment. Le défaut est le modèle retenu par ce banc ; voir la valeur.
 */
export const COMPOSITION_IDENTIFY_MODEL_DEFAULT = "gpt-5.4-mini";

function safeEnvGet(name: string): string | undefined {
  try {
    return Deno.env.get(name);
  } catch {
    return undefined;
  }
}

export function compositionIdentifyModel(): string {
  const override = (safeEnvGet("KEEL_COMPOSITION_IDENTIFY_MODEL") ?? "").trim();
  return override || COMPOSITION_IDENTIFY_MODEL_DEFAULT;
}

/** La table des noms retenus. Écrite par la RPC, lue ici, nulle part ailleurs. */
export const IDENTIFIED_NAMES_TABLE = "food_composition_identified_names";

/**
 * LES DÉCISIONS DÉJÀ PRISES pour ces noms.
 *
 * ⛔ SEULEMENT `active`. Un nom en `conflict` (deux plans, deux aliments) ou
 * `rejected` (une lecture humaine l'a jugé faux) repart à l'appel : on ne
 * resservira pas une identité contestée à tout le monde.
 *
 * ⚠️ LE SLUG RELU EST REVALIDÉ contre l'index du plan. Une ligne du
 * référentiel retirée de la composition depuis (`isComposable`) ne revient pas
 * par cette porte.
 *
 * Ne lève jamais ; `Map` vide sur tout échec.
 */
export async function loadIdentifiedNames(
  db: PendingDbClient,
  forms: readonly string[],
  index: CompositionIndex,
  isComposable: ComposablePredicate,
): Promise<Map<string, IdentifyVerdict>> {
  const out = new Map<string, IdentifyVerdict>();
  const wanted = [...new Set(forms.filter((f) => typeof f === "string" && f.length > 0))];
  if (wanted.length === 0 || typeof db.from !== "function") return out;
  try {
    const { data, error } = await db.from(IDENTIFIED_NAMES_TABLE)
      .select("form,slug,status")
      .in("form", wanted);
    if (error) {
      console.warn("[keel/composition_identify] identified names read refused", error);
      return out;
    }
    if (!Array.isArray(data)) return out;
    const asked = new Set(wanted);
    for (const row of data) {
      const r = row as Record<string, unknown>;
      const form = String(r?.form ?? "");
      if (!asked.has(form) || out.has(form) || r?.status !== "active") continue;
      const slug = typeof r?.slug === "string" ? r.slug : null;
      if (slug === null) {
        out.set(form, { kind: "absent" });
        continue;
      }
      const ref = index.bySlug.get(slug);
      if (ref === undefined || !isComposable(ref)) continue;
      out.set(form, { kind: "slug", slug });
    }
    return out;
  } catch (error) {
    console.warn("[keel/composition_identify] identified names read failed", error);
    return out;
  }
}

/**
 * LES DÉCISIONS DE CE PLAN, RETENUES POUR LES SUIVANTS.
 *
 * ⚠️ SEULEMENT CE QUE LE MODÈLE A DIT SUR CE PLAN-CI. Une décision relue dans
 * la table n'y retourne pas : `sightings` compte les plans où un modèle s'est
 * prononcé, pas les relectures — la même règle que le sas.
 *
 * Ne lève jamais.
 */
export async function recordIdentifiedNames(
  db: PendingDbClient,
  rows: readonly { form: string; slug: string | null }[],
): Promise<{ written: number; failed: boolean }> {
  if (rows.length === 0) return { written: 0, failed: false };
  try {
    const { error } = await db.rpc("record_food_composition_identifications", {
      p_rows: rows.map((r) => ({ form: r.form, slug: r.slug })),
    });
    if (error) {
      console.warn("[keel/composition_identify] identified names write refused", error);
      return { written: 0, failed: true };
    }
    return { written: rows.length, failed: false };
  } catch (error) {
    console.warn("[keel/composition_identify] identified names write failed", error);
    return { written: 0, failed: true };
  }
}

/**
 * UN APPEL, TOUS LES NOMS. Rend le texte brut, ou `null` sur tout échec.
 *
 * Même construction que `askCompositionFill` : température 0 (deux plans qui
 * rencontrent le même nom doivent obtenir le même aliment), palier tenté puis
 * lâché s'il dérange, et un plafond total qui arrête le minuteur.
 */
export async function askCompositionIdentify(
  requests: readonly IdentifyRequest[],
  candidateLines: readonly string[],
  meta: { source: string; requestId: string; userId: string },
): Promise<string | null> {
  if (requests.length === 0) return null;
  let timer: number | undefined;
  try {
    const appel = (tier: boolean) =>
      generateWithGemini(
        COMPOSITION_IDENTIFY_SYSTEM_PROMPT,
        identifyUserMessage(requests, candidateLines),
        0,
        true,
        [],
        "auto",
        {
          source: meta.source,
          requestId: meta.requestId,
          userId: meta.userId,
          model: compositionIdentifyModel(),
          httpTimeoutMs: COMPOSITION_IDENTIFY_TIMEOUT_MS,
          ...(tier ? { serviceTier: PLAN_SERVICE_TIER } : {}),
        },
      );
    const raced = await Promise.race([
      appel(true).catch((error) => {
        console.warn(JSON.stringify({
          tag: "keel.composition_identify.service_tier_dropped",
          source: meta.source,
          request_id: meta.requestId,
          error: error instanceof Error ? error.message : String(error),
        }));
        return appel(false);
      }),
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), COMPOSITION_IDENTIFY_TIMEOUT_MS + 3_000);
      }),
    ]);
    return typeof raced === "string" ? raced : null;
  } catch (error) {
    console.warn("[keel/composition_identify] identify call failed", error);
    return null;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/**
 * LE GESTE COMPLET, pour un plan : les noms lus, retenus, demandés, écrits.
 *
 * ⚠️ LES LIGNES SONT MODIFIÉES EN PLACE (`ref`, `refRefused`). L'appelant doit
 * repeser ensuite (`regramMeal`) : un identifiant neuf change les grammes.
 *
 * ⚠️ AUCUN APPEL QUAND IL N'Y A RIEN À RETROUVER, ni quand la table des noms
 * retenus répond à tout. L'étape « par le nom » tourne toujours : elle ne
 * coûte rien.
 */
export async function identifyPlanFoods(args: {
  db: PendingDbClient;
  index: CompositionIndex;
  isComposable: ComposablePredicate;
  lines: IdentifiableLine[];
  /**
   * ⛔ REQUIS. `true` : les identifiants écrits par le modèle sont oubliés et
   * chaque ligne est retrouvée par son NOM (`forgetModelRefs`), avec repli sur
   * l'identifiant du modèle quand rien d'autre n'a répondu. C'est le chemin de
   * production depuis le 2026-09-24.
   */
  forgetModelRefs: boolean;
  meta: { source: string; requestId: string; userId: string };
  /**
   * L'APPEL, INJECTABLE — défaut : `askCompositionIdentify`. Une couture de
   * banc, comme `repairPlanComposition.ask` : le défaut EST la production, et
   * l'omettre ne désarme rien.
   */
  ask?: (
    requests: readonly IdentifyRequest[],
    candidateLines: readonly string[],
    meta: { source: string; requestId: string; userId: string },
  ) => Promise<string | null>;
}): Promise<{ counts: Record<string, number> }> {
  const fallbackRefs = args.forgetModelRefs
    ? forgetModelRefs(args.lines)
    : new Map<IdentifiableLine, string>();
  const { requests, overCap } = identifyRequestsFor(args.index, args.lines);
  const cached = requests.length === 0
    ? new Map<string, IdentifyVerdict>()
    : await loadIdentifiedNames(
      args.db,
      requests.map((r) => r.term),
      args.index,
      args.isComposable,
    );
  const toAsk = requests.filter((r) => !cached.has(r.term));
  let asked = false;
  let callFailed = false;
  let parsed: ReturnType<typeof parseIdentifyAnswers> = {
    answers: new Map(),
    invented: 0,
    notComposable: 0,
  };
  if (toAsk.length > 0) {
    asked = true;
    const raw = await (args.ask ?? askCompositionIdentify)(
      toAsk,
      identifyCandidateLines(args.index, args.isComposable),
      args.meta,
    );
    callFailed = raw === null;
    parsed = parseIdentifyAnswers(raw, toAsk, args.index, args.isComposable);
  }
  const decisions = new Map<string, IdentifyVerdict>([...cached, ...parsed.answers]);
  const lineCounts = applyIdentifications({
    index: args.index,
    isComposable: args.isComposable,
    lines: args.lines,
    decisions,
    fallbackRefs,
  });
  const written = await recordIdentifiedNames(
    args.db,
    [...parsed.answers].map(([form, v]) => ({
      form,
      slug: v.kind === "slug" ? v.slug : null,
    })),
  );
  return {
    counts: {
      model_refs_forgotten: fallbackRefs.size,
      requested: requests.length,
      over_cap: overCap.length,
      reused: cached.size,
      asked: asked ? toAsk.length : 0,
      call_failed: callFailed ? 1 : 0,
      answered_slug: [...parsed.answers.values()].filter((v) => v.kind === "slug").length,
      answered_absent: [...parsed.answers.values()].filter((v) => v.kind === "absent").length,
      slug_invented: parsed.invented,
      slug_not_composable: parsed.notComposable,
      ...lineCounts,
      recorded: written.written,
      record_failed: written.failed ? 1 : 0,
    },
  };
}
