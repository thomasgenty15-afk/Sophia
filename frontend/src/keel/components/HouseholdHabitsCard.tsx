import React from "react";

import {
  habitDraft,
  type HabitDraftSlot,
  habitDraftBlocked,
  habitPayload,
  type HabitSlot,
  DRAFT_NOTE_MAX_CHARS,
  type MemberHabitsView,
} from "../api/householdHabits";
import type { EatingOccasion } from "../api/mealGeneration";
import { mealCopy } from "../api/mealLabels";
import { t } from "../i18n/t";
import { Button } from "./ui/Button";
import { SectionLabel } from "./ui/Card";
import { Field, inputClass } from "./ui/Field";

// KEEL — CE QUE CETTE BOUCHE MANGE D'HABITUDE.
//
// Autorité: `scratchpad/SPEC-HABITUDES-ET-FORME-DE-CUISSON-20260814.md` §B2,
// §B3, §H1, §H2. Le moteur qui LIT ces lignes est LOT G.
//
// ── LE CAS QUI A OUVERT LE CHANTIER ────────────────────────────────────────
// « Ma mère a mis qu'elle voulait se maintenir, mais on lui fait manger des
// œufs brouillés tous les matins alors qu'elle mange une pomme. » Sa mère est
// une bouche SANS COMPTE: le produit savait d'elle prénom, naissance, objectif,
// absences, moments, allergies et corps — rien sur ce qu'elle mange. Cette
// carte est l'endroit qui manquait.
//
// ── LES TROIS PIÈGES DE §H2, ET COMMENT CHACUN EST TENU ICI ────────────────
//
// 1. RIEN N'EST PRÉ-COCHÉ. Quand aucune ligne n'existe, les deux boutons radio
//    de chaque moment sont TOUS LES DEUX vides. `null` veut dire « personne n'a
//    rien dit », jamais « elle mange comme tout le monde ». Une coche
//    automatique écrirait au premier Save un fait faux que l'utilisateur ne
//    peut pas démentir — cicatrice `auto-tick-writes-undeniable-false-facts`,
//    le motif pour lequel une fonctionnalité entière a été refusée ici. La
//    règle vit dans `habitDraft`, elle est testée, et cette carte ne fait que
//    l'afficher.
//
// 2. AUCUN DÉCOMPTE DE QUI A REMPLI. Pas de pastille « à compléter », pas de
//    ligne ambre « personne n'a rien dit », pas de total au niveau du foyer.
//    « 2 personnes n'ont rien dit » se lit « il en reste 2 à relancer » — c'est
//    la faute qui a fait supprimer le « conseil de famille » (FF-050 §1): on
//    avait recréé, dans le produit, la corvée qu'il promet de supprimer.
//    ⚠️ La carte n'énonce donc QUE ce qui est su. Une absence ne s'affiche pas.
//
// 3. LE FORMULAIRE ATTEND SA LECTURE. Tant que `loaded` est faux, on rend un
//    ATTENDU et AUCUN champ. Un formulaire figé au montage sur un état vide
//    affiche du vide non lu puis l'ÉCRASE au Save — cicatrice
//    `mount-snapshot-forms-need-a-loading-gate`.
//
// ── CE QUE CETTE CARTE N'EST PAS ───────────────────────────────────────────
// Ce n'est pas `fixed_intakes`. Elle ne demande ni quantité, ni aliment
// résolu: « une pomme » n'a ni l'un ni l'autre, et lui en inventer écrirait un
// fait que personne n'a pesé. Une habitude dit une TENDANCE QUE LA COMPOSITION
// CONTOURNE, pas une quantité qui remplace un repas.

function occasionLabel(slot: EatingOccasion): string {
  return mealCopy(`meals.slot.${slot}` as Parameters<typeof mealCopy>[0]);
}

export default function HouseholdHabitsCard(
  { slots, habits, loaded, busy, onSave }: {
    /**
     * LES MOMENTS DE CETTE PERSONNE — son `eating_rhythm`, pas une liste de
     * six. Quelqu'un qui ne prend pas de collation ne doit pas lire une ligne
     * vide toutes les semaines (§H1). L'appelant a déjà tranché entre sa
     * déclaration et le repli du foyer, exactement comme pour `goal`.
     */
    slots: readonly EatingOccasion[];
    /** `null` = AUCUNE LIGNE, c'est-à-dire personne n'a rien dit. */
    habits: MemberHabitsView | null;
    /** LA GARDE DE CHARGEMENT. Faux = la lecture n'a pas eu lieu. */
    loaded: boolean;
    busy: boolean;
    onSave: (slots: HabitSlot[], note: string | null) => Promise<boolean>;
  },
) {
  const [open, setOpen] = React.useState(false);

  // CE QUI EST SU, ET RIEN D'AUTRE. Pas de « rien de dit » quand il n'y a rien:
  // voir le piège n°2 en tête de fichier.
  const known = (habits?.slots ?? []).filter((h) =>
    (slots as readonly string[]).includes(h.slot)
  );

  return (
    <div className="border-t border-line pt-3">
      <SectionLabel>{t("household.habits.title")}</SectionLabel>
      <p className="mb-2 text-xs text-ink-soft">{t("household.habits.hint")}</p>

      {/* REPLIÉE PAR DÉFAUT (§H1). Le résumé n'énonce que des FAITS: les
          moments où elle a son habitude. Quand il n'y en a pas, il n'y a pas
          de ligne — et surtout pas une invitation à remplir. */}
      {known.length > 0 ? (
        // ⛔ `break-words` SUR LES DEUX, ET C'EST UNE MESURE, PAS UNE PRÉCAUTION.
        // `usual` et `note` sont du TEXTE D'UTILISATEUR: rien ne garantit une
        // espace. Mesuré dans un cadre de 320 px avec 39 signes insécables —
        // le même gabarit que le prénom qui a débordé chez Lot E: la ligne
        // poussait son bord droit à 428 px, donc la PAGE ENTIÈRE défilait
        // horizontalement. `overflow-wrap: break-word` coupe le mot au lieu de
        // pousser le bloc; il ne coupe QUE ce qui ne tient pas.
        <ul className="mb-2 flex flex-col gap-1 break-words text-sm">
          {known.map((h) => (
            <li key={h.slot}>
              <span className="text-ink-soft">{occasionLabel(h.slot)}</span>
              {" — "}
              <span className="font-medium">{h.usual}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {habits?.note ? (
        <p className="mb-2 break-words text-sm text-ink-soft">{habits.note}</p>
      ) : null}

      <button
        className="text-fig-700 underline"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? t("household.habits.close") : t("household.habits.open")}
      </button>

      {open
        ? (
          // ⚠️ LA GARDE DE CHARGEMENT EST ICI, ET LE FORMULAIRE EST UN AUTRE
          // COMPOSANT. C'est le seul montage qui tienne: les `useState` de
          // `HabitsFields` sont initialisés depuis ce qui a été LU, et ils ne
          // s'initialisent qu'une fois. Rendre le formulaire avant la lecture
          // le figerait sur du vide, qu'il réécrirait ensuite au Save.
          !loaded
            ? <p className="mt-2 text-sm text-ink-soft">{t("household.habits.loading")}</p>
            : (
              <HabitsFields
                // LA SIGNATURE DE CE QUI A ÉTÉ LU. Un rafraîchissement qui
                // rapporte autre chose que ce qu'on a tapé REMONTE le
                // formulaire: c'est la vérité du serveur qui gagne, et elle
                // s'affiche au lieu de rester cachée sous un brouillon. Une
                // lecture identique ne change pas la clé, donc la saisie en
                // cours survit à un rafraîchissement de fond.
                key={JSON.stringify([
                  habits?.slots ?? null,
                  habits?.note ?? null,
                  slots,
                ])}
                slots={slots}
                habits={habits}
                busy={busy}
                onSave={onSave}
              />
            )
        )
        : null}
    </div>
  );
}

/**
 * LES CHAMPS — montés SEULEMENT une fois la lecture faite.
 *
 * Séparés du repli exprès: c'est ce qui garantit que les initialiseurs de
 * `useState` voient les données réelles et jamais un état vide.
 */
function HabitsFields(
  { slots, habits, busy, onSave }: {
    slots: readonly EatingOccasion[];
    habits: MemberHabitsView | null;
    busy: boolean;
    onSave: (slots: HabitSlot[], note: string | null) => Promise<boolean>;
  },
) {
  const [draft, setDraft] = React.useState<HabitDraftSlot[]>(
    () => habitDraft(slots, habits),
  );
  const [note, setNote] = React.useState(habits?.note ?? "");
  const [saved, setSaved] = React.useState(false);

  // Un identifiant stable pour les groupes de boutons radio. Sans lui, deux
  // fiches ouvertes en même temps partageraient leurs groupes et cocher un
  // moment chez l'une décocherait le même moment chez l'autre.
  const groupId = React.useId();

  const blocked = habitDraftBlocked(draft);
  const blockedSet = new Set<string>(blocked);

  const set = (slot: EatingOccasion, patch: Partial<HabitDraftSlot>) => {
    setDraft((d) => d.map((x) => (x.slot === slot ? { ...x, ...patch } : x)));
    setSaved(false);
  };

  return (
    <div className="mt-3 flex flex-col gap-3">
      {slots.length === 0
        ? <p className="text-sm text-ink-soft">{t("household.habits.no_slots")}</p>
        : draft.map((row) => {
          const name = `${groupId}-${row.slot}`;
          return (
            // ⚠️ `fieldset` ET `legend`, PAS UN `<p>`: deux boutons radio sans
            // groupe nommé se lisent « bouton radio, 1 sur 2 » au lecteur
            // d'écran, sans jamais dire DE QUEL MOMENT il s'agit.
            <fieldset key={row.slot} className="border-0 p-0">
              <legend className="mb-1 block text-label font-semibold uppercase text-ink-soft">
                {occasionLabel(row.slot)}
              </legend>
              {/* ⛔ `flex-col` ET PAS UNE LIGNE. À 320 px, la fiche ouverte ne
                  laisse que 198 px (carte `p-4` + panneau `p-3`), et les deux
                  libellés — « Eats what the house cooks » / « Has something of
                  their own » — n'y tiennent pas côte à côte. Empilés, ils
                  tiennent à toute largeur et l'ordre de lecture reste celui de
                  la décision. */}
              <div className="flex flex-col gap-1 text-sm">
                <label className="flex items-start gap-2">
                  <input
                    type="radio"
                    name={name}
                    className="mt-1 shrink-0"
                    // ⚠️ `checked={...}` AVEC `null` POSSIBLE: quand le choix
                    // est `null`, LES DEUX valent `false` et rien n'est coché.
                    // C'est le piège n°1, rendu à l'écran.
                    checked={row.choice === "household_dish"}
                    disabled={busy}
                    onChange={() => set(row.slot, { choice: "household_dish" })}
                  />
                  <span>{t("household.habits.choice_household_dish")}</span>
                </label>
                <label className="flex items-start gap-2">
                  <input
                    type="radio"
                    name={name}
                    className="mt-1 shrink-0"
                    checked={row.choice === "own_usual"}
                    disabled={busy}
                    onChange={() => set(row.slot, { choice: "own_usual" })}
                  />
                  <span>{t("household.habits.choice_own_usual")}</span>
                </label>
              </div>
              {/* LE CHAMP N'APPARAÎT QUE SI ON A DIT « SON HABITUDE ». Six
                  champs vides en permanence feraient une carte qui demande
                  six réponses; elle n'en demande aucune. */}
              {row.choice === "own_usual" ? (
                <div className="mt-2">
                  <Field
                    label={t("household.habits.usual_label")}
                    error={blockedSet.has(row.slot)
                      ? t("household.habits.usual_missing")
                      : undefined}
                  >
                    <input
                      type="text"
                      className={inputClass}
                      maxLength={DRAFT_NOTE_MAX_CHARS}
                      placeholder={t("household.habits.usual_placeholder")}
                      value={row.usual}
                      disabled={busy}
                      onChange={(e) => set(row.slot, { usual: e.target.value })}
                    />
                  </Field>
                </div>
              ) : null}
            </fieldset>
          );
        })}

      {/* ── UN SEUL CHAMP LIBRE, DURABLE (§B3) ────────────────────────────
          UNE ligne, relue à chaque composition. Pas un journal, pas un fil:
          ce qu'on écrit là est une propriété durable de la personne. */}
      <Field
        label={t("household.habits.note_label")}
        hint={t("household.habits.note_hint")}
      >
        <textarea
          className={inputClass}
          rows={2}
          maxLength={DRAFT_NOTE_MAX_CHARS}
          placeholder={t("household.habits.note_placeholder")}
          value={note}
          disabled={busy}
          onChange={(e) => { setNote(e.target.value); setSaved(false); }}
        />
      </Field>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="secondary"
          // ⚠️ CE N'EST PAS LA GARDE. Elle est en base (`bad_slots`,
          // `bad_note`, et la relecture par `plan_draft_note.ts`). Un bouton
          // inerte n'a jamais gardé quoi que ce soit — il évite un aller-retour
          // dont le refus serait exact mais inutile.
          disabled={busy || blocked.length > 0}
          onClick={async () => {
            const ok = await onSave(habitPayload(draft), note.trim() || null);
            if (ok) setSaved(true);
          }}
        >
          {t("household.habits.save")}
        </Button>
        {saved
          ? <span className="text-xs text-emerald-700">{t("household.habits.saved")}</span>
          : null}
      </div>
    </div>
  );
}
