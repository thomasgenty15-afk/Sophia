/**
 * PIVOT NUTRITION §3.3 — charger la doctrine PUBLIÉE du coach d'un élève.
 *
 * La coquille d'I/O de `doctrine.ts`, séparée pour la même raison que partout
 * ailleurs dans `_shared/keel/`: la décision est pure et testable, la lecture
 * ne l'est pas.
 *
 * ── L'ARBITRAGE DE PANNE, ET IL N'EST PAS SYMÉTRIQUE ─────────────────────
 * Que fait-on quand la doctrine ne se lit pas ?
 *
 *   Refuser de répondre  → on casse le produit pour l'élève à cause d'un
 *                          incident qui ne le concerne pas.
 *   Répondre normalement → l'agent redevient un assistant nutrition générique
 *                          et peut contredire le coach — précisément le seul
 *                          risque que §3.3 existe pour éliminer.
 *
 * Aucune des deux. Le troisième chemin: `reason_code` non nul + un bloc de
 * PRUDENCE injecté à la place de la doctrine (`FALLBACK_PRUDENCE_BLOCK`), qui
 * dit au modèle de rester factuel et de déférer au coach au lieu de
 * prescrire. On dégrade la richesse de la réponse, jamais son autorité.
 *
 * Corollaire IMPORTANT côté verrou: quand la doctrine est absente, la ceinture
 * de sortie ne peut évidemment pas vérifier des interdits qu'elle n'a pas.
 * Le verrou MÉDICAL, lui, ne dépend pas de cette lecture (il vient de
 * `student_safety_constraints`) et reste armé. C'est l'asymétrie voulue: la
 * sécurité de l'élève ne s'appuie jamais sur la disponibilité d'une table du
 * coach.
 */

import {
  type CoachDoctrine,
  compileDoctrineBlock,
  type CompiledDoctrine,
  parseCoachDoctrine,
} from "./doctrine.ts";

export const DOCTRINE_LOAD_REASONS = [
  "loaded",
  "no_coach",
  "no_published_doctrine",
  "load_failed",
  "empty_doctrine",
] as const;
export type DoctrineLoadReason = (typeof DOCTRINE_LOAD_REASONS)[number];

export interface LoadedDoctrine {
  doctrine: CoachDoctrine | null;
  compiled: CompiledDoctrine | null;
  coachId: string | null;
  reason: DoctrineLoadReason;
  /** Malformed entries dropped at parse time. Surfaced on the coach screen. */
  issues: string[];
}

/**
 * Injecté à la place du bloc doctrine quand il n'y en a pas.
 *
 * Ce n'est PAS un bloc vide: sans instruction, le modèle comble le vide avec
 * sa culture nutritionnelle générale, qui est exactement la voix que le
 * produit ne vend pas.
 */
export const FALLBACK_PRUDENCE_BLOCK = [
  "== NO COACH METHOD AVAILABLE THIS TURN ==",
  "",
  "You could not load this coach's method. Until it is available:",
  "- Do NOT give prescriptive nutrition advice, and do not invent a method.",
  "- Answer what is factual and already written in this student's protocol.",
  "- For anything the protocol does not settle, say it is the coach's call and",
  "  invite the student to ask them. Deferring is correct here; guessing is not.",
].join("\n");

/** Structural type: tests inject a fake, production injects a SupabaseClient. */
export type DoctrineDb = {
  from(table: string): {
    select(columns: string): {
      eq(column: string, value: string): {
        eq?(column: string, value: string): unknown;
        not?(column: string, op: string, value: unknown): unknown;
        order?(column: string, opts: unknown): unknown;
        limit?(n: number): unknown;
        maybeSingle?(): PromiseLike<{ data: unknown; error: unknown }>;
      };
    };
  };
};

/**
 * Résout le coach VIVANT de cet élève, puis sa doctrine publiée.
 *
 * Deux lectures et pas une jointure: `coach_clients` porte l'index unique
 * partiel "un seul coach vivant par élève" (§5, « élève de DEUX coachs interdit
 * v1 »), donc la première lecture est déjà censée être unique — et si elle ne
 * l'est plus, on veut le voir ici plutôt que de laisser une jointure en choisir
 * une au hasard.
 */
export async function loadPublishedDoctrine(
  db: unknown,
  studentUserId: string,
): Promise<LoadedDoctrine> {
  const empty = (reason: DoctrineLoadReason, coachId: string | null = null): LoadedDoctrine => ({
    doctrine: null,
    compiled: null,
    coachId,
    reason,
    issues: [],
  });

  const id = String(studentUserId ?? "").trim();
  if (!id) return empty("no_coach");

  // deno-lint-ignore no-explicit-any
  const client = db as any;

  let coachId: string | null = null;
  try {
    const { data, error } = await client
      .from("coach_clients")
      .select("coach_id")
      .eq("student_user_id", id)
      .eq("status", "active")
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    coachId = String((data as Record<string, unknown> | null)?.coach_id ?? "").trim() || null;
  } catch (error) {
    console.warn("[keel/doctrine] coach lookup failed", error);
    return empty("load_failed");
  }
  if (!coachId) return empty("no_coach");

  let row: Record<string, unknown> | null = null;
  try {
    const { data, error } = await client
      .from("coach_doctrines")
      .select(
        "coach_id, version, beliefs, forbidden, vocabulary, arbitrations, voice, " +
          "compiled_prompt, compiled_prompt_hash, content_locale, published_at",
      )
      .eq("coach_id", coachId)
      .not("published_at", "is", null)
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    row = (data ?? null) as Record<string, unknown> | null;
  } catch (error) {
    console.warn("[keel/doctrine] doctrine load failed", error);
    return empty("load_failed", coachId);
  }
  if (!row) return empty("no_published_doctrine", coachId);

  const { doctrine, issues } = parseCoachDoctrine(row);
  const compiled = compileDoctrineBlock(doctrine);

  return {
    doctrine,
    compiled,
    coachId,
    // A published-but-empty doctrine is a real state (the coach clicked
    // publish on a blank form) and it must not be reported as "loaded": the
    // prudence block is the right injection, exactly as if none existed.
    reason: compiled.isEmpty ? "empty_doctrine" : "loaded",
    issues,
  };
}

/**
 * Le bloc à injecter dans la couche `[DOCTRINE COACH]`, quel que soit le
 * résultat de la lecture. Un seul appel, jamais de `?? ""` chez l'appelant —
 * c'est là que le vide se remplirait de culture générale.
 */
export function doctrineBlockFor(loaded: LoadedDoctrine): string {
  if (loaded.reason === "loaded" && loaded.compiled) return loaded.compiled.text;
  return FALLBACK_PRUDENCE_BLOCK;
}
