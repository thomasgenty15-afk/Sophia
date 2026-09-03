/**
 * FF-062 R11 — CORRIGER LE CHIFFRE LE FAIT CHANGER DE BASE. PUR.
 *
 * Autorité: docs/fonctionnalites/conversation/FF-062-quand-sophia-parle-la-premiere.md
 * (R10-R11) · docs/keel/CALORIE_REVERSAL.md.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * CE QUE LA CORRECTION ACHÈTE, ET CE QU'ELLE N'ACHÈTE PAS
 * ══════════════════════════════════════════════════════════════════════════
 *
 * R11: *« une correction humaine transforme une estimation en déclaration »*.
 * C'est ce qui rend l'option « modifier » utile plutôt que cosmétique — un
 * chiffre qu'on peut corriger sans que rien ne change en aval est un champ de
 * décoration.
 *
 * ⚠️ 🔴 ET VOICI CE QUI EST **FAUX** DANS LA FORMULATION DE LA FICHE, écrit ici
 * parce que personne ne le retrouvera ailleurs. R11 ajoute *« et la mesure
 * gagne 24 points de fiabilité »*. Les 24 points sont l'écart mesuré entre
 * `photo_estimate` (−26,6 % de biais) et `declared_quantities` (2,3 % de MAPE)
 * — mais ces 2,3 % ont été mesurés sur des **quantités recalculées en grammes
 * par une table**, pas sur un être humain qui tape un nombre de calories pour
 * un plat de restaurant. Personne n'a mesuré CE geste-là.
 *
 * Ce que la correction établit avec certitude est plus modeste et suffit:
 * **le chiffre ne vient plus d'une photo**. Le biais de −26,6 %, lui,
 * disparaît — il est une propriété de l'estimation par pixels.
 *
 * Conséquences tenues par ce module:
 *   · la BASE devient `declared_quantities` — c'est la décision de la fiche, et
 *     c'est le seul jeton disponible pour « la personne a donné le nombre »;
 *   · la PHRASE rendue ne dit plus « d'après les quantités que tu m'as
 *     données » (elle n'en a donné aucune) mais « le chiffre que tu m'as
 *     donné ». Voir `ENERGY_BASIS_MARKERS`, corrigé le 2026-09-02;
 *   · **aucun chiffre de fiabilité n'est écrit nulle part**. Ni 2,3 %, ni 24
 *     points. Un nombre qu'on n'a pas mesuré ne s'affiche pas.
 *
 * PURE MODULE: ni base, ni horloge, ni aléatoire.
 */

import {
  ENERGY_BASIS_MARKERS,
  ENERGY_KCAL_MAX,
  ENERGY_KCAL_MIN,
  type EnergyEstimate,
} from "./meal_analysis.ts";
import { type LocalePackKey, localePackKey } from "./locale.ts";

/**
 * LE PRÉFIXE DU JETON — neuvième vocabulaire, disjoint des huit autres.
 *
 * C'est un jeton de FORMULAIRE (comme `KEEL_WEIGHIN_` et `KEEL_WEEKLY_`): le
 * front le reconnaît par sa forme et monte un dialogue à un champ. Un chiffre
 * ne se tape pas dans un bouton.
 */
export const ENERGY_FIX_TOKEN_PREFIX = "KEEL_KCAL_";

const ENERGY_FIX_TOKEN =
  /^KEEL_KCAL_([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$/;

/**
 * Le jeton de correction pour UN fait photo.
 *
 * ⚠️ IL PORTE L'ÉVÉNEMENT, ET RIEN D'AUTRE. Pas le chiffre courant (il serait
 * périmé au moment du tap, et surtout modifiable par le client), pas l'élève
 * (le JWT l'identifie côté serveur — un jeton qui porterait un identifiant
 * serait un identifiant modifiable désignant la ligne à écrire).
 */
export function energyFixToken(eventId: string): string {
  const id = String(eventId ?? "").trim();
  if (!/^[0-9a-fA-F-]{36}$/.test(id)) {
    throw new Error(
      `[keel/energy_correction] eventId n'est pas un uuid: ${JSON.stringify(eventId)}`,
    );
  }
  return `${ENERGY_FIX_TOKEN_PREFIX}${id}`;
}

/** L'événement que ce jeton nomme, ou `null` si ce n'en est pas un. */
export function parseEnergyFixToken(raw: unknown): string | null {
  const m = ENERGY_FIX_TOKEN.exec(String(raw ?? "").trim());
  return m ? m[1] : null;
}

export type EnergyCorrection =
  | { ok: true; estimate: EnergyEstimate }
  /** Rien n'a été saisi: on ne remplace pas un chiffre par du vide. */
  | { ok: false; reason: "empty" }
  | { ok: false; reason: "not_a_number" }
  | { ok: false; reason: "out_of_range"; min: number; max: number };

/**
 * Ce que la correction devient — ou pourquoi elle est refusée.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * LA BANDE DE CONFIANCE PASSE À `high`, ET C'EST LE SEUL ENDROIT OÙ ELLE MONTE
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `parseEnergyEstimate` ne rend jamais mieux que ce que le modèle a déclaré, et
 * défaut à `low`. Ici la personne a REGARDÉ le chiffre et l'a remplacé: ce
 * n'est plus une lecture d'image dont on doute, c'est une déclaration. La
 * bande dit la confiance dans l'ORIGINE du nombre, pas dans son exactitude —
 * et l'origine est maintenant certaine.
 *
 * ⛔ HORS BORNES = REFUSÉ ET NOMMÉ, jamais ramené au bord. Un 50 000 ramené à
 * 5 000 produirait une donnée fausse qui a l'air vraie, et elle remplacerait un
 * chiffre qui, lui, était au moins honnête sur son origine.
 *
 * ⚠️ LE VIDE EST UN REFUS, PAS UNE SUPPRESSION. « Modifier » puis valider à
 * blanc ne doit pas effacer l'estimation: la personne a ouvert un champ, pas
 * demandé le silence. Retirer un chiffre est un autre geste, et il n'existe pas.
 */
export function correctEnergy(raw: unknown): EnergyCorrection {
  const text = String(raw ?? "").trim();
  if (!text) return { ok: false, reason: "empty" };
  // La virgule décimale est ce que tape la moitié de l'Europe — même si un kcal
  // entier est le cas normal, refuser « 620,5 » serait un refus pour rien.
  const n = Number(text.replace(",", "."));
  if (!Number.isFinite(n)) return { ok: false, reason: "not_a_number" };
  const kcal = Math.round(n);
  if (kcal < ENERGY_KCAL_MIN || kcal > ENERGY_KCAL_MAX) {
    return {
      ok: false,
      reason: "out_of_range",
      min: ENERGY_KCAL_MIN,
      max: ENERGY_KCAL_MAX,
    };
  }
  return {
    ok: true,
    estimate: {
      kcal,
      // R11 — LA BASE CHANGE, ET C'EST TOUT L'OBJET DE CE MODULE.
      basis: "declared_quantities",
      confidence_band: "high",
    },
  };
}

// ---------------------------------------------------------------------------
// LES MOTS
// ---------------------------------------------------------------------------

/**
 * LE BOUTON, ET L'ACCUSÉ DE LA CORRECTION.
 *
 * ⚠️ L'ACCUSÉ REND LE CHIFFRE, ET C'EST L'INVERSE DE LA RÈGLE DE LA PESÉE.
 * `renderWeighInAck` accuse le geste et jamais la valeur, parce qu'un poids ne
 * doit pas être renvoyé à quelqu'un dont l'écran des mesures se retire sous
 * plancher. Ici, le chiffre vient d'être AFFICHÉ à la personne et elle vient de
 * le remplacer: le taire lui laisserait ignorer si sa correction a été prise.
 * Et il ne peut atteindre personne d'autre — la porte des quatre gardes s'est
 * déjà refermée à l'ingestion, donc un élève sous plancher n'a pas de chiffre à
 * corriger.
 *
 * ⛔ ET IL PORTE SA BASE, comme partout ailleurs (CALORIE_REVERSAL §5, couche
 * 4). « 750 kcal, c'est noté » serait un chiffre nu.
 */
const FIX_COPY: Record<LocalePackKey, {
  button: string;
  title: string;
  subtitle: string;
  field: string;
  submit: string;
  cancel: string;
  noted: (kcal: number, basis: string) => string;
  empty: string;
  notANumber: string;
  outOfRange: (min: number, max: number) => string;
  /** La correction est IRRECEVABLE — et ce n'est pas une panne. Voir `stale`. */
  stale: string;
  failed: string;
}> = {
  en: {
    button: "Change it",
    title: "The figure",
    subtitle: "Replace it with what you know.",
    field: "kcal",
    submit: "Save",
    cancel: "Leave it",
    noted: (kcal, basis) => `Noted: about ${kcal} kcal, ${basis}.`,
    empty: "Nothing entered, so I have left the figure as it was.",
    notANumber: "That should be a number.",
    outOfRange: (min, max) =>
      `That is outside what I can read as a meal (${min}-${max} kcal), so I have left the figure as it was.`,
    stale: "That figure is not open to changes any more — nothing was saved.",
    failed:
      "Something went wrong on my side and I couldn't change it. Sorry — could you try again?",
  },
  fr: {
    button: "Modifier",
    title: "Le chiffre",
    subtitle: "Remplace-le par ce que tu sais.",
    field: "kcal",
    submit: "Enregistrer",
    cancel: "Laisser",
    noted: (kcal, basis) => `C'est noté : environ ${kcal} kcal, ${basis}.`,
    empty: "Rien n'a été saisi, donc j'ai laissé le chiffre tel quel.",
    notANumber: "Ça doit être un nombre.",
    outOfRange: (min, max) =>
      `C'est en dehors de ce que je peux lire comme un repas (${min} à ${max} kcal), donc j'ai laissé le chiffre tel quel.`,
    stale: "Ce chiffre n'est plus modifiable — rien n'a été enregistré.",
    failed:
      "Quelque chose a mal tourné de mon côté et je n'ai pas pu le modifier. Désolée — tu peux réessayer ?",
  },
};

/** Le bouton à coller sous l'accusé photo, quand un chiffre y figure. */
export function energyFixButton(args: {
  locale: string;
  eventId: string;
}): { payload: string; label: string } {
  return {
    payload: energyFixToken(args.eventId),
    label: FIX_COPY[localePackKey(String(args.locale ?? ""))].button,
  };
}

export function renderEnergyFixAck(args: {
  locale: string;
  /**
   * ⚠️ LE VERDICT DE L'ÉCRIVAIN, PAS UNE UNION RECOPIÉE. `EnergyFixOutcome`
   * (côté I/O) porte deux issues que le module pur ne connaît pas — `stale` et
   * `failed`. Les nommer ici plutôt que d'importer l'autre type garde ce module
   * PUR; les ÉNUMÉRER à la main est ce qui a divergé quand `stale` est apparu,
   * et c'est le compilateur qui l'a dit.
   */
  outcome:
    | EnergyCorrection
    | { ok: false; reason: "stale" }
    | { ok: false; reason: "failed" };
}): string {
  const pack = localePackKey(String(args.locale ?? ""));
  const copy = FIX_COPY[pack];
  if (args.outcome.ok) {
    // ⛔ LA BASE VIENT DES MARQUEURS, JAMAIS RÉÉCRITE ICI. Une seconde
    // formulation de « d'où vient ce chiffre » divergerait de celle de
    // l'accusé photo, et la couche 4 du harnais s'accroche sur les marqueurs.
    return copy.noted(
      args.outcome.estimate.kcal,
      ENERGY_BASIS_MARKERS[pack][args.outcome.estimate.basis],
    );
  }
  switch (args.outcome.reason) {
    case "empty":
      return copy.empty;
    case "not_a_number":
      return copy.notANumber;
    case "out_of_range":
      return copy.outOfRange(args.outcome.min, args.outcome.max);
    case "stale":
      // ⛔ PAS « réessaie ». Aucun des trois états de `stale` ne changera.
      return copy.stale;
    case "failed":
      return copy.failed;
  }
}

export const ENERGY_FIX_COPY_PACKS = Object.freeze(FIX_COPY);
