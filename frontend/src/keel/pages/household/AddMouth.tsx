// ⟳ 2026-09-24 — SORTI DE `HouseholdPage.tsx` (découpage, lot 4c), À L'IDENTIQUE.
// L'ajout d'une bouche: la carte et sa fenêtre.
// Le fichier d'origine l'atteint par ses imports; il ré-exporte ce qu'il exportait.

import React from "react";
import type { EatingOccasion } from "../../api/mealGeneration";
import { blockList, emptyMouthDraft, filledPreferenceBlocks, type MouthFormDraft } from "../../lib/mouthForm";
import { useEatingStructure } from "../../lib/useEatingStructure";
import { MouthCoreFields, MouthPreferencesFields } from "../../components/MouthFormDialog";
import Modal from "../../components/ui/Modal";
// ⛔ LE PLAFOND, EN UN SEUL EXEMPLAIRE (A5). Il vit en base
// (`keel_household_max_mouths()`); cette constante ne le décide pas, elle
// l'ANNONCE avant le clic. Elle était recopiée ici sous un second nom.
import { HOUSEHOLD_MAX_MOUTHS } from "../../api/onboarding";
import { t } from "../../i18n/t";
import { Button } from "../../components/ui/Button";
import { SheetFrame } from "./SheetFrame.tsx";

/**
 * AJOUTER UNE BOUCHE — le geste que tout ce chantier existe pour permettre.
 *
 * ── ⚠️ LE FORMULAIRE EST DEVENU UNE FENÊTRE LE 2026-08-18 (lot L5) ────────
 * Trois champs en ligne (prénom, naissance, direction) laissaient une personne
 * inscrite dont on ne savait NI le corps, NI son niveau d'activité, NI ce
 * qu'elle mange déjà — c'est-à-dire une bouche que la composition dimensionne
 * au jugé. La fenêtre pose les six blocs de la conception d'un seul geste.
 *
 * ⚠️ ELLE SE FERME TOUJOURS, et le formulaire NE SE REPLIE PAS tout seul après
 * un ajout: il se vide et se rouvre. Trois personnes d'affilée sans quitter le
 * flux est la mesure de ce lot, et une fenêtre qui se referme à chaque succès
 * la rate.
 */
export function AddMouthCard(
  { count, slots, busy, todayLocalIso, failure, onAdd }: {
    count: number;
    busy: boolean;
    todayLocalIso: string;
    /** Le refus du dernier geste, ou `null`. REQUIS — voir `MouthFormDialog`. */
    failure: string | null;
    onAdd: (draft: MouthFormDraft) => Promise<boolean>;
    /**
     * LES MOMENTS DE LA MAISON. REQUIS, même raison qu'ailleurs — et c'est
     * bien CEUX DE LA MAISON: quelqu'un qu'on ajoute n'a encore rien dit de
     * lui, et le repli documenté de `null` sur sa ligne est le rythme du foyer.
     */
    slots: readonly EatingOccasion[];
  },
) {
  const [open, setOpen] = React.useState(false);
  const [draft, setDraft] = React.useState<MouthFormDraft>(emptyMouthDraft);

  // LE PLAFOND REND SON MOTIF. La limite vit en base (`household_full`) et doit
  // tenir face à un appel direct de la RPC; ici on ne fait que la DIRE, et on
  // la dit AVANT le refus plutôt qu'après.
  const full = count >= HOUSEHOLD_MAX_MOUTHS;

  return (
    // ── LE PIED DE LA LISTE, PLUS UNE CARTE À PART (2026-09-09) ────────────
    // Elle était une `Card` avec son propre titre de section (« ajouter
    // quelqu'un ») et sa phrase, posée entre la fiche du titulaire et la liste
    // des bouches: trois en-têtes pour un seul sujet. Le geste allonge la
    // liste — il vit sous elle, séparé par le même trait que les blocs d'une
    // fiche. `household.add.body` est partie des deux packs: elle expliquait
    // un titre qui n'existe plus.
    <div className="mt-3 border-t border-line pt-3">
      {full ? (
        // LE PLAFOND ATTEINT EST UN FAIT, donc l'ambre reste (charte §2:
        // ambre = attention). Ce qui change: le rayon passe au vocabulaire, et
        // l'encre à `amber-800`, la valeur que `Badge tone="caution"` emploie —
        // un état se reconnaît d'un écran à l'autre à sa VALEUR, pas seulement
        // à sa famille.
        <p className="rounded-card bg-amber-50 p-3 text-sm text-amber-800">
          {t("household.add.full")}
        </p>
      ) : (
        <div>
          {/* ── ⟳ A5 POINT 3 — UNE SEULE FENÊTRE, ET TOUT EST DEDANS ───────
              La fiche était EN LIGNE sur la page (les trois blocs
              obligatoires), et les goûts derrière un second écran (`Modal`).
              Deux surfaces pour une seule personne, dont une qui s'ouvrait
              par-dessus l'autre.

              Le bouton ouvre maintenant UNE fenêtre qui porte les deux: les
              blocs obligatoires en ligne, les préférences dans un accordéon
              DEDANS.

              ⛔ PAS DEUX `Modal` IMBRIQUÉS, et ce n'est pas un goût: `Modal`
              passe par `createPortal(document.body)`, et deux portails
              empilés n'ont JAMAIS été essayés dans ce dépôt — ni le piège du
              focus, ni celui de la touche Échap (laquelle ferme?), ni celui du
              défilement de fond. L'accordéon (`SheetFrame`, le troisième usage
              qui le justifie) répond à la même demande sans ouvrir ce
              chantier-là. */}
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() => setOpen(true)}
          >
            {t("household.add.open")}
          </Button>
          <Modal
            open={open}
            onClose={() => setOpen(false)}
            title={draft.firstName.trim()
              ? t("household.mouth.preferences_title_named", {
                name: draft.firstName.trim(),
              })
              : t("household.add.title")}
            size="lg"
            closeAsIcon
            closeLabel={t("common.close")}
          >
            <AddMouthForm
              draft={draft}
              onChange={setDraft}
              todayLocalIso={todayLocalIso}
              busy={busy}
              failure={failure}
              slots={slots}
              onSubmit={() => {
                void (async () => {
                  const ok = await onAdd(draft);
                  if (!ok) return;
                  // ON VIDE ET ON FERME: le brouillon suivant est celui de
                  // quelqu'un d'autre, et une fenêtre restée ouverte sur les
                  // préférences de la personne d'avant écrirait dans la fiche
                  // de la suivante.
                  setDraft(emptyMouthDraft());
                  setOpen(false);
                })();
              }}
            />
          </Modal>
        </div>
      )}
    </div>
  );
}

/**
 * LE CORPS DE LA FENÊTRE D'AJOUT — A5 point 3, 2026-09-03.
 *
 * ⚠️ UN COMPOSANT À PART, ET C'EST UNE CONTRAINTE DE PREUVE, PAS UN GOÛT.
 * `Modal` passe par `createPortal(…, document.body)`, et `renderToStaticMarkup`
 * ne rend RIEN d'un portail: monté à travers le chrome, ce formulaire serait
 * une chaîne vide, et chaque assertion qui le vise serait verte quoi qu'il
 * arrive. Les tests de ce dépôt montent donc les CORPS, jamais le chrome.
 *
 * ⛔ ET IL N'OUVRE PAS DE SECONDE FENÊTRE. Le bouton des préférences (dans
 * `MouthCoreFields`) bascule l'accordéon qui est JUSTE EN DESSOUS, dans la même
 * fenêtre — deux `createPortal` empilés n'ont jamais été essayés ici.
 */
export function AddMouthForm(
  { draft, onChange, todayLocalIso, busy, failure, slots, onSubmit }: {
    draft: MouthFormDraft;
    onChange: React.Dispatch<React.SetStateAction<MouthFormDraft>>;
    todayLocalIso: string;
    busy: boolean;
    failure: string | null;
    slots: readonly EatingOccasion[];
    onSubmit: () => void;
  },
) {
  // OUVERT PAR DÉFAUT? NON — ET C'EST LE SEUL CADRE DE CE LOT QUI NE L'EST PAS.
  // Les cadres d'une fiche EXISTANTE s'ouvrent parce qu'ils portent des
  // réponses déjà données, qu'on cacherait sinon. Ici il n'y a encore rien à
  // cacher: la personne n'existe pas, et les six blocs de goûts au-dessus du
  // bouton « Ajouter » feraient une fenêtre de trente champs pour quelqu'un qui
  // veut juste inscrire un prénom. Le récapitulatif dit ce qui s'y trouve.
  const [prefsOpen, setPrefsOpen] = React.useState(false);
  const filled = filledPreferenceBlocks(draft);
  // ⚠️ `existing: false` — on l'AJOUTE. `hasAccount: false` — une bouche qu'on
  // saisit n'a jamais de compte au moment où on la saisit; elle en gagne un si
  // elle réclame sa place plus tard.
  const subject = { existing: false, hasAccount: false, isSelf: false } as const;
  // ⚠️ FF-060 — CE FORMULAIRE CALCULE LE SIEN. Il a le brouillon et la date
  // locale; lui faire descendre la structure en prop l'aurait couplé à un
  // parent qui n'a pas besoin de la connaître, et le troisième site de montage
  // aurait fini par l'oublier.
  const structure = useEatingStructure({
    draft,
    active: prefsOpen,
    todayLocalIso,
    // UNE SEULE BOUCHE PAR MONTAGE: la fiche d'ajout ne parle que d'elle.
    subject: "new",
  });

  return (
    <div className="flex flex-col gap-4">
      <MouthCoreFields
        draft={draft}
        onChange={onChange}
        subject={subject}
        todayLocalIso={todayLocalIso}
        busy={busy}
        failure={failure}
        // ⛔ IL BASCULE L'ACCORDÉON, IL N'OUVRE PAS UNE FENÊTRE.
        onOpenPreferences={() => setPrefsOpen((v) => !v)}
        onSubmit={onSubmit}
      />
      <SheetFrame
        title={t("household.member.frame_preferences")}
        open={prefsOpen}
        onToggle={() => setPrefsOpen((v) => !v)}
        // RIEN À LIRE: ce brouillon n'existe qu'ici, il ne vient d'aucune
        // lecture. La garde n'a donc rien à retenir — et c'est le seul site du
        // lot où elle est vraie par construction.
        loaded
        summary={filled.length === 0
          ? t("household.mouth.preferences_empty")
          : t("household.mouth.preferences_filled", {
            blocks: blockList(
              filled.map((b) =>
                t(`household.mouth.block_${b}` as "household.mouth.block_identity")
              ),
            ),
          })}
      >
        <MouthPreferencesFields
          draft={draft}
          onChange={onChange}
          subject={subject}
          busy={busy}
          structure={structure}
          // FERMER L'ACCORDÉON, PAS LA FENÊTRE: la fiche obligatoire est
          // au-dessus, et refermer la fenêtre entière perdrait le geste.
          onClose={() => setPrefsOpen(false)}
          slots={slots}
          // ⟳ ELLE A BIEN OÙ RANGER SON SHAKER DEPUIS LE 2026-08-19
          // (`household_members.fixed_intakes`), et c'est « Ajouter » qui
          // l'écrit: la ligne membre n'existe qu'après. Voir `ShakerPort`.
          shakerPort={{ kind: "with_the_card" }}
        />
      </SheetFrame>
    </div>
  );
}
