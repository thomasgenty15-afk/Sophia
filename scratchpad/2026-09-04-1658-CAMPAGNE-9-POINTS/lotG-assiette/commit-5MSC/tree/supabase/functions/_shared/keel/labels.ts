// KEEL — accès aux packs de libellés, par locale.
//
// ── POURQUOI CE FICHIER EXISTE ─────────────────────────────────────────────
// `labelFor` vivait dans `labels.en.ts` avec un 3ᵉ paramètre OPTIONNEL
// (`localePack: LocalePack = EN_LABELS`). Les trois appelants de production ne
// le passaient pas — donc un pack français pouvait exister, être complet, être
// testé, et n'être servi nulle part. Le paramètre déclarait un axe que personne
// n'était obligé de brancher: la définition même d'une garde désarmée.
//
// Le déplacer ICI avec un 3ᵉ argument REQUIS est le mécanisme: les appelants
// cessent de compiler, le compilateur les énumère, et chacun doit dire d'où
// vient sa locale. `labels.en.ts` ne garde que ses données et ses types.

import { localePackKey } from "./locale.ts"
import { EN_LABELS, type LocalePack, type Vocab } from "./labels.en.ts"
import { FR_LABELS } from "./labels.fr.ts"

export type { LocalePack, Vocab }
export { EN_LABELS, FR_LABELS }

const PACKS: Record<"en" | "fr", LocalePack> = {
  en: EN_LABELS,
  fr: FR_LABELS,
}

/**
 * Le pack de libellés d'une locale. R7 par délégation: `localePackKey` jette
 * pour une langue qu'on n'a pas livrée, plutôt que de servir l'anglais en
 * silence à quelqu'un qui lit du français.
 */
export function localePackFor(locale: string): LocalePack {
  return PACKS[localePackKey(locale)]
}

/**
 * Le libellé d'affichage d'un jeton.
 *
 * `pack` est REQUIS. Un défaut à `EN_LABELS` rendrait l'anglais à tout appelant
 * qui oublie la question — et « oublier la question » est précisément l'état
 * dont ce module sort.
 *
 * R7: un vocab ou un jeton inconnu JETTE. Jamais `undefined`, jamais un repli
 * silencieux: deux normalisations qui divergent plus un drop silencieux font un
 * bug sans erreur nulle part.
 */
export function labelFor(
  vocab: Vocab,
  token: string,
  pack: LocalePack,
): string {
  const table = pack[vocab]
  if (!table) {
    throw new Error(`labelFor: unknown vocab "${vocab}" (R7: fail loudly)`)
  }
  const label = table[token]
  if (label === undefined) {
    throw new Error(
      `labelFor: unknown token "${token}" in vocab "${vocab}" (R7: fail loudly)`,
    )
  }
  return label
}

/** Raccourci: résout le pack depuis la locale, puis libelle. */
export function labelIn(
  vocab: Vocab,
  token: string,
  locale: string,
): string {
  return labelFor(vocab, token, localePackFor(locale))
}
