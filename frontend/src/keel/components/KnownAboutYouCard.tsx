import React from "react";

import {
  canProduce,
  groupBySubject,
  portionIndexFor,
  INDEX_MAX,
  type PortionIndex,
  HOUSEHOLD_SUBJECT,
  isNextPlanItemAlive,
  itemsInBlock,
  visibleDuplicates,
  preferenceSideOf,
  type KnownBlock,
  type KnownStore,
  KnownWriteError,
  type KnownWriteRefusal,
  type NextPlanEntry,
  opaqueStoreRefusal,
  type PortionAdjustMember,
  type RetainedItem,
  type RetainedKind,
  retainedItemFromLegacyNote,
  rewriteRetainedItem,
  subjectMemberId,
  subjectsForPortionAdjust,
} from "../api/retainedItems";
import type { FieldChange } from "../api/fieldChanges";
import { isFocusedLine } from "../api/memoryView";
import { MEMO_MAX_LINES, type MemoLine } from "../api/retainedItems";
import { formatWeekday } from "../i18n/format";
import { type MessageKey, t } from "../i18n/t";
import { Button } from "./ui/Button";
import { Card, SectionLabel } from "./ui/Card";
import { inputClass } from "./ui/Field";

/**
 * LA PHRASE D'UN INDICE DE PORTION, ou `null` au milieu.
 *
 * ⛔ AUCUN CHIFFRE. La personne a dit « un peu trop »; on lui rend un adverbe,
 * pas un pourcentage qu'elle n'a jamais demandé — même règle que le reste de
 * cette carte, où aucun gramme ne passe.
 *
 * ⟳ ELLE VENAIT DE `api/retainedItems.ts` (lot C). Elle y était la seule chose
 * à nommer des clés `known.*`, ce qui faisait ATTEINDRE ce namespace à toute
 * page important ce module — `/app/setup` et `/app/household` depuis le lot C.
 * Les faits vivent dans l'API, les mots dans la carte qui les rend.
 */
// ⛔ NON EXPORTÉE, et ce n'est pas une pudeur: `react-refresh/only-export-components`
// refuse qu'un fichier de composant exporte autre chose qu'un composant — le
// rechargement à chaud casse silencieusement sinon. Elle n'a qu'un appelant, et
// il est dans ce fichier.
function portionIndexLabelKey(index: PortionIndex): string | null {
  if (index.answers === 0 || index.position === 0) return null;
  const strong = Math.abs(index.position) >= INDEX_MAX;
  if (index.position < 0) {
    return strong ? "known.index.portions.down_strong" : "known.index.portions.down";
  }
  return strong ? "known.index.portions.up_strong" : "known.index.portions.up";
}

// « CE QUE SOPHIA SAIT DE TOI » — la surface de transparence, §6 de
// `docs/keel/NOMENCLATURE-MEMOIRE.md`.
//
// ── LE DÉFAUT QU'ELLE FERME ────────────────────────────────────────────────
// Ce que le produit retient d'une personne se voyait à UN seul endroit — une
// carte repliée en bas de `/app/plan` (`StudentWeekPlanPage:2329`) — et sous UNE
// seule forme: une liste plate de phrases. Trois conséquences mesurées: le
// générateur ne peut rien filtrer, l'écran ne peut rien ranger, et la promesse
// « rien d'opaque » dépend du hasard d'un défilement.
//
// ── LES TROIS CHOSES SUR CHAQUE LIGNE, ET PAS MOINS (§6) ──────────────────
// D'où elle vient (`source` EN CLAIR — « tu l'as écrit », « je l'ai retenu de
// mardi », « tu l'as coché au bilan »), un moyen de l'ÉDITER, un moyen de la
// SUPPRIMER. Une ligne qui n'a pas les trois est une ligne qu'on subit.
//
// ── ⚠️ LE PIÈGE QUE CETTE CARTE DOIT TENIR (contrat de phase 0 §2.2) ───────
// La matrice mord AUSSI À LA LECTURE. Déplacer une ligne vers une famille que
// son producteur n'a pas le droit d'écrire l'écrirait sans erreur et la ferait
// DISPARAÎTRE au chargement suivant. `rewriteRetainedItem` la re-signe alors
// `source: "written"` + `item: ""`; cette carte ne fait que l'appeler, et ne
// réimplémente PAS la règle.
//
// ⚠️ DEPUIS LE LOT M1, ÇA VAUT POUR **TOUTE** ÉDITION D'UNE LIGNE DU MEMORIZER.
// `canProduce("conversation", …)` est faux pour les huit familles: le chat ne
// produit plus rien. Une ligne « je l'ai retenu de mardi » que la personne
// édite change donc de main et devient « tu l'as écrit » — ce qui est vrai:
// elle vient de la reprendre à son compte. Elle reste LUE tant qu'elle n'est
// pas éditée (`canHold`), sans quoi le retrait du producteur effacerait son
// passé au lieu de fermer son avenir.
//
// ── ⛔ CE QUI N'ARRIVE JAMAIS ICI ─────────────────────────────────────────
// Aucun gramme, aucune calorie. La personne dit « trop gros », pas « −80 g » —
// c'est l'enveloppe qui traduit, en aval, là où le plancher TCA s'applique.
// Et rien de `sensitive` ni de `safety`: une allergie a sa table
// (`student_safety_constraints`), synchrone et sans ranking, et le filtre est
// posé DANS la requête des propositions, pas à l'affichage.
//
// ── CE QUE CETTE CARTE NE PROMET PAS ──────────────────────────────────────
// Le lot 1C a livré le routage: les six familles atteignent les trois
// générateurs, donc une ligne affichée ici est réellement servie. UNE exception,
// nommée sur la section concernée: `portion.adjust` n'atteint pas encore
// l'enveloppe. On l'écrit sur l'écran plutôt que de laisser croire.

/**
 * ⟳ LOT D — LES SIX SECTIONS PAR FAMILLE SONT DEVENUES CINQ BLOCS PAR
 * DESTINATION. `no_more` et `again` sont maintenant les DEUX LISTES d'un seul
 * bloc (une préparation est une préférence); `portions`, `rhythm` et `kitchen`
 * sont fondus dans « Réglages ajustés », la seule face visible de la
 * destination ②; `next_week` devient l'encart, qui meurt au prochain plan
 * VALIDÉ et non plus au calendrier.
 */
const BLOCK_TITLE: Readonly<Record<KnownBlock, MessageKey>> = {
  preferences: "known.block.preferences.title",
  notes: "known.block.notes.title",
  settings: "known.block.settings.title",
  next_plan: "known.block.next_plan.title",
  legacy: "known.legacy.title",
};

const BLOCK_INTRO: Readonly<Record<KnownBlock, MessageKey>> = {
  preferences: "known.block.preferences.intro",
  notes: "known.block.notes.intro",
  settings: "known.block.settings.intro",
  next_plan: "known.block.next_plan.intro",
  legacy: "known.legacy.intro",
};

const BLOCK_EMPTY: Readonly<Record<KnownBlock, MessageKey>> = {
  preferences: "known.block.preferences.empty",
  notes: "known.block.notes.empty",
  settings: "known.block.settings.empty",
  next_plan: "known.block.next_plan.empty",
  legacy: "known.legacy.empty",
};

/** Les deux listes du bloc ①, dans l'ordre de lecture. */
const PREFERENCE_SIDE_TITLE = {
  no_more: "known.section.no_more.title",
  again: "known.section.again.title",
} as const;

/**
 * LE NOM DU CHAMP, TEL QUE LA PERSONNE LE LIT DANS SES RÉGLAGES — lot M5.
 *
 * ⛔ LE MÊME MOT DES DEUX CÔTÉS. Le fil dit « ce qui vient de changer »; si le
 * champ y porte un autre nom que dans l'écran de réglages, la personne ne peut
 * pas faire le lien — et le fil devient une notification sur quelque chose
 * qu'elle ne sait pas retrouver.
 */
const FIELD_TITLE: Readonly<Record<FieldChange["field"], MessageKey>> = {
  cook_days: "known.field.cook_days",
  cooking_time_min: "known.field.cooking_time_min",
  budget_amount: "known.field.budget_amount",
  recipe_difficulty: "known.field.recipe_difficulty",
  variety: "known.field.variety",
  eating_rhythm: "known.field.eating_rhythm",
};

/**
 * UNE VALEUR DE CHAMP, LISIBLE.
 *
 * ⛔ `null` DEVIENT « rien », PAS « null » NI « 0 ». Une valeur absente veut
 * dire « ce n'était pas renseigné », et l'afficher comme un zéro ferait croire
 * à une déclaration que la personne n'a jamais faite — la même distinction que
 * `undoFieldChange` tient en RETIRANT la clé.
 */
function showFieldValue(value: unknown): string {
  if (value === null || value === undefined) return t("known.field.unset");
  if (Array.isArray(value)) {
    return value.length === 0
      ? t("known.field.unset")
      : value.map((entry) => String(entry)).join(", ");
  }
  return String(value);
}

/**
 * ⚠️ LES LIBELLÉS DE MOMENT VIENNENT DE `slot.*`, PAS D'UN CATALOGUE LOCAL.
 * Le dépôt a déjà payé « Morning snack » ici et « Mid-morning » dans la grille —
 * deux mots pour le même créneau se lisent comme deux créneaux. Les clés sont
 * écrites en LITTÉRAL (et pas composées) pour que le scanner de coutures les
 * voie: une clé fabriquée par concaténation est invisible à toute analyse
 * statique.
 */
const OCCASION_KEY: Readonly<Record<string, MessageKey>> = {
  breakfast: "slot.breakfast",
  snack_am: "slot.snack_am",
  lunch: "slot.lunch",
  snack_pm: "slot.snack_pm",
  dinner: "slot.dinner",
  before_bed: "slot.before_bed",
};

/** Même raison que ci-dessus: les jours sont l'atome `day.long.*`. */
const DAY_KEY: Readonly<Record<string, MessageKey>> = {
  mon: "day.long.mon",
  tue: "day.long.tue",
  wed: "day.long.wed",
  thu: "day.long.thu",
  fri: "day.long.fri",
  sat: "day.long.sat",
  sun: "day.long.sun",
};

const KIND_KEY: Readonly<Record<RetainedKind, MessageKey>> = {
  "food.exclude": "known.kind.food_exclude",
  "food.prefer": "known.kind.food_prefer",
  "method.avoid": "known.kind.method_avoid",
  "method.prefer": "known.kind.method_prefer",
  "portion.adjust": "known.kind.portion_adjust",
  "rhythm.set": "known.kind.rhythm_set",
  "logistics.set": "known.kind.logistics_set",
  craving: "known.kind.craving",
};

/**
 * LES FAMILLES VERS LESQUELLES LA PERSONNE PEUT DÉPLACER UNE LIGNE.
 *
 * ⚠️ `portion.adjust` EN FAIT PARTIE, ET C'EST TOUT LE POINT: c'est la seule
 * famille interdite au memorizer, donc la seule qui déclenche la re-signature
 * du §2.2. La retirer d'ici rendrait le piège inatteignable — et une garde
 * qu'aucun geste n'atteint est une garde qu'on croit avoir.
 *
 * ⛔ `rhythm.set` ET `logistics.set` N'Y SONT PAS, et ce n'est pas un oubli:
 * les deux portent une `value` STRUCTURÉE qu'une phrase libre ne contient pas.
 * Transformer « je saute souvent le petit-déj » en `rhythm.set` demanderait de
 * DEVINER l'occasion — et ce dépôt porte la cicatrice chiffrée de ce geste
 * (« laitue » ≠ « lait », 12 faux positifs sur 12). Une ligne DÉJÀ de ces
 * familles reste éditable chez elle; elle ne se fabrique pas ici.
 *
 * ⛔ `craving` non plus: il vit dans l'autre magasin, avec son ancre de semaine.
 * L'offrir ici écrirait une envie sans date d'expiration.
 */
const MOVABLE_KINDS: readonly RetainedKind[] = [
  "food.exclude",
  "food.prefer",
  "method.avoid",
  "method.prefer",
  "portion.adjust",
];

/**
 * ⚠️ CHAQUE REFUS A SA PHRASE, ET `stale_snapshot` N'EST PLUS UN FOURRE-TOUT.
 * Sa copie affirme l'existence d'un TIERS (« quelque chose a changé ici pendant
 * que tu modifiais »): elle ne doit sortir que quand la RPC l'a MESURÉ. Un
 * réseau coupé, un 500, un refus RLS disent `write_failed` — l'inconnu, nommé.
 *
 * ⛔ LA TABLE EST EXHAUSTIVE PAR LE TYPE (`Record<KnownWriteRefusal, …>`): un
 * refus ajouté au socle sans sa phrase ne compile plus. Un `Record<string, …>`
 * l'aurait laissé tomber sur le message générique, en silence.
 */
const REFUSAL_KEY: Readonly<Record<KnownWriteRefusal, MessageKey>> = {
  no_user: "known.error.no_user",
  no_goal_row: "known.error.no_goal_row",
  bad_items: "known.error.bad_items",
  bad_next_plan: "known.error.bad_items",
  bad_notes: "known.error.bad_items",
  stale_snapshot: "known.error.stale_snapshot",
  no_write_port: "known.error.no_write_port",
  opaque_store: "known.error.opaque_store",
  write_failed: "known.error.write_failed",
};

function refusalMessage(error: unknown): string {
  if (error instanceof KnownWriteError) {
    const key = REFUSAL_KEY[error.refusal];
    if (key) return t(key);
  }
  return t("known.error.generic");
}

// ---------------------------------------------------------------------------

export interface KnownAboutYouCardProps {
  store: KnownStore;
  /** `member_id` → prénom. ⛔ Jamais l'inverse: la clé est l'id, pas le nom. */
  members: ReadonlyMap<string, string>;
  /** Les bouches avec leur état d'âge, pour LE CONSTAT des portions. */
  roster: readonly PortionAdjustMember[];
  /** `YYYY-MM-DD`, le jour LOCAL de la personne. Ce composant ne lit pas l'heure. */
  today: string;
  /**
   * LE BLOC SUR LEQUEL ON ARRIVE, quand on arrive d'une bulle du chat.
   *
   * ⚠️ `null` EST LE CAS NORMAL — quelqu'un qui ouvre la page par le menu
   * n'arrive de nulle part. Ce n'est pas une sélection: rien n'est masqué, la
   * page défile simplement jusque-là.
   */
  focus?: KnownBlock | null;
  /**
   * Le jour de la ligne dont la bulle parlait, pour la SURLIGNER.
   *
   * ⛔ UN SURLIGNAGE, JAMAIS UN FILTRE. Réduire l'affichage aux lignes de ce
   * jour ferait disparaître tout le reste de la mémoire au moment précis où la
   * personne vient vérifier ce qu'on en sait — l'inverse de la promesse de cet
   * écran.
   */
  focusAt?: string | null;
  /**
   * ⟳ 2026-09-05 — Les TEXTES des lignes que la bulle a écrites. Quand il y en
   * a, seules ces lignes s'allument; `focusAt` ne sert plus que de repli pour
   * une bulle qui ne les porte pas. Voir `isFocusedLine`.
   */
  focusLines?: readonly string[] | null;
  onSave: (next: {
    items: readonly RetainedItem[];
    nextPlan: readonly NextPlanEntry[];
    notes:
      | { legacyNotes: readonly string[]; legacyOrigin: KnownStore["legacyOrigin"] }
      | null;
  }) => Promise<void>;
  /**
   * ── LOT M5 · LES CHAMPS QUE L'IA A CHANGÉS ────────────────────────────────
   *
   * ⛔ CE N'EST PAS UN MAGASIN DE PLUS, C'EST LE JOURNAL DES ÉCRITURES DANS LES
   * CHAMPS QUE LA PERSONNE VOIT DÉJÀ. Depuis M5, le bilan ne range plus
   * `cooking_time_min` à part: il CHANGE le réglage. Avant, il n'écrivait rien
   * et les générateurs posaient la valeur en mémoire au moment de composer — la
   * personne lisait 45 min dans ses réglages et son plan était fait sur 30,
   * sans qu'un écran le dise et sans qu'elle puisse le défaire.
   *
   * ⚠️ SANS CE FIL, L'ÉCRITURE SERAIT PIRE QUE LE CORRECTIF MUET: le réglage
   * changerait pour de bon, et la personne ne saurait toujours pas pourquoi.
   * C'est la contrepartie qui rend l'écriture acceptable, pas un ornement.
   */
  fieldChanges: readonly FieldChange[];
  /**
   * ── LOT M4 · LE MÉMO ──────────────────────────────────────────────────────
   * Cinq lignes au plus, pour ce qu'aucune famille ne porte et qu'aucun indice
   * ne mesure. ⛔ REQUIS, jamais optionnel: un mémo qu'un appelant oublierait
   * de passer redeviendrait le champ caché que ce lot existe pour empêcher, et
   * rien ne rougirait.
   */
  memo: readonly MemoLine[];
  /** Retire la ligne n° `index`. Par POSITION, jamais par texte. */
  onRemoveMemoLine: (index: number) => Promise<void>;
  /** Défaire l'entrée n° `index`. Le champ revient à sa valeur d'AVANT. */
  onUndoFieldChange: (index: number) => Promise<void>;
}

/** Quelle ligne est en cours d'édition. `null` = aucune. */
type Editing =
  | { readonly at: "item"; readonly index: number }
  | { readonly at: "note"; readonly text: string }
  | null;

export default function KnownAboutYouCard(props: KnownAboutYouCardProps) {
  const { store, members, roster, today, onSave } = props;
  const { fieldChanges, onUndoFieldChange } = props;
  const { memo, onRemoveMemoLine } = props;

  const [editing, setEditing] = React.useState<Editing>(null);
  const [draftText, setDraftText] = React.useState("");
  const [draftKind, setDraftKind] = React.useState<RetainedKind | "">("");
  const [draftDirection, setDraftDirection] = React.useState<"down" | "up">("down");
  const [draftMagnitude, setDraftMagnitude] = React.useState<"slight" | "clear">(
    "slight",
  );
  const [busy, setBusy] = React.useState(false);
  /**
   * ⚠️ L'ERREUR EST RENDUE LÀ OÙ LE GESTE A EU LIEU, et c'est une cicatrice
   * nommée du dépôt: un refus affiché loin du bouton se lit comme un bouton
   * mort (trois fois dans `SetupPage`). D'où la clé: la ligne concernée.
   */
  const [error, setError] = React.useState<{ key: string; message: string } | null>(
    null,
  );

  const closeEdit = () => {
    setEditing(null);
    setDraftText("");
    setDraftKind("");
  };

  async function commit(
    key: string,
    next: Parameters<KnownAboutYouCardProps["onSave"]>[0],
  ) {
    setBusy(true);
    setError(null);
    try {
      await onSave(next);
      closeEdit();
    } catch (e) {
      setError({ key, message: refusalMessage(e) });
    } finally {
      setBusy(false);
    }
  }

  /**
   * ⚠️ MÊME PATRON QUE `commit`, ET MÊME RAISON: l'erreur est rendue LÀ OÙ LE
   * GESTE A EU LIEU. Un refus affiché loin du bouton se lit comme un bouton
   * mort — cicatrice nommée du dépôt, trois fois dans `SetupPage`.
   */
  /** ⚠️ MÊME PATRON QUE `commitUndo`: l'erreur est rendue LÀ OÙ LE GESTE A EU LIEU. */
  async function commitMemoRemove(key: string, index: number) {
    setBusy(true);
    setError(null);
    try {
      await onRemoveMemoLine(index);
    } catch (e) {
      setError({ key, message: refusalMessage(e) });
    } finally {
      setBusy(false);
    }
  }

  async function commitUndo(key: string, index: number) {
    setBusy(true);
    setError(null);
    try {
      await onUndoFieldChange(index);
    } catch (e) {
      setError({ key, message: refusalMessage(e) });
    } finally {
      setBusy(false);
    }
  }

  // ── LES GESTES SUR UNE LIGNE RANGÉE ──────────────────────────────────────

  const removeItem = (index: number) =>
    commit(`item:${index}`, {
      items: store.items.filter((_, i) => i !== index),
      nextPlan: store.nextPlan,
      notes: null,
    });

  const saveItem = (index: number) => {
    const current = store.items[index];
    const kind = (draftKind || current.kind) as RetainedKind;
    const value = kind === "portion.adjust"
      ? { direction: draftDirection, magnitude: draftMagnitude }
      : kind === current.kind
      ? current.value
      : null;
    // ⚠️ LA RÈGLE VIT DANS `rewriteRetainedItem`, PAS ICI. C'est elle qui
    // re-signe `written` / `item: ""` quand la famille visée est interdite au
    // producteur d'origine — la réimplémenter ici ferait deux versions d'une
    // règle dont la seconde divergerait en silence.
    const rewritten = rewriteRetainedItem(
      current,
      { text: draftText, kind, subject: current.subject, value },
      today,
    );
    if (!rewritten) {
      // `null` est un REFUS, jamais un repli. Il se dit à l'endroit du geste.
      setError({ key: `item:${index}`, message: t("known.error.unreadable") });
      return;
    }
    return commit(`item:${index}`, {
      items: store.items.map((entry, i) => (i === index ? rewritten : entry)),
      nextPlan: store.nextPlan,
      notes: null,
    });
  };

  // ── LES GESTES SUR UNE ANCIENNE NOTE (§7) ────────────────────────────────

  const removeNote = (text: string) =>
    commit(`note:${text}`, {
      items: store.items,
      nextPlan: store.nextPlan,
      notes: {
        legacyNotes: store.legacyNotes.filter((n) => n !== text),
        legacyOrigin: store.legacyOrigin,
      },
    });

  const saveNote = (text: string) => {
    const typed = draftText.trim();
    if (!typed) return removeNote(text);
    // ⛔ AUCUNE INFÉRENCE RÉTROACTIVE. Sans famille choisie, la note reste une
    // note: on ne devine pas ce qu'une phrase plate voulait dire.
    if (!draftKind) {
      return commit(`note:${text}`, {
        items: store.items,
        nextPlan: store.nextPlan,
        notes: {
          legacyNotes: store.legacyNotes.map((n) => (n === text ? typed : n)),
          legacyOrigin: store.legacyOrigin,
        },
      });
    }
    const value = draftKind === "portion.adjust"
      ? { direction: draftDirection, magnitude: draftMagnitude }
      : null;
    const promoted = retainedItemFromLegacyNote({
      text: typed,
      kind: draftKind,
      // ⛔ Le défaut est `household` — « tout le monde à table » — et la personne
      // n'a nommé personne en tapant une phrase. Lui attribuer une bouche ici
      // serait exactement l'inférence que l'axe 3 interdit.
      subject: HOUSEHOLD_SUBJECT,
      value,
      today,
    });
    if (!promoted) {
      setError({ key: `note:${text}`, message: t("known.error.unreadable") });
      return;
    }
    // ⚠️ LES DEUX MOITIÉS PARTENT ENSEMBLE: retirer la phrase puis ajouter la
    // ligne en deux écritures laisserait une fenêtre où la personne a perdu sa
    // note sans avoir gagné sa ligne.
    return commit(`note:${text}`, {
      items: [...store.items, promoted],
      nextPlan: store.nextPlan,
      notes: {
        legacyNotes: store.legacyNotes.filter((n) => n !== text),
        legacyOrigin: store.legacyOrigin,
      },
    });
  };

  // ── LES MORCEAUX DE RENDU ────────────────────────────────────────────────

  const nameOf = (subject: string): string => {
    if (subject === HOUSEHOLD_SUBJECT) return t("known.subject.household");
    const id = subjectMemberId(subject as RetainedItem["subject"]);
    const name = id ? members.get(id) : undefined;
    // Une bouche partie du foyer garde son id et perd son nom. Le dire vaut
    // mieux que d'afficher un uuid, et mieux que de faire disparaître la ligne.
    return name ?? t("known.subject.gone");
  };

  const sourceLine = (item: RetainedItem): string => {
    switch (item.source) {
      case "written":
        return t("known.source.written");
      case "conversation":
        // « je l'ai retenu de mardi ». Le jour vient de `at`, qui est le jour où
        // la personne l'a DIT, dans SA journée — jamais reprojeté en UTC.
        return t("known.source.conversation", {
          day: formatWeekday(item.at, { long: true }),
        });
      case "questionnaire":
        return t("known.source.questionnaire");
      case "draft_note":
        return t("known.source.draft_note");
    }
  };

  /**
   * ⛔ LA CITATION — LOT M2. Ce qui rend « Enlever » décidable.
   *
   * ── SANS ELLE, « ENLEVER » EST UN PARI ────────────────────────────────
   * Une ligne qui dit *« Poulet — aliments évités »* et rien d'autre pose une
   * question à laquelle la personne ne peut pas répondre: enlever, c'est
   * peut-être défaire une erreur du produit, peut-être perdre une chose
   * qu'elle a vraiment demandée trois semaines plus tôt. Devant ce doute, on
   * ne touche à rien — et le magasin ne décroît jamais. C'est le mécanisme de
   * la boule de neige que ce chantier existe pour arrêter.
   *
   * ⚠️ ET C'EST AUSSI LA TRAÇABILITÉ, GRATUITEMENT: « pourquoi il n'y a pas de
   * poulet ? » se répond en montrant cet écran.
   *
   * ⛔ ELLE S'ABSTIENT PLUTÔT QUE D'INVENTER. `quote === null` a deux causes
   * légitimes — `written` (le texte EST sa phrase) et les lignes d'avant M2 —
   * et dans les deux cas on ne rend RIEN. Fabriquer une cause plausible serait
   * exactement le mensonge que ce lot ferme.
   */
  const quoteLine = (item: RetainedItem): string | null => {
    const quote = String(item.quote ?? "").trim();
    if (!quote) return null;
    return t("known.quote", { quote });
  };

  /** La `value` en mots. ⛔ Jamais un nombre pour une portion. */
  const detailLine = (item: RetainedItem): string | null => {
    if (item.kind === "portion.adjust") {
      const key: MessageKey = item.value.direction === "down"
        ? item.value.magnitude === "slight"
          ? "known.portion.down_slight"
          : "known.portion.down_clear"
        : item.value.magnitude === "slight"
        ? "known.portion.up_slight"
        : "known.portion.up_clear";
      return t(key);
    }
    if (item.kind === "rhythm.set") {
      const occasion = t(OCCASION_KEY[item.value.occasion]);
      return t(item.value.present ? "known.rhythm.present" : "known.rhythm.absent", {
        occasion,
      });
    }
    if (item.kind === "logistics.set") {
      switch (item.value.field) {
        case "cook_days":
          return t("known.logistics.cook_days", {
            days: item.value.value.map((d) => t(DAY_KEY[d] ?? "day.long.mon"))
              .join(", "),
          });
        case "cooking_time_min":
          return t("known.logistics.cooking_time_min", { n: item.value.value });
        case "recipe_difficulty":
          return t("known.logistics.recipe_difficulty", {
            level: t(
              item.value.value === "simple"
                ? "known.difficulty.simple"
                : item.value.value === "normal"
                ? "known.difficulty.normal"
                : "known.difficulty.keen",
            ),
          });
        case "variety":
          return t("known.logistics.variety", {
            level: t(
              item.value.value === "repeat"
                ? "known.variety.repeat"
                : item.value.value === "some"
                ? "known.variety.some"
                : "known.variety.varied",
            ),
          });
        case "budget_amount":
          return t("known.logistics.budget_amount", { amount: item.value.value });
      }
    }
    return null;
  };

  /**
   * LE CONSTAT DE L'EXCLUSION — la nomenclature l'exige en toutes lettres:
   * « le mineur est simplement exclu de l'ajustement; rien n'échoue, ET LE
   * CONSTAT LE DIT ». Ici, le constat EST l'écran.
   */
  const exclusionLine = (item: RetainedItem): string | null => {
    if (item.kind !== "portion.adjust") return null;
    const audience = subjectsForPortionAdjust(item, roster);
    if (audience.excluded.length === 0) return null;
    const gone = audience.excluded.filter((e) => e.reason === "not_in_household");
    if (gone.length === audience.excluded.length) {
      return t("known.portion.not_for_gone");
    }
    const names = audience.excluded
      .filter((e) => e.reason !== "not_in_household")
      .map((e) => members.get(e.memberId) ?? t("known.subject.gone"))
      .join(", ");
    return t("known.portion.not_for", { names });
  };

  /**
   * ⚠️ CE QUE CET ÉDITEUR NE SAIT PAS ÉCRIRE, ET QUI SE DIT SUR L'ÉCRAN.
   * Sur `rhythm.set` et `logistics.set`, seul le TEXTE est éditable: la `value`
   * structurée (l'occasion, les jours, le nombre) se règle dans son écran à
   * elle. Sans cette phrase, la personne réécrit sa ligne et voit le détail en
   * dessous continuer de dire autre chose — deux vérités pour une ligne, sur
   * l'écran dont la promesse est « rien d'opaque ». Le dire est le minimum;
   * rendre la `value` éditable ici est le mieux, et ce n'est pas fait.
   */
  const detailIsLocked = (kind: RetainedKind): boolean =>
    kind === "rhythm.set" || kind === "logistics.set";

  const editorFor = (
    key: string,
    kindOptions: readonly RetainedKind[],
    allowKeepAsNote: boolean,
    onCommit: () => void,
    lockedDetail = false,
  ) => (
    <div className="mt-2 space-y-2">
      {lockedDetail && (
        <p className="text-xs text-amber-700">{t("known.detail_locked")}</p>
      )}
      {/* ⚠️ `flex-1` ET PAS `w-full` dans une rangée flex: c'est
          `flex-basis: 0%` qui l'emporte, et `min-w-0` (déjà dans `inputClass`)
          est ce qui autorise le champ à rétrécir. Sans lui, un enfant de flex a
          `min-width: auto` et pousse la ligne — débordement mesuré à 320 px. */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={draftText}
          onChange={(e) => setDraftText(e.target.value)}
          className={`${inputClass} flex-1`}
          aria-label={t("known.edit_text_label")}
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-xs text-ink-soft" htmlFor={`known-kind-${key}`}>
          {t("known.file_under")}
        </label>
        <select
          id={`known-kind-${key}`}
          className={`${inputClass} flex-1`}
          value={draftKind}
          onChange={(e) => setDraftKind(e.target.value as RetainedKind | "")}
        >
          {allowKeepAsNote && <option value="">{t("known.file_under_keep")}</option>}
          {kindOptions.map((kind) => (
            <option key={kind} value={kind}>{t(KIND_KEY[kind])}</option>
          ))}
        </select>
      </div>
      {draftKind === "portion.adjust" && (
        <div className="flex flex-wrap items-center gap-2">
          {/* ⛔ DEUX SÉLECTEURS D'ADVERBES, ET AUCUN CHAMP DE NOMBRE. La
              personne dit « trop gros », pas « −80 g » — et le socle refuse un
              `value` qui porterait un gramme, à la compilation ET à la lecture. */}
          <select
            className={`${inputClass} flex-1`}
            value={draftDirection}
            onChange={(e) => setDraftDirection(e.target.value as "down" | "up")}
            aria-label={t("known.portion.direction_label")}
          >
            <option value="down">{t("known.portion.direction_down")}</option>
            <option value="up">{t("known.portion.direction_up")}</option>
          </select>
          <select
            className={`${inputClass} flex-1`}
            value={draftMagnitude}
            onChange={(e) =>
              setDraftMagnitude(e.target.value as "slight" | "clear")}
            aria-label={t("known.portion.magnitude_label")}
          >
            <option value="slight">{t("known.portion.magnitude_slight")}</option>
            <option value="clear">{t("known.portion.magnitude_clear")}</option>
          </select>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" disabled={busy} onClick={onCommit}>
          {busy ? t("known.saving") : t("known.save")}
        </Button>
        <button
          type="button"
          onClick={closeEdit}
          className="text-xs text-fig-700 underline hover:text-fig-800"
        >
          {t("known.cancel")}
        </button>
      </div>
      {/* L'ERREUR EST ICI, sous le bouton qu'on vient d'appuyer. */}
      {error?.key === key && (
        <p className="text-sm text-red-700">{error.message}</p>
      )}
    </div>
  );

  const itemLine = (item: RetainedItem, index: number) => {
    const key = `item:${index}`;
    const open = editing?.at === "item" && editing.index === index;
    const detail = detailLine(item);
    const excluded = exclusionLine(item);
    const options = MOVABLE_KINDS.includes(item.kind)
      ? MOVABLE_KINDS
      : [item.kind, ...MOVABLE_KINDS];
    return (
      <li
        key={key}
        className={`rounded-card border border-line bg-paper-2 px-3 py-2${
          focusRing(item.at, item.text)
        }`}
      >
        <div className="flex flex-wrap items-start gap-2">
          <div className="min-w-0 flex-1">
            {/* ⛔ LOT M2 — DANS LE FIL, LA LIGNE DIT OÙ ELLE EST ALLÉE.
                Le design l'écrit en exemple: « Poulet ajouté aux aliments
                évités ». Sans la destination, le fil annonce un changement
                sans dire ce qui a changé, et la personne doit chercher la
                ligne dans six sections pour comprendre. Sous une section, ce
                serait redondant: le titre est juste au-dessus. */}
            <p className="text-sm text-ink">{item.text}</p>
            {detail && <p className="mt-0.5 text-xs text-ink">{detail}</p>}
            {excluded && (
              <p className="mt-0.5 text-xs text-amber-700">{excluded}</p>
            )}
            {/* LES TROIS CHOSES, PREMIÈRE: D'OÙ ELLE VIENT, EN CLAIR. */}
            <p className="mt-0.5 text-xs text-ink-soft">{sourceLine(item)}</p>
            {/* ⛔ LOT M2 — LA PHRASE QUI L'A CAUSÉE. Sans elle, le bouton
                « Enlever » juste à côté est un pari. */}
            {quoteLine(item) && (
              <p className="mt-0.5 text-xs italic text-ink-soft">
                {quoteLine(item)}
              </p>
            )}
          </div>
          {!open && (
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setError(null);
                  setEditing({ at: "item", index });
                  setDraftText(item.text);
                  setDraftKind(item.kind);
                  if (item.kind === "portion.adjust") {
                    setDraftDirection(item.value.direction);
                    setDraftMagnitude(item.value.magnitude);
                  }
                }}
                className="text-xs text-fig-700 underline hover:text-fig-800"
              >
                {t("known.edit")}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void removeItem(index)}
                className="text-xs text-fig-700 underline hover:text-fig-800"
              >
                {t("known.remove")}
              </button>
            </div>
          )}
        </div>
        {open && editorFor(
          key,
          options,
          false,
          () => void saveItem(index),
          // Le détail reste verrouillé tant que la ligne GARDE sa famille
          // structurée: en changer la famille remplace la `value` par `null`,
          // et il n'y a alors plus rien qui puisse diverger.
          detailIsLocked(item.kind) && (draftKind || item.kind) === item.kind,
        )}
        {/* Le refus d'un RETRAIT n'a pas d'éditeur pour le porter: il se rend
            quand même sous la ligne, jamais en tête de page. */}
        {!open && error?.key === key && (
          <p className="mt-2 text-sm text-red-700">{error.message}</p>
        )}
      </li>
    );
  };

  const noteLine = (text: string) => {
    const key = `note:${text}`;
    const open = editing?.at === "note" && editing.text === text;
    const origin = store.legacyOrigin[text.toLowerCase()];
    return (
      <li key={key} className="rounded-card border border-line bg-paper-2 px-3 py-2">
        <div className="flex flex-wrap items-start gap-2">
          <div className="min-w-0 flex-1">
            {/* ⛔ RENDUE TELLE QUELLE (§7). Aucune famille devinée, aucune
                reformulation: c'est la phrase que la personne ou le memorizer a
                écrite, et elle reste lisible jusqu'à ce qu'ELLE la range. */}
            <p className="text-sm text-ink">{text}</p>
            <p className="mt-0.5 text-xs text-ink-soft">
              {origin?.at
                ? t("known.source.conversation", {
                  day: formatWeekday(origin.at, { long: true }),
                })
                : t("known.source.written")}
            </p>
          </div>
          {!open && (
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setError(null);
                  setEditing({ at: "note", text });
                  setDraftText(text);
                  setDraftKind("");
                }}
                className="text-xs text-fig-700 underline hover:text-fig-800"
              >
                {t("known.edit")}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void removeNote(text)}
                className="text-xs text-fig-700 underline hover:text-fig-800"
              >
                {t("known.remove")}
              </button>
            </div>
          )}
        </div>
        {open && editorFor(key, MOVABLE_KINDS, true, () => void saveNote(text))}
        {!open && error?.key === key && (
          <p className="mt-2 text-sm text-red-700">{error.message}</p>
        )}
      </li>
    );
  };

  /**
   * ⛔ UNE LIGNE DE CHANGEMENT DE CHAMP — LOT M5.
   *
   * Les trois choses du design, et pas moins:
   *   ① ce qui a changé — le champ NOMMÉ, et sa valeur d'avant → après;
   *   ② la phrase source, CITÉE;
   *   ③ le geste inverse, en un clic.
   *
   * ⚠️ LA VALEUR D'AVANT EST AFFICHÉE, PAS SEULEMENT STOCKÉE. « 45 → 30 » se
   * décide d'un coup d'œil; « 30 min » seul oblige la personne à se souvenir de
   * ce qu'elle avait mis, c'est-à-dire à faire le travail que ce fil existe pour
   * lui épargner.
   */
  const fieldLine = (change: FieldChange, index: number) => {
    const key = `field:${index}`;
    return (
      <li
        key={key}
        className={`rounded-card border border-line bg-paper-2 px-3 py-2${
          focusRing(change.at)
        }`}
      >
        <div className="flex flex-wrap items-start gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
              {t(FIELD_TITLE[change.field])}
            </p>
            <p className="text-sm text-ink">
              {t("known.field.moved", {
                previous: showFieldValue(change.previous),
                next: showFieldValue(change.next),
              })}
            </p>
            <p className="mt-0.5 text-xs text-ink-soft">
              {t("known.source.questionnaire")}
            </p>
            <p className="mt-0.5 text-xs italic text-ink-soft">
              {t("known.quote", { quote: change.quote })}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void commitUndo(key, index)}
              className="text-xs text-fig-700 underline hover:text-fig-800"
            >
              {t("known.field.undo")}
            </button>
          </div>
        </div>
        {error?.key === key && (
          <p className="mt-2 text-sm text-red-700">{error.message}</p>
        )}
      </li>
    );
  };

  /**
   * ⟳ LOT D — TOUT SE GROUPE PAR BOUCHE, plus seulement deux sections.
   *
   * ── LE DÉFAUT QUE ÇA FERME ────────────────────────────────────────────
   * Il fallait lire SIX listes et repérer un prénom dans chacune pour savoir ce
   * que Sophia sait de Léa. Le groupement est donc la personne, et les blocs
   * sont les trois DESTINATIONS — ce qui rend visible la frontière que la
   * nomenclature pose et que l'écran effaçait: un INDICE (« pour nous ») ne se
   * lit plus comme un SAVOIR.
   *
   * ⚠️ UNE BOUCHE SANS LIGNE N'A PAS D'EN-TÊTE. `groupBySubject` ne rend que
   * les sujets PRÉSENTS: un en-tête vide par personne ferait lire « Sophia ne
   * sait rien de Léa » là où la vérité est « Léa n'a rien dit ».
   */
  const groupedItems = (rows: readonly RetainedItem[]) =>
    groupBySubject(rows).map((group) => (
      <div key={group.subject} className="mt-3">
        <p className="text-xs font-semibold text-ink-soft">
          {nameOf(group.subject)}
        </p>
        <ul className="mt-1 space-y-2">
          {group.items.map((item) => itemLine(item, store.items.indexOf(item)))}
        </ul>
      </div>
    ));

  /**
   * LE MÉMO D'UNE BOUCHE — destination ③, groupée comme les deux autres.
   *
   * ⚠️ LE `when` EST RENDU, PAS SEULEMENT STOCKÉ. « Le mardi soir » est ce qui
   * distingue un fait durable d'un fait DATÉ, et une note dont le moment reste
   * invisible se lit comme une règle permanente — c'est le lot A qui a posé ce
   * champ, et l'écran est le seul endroit où la personne peut le démentir.
   */
  const memoWhen = (line: MemoLine): string | null => {
    if (!line.when) return null;
    const day = line.when.weekday === null ? null : DAY_KEY[line.when.weekday];
    const slot = line.when.slot === null ? null : OCCASION_KEY[line.when.slot];
    if (!day && !slot) return null;
    return [day ? t(day) : null, slot ? t(slot) : null]
      .filter((x): x is string => x !== null)
      .join(" · ");
  };

  const liveNextPlan = store.nextPlan.filter((entry) =>
    isNextPlanItemAlive(entry.item, entry.anchor, today)
  );

  /**
   * ⛔ LE SEUL CAS OÙ L'ÉCRAN NE PEUT RIEN ENREGISTRER, ET IL SE DIT AVANT LE
   * GESTE. Une clé de magasin qui n'est PAS une liste n'offre aucune place où
   * recoller ce qu'on n'a pas su lire: écrire par-dessus le détruirait. Le
   * refus est donc posé en tête plutôt que découvert au clic — un bouton qui
   * refuse toujours sans l'avoir annoncé se lit comme un bouton cassé.
   */
  const unwritable = opaqueStoreRefusal(store) !== null;

  // ── ARRIVER D'UNE BULLE ────────────────────────────────────────────────
  //
  // ⚠️ AU MONTAGE SEULEMENT, et sur l'état déjà chargé: la page ne monte cette
  // carte qu'en `ready`. Défiler avant que les lignes existent viserait une
  // ancre qui n'est pas encore là.
  //
  // ⛔ PAS DE `behavior: "smooth"`. Ce dépôt a mesuré qu'il n'est pas garanti —
  // il peut être un no-op complet. On ne construit rien dessus, et surtout on
  // n'attend pas sa fin.
  React.useEffect(() => {
    if (!props.focus) return;
    const anchor = document.getElementById(`known-${props.focus}`);
    anchor?.scrollIntoView();
  }, [props.focus]);

  // ── LE SURLIGNAGE S'ÉTEINT ────────────────────────────────────────────
  //
  // ⚠️ IL DOIT S'ÉTEINDRE, et pas par élégance. Le jour est une clé GROSSIÈRE:
  // toutes les lignes écrites le même jour portent le même `at`, donc plusieurs
  // s'allument ensemble. Laissé en place, ce halo cesserait de dire « c'est là »
  // pour se lire comme un état de ces lignes — celui-là même que la carte ne
  // veut pas suggérer, puisqu'elles n'ont rien de différent des autres.
  //
  // ⛔ IL ÉTAIT PLUS GROSSIER QUE LA LIGNE, et ce n'est plus vrai depuis le
  // 2026-09-05: la bulle porte les TEXTES qu'elle a écrits (`focusLines`), et
  // c'est le texte qui sert d'identité — il n'existe toujours pas
  // d'identifiant de ligne en base. Le jour reste le repli d'une bulle qui ne
  // les porte pas.
  const focusArmed = Boolean(props.focusAt) ||
    (props.focusLines?.length ?? 0) > 0;
  const [focusLive, setFocusLive] = React.useState<boolean>(focusArmed);
  React.useEffect(() => {
    if (!focusArmed) return;
    setFocusLive(true);
    const timer = setTimeout(() => setFocusLive(false), 3000);
    return () => clearTimeout(timer);
  }, [focusArmed, props.focusAt, props.focusLines]);

  /** Cette ligne est-elle celle dont la bulle parlait ? */
  const isFocused = (at: string, text?: string | null): boolean =>
    focusLive && isFocusedLine({
      focusAt: props.focusAt,
      focusLines: props.focusLines,
      at,
      text,
    });

  /**
   * ⚠️ UN ANNEAU, PAS UN FOND. Un fond coloré se lit comme un ÉTAT de la ligne
   * (« celle-ci est différente »); un anneau se lit comme « c'est là ». La
   * distinction compte sur un écran dont toutes les lignes se valent.
   */
  // `fig-600` est LE jeton d'anneau de focus du dépôt (`tokens.css:134`) — pas
  // une nuance choisie ici. `fig-500` n'existe pas.
  const focusRing = (at: string, text?: string | null): string =>
    isFocused(at, text) ? " ring-2 ring-fig-600" : "";

  const duplicates = visibleDuplicates({ items: store.items, memo });
  const preferences = itemsInBlock(store.items, "preferences");
  const settings = itemsInBlock(store.items, "settings");

  /**
   * LE MÉMO, GROUPÉ PAR BOUCHE — et l'INDEX D'ORIGINE voyage avec la ligne.
   *
   * ⛔ ÉCRIT À LA MAIN, ET SURTOUT PAS `groupBySubject(memo as never)`. Un
   * `as` sur un type étranger désarme le typecheck en silence — la cicatrice
   * est chiffrée dans ce dépôt (« 200 en log, null en silence »): `MemoLine`
   * n'est pas un `RetainedItem`, et le jour où l'un des deux gagne un champ, le
   * cast rendrait un objet à moitié construit sans qu'une ligne rougisse.
   *
   * ⚠️ L'INDEX EST CELUI DU MAGASIN, PAS CELUI DU GROUPE. `onRemoveMemoLine`
   * retire par POSITION dans la liste d'origine: passer l'index du groupe
   * effacerait la ligne de quelqu'un d'autre.
   *
   * ⚠️ « TOUTE LA TABLE » EN PREMIER, comme `groupBySubject`. Deux ordres
   * différents sur le même écran se lisent comme deux écrans.
   */
  const memoGroups = (() => {
    const bySubject = new Map<string, Array<{ line: MemoLine; index: number }>>();
    memo.forEach((line, index) => {
      const list = bySubject.get(line.subject) ?? [];
      list.push({ line, index });
      bySubject.set(line.subject, list);
    });
    const out: Array<{ subject: string; lines: Array<{ line: MemoLine; index: number }> }> = [];
    const shared = bySubject.get(HOUSEHOLD_SUBJECT);
    if (shared) out.push({ subject: HOUSEHOLD_SUBJECT, lines: shared });
    for (const [subject, lines] of bySubject) {
      if (subject === HOUSEHOLD_SUBJECT) continue;
      out.push({ subject, lines });
    }
    return out;
  })();

  /**
   * ⟳ LE FIL « CE QUI VIENT DE CHANGER » A ÉTÉ RETIRÉ (lot D), ET CE N'EST PAS
   * UNE SIMPLIFICATION.
   *
   * Il rejouait, en tête, des lignes qui figurent DÉJÀ dans leur bloc — un
   * doublon visible assumé, au moment précis où cette carte a pour promesse
   * qu'un même fait n'apparaît qu'une fois. Ce qu'il apportait vraiment — QUAND
   * c'est arrivé, et POURQUOI — n'est pas perdu: chaque ligne porte sa date, sa
   * provenance et la phrase qui l'a causée, dans son bloc.
   *
   * ⚠️ CE QUI ÉTAIT SA VRAIE RAISON D'ÊTRE RESTE, ET IL A CHANGÉ DE PLACE: les
   * `field_changes` — les réglages bougés sans que la personne les ait touchés
   * — sont maintenant EN TÊTE du bloc « Réglages ajustés », avec leur
   * « Défaire ». C'était le seul contenu du fil qui n'existait nulle part
   * ailleurs.
   */
  return (
    <div className="space-y-8">
      {unwritable && (
        <Card tone="warning">
          <p className="text-sm text-amber-900">{t("known.store_unreadable")}</p>
        </Card>
      )}

      {/* ══ LOT D · LA MÊME CHOSE DITE DEUX FOIS ════════════════════════════
          ⛔ ON LA NOMME, ON NE LA CACHE PAS. Masquer la seconde ligne ferait
          disparaître de l'écran quelque chose qui EXISTE en base et qui atteint
          le prompt — le contraire exact de la promesse de cette carte. Un
          doublon entre le magasin structuré et le mémo est un défaut du
          classifieur (§2.3: les trois destinations sont sans recouvrement), et
          la personne est la seule à pouvoir dire laquelle des deux compte. */}
      {duplicates.length > 0 && (
        <Card tone="warning">
          <p className="text-sm text-amber-900">
            {t("known.duplicate.body", {
              lines: duplicates.map((d) => d.text).join(" · "),
            })}
          </p>
        </Card>
      )}

      {/* ══ ① LES PRÉFÉRENCES ALIMENTAIRES — par personne, deux listes ═══════
          §2.2 ① de la nomenclature. Une PRÉPARATION est une préférence: les
          `method.*` sont dans les mêmes listes que les `food.*`, et il n'y a
          plus à savoir ce que le produit appelle « une méthode ». */}
      <section id="known-preferences">
        <SectionLabel>{t(BLOCK_TITLE.preferences)}</SectionLabel>
        <p className="mb-2 text-xs text-ink-soft">{t(BLOCK_INTRO.preferences)}</p>
        {preferences.length === 0
          ? (
            <Card tone="dashed">
              <p className="text-sm text-ink-soft">{t(BLOCK_EMPTY.preferences)}</p>
            </Card>
          )
          : (
            <>
              {(["no_more", "again"] as const).map((side) => {
                const rows = preferences.filter(
                  (item) => preferenceSideOf(item) === side,
                );
                if (rows.length === 0) return null;
                return (
                  <div key={side} className="mt-3">
                    <p className="text-sm font-semibold text-ink">
                      {t(PREFERENCE_SIDE_TITLE[side])}
                    </p>
                    {groupedItems(rows)}
                  </div>
                );
              })}
            </>
          )}
      </section>

      {/* ══ ③ CE QUE JE SAIS D'AUTRE — le mémo, par personne, daté ═══════════
          ⛔ IL SE VOIT, ET C'EST UNE CONDITION D'EXISTENCE, pas un ornement.
          Un champ texte caché, sans plafond, injecté dans chaque prompt est
          exactement le magasin que ce chantier supprime, avec un autre chapeau
          — et la chose la plus difficile à déboguer du produit: le jour où un
          plan part de travers, personne ne peut dire pourquoi. */}
      <section id="known-notes">
        <SectionLabel>{t(BLOCK_TITLE.notes)}</SectionLabel>
        <p className="mb-2 text-xs text-ink-soft">
          {t(BLOCK_INTRO.notes, {
            used: String(memo.length),
            max: String(MEMO_MAX_LINES),
          })}
        </p>
        {memo.length === 0
          ? (
            <Card tone="dashed">
              <p className="text-sm text-ink-soft">{t(BLOCK_EMPTY.notes)}</p>
            </Card>
          )
          : (
            <>
              {memoGroups.map((group) => (
                <div key={group.subject} className="mt-3">
                  <p className="text-xs font-semibold text-ink-soft">
                    {nameOf(group.subject)}
                  </p>
                  <ul className="mt-1 space-y-2">
                    {group.lines.map(({ line, index }) => (
                        <li
                          key={`memo:${index}`}
                          className={`rounded-card border border-line bg-paper-2 px-3 py-2${
                            focusRing(line.at, line.text)
                          }`}
                        >
                          <div className="flex flex-wrap items-start gap-2">
                            <div className="min-w-0 flex-1">
                              <p className="text-sm text-ink">{line.text}</p>
                              {memoWhen(line) && (
                                <p className="mt-0.5 text-xs text-ink">
                                  {memoWhen(line)}
                                </p>
                              )}
                              <p className="mt-0.5 text-xs italic text-ink-soft">
                                {t("known.quote", { quote: line.quote })}
                              </p>
                            </div>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() =>
                                void commitMemoRemove(`memo:${index}`, index)}
                              className="shrink-0 text-xs text-fig-700 underline hover:text-fig-800"
                            >
                              {t("known.remove")}
                            </button>
                          </div>
                          {error?.key === `memo:${index}` && (
                            <p className="mt-2 text-sm text-red-700">
                              {error.message}
                            </p>
                          )}
                        </li>
                    ))}
                  </ul>
                </div>
              ))}
            </>
          )}
      </section>

      {/* ══ ② LES RÉGLAGES AJUSTÉS — la seule face visible des indices ═══════
          ⚠️ CE BLOC N'EST PAS UN « SAVOIR », ET SON INTRO LE DIT. Les indices
          sont internes (« pour nous », §2.2 ②); ils sont ici pour le RETOUR EN
          ARRIÈRE, pas pour se lire comme une chose que Sophia sait de vous.
          Confondre les deux était le défaut de l'écran d'avant. */}
      <section id="known-settings">
        <SectionLabel>{t(BLOCK_TITLE.settings)}</SectionLabel>
        <p className="mb-2 text-xs text-ink-soft">{t(BLOCK_INTRO.settings)}</p>
        {(() => {
          // ⚠️ PAR BOUCHE, JAMAIS AGRÉGÉE. Un indice appartient à qui mange;
          // en faire une moyenne de foyer servirait à tout le monde une part
          // que personne n'a demandée.
          const lines = groupBySubject(
            settings.filter((item) => item.kind === "portion.adjust"),
          )
            .map((group) => ({
              subject: group.subject,
              key: portionIndexLabelKey(portionIndexFor(group.items)),
            }))
            .filter((row) => row.key !== null);
          if (lines.length === 0) return null;
          return (
            <div className="mb-2 space-y-1">
              {lines.map((row) => (
                <p key={row.subject} className="text-xs text-ink-soft">
                  {t(row.key as MessageKey, { who: nameOf(row.subject) })}
                </p>
              ))}
            </div>
          );
        })()}
        {fieldChanges.length === 0 && settings.length === 0
          ? (
            <Card tone="dashed">
              <p className="text-sm text-ink-soft">{t(BLOCK_EMPTY.settings)}</p>
            </Card>
          )
          : (
            <>
              {/* ⚠️ LES CHANGEMENTS DE CHAMP EN PREMIER. Ils portent sur des
                  réglages que la personne a elle-même remplis: c'est le
                  changement le plus surprenant, donc celui qu'elle doit voir
                  d'abord — et le seul qui porte « Défaire ». */}
              {fieldChanges.length > 0 && (
                <ul className="space-y-2">
                  {fieldChanges.map((change, index) => fieldLine(change, index))}
                </ul>
              )}
              {groupedItems(settings)}
            </>
          )}
      </section>

      {/* ══ L'ENCART — « pour le prochain plan », et il meurt à la VALIDATION ═
          ⚠️ RENDU SEULEMENT S'IL EST NON VIDE (§7.1). Un bloc vide annoncerait
          une réserve qui n'existe pas, sur le seul contenu de cette carte qui
          est censé disparaître tout seul. */}
      {liveNextPlan.length > 0 && (
        <section id="known-next_plan">
          <SectionLabel>{t(BLOCK_TITLE.next_plan)}</SectionLabel>
          <p className="mb-2 text-xs text-ink-soft">{t(BLOCK_INTRO.next_plan)}</p>
          <ul className="space-y-2">
            {liveNextPlan.map((entry, i) => (
              <li
                key={`next:${i}`}
                className={`rounded-card border border-line bg-paper-2 px-3 py-2${
                  focusRing(entry.item.at, entry.item.text)
                }`}
              >
                <p className="text-sm text-ink">{entry.item.text}</p>
                <p className="mt-0.5 text-xs text-ink-soft">
                  {sourceLine(entry.item)}
                </p>
                {/* ⟳ LOT A — L'ENCART NE MEURT PLUS AU CALENDRIER. Cette ligne
                    annonçait une DATE (« bon jusqu'au 7 septembre »), et c'était
                    faux depuis que sa durée de vie est le prochain plan VALIDÉ:
                    une envie pouvait survivre à sa date, ou mourir avant. On
                    annonce donc l'ÉVÉNEMENT, qui est ce qui la tue vraiment. */}
                <p className="mt-0.5 text-xs text-ink">
                  {t("known.block.next_plan.until")}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ══ LES ANCIENNES NOTES — TANT QU'IL EN RESTE ═══════════════════════
          ⟳ LOT C/D — ELLES N'ATTEIGNENT PLUS LE PLAN, ET L'INTRO LE DIT. Ces
          phrases plates vivaient dans `practical_constraints.food_preferences`,
          que les deux générateurs lisaient à chaque composition. Le lot C a
          fermé ce magasin: il n'a plus d'écrivain, plus de lecteur, et plus
          personne ne l'élague. Il reste ici en LECTURE pour que la personne le
          RANGE (en préférence, avec un sujet) ou l'ENLÈVE.

          ⛔ ON NE RECLASSE RIEN À SA PLACE. Une phrase sans `kind` ne dit pas
          si elle est un goût, une méthode ou un fait; deviner écrirait une
          règle que personne n'a demandée.

          ⚠️ LE BLOC DISPARAÎT QUAND IL EST VIDE, et c'est le lot D: un cadre
          « Aucune » sur une archive fermée est un cadre qui ne servira plus
          jamais à rien, en tête d'un écran qui promet de ne montrer que ce qui
          existe. */}
      {store.legacyNotes.length > 0 && (
        <section id="known-legacy">
          <SectionLabel>{t("known.legacy.title")}</SectionLabel>
          <p className="mb-2 text-xs text-ink-soft">{t("known.legacy.intro")}</p>
          <ul className="space-y-2">
            {store.legacyNotes.map((text) => noteLine(text))}
          </ul>
        </section>
      )}

      {/* ── CE QUE LA LECTURE A REFUSÉ ───────────────────────────────────── */}
      {(store.refused.total > 0 || store.nextPlanRefused.total > 0) && (
        <Card tone="warning">
          {/* Un magasin dont la moitié des lignes est refusée ressemble
              EXACTEMENT à un magasin à moitié vide. Sur l'écran dont la
              promesse est « rien d'opaque », le silence serait le pire choix. */}
          <p className="text-sm text-amber-900">
            {t("known.refused.body", {
              count: store.refused.total + store.nextPlanRefused.total,
            })}
          </p>
        </Card>
      )}
    </div>
  );
}

/** Le producteur d'origine garde-t-il la main sur cette famille ? Exporté pour
 * que la page puisse l'expliquer sans réimplémenter la matrice.
 *
 * ⚠️ AUCUN IMPORTATEUR À CE JOUR (vérifié par grep sur `frontend/src`): la
 * page annoncée ne s'en sert pas encore. On ne le retire pas au passage — ce
 * lot rend le gate vert, il ne purge pas une API en cours d'écriture — mais
 * s'il reste sans lecteur, sa place est dans `keel/api/retainedItems.ts`, à
 * côté du `canProduce` qu'il enveloppe. */
// eslint-disable-next-line react-refresh/only-export-components
export function keepsItsSource(item: RetainedItem, kind: RetainedKind): boolean {
  return canProduce(item.source, kind);
}
