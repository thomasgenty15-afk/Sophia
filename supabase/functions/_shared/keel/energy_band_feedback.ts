/**
 * ═══════════════════════════════════════════════════════════════════════════
 * LOT B.7 — CE QUE LA PERSONNE PENSE DE LA FOURCHETTE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * L'accusé d'une photo rend maintenant une FOURCHETTE (`photoEnergyBand`),
 * asymétrique et ouverte vers le haut du montant exact du biais mesuré
 * (−26,6 %). Trois boutons demandent ce qu'elle en pense.
 *
 * ── POURQUOI TROIS ET PAS UN ──────────────────────────────────────────────
 *
 * Le plan d'origine en prévoyait DEUX: « c'est à peu près ça » et
 * « corriger ». Le second n'existe plus — `KEEL_KCAL_` a été désarmé le
 * 2026-09-07, parce que remplacer un fait déjà écrit par un bouton est
 * précisément la lane que ce chantier ferme.
 *
 * Restait donc un bouton unique, dont le seul effet aurait été de ne plus se
 * reproposer. La règle T1 de ce dépôt dit de ne pas écrire un champ que rien
 * ne consomme, et un tap qui ne nourrit que sa propre disparition en est un.
 *
 * Trois verdicts changent la nature du geste: la réponse CALIBRE la
 * fourchette au lieu de seulement la mesurer. « C'était plus » sur une bande
 * qui s'ouvre déjà vers le haut dit qu'elle ne s'ouvre pas assez; « c'était
 * moins » dit que le biais est sur-corrigé pour ce genre d'assiette. C'est la
 * seule information qu'on ne peut obtenir d'aucune autre source: une photo ne
 * montre pas l'huile de la poêle, et personne ne pèse son dîner.
 *
 * ── ⛔ CE QUE CE GESTE NE FAIT PAS, ET N'A PAS LE DROIT DE FAIRE ──────────
 *
 *   · IL NE CHANGE PAS LE CHIFFRE. `energy_estimate.kcal` et sa base restent
 *     ce que la photo a rendu. Un « ça a l'air juste » n'a RIEN mesuré, et
 *     promouvoir l'estimation en `declared_quantities` lui emprunterait une
 *     fiabilité (2,3 % de MAPE) que ce tap n'a jamais eue. C'est l'erreur que
 *     l'en-tête de `energy_correction.ts` corrigeait déjà à propos de R11.
 *   · IL NE TOUCHE À AUCUN PLAN. C'est une déclaration posée À CÔTÉ du fait,
 *     jamais une réécriture de ce fait ni d'une ligne composée.
 *   · IL NE REND AUCUN NOMBRE. Les trois libellés sont des mots; demander
 *     « combien ? » rouvrirait la correction par un autre nom.
 */

import { type LocalePackKey, localePackKey } from "./locale.ts";

/**
 * Neuvième vocabulaire vivant, disjoint de tous les autres.
 *
 * ⚠️ PAS `KEEL_ENERGYOK_` NI `KEEL_KCAL_OK_`. Le second partagerait `KEEL_KCAL`
 * avec le jeton de correction — désarmé mais TOUJOURS LISTÉ, parce que des
 * bulles en portent encore. C'est très exactement le piège `KEEL_WE` que
 * `weigh_in.ts` documente: deux lecteurs qui se décident par `startsWith`, et
 * le premier gagne en silence.
 */
export const ENERGY_BAND_TOKEN_PREFIX = "KEEL_BANDFB_";

/**
 * LES TROIS VERDICTS. Vocabulaire FERMÉ.
 *
 * ⚠️ `about` D'ABORD, ET C'EST L'ORDRE DES BOUTONS. Poser un désaccord en
 * premier suggère que le chiffre est douteux avant même qu'on l'ait lu.
 */
export const ENERGY_BAND_VERDICTS = ["about", "more", "less"] as const;
export type EnergyBandVerdict = (typeof ENERGY_BAND_VERDICTS)[number];

const TOKEN =
  /^KEEL_BANDFB_(about|more|less)\|([0-9a-fA-F-]{36})$/;

export function energyBandToken(
  verdict: EnergyBandVerdict,
  eventId: string,
): string {
  const id = String(eventId ?? "").trim();
  if (!/^[0-9a-fA-F-]{36}$/.test(id)) {
    throw new Error(
      `[keel/energy_band] eventId invalide: ${JSON.stringify(eventId)}`,
    );
  }
  return `${ENERGY_BAND_TOKEN_PREFIX}${verdict}|${id}`;
}

export interface EnergyBandTap {
  readonly verdict: EnergyBandVerdict;
  readonly eventId: string;
}

/** Lit un tap, ou rend `null` — le contrat de tous les lecteurs du dépôt. */
export function parseEnergyBandToken(raw: unknown): EnergyBandTap | null {
  const m = TOKEN.exec(String(raw ?? "").trim());
  if (!m) return null;
  return { verdict: m[1] as EnergyBandVerdict, eventId: m[2] };
}

const COPY: Record<LocalePackKey, {
  about: string;
  more: string;
  less: string;
  /** L'accusé, quand la déclaration EST écrite. */
  thanks: Record<EnergyBandVerdict, string>;
  /** Le même, quand rien n'a pu s'écrire: on ne prétend pas. */
  unwritten: string;
}> = {
  en: {
    about: "About right",
    more: "It was more",
    less: "It was less",
    thanks: {
      about: "Good to know — I'll keep reading photos the same way.",
      more:
        "Noted: more than that. Photo guesses run low, and yours runs lower still — I'll keep it in mind.",
      less:
        "Noted: less than that. I'll keep it in mind for your plates.",
    },
    unwritten:
      "I could not record that just now. It changes nothing about what is already logged.",
  },
  fr: {
    about: "À peu près ça",
    more: "C'était plus",
    less: "C'était moins",
    thanks: {
      about: "Bon à savoir — je continue à lire les photos de la même façon.",
      more:
        "C'est noté : plus que ça. Les estimations sur photo tirent vers le bas, et les tiennes encore plus — j'en tiens compte.",
      less:
        "C'est noté : moins que ça. J'en tiens compte pour tes assiettes.",
    },
    unwritten:
      "Je n'ai pas réussi à l'enregistrer à l'instant. Ça ne change rien à ce qui est déjà noté.",
  },
};

/**
 * Les trois boutons, dans l'ordre.
 *
 * ⛔ ILS N'EXISTENT QUE SOUS UNE FOURCHETTE. Sur un chiffre DÉCLARÉ
 * (`declared_quantities`), il n'y a rien à calibrer: la personne a donné le
 * nombre, lui demander s'il est juste serait lui demander de se relire.
 * L'appelant tient cette condition — ce module ne sait pas d'où vient le
 * chiffre, et c'est voulu: il rendrait sinon une quatrième lecture de la base.
 */
export function energyBandButtons(args: {
  locale: string;
  eventId: string;
}): { payload: string; label: string }[] {
  const copy = COPY[localePackKey(String(args.locale ?? ""))];
  return ENERGY_BAND_VERDICTS.map((v) => ({
    payload: energyBandToken(v, args.eventId),
    label: copy[v],
  }));
}

export function renderEnergyBandAck(args: {
  locale: string;
  verdict: EnergyBandVerdict;
  /** `false` quand rien n'a pu être écrit: l'accusé ne prétend alors pas. */
  written: boolean;
}): string {
  const copy = COPY[localePackKey(String(args.locale ?? ""))];
  return args.written ? copy.thanks[args.verdict] : copy.unwritten;
}

/** Exporté pour le harnais de parité: aucun rendu ne doit porter de chiffre. */
export const ENERGY_BAND_COPY_PACKS = Object.freeze(COPY);
