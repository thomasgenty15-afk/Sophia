import React from "react";

import { supabase } from "../../lib/supabase";
import {
  EATING_OCCASIONS,
  type EatingOccasion,
  type EatingOccasionSlot,
} from "../api/mealGeneration";
import { mealCopy } from "../api/mealLabels";
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

const COPY = {
  title: "How your day runs",
  intro:
    "Tick the moments you actually eat on an ordinary day. Your week gets built " +
    "around those — no meal you did not name, and none of yours dropped.",
  time_hint: "Time is optional. Leave it blank if it moves around.",
  time_label: "around",
  save: "Save",
  saving: "…",
  saved: "Saved. Your next plan is built around this.",
  none:
    "Nothing ticked. Your week falls back to breakfast, lunch and dinner — the " +
    "ordinary assumption, not something you chose.",
  needs_goal: "Set your goal above first — this is saved alongside it.",
  open: "Change",
  close: "Close",
  summary_none: "Not set — your week falls back to breakfast, lunch and dinner.",
  unsaved: "Changed but not saved. Your week still runs on what is shown above.",
} as const;

/** `mealLabels` nomme déjà chaque créneau: pas de seconde table de libellés. */
function occasionLabel(slot: EatingOccasion): string {
  return mealCopy(`meals.slot.${slot}` as Parameters<typeof mealCopy>[0]);
}

/**
 * L'EMPREINTE D'UN RYTHME — ce qui décide que deux rythmes sont LE MÊME.
 *
 * Sur les six moments, dans l'ordre du jour: absent, ou pris avec son heure.
 * Une chaîne et pas un tableau, parce que le parent recalcule `props.rhythm` à
 * chaque rendu (`parseEatingRhythm(...)` appelé dans le JSX): comparer les
 * identités de tableaux dirait « changé » à chaque frappe de clavier voisine.
 */
function fingerprint(pick: (slot: EatingOccasion) => string | null | undefined): string {
  return EATING_OCCASIONS.map((slot) => {
    const at = pick(slot);
    return at === undefined ? "" : `${slot}@${at ?? ""}`;
  }).join("|");
}

function savedFingerprint(rhythm: readonly EatingOccasionSlot[]): string {
  return fingerprint((slot) => {
    const row = rhythm.find((o) => o.slot === slot);
    return row ? row.at : undefined;
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
  // L'état de saisie porte les SIX moments, cochés ou non, plus leur heure. On
  // ne dérive pas « décoché » de l'absence dans un tableau: décocher puis
  // recocher doit retrouver l'heure qu'on avait tapée.
  const [picked, setPicked] = React.useState<Set<EatingOccasion>>(
    () => new Set(props.rhythm.map((o) => o.slot)),
  );
  const [times, setTimes] = React.useState<Record<string, string>>(
    () => Object.fromEntries(props.rhythm.filter((o) => o.at).map((o) => [o.slot, o.at!])),
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
    setTimes(Object.fromEntries(props.rhythm.filter((o) => o.at).map((o) => [o.slot, o.at!])));
  }

  /** Ce que la carte repliée dit: le rythme ENREGISTRÉ, dans l'ordre du jour. */
  const savedSummary = React.useMemo(() => {
    const parts = EATING_OCCASIONS.flatMap((slot) => {
      const saved = props.rhythm.find((o) => o.slot === slot);
      if (!saved) return [];
      const label = occasionLabel(slot);
      return [saved.at ? `${label} ${COPY.time_label} ${saved.at}` : label];
    });
    return parts.length > 0 ? parts.join(" · ") : null;
  }, [props.rhythm]);

  /** Le brouillon s'écarte-t-il de ce qui est en base ? (repli ≠ perte) */
  const dirty =
    saved !==
    fingerprint((slot) => (picked.has(slot) ? times[slot]?.trim() || null : undefined));

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
        .map((slot) => ({ slot, at: times[slot]?.trim() || null }));

      // La fusion, et la garantie qu'une ligne a bougé, appartiennent au
      // module: un update qui ne matche rien répond 204 sans erreur, et cette
      // carte affichait alors « Saved » sur une saisie partie nulle part.
      await mergePracticalConstraints({
        userId: uid,
        current: props.practicalConstraints,
        patch: { eating_rhythm },
        source: "EatingRhythmCard",
      });
      setFlash(COPY.saved);
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
        <p className="mt-2 text-xs leading-5 text-gray-500">{COPY.intro}</p>
      )}

      <ul className="mt-4 space-y-2">
        {EATING_OCCASIONS.map((slot) => {
          const on = picked.has(slot);
          return (
            <li
              key={slot}
              className={`flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2 ${
                on ? "border-gray-900 bg-gray-50" : "border-gray-200"
              }`}
            >
              <label className="flex flex-1 cursor-pointer items-center gap-2.5">
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={on}
                  onChange={() => toggle(slot)}
                />
                <span className="text-sm font-medium text-gray-900">
                  {occasionLabel(slot)}
                </span>
              </label>
              {/* L'heure n'apparaît QUE sur un moment coché: un champ d'heure à
                  côté d'un moment qu'on ne prend pas est une question sans
                  objet, et six d'entre elles font une carte illisible. */}
              {on && (
                <label className="flex items-center gap-2 text-xs text-gray-500">
                  {COPY.time_label}
                  <input
                    type="time"
                    className="rounded-lg border border-gray-300 px-2 py-1 text-sm text-gray-900"
                    value={times[slot] ?? ""}
                    onChange={(e) => {
                      setFlash(null);
                      setTimes((prev) => ({ ...prev, [slot]: e.target.value }));
                    }}
                  />
                </label>
              )}
            </li>
          );
        })}
      </ul>

      <p className="mt-2 text-xs leading-5 text-gray-500">{COPY.time_hint}</p>

      {/* NE RIEN COCHER EST UN ÉTAT VALIDE, et l'écran dit ce qu'il produit
          plutôt que de refuser d'enregistrer. Le repli est le comportement du
          moteur avant qu'on pose la question — donc une hypothèse ordinaire, et
          la copie le nomme comme telle au lieu de la faire passer pour un
          choix. */}
      {picked.size === 0 && (
        <p className="mt-3 rounded-lg bg-gray-50 p-3 text-xs leading-5 text-gray-600">
          {COPY.none}
        </p>
      )}

      {!props.hasGoal && (
        <p className="mt-3 rounded-lg bg-amber-50 p-3 text-xs leading-5 text-amber-900">
          {COPY.needs_goal}
        </p>
      )}

      <div className="mt-4">
        <Button
          variant="secondary"
          disabled={busy || !props.hasGoal}
          onClick={() => void save()}
        >
          {busy ? COPY.saving : COPY.save}
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
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        {flash && <p className="mt-3 text-xs text-emerald-700">{flash}</p>}
      </>
    );
  }

  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <SectionLabel>{COPY.title}</SectionLabel>
        <button
          type="button"
          onClick={() => {
            setFlash(null);
            setOpen((o) => !o);
          }}
          aria-expanded={open}
          aria-controls="eating-rhythm-editor"
          className="shrink-0 text-xs font-medium text-gray-700 underline underline-offset-2 hover:text-gray-900"
        >
          {open ? COPY.close : COPY.open}
        </button>
      </div>

      {/* REPLIÉE, ELLE DOIT ENCORE DIRE CE QU'ELLE CONTIENT. Un bloc plié qui
          n'affiche qu'un titre oblige à l'ouvrir pour savoir sur quoi sa semaine
          est construite — et « rien d'écrit » est une réponse à afficher, pas un
          vide: c'est le repli sur trois repas, et l'élève doit le lire sans
          déplier. */}
      {!open && (
        <div className="mt-2">
          <p className="text-sm text-gray-900">{savedSummary ?? COPY.summary_none}</p>
          {dirty && <p className="mt-1 text-xs text-amber-700">{COPY.unsaved}</p>}
        </div>
      )}

      {open && editor}

      {/* Hors du bloc dépliable: un échec d'écriture, comme la confirmation
          qui suit le repli automatique, doit rester lisible dans les deux
          états. */}
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      {flash && <p className="mt-3 text-xs text-emerald-700">{flash}</p>}
    </Card>
  );
}
