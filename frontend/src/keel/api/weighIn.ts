// FF-062 C2 — LE RAPPEL DE PESÉE, côté client.
//
// ── CE QUE CE MODULE EST, ET CE QU'IL N'EST PAS ────────────────────────────
// Il porte la RECONNAISSANCE du jeton, la DÉCISION de soumission, et la lecture
// du dernier poids. Il ne rend rien: le rendu vit dans `WeighInDialog`, et la
// décision est ici pour la même raison que `buildWeeklySubmission` — ce dépôt
// n'a pas de jsdom, donc une règle enfermée dans un composant n'a aucune
// épreuve à sa taille.
//
// ── LES BORNES SONT RECOPIÉES, ET LA COPIE EST GARDÉE ──────────────────────
// Le front est en Vite/TS et le back en Deno: aucun import n'est possible entre
// les deux runtimes. `weight_bounds.ts` porte l'original et
// `weight_bounds_test.ts` lit les copies du front sur le disque pour vérifier
// qu'elles n'ont pas dérivé. Celle-ci est la QUATRIÈME, et elle y est inscrite.
//
// ⚠️ ON NE LES IMPORTE PAS DE `bodyMeasures.ts`, ET CE N'EST PAS UN OUBLI.
// `/app/chat` ne déclare que les namespaces `chat`, `app` et `shell`
// (`catalog.ts`); `bodyMeasures.ts` atteint `plan.*`, et la couture des pages
// (`pageSeams.int.test.ts`) refuse — à raison — qu'un écran atteigne un
// vocabulaire qu'il n'a pas déclaré. Deux nombres recopiés et GARDÉS coûtent
// moins qu'un namespace de plus sur la page de conversation.

import { supabase } from "../../lib/supabase";

/** Poids minimal plausible, en kilogrammes. Copie gardée — voir l'en-tête. */
export const WEIGHT_KG_MIN = 25;

/** Poids maximal plausible, en kilogrammes. Copie gardée — voir l'en-tête. */
export const WEIGHT_KG_MAX = 400;

/** Le préfixe du jeton. Septième vocabulaire, disjoint des six autres. */
export const WEIGH_IN_TOKEN_PREFIX = "KEEL_WEIGHIN_";

/**
 * Le jeton du jour, frappé par l'ÉCRAN.
 *
 * ⚠️ POURQUOI LE FRONT A LE DROIT DE LE FABRIQUER. Le geste « mettre à jour
 * mon poids » du « + » ne répond à aucune bulle: il n'y a donc pas de jeton à
 * relire. Vérifié côté serveur avant de l'ajouter — `writeWeighInReply`
 * n'utilise `askedOn` que pour le JOURNAL, jamais comme garde: un jeton frappé
 * sans qu'aucune question ne soit partie s'écrit exactement comme un autre.
 *
 * ⛔ ET IL NE PORTE QUE LE JOUR. L'élève est identifié par son JWT, jamais par
 * le contenu d'un jeton qui a fait l'aller-retour par un client.
 */
export function weighInTokenFor(localDate: string): string {
  const date = String(localDate ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error(`weighInTokenFor: date invalide: ${JSON.stringify(localDate)}`);
  }
  return `${WEIGH_IN_TOKEN_PREFIX}${date}`;
}

/**
 * `true` si ce payload de bouton ouvre le formulaire de pesée.
 *
 * ⚠️ ANCRÉ AUX DEUX BOUTS, ET C'EST LE SEUL PIÈGE DE FORME DE CE LOT.
 * `KEEL_WEIGHIN_` et `KEEL_WEEKLY_` partagent `KEEL_WE`: un `startsWith`
 * ouvrirait le mauvais formulaire, et l'élève noterait son poids dans le point
 * du dimanche — ou l'inverse. Le miroir serveur (`parseWeighInToken`) porte la
 * même ancre, et `weighIn.int.test.ts` éprouve la disjonction dans les deux
 * sens.
 */
export function isWeighInToken(payload: string): boolean {
  return /^KEEL_WEIGHIN_\d{4}-\d{2}-\d{2}$/.test(String(payload ?? "").trim());
}

export type WeighInSubmissionError =
  /** Rien n'a été saisi. R8: valider un champ vide n'écrit AUCUNE ligne. */
  | { kind: "empty" }
  | { kind: "not_a_number" }
  | { kind: "out_of_range"; min: number; max: number };

export type WeighInSubmission =
  | { ok: true; values: { weight_kg: number } }
  | { ok: false; error: WeighInSubmissionError };

/**
 * Ce qui part quand l'élève valide — ou ce qui le refuse.
 *
 * ── HORS BORNES = REFUSÉ ET NOMMÉ, jamais ramené au bord ──────────────────
 * Un 500 kg ramené à 400 produit une donnée fausse qui a l'air vraie, et cette
 * donnée arme la ceinture de restriction. Le serveur applique déjà la même
 * règle (`writeWeighIn`); ici c'est pour que l'élève voie son erreur au lieu de
 * la subir en silence.
 *
 * ── LE CHAMP VIDE EST UNE RÉPONSE, PAS UNE ERREUR DE SAISIE ───────────────
 * C'est la moitié client de R8: le champ porte l'ancien poids en PLACEHOLDER
 * et n'est jamais pré-rempli, donc « valider sans rien taper » est un geste que
 * quelqu'un fait vraiment — il n'est pas monté sur la balance. On le refuse
 * avec son motif; on n'écrit surtout pas l'ancienne valeur.
 */
export function buildWeighInSubmission(raw: string): WeighInSubmission {
  const text = String(raw ?? "").trim();
  if (!text) return { ok: false, error: { kind: "empty" } };
  // La virgule décimale est ce que tape la moitié de l'Europe.
  const n = Number(text.replace(",", "."));
  if (!Number.isFinite(n)) return { ok: false, error: { kind: "not_a_number" } };
  if (n < WEIGHT_KG_MIN || n > WEIGHT_KG_MAX) {
    return {
      ok: false,
      error: { kind: "out_of_range", min: WEIGHT_KG_MIN, max: WEIGHT_KG_MAX },
    };
  }
  return { ok: true, values: { weight_kg: n } };
}

/**
 * Le dernier poids connu — pour le PLACEHOLDER, jamais pour la valeur.
 *
 * ⚠️ UNE PANNE REND `null`, ET LE FORMULAIRE S'OUVRE QUAND MÊME. Perdre le
 * placeholder coûte un repère; bloquer le dialogue coûte la pesée, c'est-à-dire
 * la seule chose que ce canal existe pour obtenir. C'est le sens inverse du
 * fail-closed serveur, et c'est délibéré: ici il n'y a aucun risque à ouvrir un
 * champ vide.
 */
export async function loadLastWeightKg(): Promise<number | null> {
  const { data, error } = await supabase
    .from("student_body_measures")
    .select("value_si")
    .eq("kind", "weight")
    .order("local_date", { ascending: false })
    .order("measured_at", { ascending: false })
    .limit(1);
  if (error) {
    console.warn("[keel/weighIn] dernier poids illisible", error.message);
    return null;
  }
  const row = ((data ?? [])[0] ?? null) as { value_si?: unknown } | null;
  const kg = Number(row?.value_si);
  // `Number(null)` vaut 0: un placeholder « 0 kg » est pire qu'un placeholder
  // absent. Même mode d'échec que `finiteEnergyNumber`, l'absence devenue une
  // valeur.
  return Number.isFinite(kg) && kg > 0 ? kg : null;
}
