import React from "react";
import { useSearchParams } from "react-router-dom";

import { useAuth } from "../../context/AuthContext";
import {
  type KnownBlock,
  KNOWN_BLOCKS,
  type KnownMouth,
  type KnownStore,
  loadKnownRoster,
  loadKnownStore,
  persistKnownStore,
} from "../api/retainedItems";
import {
  fieldChangesFrom,
  saveUndoneFieldChanges,
  undoFieldChange,
} from "../api/fieldChanges";
import { normalizeFocusLines } from "../api/memoryView";
import { memoFrom, withoutMemoLine } from "../api/retainedItems";
import { localDateIn } from "../api/dates";
import { supabase } from "../../lib/supabase";
import KeelAppShell from "../components/KeelAppShell";
import KnownAboutYouCard from "../components/KnownAboutYouCard";
import { Card } from "../components/ui/Card";
import { t } from "../i18n/t";

// KEEL — `/app/about-you` : « CE QUE SOPHIA SAIT DE TOI ».
//
// ── POURQUOI UNE DESTINATION, ET PAS UNE CARTE DE PLUS ────────────────────
// Tout ce que le produit retient d'une personne vivait dans une carte repliée,
// en bas de `/app/plan` (`StudentWeekPlanPage:2329`). La promesse « rien
// d'opaque » dépendait donc du hasard d'un défilement — et d'un écran qu'on
// ouvre pour composer sa semaine, pas pour se relire. §6 de
// `docs/keel/NOMENCLATURE-MEMOIRE.md` tranche: elle devient une destination à
// elle, avec son entrée de nav (une route sans lien est une fonctionnalité que
// personne n'a).
//
// ── ⚠️ LA GATE DE CHARGEMENT N'EST PAS DU CONFORT ─────────────────────────
// Cicatrice nommée du dépôt: « formulaire figé au montage sans gate » — il
// affiche du vide non lu, puis l'ÉCRASE au Save. Ici le prix serait maximal:
// la carte écrit la liste ENTIÈRE des items, donc un rendu avant lecture
// enverrait `[]` et effacerait tout ce que la personne avait déclaré. La carte
// n'est donc montée QUE sur l'état `ready`.
//
// ── ⟳ LE PORT D'ÉCRITURE EST POSÉ (corrigé le 2026-09-03) ─────────────────
// Ce bloc disait: « la migration est ÉCRITE et NON LANCÉE, chaque
// enregistrement rend `no_write_port` ». C'était vrai le jour où il a été
// écrit, et faux depuis: `20260818240000_a_write_port_for_what_sophia_knows.sql`
// est au registre, et cet écran enregistre pour de bon.
//
// ⚠️ CE QUI RESTE VRAI, ET QU'ON NE RETIRE PAS AVEC LA PHRASE PÉRIMÉE: le refus
// `no_write_port` EXISTE toujours et se rend toujours sous le bouton pressé. Il
// est la réponse d'un déploiement où le front est plus neuf que la base — le
// cas le plus courant d'un déploiement en deux temps. Un refus nommé, sous le
// geste, plutôt qu'un « Saved » posé sur un 204 silencieux.
//
// ⚠️ ET LA LEÇON GÉNÉRALE, PARCE QU'ELLE A COÛTÉ: une phrase de commentaire qui
// décrit un ÉTAT (« pas encore lancée ») survit à sa cause et se met à mentir.
// Ce dépôt en porte la cicatrice — « une contrainte documentée survit à sa
// cause ». Ce qui décrit une RÈGLE vieillit bien; ce qui décrit un état du
// jour, non.

type LoadState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; store: KnownStore; roster: KnownMouth[] };

export default function StudentKnownPage() {
  const [params] = useSearchParams();
  // ⛔ VALIDÉS, PAS RECOPIÉS. `focus` est comparé au vocabulaire fermé des
  // blocs et `at` à la forme d'un jour: ils viennent de l'URL, c'est-à-dire de
  // la barre d'adresse autant que d'un bouton.
  const rawFocus = String(params.get("focus") ?? "").trim();
  const focus = (KNOWN_BLOCKS as readonly string[]).includes(rawFocus)
    ? rawFocus as KnownBlock
    : null;
  const rawAt = String(params.get("at") ?? "").trim();
  const focusAt = /^\d{4}-\d{2}-\d{2}$/.test(rawAt) ? rawAt : null;
  // ⟳ 2026-09-05 — `line` répète le texte de chaque ligne que la bulle a
  // écrite: la carte allume celles-là. Validé (textes non vides, plafonné) et
  // mémoïsé: un tableau neuf à chaque rendu relancerait le surlignage.
  const focusLines = React.useMemo(
    () => normalizeFocusLines(params.getAll("line")),
    [params],
  );

  const { user } = useAuth();
  const userId = user?.id ?? "";

  const [state, setState] = React.useState<LoadState>({ kind: "loading" });

  /**
   * LE JOUR LOCAL DE LA PERSONNE, résolu UNE fois par montage.
   *
   * ⚠️ Il sert de `at` à toute ligne que la personne re-signe, et de « today »
   * à l'expiration des envies. `localDateIn` prend le fuseau de l'appareil et
   * rend un `yyyy-mm-dd` — jamais un `new Date().toISOString()`, qui donnerait
   * le lendemain à un Européen après 22 h. Un « je l'ai écrit mardi » daté de
   * mercredi est un écran de transparence qui ment.
   */
  const today = React.useMemo(
    () => localDateIn(Intl.DateTimeFormat().resolvedOptions().timeZone),
    [],
  );

  const refresh = React.useCallback(async () => {
    if (!userId) return;
    try {
      // Les deux lectures ensemble: la carte a besoin des bouches pour NOMMER
      // qui est concerné par un ajustement de portion, et une carte à moitié
      // chargée afficherait « — » à la place des prénoms le temps d'un rendu.
      const [store, roster] = await Promise.all([
        loadKnownStore(userId),
        loadKnownRoster(),
      ]);
      setState({ kind: "ready", store, roster });
    } catch (error) {
      setState({
        kind: "error",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }, [userId]);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  const shell = (children: React.ReactNode) => (
    <KeelAppShell title={t("known.title")}>
      {children}
    </KeelAppShell>
  );

  if (state.kind === "loading") {
    return shell(<p className="text-sm text-ink-soft">{t("known.loading")}</p>);
  }

  if (state.kind === "error") {
    return shell(
      <Card tone="warning">
        <p className="text-sm text-amber-900">
          {t("known.error.load", { message: state.message })}
        </p>
      </Card>,
    );
  }

  const { store, roster } = state;

  if (!store.hasGoal) {
    // Pas de ligne `student_goals` = rien à lire ET rien à écrire. Le dire
    // plutôt que rendre six sections vides qui laisseraient croire que Sophia
    // ne retient rien.
    return shell(
      <Card tone="dashed">
        <p className="text-sm text-ink-soft">{t("known.no_goal")}</p>
      </Card>,
    );
  }

  const members = new Map(roster.map((m) => [m.memberId, m.displayName]));

  return shell(
    <>
      <p className="mb-6 text-sm text-ink-soft">{t("known.intro")}</p>
      <KnownAboutYouCard
        store={store}
        members={members}
        roster={roster}
        today={today}
        // ── D'OÙ ON ARRIVE, QUAND ON ARRIVE D'UNE BULLE ───────────────────
        //
        // Le bouton « Voir » d'un message du chat ouvre cette page sur le bloc
        // qui vient d'être écrit, et surligne la ligne du jour. Sans ça, la
        // personne arrive en haut d'une page à cinq blocs et cherche ce dont on
        // vient de lui parler — ce qui est exactement le geste que le bouton
        // existe pour lui épargner.
        //
        // ⚠️ LES DEUX SONT FACULTATIFS ET VALIDÉS. Un `focus` hors du
        // vocabulaire des blocs, ou un `at` qui n'est pas un jour, ne surligne
        // rien: ce sont des paramètres d'URL, donc du texte que n'importe qui
        // peut écrire.
        focus={focus}
        focusAt={focusAt}
        focusLines={focusLines}
        // ── LOT M5 · CE QUE L'IA A CHANGÉ DANS LES RÉGLAGES ────────────────
        //
        // ⛔ SANS CE FIL, L'ÉCRITURE DU LOT M5 SERAIT PIRE QUE LE CORRECTIF
        // MUET QU'ELLE REMPLACE. Avant, `cooking_time_min` n'était pas touché:
        // les générateurs posaient la valeur en mémoire au moment de composer,
        // et la personne lisait 45 min pendant que son plan était fait sur 30.
        // Maintenant le réglage change POUR DE BON — donc il faut qu'elle
        // puisse le voir, en connaître la cause, et le remettre.
        // ── LOT M4 · LE MÉMO ────────────────────────────────────────────
        // ⛔ IL SE VOIT, ET C'EST UNE CONDITION D'EXISTENCE. Un mémo caché,
        // sans plafond, injecté dans chaque prompt est le magasin que ce
        // chantier supprime avec un autre chapeau — et il ATTEINT le prompt
        // (les deux générateurs le passent). Le montrer ici est la
        // contrepartie qui rend cette injection acceptable.
        memo={memoFrom(store.constraints)}
        onRemoveMemoLine={async (index) => {
          // ⛔ LA RÈGLE VIT DANS `withoutMemoLine`, PAS ICI: par POSITION,
          // jamais par texte. `null` est un refus (index hors bornes, colonne
          // illisible), jamais un repli — écrire quand même poserait une
          // colonne qu'on n'a pas su lire.
          const next = withoutMemoLine(store.constraints, index);
          if (!next) throw new Error(t("known.error.unreadable"));
          await saveUndoneFieldChanges({
            supabase,
            userId,
            practicalConstraints: next,
          });
          await refresh();
        }}
        fieldChanges={fieldChangesFrom(store.constraints)}
        onUndoFieldChange={async (index) => {
          // ⛔ LA RÈGLE VIT DANS `undoFieldChange`, PAS ICI. C'est elle qui
          // remet la valeur d'AVANT et qui RETIRE la clé quand il n'y en avait
          // pas — la réimplémenter ici ferait deux versions d'une règle dont la
          // seconde divergerait en silence.
          const next = undoFieldChange(store.constraints, index);
          // `null` est un REFUS (index hors bornes, journal illisible), jamais
          // un repli: écrire quand même poserait une colonne qu'on n'a pas su
          // lire.
          if (!next) throw new Error(t("known.error.unreadable"));
          await saveUndoneFieldChanges({
            supabase,
            userId,
            practicalConstraints: next,
          });
          await refresh();
        }}
        onSave={async (next) => {
          // ⚠️ L'ÉCRITURE EST CIBLÉE ET SA GARDE EST DANS LE PRÉDICAT: la RPC
          // compare la valeur LIVE à celle qu'on a LUE (`store.rawItems`), donc
          // un geste posé sur un état périmé est REFUSÉ (`stale_snapshot`) au
          // lieu d'écraser celui d'un tiers. Le refus remonte à la carte, qui
          // le rend sous le bouton.
          await persistKnownStore({
            store,
            items: next.items,
            nextPlan: next.nextPlan,
            notes: next.notes,
          });
          await refresh();
        }}
      />
    </>,
  );
}
