import React from "react";

import {
  canProduce,
  groupBySubject,
  HOUSEHOLD_SUBJECT,
  isNextPlanItemAlive,
  itemsInSection,
  KNOWN_SECTIONS,
  type KnownSection,
  type KnownStore,
  KnownWriteError,
  type KnownWriteRefusal,
  type NextPlanEntry,
  nextPlanLifeOf,
  opaqueStoreRefusal,
  type PortionAdjustMember,
  type RetainedItem,
  type RetainedKind,
  retainedItemFromLegacyNote,
  rewriteRetainedItem,
  subjectMemberId,
  subjectsForPortionAdjust,
} from "../api/retainedItems";
import { formatDateLong, formatWeekday } from "../i18n/format";
import { type MessageKey, t } from "../i18n/t";
import { Button } from "./ui/Button";
import { Card, SectionLabel } from "./ui/Card";
import { inputClass } from "./ui/Field";

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
// `canProduce` mord AUSSI À LA LECTURE. Déplacer une ligne du memorizer vers
// `portion.adjust` — la seule famille qui lui est interdite — l'écrirait sans
// erreur et la ferait DISPARAÎTRE au chargement suivant. `rewriteRetainedItem`
// la re-signe alors `source: "written"` + `item: ""`; cette carte ne fait que
// l'appeler, et ne réimplémente PAS la règle.
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

const SECTION_TITLE: Readonly<Record<KnownSection, MessageKey>> = {
  no_more: "known.section.no_more.title",
  again: "known.section.again.title",
  portions: "known.section.portions.title",
  rhythm: "known.section.rhythm.title",
  kitchen: "known.section.kitchen.title",
  next_week: "known.section.next_week.title",
};

const SECTION_EMPTY: Readonly<Record<KnownSection, MessageKey>> = {
  no_more: "known.section.no_more.empty",
  again: "known.section.again.empty",
  portions: "known.section.portions.empty",
  rhythm: "known.section.rhythm.empty",
  kitchen: "known.section.kitchen.empty",
  next_week: "known.section.next_week.empty",
};

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
  onSave: (next: {
    items: readonly RetainedItem[];
    nextPlan: readonly NextPlanEntry[];
    notes:
      | { legacyNotes: readonly string[]; legacyOrigin: KnownStore["legacyOrigin"] }
      | null;
  }) => Promise<void>;
}

/** Quelle ligne est en cours d'édition. `null` = aucune. */
type Editing =
  | { readonly at: "item"; readonly index: number }
  | { readonly at: "note"; readonly text: string }
  | null;

export default function KnownAboutYouCard(props: KnownAboutYouCardProps) {
  const { store, members, roster, today, onSave } = props;

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
      <li key={key} className="rounded-card border border-line bg-paper-2 px-3 py-2">
        <div className="flex flex-wrap items-start gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-sm text-ink">{item.text}</p>
            {detail && <p className="mt-0.5 text-xs text-ink">{detail}</p>}
            {excluded && (
              <p className="mt-0.5 text-xs text-amber-700">{excluded}</p>
            )}
            {/* LES TROIS CHOSES, PREMIÈRE: D'OÙ ELLE VIENT, EN CLAIR. */}
            <p className="mt-0.5 text-xs text-ink-soft">{sourceLine(item)}</p>
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

  /** Les sections 3 et 4 sont GROUPÉES PAR BOUCHE (§6). */
  const groupedSection = (section: KnownSection) => {
    const rows = itemsInSection(store.items, section);
    const groups = groupBySubject(rows);
    return groups.map((group) => (
      <div key={group.subject} className="mt-3">
        <p className="text-xs font-semibold text-ink-soft">
          {nameOf(group.subject)}
        </p>
        <ul className="mt-1 space-y-2">
          {group.items.map((item) => itemLine(item, store.items.indexOf(item)))}
        </ul>
      </div>
    ));
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

  return (
    <div className="space-y-8">
      {unwritable && (
        <Card tone="warning">
          <p className="text-sm text-amber-900">{t("known.store_unreadable")}</p>
        </Card>
      )}
      {KNOWN_SECTIONS.map((section) => {
        const grouped = section === "portions" || section === "rhythm";
        const rows = section === "next_week"
          ? []
          : itemsInSection(store.items, section);
        const count = section === "next_week" ? liveNextPlan.length : rows.length;
        return (
          <section key={section}>
            <SectionLabel>{t(SECTION_TITLE[section])}</SectionLabel>
            {section === "portions" && (
              // ⚠️ CE QU'ON NE PROMET PAS. Le routage de 1C sert les six
              // familles aux générateurs; l'enveloppe, elle, ne lit pas encore
              // les ajustements. Le dire vaut mieux qu'un écran qui laisse
              // croire.
              <p className="mb-2 text-xs text-ink-soft">
                {t("known.section.portions.not_wired")}
              </p>
            )}
            {count === 0
              ? (
                <Card tone="dashed">
                  <p className="text-sm text-ink-soft">{t(SECTION_EMPTY[section])}</p>
                </Card>
              )
              : section === "next_week"
              ? (
                <ul className="space-y-2">
                  {liveNextPlan.map((entry, i) => {
                    const life = nextPlanLifeOf(entry.anchor);
                    return (
                      <li
                        key={`next:${i}`}
                        className="rounded-card border border-line bg-paper-2 px-3 py-2"
                      >
                        <p className="text-sm text-ink">{entry.item.text}</p>
                        <p className="mt-0.5 text-xs text-ink-soft">
                          {sourceLine(entry.item)}
                        </p>
                        {/* ⚠️ L'EXPIRATION EST AFFICHÉE, ET C'EST LA RÈGLE DU
                            §6: « une envie qui disparaît sans prévenir se lit
                            comme une perte de données; une envie datée se lit
                            comme une envie. » */}
                        {life && (
                          <p className="mt-0.5 text-xs text-ink">
                            {t("known.section.next_week.expires", {
                              date: formatDateLong(life.lastDay),
                            })}
                          </p>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )
              : grouped
              ? <>{groupedSection(section)}</>
              : (
                <ul className="space-y-2">
                  {rows.map((item) => itemLine(item, store.items.indexOf(item)))}
                </ul>
              )}
            {section === "next_week" && count > 0 && (
              // ⚠️ TROU NOMMÉ PLUTÔT QUE MASQUÉ: le magasin provisoire n'a pas
              // encore de geste d'édition sur cet écran. Ces lignes s'en vont
              // toutes seules, à la date affichée — mais on ne fait pas semblant
              // d'offrir un bouton qui n'écrit rien.
              <p className="mt-2 text-xs text-ink-soft">
                {t("known.section.next_week.read_only")}
              </p>
            )}
          </section>
        );
      })}

      {/* ── §7 · LES ANCIENNES NOTES ─────────────────────────────────────── */}
      <section>
        <SectionLabel>{t("known.legacy.title")}</SectionLabel>
        <p className="mb-2 text-xs text-ink-soft">{t("known.legacy.intro")}</p>
        {store.legacyNotes.length === 0
          ? (
            <Card tone="dashed">
              <p className="text-sm text-ink-soft">{t("known.legacy.empty")}</p>
            </Card>
          )
          : (
            <ul className="space-y-2">
              {store.legacyNotes.map((text) => noteLine(text))}
            </ul>
          )}
      </section>

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
