import React from "react";

import { supabase } from "../../lib/supabase";
import {
  EATING_OCCASIONS,
  type EatingOccasion,
  type EatingOccasionSlot,
  MEAL_SIZES,
  type MealSize,
} from "../api/mealGeneration";
import { mealCopy } from "../api/mealLabels";
import { t } from "../i18n/t";
import { mergePracticalConstraints } from "../api/practicalConstraints";
import { Button } from "./ui/Button";
import { Card, SectionLabel } from "./ui/Card";

// LA FORME DE SA JOURNÉE — à quels moments cet élève mange, vraiment.
//
// ── LE DÉFAUT QUE ÇA CORRIGE, ET IL N'ÉTAIT PAS « ON NE DEMANDE PAS » ─────
// Le moteur imposait, en dur, trois repas par jour à tout le monde: « every day
// of the stretch needs breakfast, lunch and dinner ». Quelqu'un qui mange deux
// fois recevait un repas de trop; quelqu'un qui s'effondre à 17h n'avait aucun
// endroit où le dire, et sa journée s'arrêtait au déjeuner pour reprendre au
// dîner. Une faim qu'un plan ne nomme pas est une faim qu'on comble ailleurs —
// et c'est là que le plan le plus juste du monde s'écroule.
//
// ── POURQUOI CETTE CARTE EST À CÔTÉ DE L'OBJECTIF ET PAS DANS LE FORMULAIRE ─
// Le nombre de fois qu'on mange dans une journée est une propriété d'une VIE,
// pas d'une semaine. Le redemander à chaque génération serait la même friction
// que retaper son contexte à chaque fois — et la friction, sur une question
// stable, finit par produire des réponses bâclées. Elle se range donc dans
// `student_goals.practical_constraints`, la colonne prévue depuis le premier
// jour du pivot pour les contraintes STRUCTURÉES sur lesquelles le générateur
// branche (par opposition à `situation`, qu'il ne fait que lire).
//
// ── L'HEURE EST FACULTATIVE, ET CE N'EST PAS DE LA MOLLESSE ───────────────
// « Je grignote l'après-midi » est une information utile sans « à 17h ». Exiger
// l'heure ferait inventer une précision que l'élève n'a pas, et le moteur
// traiterait cette invention comme une contrainte. Cocher sans remplir est donc
// un état complet, pas un formulaire à moitié rempli.
//
// ── ELLE SE REPLIE — même règle que l'objectif juste au-dessus ────────────
// Six cases à cocher dépliées en permanence au-dessus du constructeur donnent
// l'impression qu'il reste quelque chose à remplir, et repoussent vers le bas
// la seule chose que l'élève vient voir: ses repas. Une fois son rythme écrit,
// c'est une propriété stable de sa vie — il n'y revient qu'en cas de
// changement. Elle s'ouvre donc d'elle-même tant que RIEN n'est écrit (c'est
// alors la question elle-même, et personne ne clique pour découvrir une
// question qu'il ignore) et reste repliée dès qu'il y a un rythme.
//
// Repliée, elle affiche CE QUI EST ENREGISTRÉ, jamais le brouillon en cours:
// une ligne pliée qui listerait des cases cochées non sauvegardées dirait que
// le moteur connaît ce créneau de 17h alors qu'aucune ligne ne le porte. Le
// brouillon divergent est signalé comme tel, et il survit au repli.

// ── I18N (lot 4) ──────────────────────────────────────────────────────────
// Le `COPY` local a rejoint le seed sous `meals.rhythm.*`. ⚠️ `meals.rhythm.title`
// est CITÉ MOT POUR MOT par `meals.picker.no_rhythm` (la grille des repas
// renvoie ici); les deux clés changent ensemble, dans les deux langues.

/** `mealLabels` nomme déjà chaque créneau: pas de seconde table de libellés. */
function occasionLabel(slot: EatingOccasion): string {
  return mealCopy(`meals.slot.${slot}` as Parameters<typeof mealCopy>[0]);
}

/**
 * L'EMPREINTE D'UN RYTHME — ce qui décide que deux rythmes sont LE MÊME.
 *
 * Sur les six moments, dans l'ordre du jour: absent, ou pris avec sa taille.
 * Une chaîne et pas un tableau, parce que le parent recalcule `props.rhythm` à
 * chaque rendu (`parseEatingRhythm(...)` appelé dans le JSX): comparer les
 * identités de tableaux dirait « changé » à chaque frappe de clavier voisine.
 */
function fingerprint(pick: (slot: EatingOccasion) => string | null | undefined): string {
  return EATING_OCCASIONS.map((slot) => {
    const size = pick(slot);
    return size === undefined ? "" : `${slot}@${size ?? ""}`;
  }).join("|");
}

function savedFingerprint(rhythm: readonly EatingOccasionSlot[]): string {
  return fingerprint((slot) => {
    const row = rhythm.find((o) => o.slot === slot);
    return row ? row.size : undefined;
  });
}

export interface EatingRhythmCardProps {
  /** `null` tant qu'aucune ligne `student_goals` n'existe: rien à mettre à jour. */
  hasGoal: boolean;
  /** Les autres clés de `practical_constraints`, à ne pas écraser. */
  practicalConstraints: Record<string, unknown>;
  rhythm: readonly EatingOccasionSlot[];
  onSaved: () => void | Promise<void>;
  /**
   * DANS LA FENÊTRE DE RÉGLAGES: pas d'encadré, pas de titre, pas de repli.
   *
   * Le repli existe parce que cette carte vivait sur la page, au-dessus des
   * repas que l'élève vient voir — dépliée en permanence, elle les repoussait
   * hors de l'écran. Dans une fenêtre qu'on a ouverte EXPRÈS pour régler ses
   * questions, la même mécanique devient un obstacle: il faudrait déplier
   * chacune des quatre sections avant de pouvoir répondre, et une section
   * repliée dans un dialogue se lit comme une section absente.
   *
   * `SetupSection` fournit alors le cadre, la couleur et le titre. Ce qui reste
   * ici est le formulaire et son enregistrement.
   */
  embedded?: boolean;
}

export default function EatingRhythmCard(props: EatingRhythmCardProps) {
  // L'état de saisie porte les SIX moments, cochés ou non, plus leur taille. On
  // ne dérive pas « décoché » de l'absence dans un tableau: décocher puis
  // recocher doit retrouver la taille qu'on avait choisie.
  const [picked, setPicked] = React.useState<Set<EatingOccasion>>(
    () => new Set(props.rhythm.map((o) => o.slot)),
  );
  const [sizes, setSizes] = React.useState<Record<string, MealSize>>(
    () => Object.fromEntries(props.rhythm.filter((o) => o.size).map((o) => [o.slot, o.size!])),
  );
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [flash, setFlash] = React.useState<string | null>(null);
  const [open, setOpen] = React.useState(() => props.rhythm.length === 0);

  // ── LE BROUILLON SUIT LE RYTHME ENREGISTRÉ QUAND CELUI-CI CHANGE ────────
  // Les initialiseurs ci-dessus ne tournent QU'AU MONTAGE. Cette carte a donc
  // longtemps affiché un rythme vide sur un élève qui en avait un: la page la
  // montait avant d'avoir lu `student_goals`, l'initialiseur voyait `[]`, et
  // plus rien ne le rattrapait quand la lecture arrivait. Le « Nothing ticked »
  // était faux, et le Save d'à côté effaçait pour de bon ce qui était en base.
  //
  // La page a maintenant son écran de chargement, donc le montage voit le vrai
  // rythme. Ce n'est pas une raison de rester monté sur cette hypothèse: elle
  // vit chez le parent, elle a déjà sauté une fois en silence, et ce qu'elle
  // protège est une ÉCRITURE DESTRUCTRICE. La carte se resynchronise donc
  // d'elle-même dès que l'empreinte enregistrée change sous elle.
  //
  // Sur l'empreinte et pas sur `props.rhythm`: un rendu du parent qui ne touche
  // pas au rythme (une frappe dans une carte voisine) ne doit pas jeter le
  // brouillon en cours. Et après une sauvegarde, ce qui est relu EST le
  // brouillon — la resynchronisation est alors sans effet visible.
  const saved = savedFingerprint(props.rhythm);
  const [syncedFrom, setSyncedFrom] = React.useState(saved);
  if (syncedFrom !== saved) {
    setSyncedFrom(saved);
    setPicked(new Set(props.rhythm.map((o) => o.slot)));
    setSizes(
      Object.fromEntries(props.rhythm.filter((o) => o.size).map((o) => [o.slot, o.size!])),
    );
  }

  /** Ce que la carte repliée dit: le rythme ENREGISTRÉ, dans l'ordre du jour. */
  const savedSummary = React.useMemo(() => {
    const parts = EATING_OCCASIONS.flatMap((slot) => {
      const saved = props.rhythm.find((o) => o.slot === slot);
      if (!saved) return [];
      const label = occasionLabel(slot);
      return [saved.size ? `${label} (${saved.size})` : label];
    });
    return parts.length > 0 ? parts.join(" · ") : null;
  }, [props.rhythm]);

  /** Le brouillon s'écarte-t-il de ce qui est en base ? (repli ≠ perte) */
  const dirty =
    saved !==
    fingerprint((slot) => (picked.has(slot) ? sizes[slot] ?? null : undefined));

  const toggle = (slot: EatingOccasion) => {
    setFlash(null);
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(slot)) next.delete(slot);
      else next.add(slot);
      return next;
    });
  };

  async function save() {
    setBusy(true);
    setError(null);
    setFlash(null);
    try {
      const { data: sess } = await supabase.auth.getUser();
      const uid = sess.user?.id;
      if (!uid) throw new Error("not_signed_in");

      // L'ORDRE DE LA JOURNÉE, pas celui des clics. On lit sa journée du réveil
      // au coucher, et le moteur la relit dans l'ordre reçu.
      const eating_rhythm = EATING_OCCASIONS
        .filter((slot) => picked.has(slot))
        .map((slot) => ({ slot, size: sizes[slot] ?? null }));

      // La fusion, et la garantie qu'une ligne a bougé, appartiennent au
      // module: un update qui ne matche rien répond 204 sans erreur, et cette
      // carte affichait alors « Saved » sur une saisie partie nulle part.
      await mergePracticalConstraints({
        userId: uid,
        current: props.practicalConstraints,
        patch: { eating_rhythm },
        source: "EatingRhythmCard",
      });
      setFlash(t("meals.rhythm.saved"));
      await props.onSaved();
      // Enregistré => la carte se replie, comme celle de l'objectif. Le geste
      // suivant est de composer ses repas, pas de relire les cases qu'on vient
      // de cocher. Le `flash` reste visible SOUS le résumé: replier ne doit pas
      // effacer la confirmation de ce qu'on vient d'écrire.
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  // LE FORMULAIRE, une seule fois, quel que soit le cadre qui l'entoure.
  // Hissé hors du `return` pour que le mode intégré et le mode carte ne soient
  // pas deux copies de la même saisie — deux copies divergeraient, et c'est
  // toujours celle qu'on ne regarde pas qui garde le vieux comportement.
  const editor = (
      <div id="eating-rhythm-editor">
      {/* L'intro n'existe QUE sur la page: dans la fenêtre, `SetupSection` la
          porte déjà, en une ligne. La répéter ferait le mur de texte que la
          fenêtre existe pour supprimer. */}
      {!props.embedded && (
        <p className="mt-2 text-xs leading-5 text-ink-soft">{t("meals.rhythm.intro")}</p>
      )}

      <ul className="mt-4 space-y-2">
        {EATING_OCCASIONS.map((slot) => {
          const on = picked.has(slot);
          return (
            // UN MOMENT RETENU SE VOIT À DEUX CHOSES, ET AUCUNE N'EST UNE
            // COULEUR D'ÉTAT: le trait passe à l'encre pleine, et le fond prend
            // le lavis de survol de la marque (`fig-50`, `ink` dessus =
            // 15,39:1). `bg-gray-50` ne pouvait plus rien dire ici — la page est
            // `paper` et la charte ne nomme aucun neutre plus clair.
            <li
              key={slot}
              className={`flex flex-wrap items-center gap-3 rounded-card border px-3 py-2 ${
                on ? "border-ink bg-fig-50" : "border-line"
              }`}
            >
              <label className="flex flex-1 cursor-pointer items-center gap-2.5">
                {/* `accent-ink`, ET CE N'EST PAS DÉCORATIF. Sans lui, une case
                    cochée est rendue dans la couleur d'accent du SYSTÈME —
                    bleue sur les réglages par défaut de macOS et de Windows.
                    C'est-à-dire une saturée que personne n'a choisie, dans la
                    teinte que `Badge tone="info"` occupe. */}
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-ink"
                  checked={on}
                  onChange={() => toggle(slot)}
                />
                <span className="text-sm font-medium text-ink">
                  {occasionLabel(slot)}
                </span>
              </label>
              {/* LA TAILLE N'APPARAÎT QUE SUR UN MOMENT COCHÉ: une taille à
                  côté d'un moment qu'on ne prend pas est une question sans
                  objet, et six d'entre elles font une carte illisible.

                  TROIS BOUTONS ET PAS UN `<select>`: les trois valeurs tiennent
                  dans la largeur, et un menu déroulant demanderait deux gestes
                  pour une réponse à trois issues. Le choix se REPREND — cliquer
                  la valeur active la retire, parce que « je n'ai rien dit » est
                  un état valide qu'un groupe de radios ne sait pas rendre une
                  fois qu'on a cliqué. */}
              {on && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-ink-soft">{t("meals.rhythm.size_label")}</span>
                  <div className="flex gap-1">
                    {MEAL_SIZES.map((size) => {
                      const active = sizes[slot] === size;
                      return (
                        <button
                          key={size}
                          type="button"
                          aria-pressed={active}
                          onClick={() => {
                            setFlash(null);
                            setSizes((prev) => {
                              const next = { ...prev };
                              if (next[slot] === size) delete next[slot];
                              else next[slot] = size;
                              return next;
                            });
                          }}
                          // MÊME VOCABULAIRE QUE LES JOURS DE CUISINE
                          // (`CookingCapacityCard`): une valeur retenue est un
                          // fait saisi, donc l'encre pleine et jamais la marque.
                          // `line-strong` (3,84:1) sur l'inactive, parce que
                          // c'est la bordure d'un CONTRÔLE — `line` est à
                          // 1,30:1, décoratif (WCAG 1.4.11).
                          className={`rounded-full border px-2.5 py-1 text-xs capitalize transition-colors ${
                            active
                              ? "border-ink bg-ink text-paper"
                              : "border-line-strong text-ink hover:bg-fig-50"
                          }`}
                        >
                          {size}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <p className="mt-2 text-xs leading-5 text-ink-soft">{t("meals.rhythm.size_hint")}</p>

      {/* NE RIEN COCHER EST UN ÉTAT VALIDE, et l'écran dit ce qu'il produit
          plutôt que de refuser d'enregistrer. Le repli est le comportement du
          moteur avant qu'on pose la question — donc une hypothèse ordinaire, et
          la copie le nomme comme telle au lieu de la faire passer pour un
          choix. */}
      {/* ⚠️ `paper-2` ET UN TRAIT, PAS UN SECOND APLAT CLAIR. Le fond de la
          carte EST `paper`: un `bg-gray-50` n'avait plus rien de plus clair à
          être. `paper-2` (#F4EFF2) est le fond alterné de la charte et l'idiome
          du fronton de `SetupSection`. Ce n'est PAS un état — l'ambre juste
          en dessous, lui, en est un. */}
      {picked.size === 0 && (
        <p className="mt-3 rounded-card border border-line bg-paper-2 p-3 text-xs leading-5 text-ink-soft">
          {t("meals.rhythm.none")}
        </p>
      )}

      {/* ⛔ AMBRE = ATTENTION, ET ÇA NE BOUGE PAS. Un avertissement porte un
          FAIT: il a droit à une surface saturée (arbitrage §5.2 de l'audit). */}
      {!props.hasGoal && (
        <p className="mt-3 rounded-card border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
          {t("meals.rhythm.needs_goal")}
        </p>
      )}

      <div className="mt-4">
        <Button
          variant="secondary"
          disabled={busy || !props.hasGoal}
          onClick={() => void save()}
        >
          {busy ? t("meals.rhythm.saving") : t("meals.rhythm.save")}
        </Button>
      </div>
      </div>
  );

  // ── DANS LA FENÊTRE ─────────────────────────────────────────────────────
  // Pas de cadre, pas de titre, pas de repli — mais l'erreur et la
  // confirmation restent, parce qu'elles disent si le geste a pris.
  if (props.embedded) {
    return (
      <>
        {editor}
        {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
        {flash && <p className="mt-3 text-xs text-emerald-700">{flash}</p>}
      </>
    );
  }

  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <SectionLabel>{t("meals.rhythm.title")}</SectionLabel>
        <button
          type="button"
          onClick={() => {
            setFlash(null);
            setOpen((o) => !o);
          }}
          aria-expanded={open}
          aria-controls="eating-rhythm-editor"
          // UN LIEN, DONC LA MARQUE (charte §2). `fig-700`/`paper` = 9,98:1.
          className="shrink-0 text-xs font-medium text-fig-700 underline underline-offset-2 hover:text-fig-800"
        >
          {open ? t("meals.rhythm.close") : t("meals.rhythm.open")}
        </button>
      </div>

      {/* REPLIÉE, ELLE DOIT ENCORE DIRE CE QU'ELLE CONTIENT. Un bloc plié qui
          n'affiche qu'un titre oblige à l'ouvrir pour savoir sur quoi sa semaine
          est construite — et « rien d'écrit » est une réponse à afficher, pas un
          vide: c'est le repli sur trois repas, et l'élève doit le lire sans
          déplier. */}
      {!open && (
        <div className="mt-2">
          <p className="text-sm text-ink">{savedSummary ?? t("meals.rhythm.summary_none")}</p>
          {dirty && <p className="mt-1 text-xs text-amber-700">{t("meals.rhythm.unsaved")}</p>}
        </div>
      )}

      {open && editor}

      {/* Hors du bloc dépliable: un échec d'écriture, comme la confirmation
          qui suit le repli automatique, doit rester lisible dans les deux
          états. */}
      {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
      {flash && <p className="mt-3 text-xs text-emerald-700">{flash}</p>}
    </Card>
  );
}
