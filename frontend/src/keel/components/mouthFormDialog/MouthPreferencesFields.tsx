// ⟳ 2026-09-24 — SORTI DE `MouthFormDialog.tsx` (découpage, lot 4a), À L'IDENTIQUE.
// Les blocs 4-6, rendus dans la fenêtre des préférences.
// Le fichier d'origine ré-exporte ce qu'il exportait: aucun appelant ne change
// d'import.

import React from "react";

import { Button } from "../ui/Button";
import { Field, inputClass } from "../ui/Field";
import { t } from "../../i18n/t";
import { DIET_ANSWERS } from "../../api/onboarding";
import {
  EATING_OCCASIONS,
  type EatingOccasionSlot,
} from "../../api/mealGeneration";
import { mealCopy } from "../../api/mealLabels";
import { type MouthVoice, voiced, whoOf } from "../../lib/mouthVoice";
import { type MouthFormDraft, shakerIsForeground } from "../../lib/mouthForm";
import { rhythmPrefillFor, rhythmPrefillLatches } from "../../lib/rhythmPrefill";
import { slotBearsLight, toggleLight } from "../../lib/mealExtras";
import SideCoursesField from "../SideCoursesField";
import type { MouthPreferencesFieldsProps } from "./types.ts";
import { HABIT_PLACEHOLDERS } from "./labels.ts";
import { Section } from "./blocks.tsx";
import { TermsEntry } from "./TermsEntry.tsx";
import { ShakerFields } from "./ShakerFields.tsx";
import { MouthAppetiteFields } from "./ActivityAndAppetiteFields.tsx";

/**
 * LES BLOCS 4-6 — CE QUI AFFINE, JAMAIS CE QUI STRUCTURE.
 *
 * ⚠️ ILS ÉDITENT LE BROUILLON DE LA FICHE, ET N'ENREGISTRENT RIEN. Il n'y a
 * donc ici NI bouton de save, NI ligne « il manque… »: les trois blocs qui
 * retiennent l'enregistrement sont en ligne, dans `MouthCoreFields`, et leur
 * refus est rendu à côté du bouton qui les lève. Poser un second bouton
 * d'enregistrement sur le même brouillon ferait diverger les deux écritures —
 * la cicatrice « deux formulaires qui écrivent les mêmes colonnes ».
 *
 * ⚠️ LA FENÊTRE SE FERME TOUJOURS, et fermer ne jette rien: le brouillon vit
 * chez l'appelant. La phrase du bas le DIT, parce que personne ne peut le
 * deviner d'un `onClose`.
 */
export function MouthPreferencesFields(
  props: MouthPreferencesFieldsProps,
): React.ReactElement {
  const { draft, onChange, subject } = props;
  const set = (patch: Partial<MouthFormDraft>) =>
    onChange((prev) => ({ ...prev, ...patch }));
  const voice: MouthVoice = subject.isSelf ? "self" : "other";
  const who = whoOf(draft.firstName, t("household.mouth.who_fallback"));

  /**
   * ══════════════════════════════════════════════════════════════════════
   * FF-060 — LES MOMENTS DÉRIVÉS SONT PROPOSÉS COCHÉS, UNE SEULE FOIS
   * ══════════════════════════════════════════════════════════════════════
   *
   * ⚠️ CE N'EST PAS INVENTER UNE RÉPONSE: c'est MONTRER celle que le plan
   * appliquera de toute façon. Le générateur ouvre ces moments avec ou sans
   * cet écran; les laisser vides ferait composer une journée en cinq temps à
   * quelqu'un dont la fiche en montre trois — et le désaccord se découvrirait
   * au plan, c'est-à-dire trop tard.
   *
   * ⛔ SEULEMENT QUAND RIEN N'EST DÉCLARÉ (`rhythm === null`). Une personne qui
   * a coché ses moments a répondu: on ne réécrit pas sa réponse, on verrouille
   * seulement son plancher. Et comme la condition tombe dès qu'on a écrit, cet
   * effet ne peut pas boucler.
   *
   * ── ⟳ 2026-09-08 — REVENU, APRÈS AVOIR ÉTÉ RETIRÉ LE 2026-09-06 ─────────
   * La pierre tombale qui vivait ici disait qu'une pré-coche confond le
   * PLANCHER (« ce corps a besoin de N moments ») et la DÉCLARATION (« voilà
   * quand je mange »), et que la cicatrice `auto-tick-writes-undeniable-false-
   * facts` s'appliquait mot pour mot.
   *
   * Décision du propriétaire, et son argument porte: cette fiche se remplit
   * DANS L'ENTONNOIR, sous les yeux de la personne, et c'est elle qui
   * l'enregistre. Des cases qu'elle voit, qu'elle peut décocher, et qu'elle
   * valide en enregistrant ne sont pas un fait écrit dans son dos — c'est un
   * formulaire pré-rempli, et l'enregistrement EST la confirmation. La
   * cicatrice de 2026-08-05 parlait d'une coche écrite par une PHOTO, sans
   * personne devant l'écran et sans moyen de la retirer; ce n'est pas ce cas.
   *
   * ⚠️ CE QUI SURVIT DE LA CICATRICE, ET QUI EST LA MOITIÉ DU LOT: la
   * proposition ne se fait qu'UNE FOIS par fiche (`prefilled`). Sans ce
   * verrou, décocher le dernier moment remettrait `rhythm` à `null` — l'état
   * même sur lequel on propose —, la liste se recocherait sous les doigts, et
   * « comme la maison » deviendrait un état que le produit refuse d'atteindre.
   *
   * ⛔ ET LA DÉCISION N'EST PAS ICI. Quels moments et combien viennent de
   * `structure.slots`, c'est-à-dire de `_shared/keel/eating_structure.ts` — le
   * même module pur que le générateur. Le tri du « quand » vit dans
   * `lib/rhythmPrefill.ts`, testé seul; cet effet ne fait que le câbler.
   */
  const prefilled = React.useRef(false);
  React.useEffect(() => {
    if (rhythmPrefillLatches(draft.rhythm)) {
      prefilled.current = true;
      return;
    }
    const next = rhythmPrefillFor({
      declared: draft.rhythm,
      // ⚠️ `slots` ET PAS `opened` — voir `RhythmPrefillInput`: `opened` est le
      // delta, et il retombe à zéro dès que le brouillon porte les moments.
      derived: props.structure?.slots ?? [],
      latched: prefilled.current,
    });
    if (next === null) return;
    prefilled.current = true;
    set({ rhythm: next });
  }, [draft.rhythm, props.structure]);

  /**
   * ⛔ LA PHRASE SUIT LE VERROU, PAS `opened` — ET C'EST UN DÉFAUT MESURÉ.
   *
   * Elle était conditionnée à `structure.opened.length > 0`. Or `opened` est ce
   * que le SERVEUR a ajouté par rapport aux moments déclarés: dès que la
   * personne coche ce qu'on lui propose, elle déclare ces moments, le serveur
   * n'a plus rien à ajouter, et `opened` retombe à zéro — pendant que le
   * plancher, lui, verrouille toujours ses quatre cases.
   *
   * Vu à l'écran le 2026-09-04: quatre cases grisées et **aucune phrase pour
   * les expliquer**. C'est très exactement ce que ce lot s'interdisait.
   *
   * La condition est donc CELLE DU VERROU: dès qu'un plancher peut mordre, il
   * se dit.
   */
  const floorCount = props.structure?.requiredCount ?? 0;
  const tickedCount = (draft.rhythm ?? []).length;
  // ══════════════════════════════════════════════════════════════════════════
  // ⟳ CE QUI S'EST PASSÉ ICI EN TROIS JOURS — à lire avant de re-trancher
  // ══════════════════════════════════════════════════════════════════════════
  //
  // 2026-09-04  la pré-coche arrive, en écrivant `structure.opened`.
  // 2026-09-06  elle est RETIRÉE: « pourquoi cette personne a l'après-midi qui
  //             est automatiquement cochée ? ». Motif écrit alors: deux choses
  //             sans rapport tombaient dans le même champ — le PLANCHER (le
  //             serveur dit « ce corps a besoin de N moments ») et la
  //             DÉCLARATION (ce qu'elle dit manger).
  // 2026-09-08  elle REVIENT, et le motif de 09-06 est jugé faux ICI: la fiche
  //             se remplit dans l'entonnoir, sous les yeux de la personne, et
  //             l'enregistrement est sa confirmation. Le détail, et ce qui
  //             survit quand même de la cicatrice, sont sur l'effet plus haut
  //             et dans `lib/rhythmPrefill.ts`.
  //
  // ⚠️ CE QUI N'A JAMAIS BOUGÉ, DANS LES TROIS ÉTATS: la PHRASE. Sans elle, la
  // personne ne sait pas d'où vient le goûter coché — et une case pré-cochée
  // sans phrase est exactement ce qui a fait retirer le lot en 09-06.
  //
  // ⚠️ ET RIEN N'EST PERDU SI ELLE DÉCOCHE TOUT. `rhythm = null` veut dire
  // « comme la maison », et le générateur dérive le plancher lui-même
  // (`eatingStructureFor`, le MÊME module pur que cette réponse): les moments
  // manquants s'ouvriront au plan. Décocher ne prive donc de rien — c'est ce
  // qui rend la pré-coche acceptable.

  // ══════════════════════════════════════════════════════════════════════════
  // ⛔ PLUS AUCUNE CASE N'EST GRISÉE — 2026-09-15
  // ══════════════════════════════════════════════════════════════════════════
  //
  // Décision produit: « les moments … ça doit pas être bloqué, mais en fonction
  // de l'objectif calorique il faut que ce soit coché ». Les deux moitiés vont
  // ensemble: on PROPOSE le compte que le corps demande (l'effet de pré-coche
  // ci-dessus), et on ne le RETIENT jamais.
  //
  // ── CE QUI VIENT D'ÊTRE RETIRÉ, ET POURQUOI ÇA NE REVIENT PAS ────────────
  // `gainsWeight` + `floorBinds` grisaient les cases cochées dès que les
  // retirer serait passé sous `requiredCount`, et seulement en prise de poids.
  // Le raisonnement tenait — une assiette a un plafond de masse, donc un grand
  // besoin réclame un moment de plus — mais sa conséquence à l'écran était une
  // case morte: la personne coche « prendre du muscle », ses trois repas
  // apparaissent grisés, et elle ne peut plus dire qu'elle saute le petit-
  // déjeuner. Le plancher reste VRAI, il n'est simplement plus OPPOSABLE.
  //
  // ⚠️ ET RIEN N'EST PERDU QUAND ELLE DÉCOCHE. Le générateur dérive le plancher
  // lui-même (`eatingStructureFor`, le MÊME module pur que cette réponse): les
  // moments manquants s'ouvriront au plan. C'est ce qui rend le retrait du
  // verrou sans conséquence sur la journée composée.
  //
  // ⛔ NE REMETS PAS `<=` À LA PLACE DE `<` ICI NON PLUS. Le piège est écrit au
  // complet dans `rhythmPrefill.int.test.ts`; il vaut pour toute condition
  // posée sur `tickedCount`.
  // ── CE QUI PARLE, ET SEULEMENT ÇA ────────────────────────────────────────
  // La phrase couvre tout le dessous du plancher: à zéro coché elle annonce ce
  // que le plan ouvrira, à l'égalité elle dit le compte que la fiche porte.
  // Au-DESSUS, elle se tait — il n'y a plus rien à ouvrir.
  const floorSpeaks = floorCount > 0 && tickedCount <= floorCount;

  /**
   * ⟳ `declaredSlots` A ÉTÉ RETIRÉ LE 2026-09-01 — IL N'AVAIT PLUS DE LECTEUR.
   *
   * Il portait la cascade « les moments cochés, sinon ceux de la maison, sinon
   * les six », et il servait à décider quels champs d'habitude s'affichaient.
   * Depuis que le champ s'ouvre AVEC SA CASE (voir le pavé de la section), la
   * seule chose qui décide est `draft.rhythm` — et le repli n'a plus d'endroit
   * où s'appliquer: une case décochée ne pose pas de question.
   *
   * ⚠️ `props.slots` A DONC PERDU SON SEUL LECTEUR DANS CE COMPOSANT, et il
   * reste déclaré REQUIS. C'est signalé, pas réparé: le retirer touche ses
   * trois sites de montage (`SetupPage`, deux fois `HouseholdPage`) et les
   * fixtures de test des sessions voisines, ce qui déborde de ce lot. Une prop
   * requise que personne ne lit est exactement le genre de ceinture armée sur
   * un coffre vide que ce dépôt paie en boucle — à retirer dans un lot à elle.
   */

  /**
   * ── ⛔ IL N'Y A PLUS DE « VOIR LES N AUTRES MOMENTS » ────────────────────
   * Le contrôle a vécu quelques heures le 2026-08-19. Il existait pour qu'une
   * ligne d'habitude ne disparaisse pas en silence quand on décoche un moment
   * au-dessus — une inquiétude légitime, et fausse en pratique:
   *
   *   · il ne s'affichait QUE sur une bouche dont le rythme est déclaré, jamais
   *     sur la carte du maître (qui n'a rien déclaré, donc rien de caché). Deux
   *     fiches identiques ne se ressemblaient plus, sans raison lisible;
   *   · et ce qu'il « révélait » sont des moments dont la personne vient de
   *     dire qu'ils n'existent pas. Proposer de les rouvrir, c'est proposer de
   *     répondre à une question qu'on a retirée soi-même.
   *
   * La section suit donc les moments déclarés, point — et la liste de cases
   * juste au-dessus est ce qui les change.
   */

  return (
    <div className="space-y-4">
      <p className="text-sm leading-6 text-ink-soft">
        {t("household.mouth.preferences_intro")}
      </p>

      {/* ═══ L'ORDRE DES SECTIONS EST UNE DÉCISION, PAS UNE MISE EN PAGE ═══
          Il va du plus EXCLUANT au plus informatif, et chaque cran contient le
          suivant:

            1. LE RÉGIME écarte des familles entières d'aliments. Le poser en
               dernier ferait remplir des dégoûts sur des aliments qu'on ne
               servira de toute façon jamais.
            2. LES ALLERGIES interdisent — médicales, fail-closed.
            3. LES DÉGOÛTS évitent — un fait de goût, que le serveur tait.
            4. COMBIEN DE FOIS ELLE MANGE dimensionne la journée…
            5. …et c'est ce qui rend la dernière section lisible: on ne demande
               « qu'est-ce qu'elle mange déjà » QUE sur les moments qui
               existent. Cette dépendance est la raison de l'ordre, pas un
               goût: l'inverse posait six questions à quelqu'un qui mange deux
               fois.

          Ordre demandé et arbitré par l'utilisateur le 2026-08-19. */}

      {/* ── 1 · LE RÉGIME ────────────────────────────────────────────────────
          ⚠️ IL EST MONTRÉ À TOUT LE MONDE DEPUIS LE 2026-08-19, et il ne
          l'était pas: la ligne portait `subject.hasAccount ? null : (…)`, au
          motif que `keel_household_set_member_diet` refuse `has_account`. Le
          motif est juste et ne dit rien de l'ÉCRAN: le régime de quelqu'un qui
          a un compte existe, il vit simplement dans une autre table
          (`student_safety_constraints`, via `saveOwnDiet`) — et cet écrivain-là
          est branché depuis toujours sur ce même champ de brouillon. Le cacher
          faisait donc que le titulaire, seul de la maison, ne voyait nulle part
          la question qui écarte le plus d'aliments; il devait la retrouver deux
          écrans plus loin. C'est l'inverse de la règle de la fenêtre — « sans
          quoi celui qui tient la maison serait le seul dont on ne sait rien ».

          ⚠️ CE QUI RESTE VRAI: l'écrivain n'est pas le même des deux côtés.
          C'est à l'appelant de le savoir, et les deux le savent déjà. */}
      <Section
        title={t(voiced("household.mouth.diet", voice), { who })}
        hint={t("household.mouth.diet_hint")}
      >
        {/* ⛔ PAS DE `Field`: LA SECTION EST DÉJÀ L'ÉTIQUETTE. Les deux
            rendaient la MÊME clé, donc « COMMENT TU MANGES » s'affichait DEUX
            FOIS (capture du 2026-08-20). `aria-label` garde le contrôle nommé
            pour un lecteur d'écran — réparer à l'œil en cassant à l'oreille
            n'est pas réparer. */}
        <select
          id="mouth-diet"
          aria-label={t(voiced("household.mouth.diet", voice), { who })}
          value={draft.diet}
          onChange={(e) => set({ diet: e.target.value })}
          className={inputClass}
        >
          {/* ⛔ L'ÉTAT DE DÉPART EST UNE INVITE, PLUS UN CHOIX. C'était
              « Personne n'a dit » — un constat sur un tiers, proposé à
              quelqu'un qui répond pour lui-même.
              ⚠️ MAIS L'OPTION RESTE, `disabled`. La retirer afficherait « Je
              mange de tout » à qui n'a rien choisi, pendant que le brouillon
              vaut `""`: l'écran annoncerait un régime que personne n'a
              déclaré, sur le champ qui écarte le plus d'aliments. */}
          <option value="" disabled>
            {t("household.mouth.diet_unset")}
          </option>
          {DIET_ANSWERS.map((d) => (
            <option key={d} value={d}>
              {t(`setup.people.diet_${d}` as "setup.people.diet_omnivore")}
            </option>
          ))}
        </select>
      </Section>


      {/* ── 2 · LES ALLERGIES · fail-closed ──────────────────────────────── */}
      <Section
        title={t(voiced("setup.mouths.allergies", voice), { who })}
      >
        {/* ══════════════════════════════════════════════════════════════════
            ⛔ ICI SE TENAIENT LES DIX-SEPT PASTILLES — RETIRÉES LE 2026-09-20
            ══════════════════════════════════════════════════════════════════

            Avec elles est partie l'aide de section (`setup.people.allergies_hint`,
            « Médical uniquement. Ça sort de toute la casserole. Les dégoûts
            viennent après. »). Retrait demandé: la liste faisait lire dix-sept
            dangers à quelqu'un qui n'en a aucun.

            ⚠️ CE QUE ÇA COÛTE, ET IL FAUT LE SAVOIR AVANT DE JUGER LE LOT:
            une pastille couvrait tous les noms d'un même danger — cocher
            `peanut` faisait reconnaître « satay », « groundnut », « PB »
            (`WIDE_COVERAGE_SLUGS`). Un mot tapé à la main n'est reconnu que
            sous ce mot, sauf si la table d'alias le connaît
            (`api/allergenSlug.ts`: « arachides », « fruits à coque »,
            « produits laitiers »… y sont, en français). Le catalogue lui-même
            n'a PAS bougé: `copy/allergens.ts` reste, le moteur et les autres
            écrans le lisent toujours.

            ⚠️ ET RIEN N'EST DEVENU INVISIBLE. Ce brouillon ne SÈME jamais les
            allergies (« elles s'AJOUTENT, elles ne se posent pas » —
            `HouseholdPage`): les pastilles ne montraient aucune déclaration
            existante, elles n'en ajoutaient que de nouvelles. Retirer un
            champ qui affiche l'existant aurait été un tout autre geste. */}
        {/* ── ⛔ ICI SE TENAIT « Rien à déclarer » — RETIRÉ LE 2026-09-20 ────
            Il existait pour qu'une section SAUTÉE et une section remplie d'un
            « non » ne soient pas le même état en base. Retiré sur demande:
            « pour ceux qui n'ont pas d'allergies, ça leur fait perdre du
            temps ». Une section vide se lit désormais comme « rien », et
            `allergiesNone` reste dans le brouillon, à `false` — trois lecteurs
            le comptent encore. Ce que ça coûte: `allergiesReviewed` n'est plus
            écrit pour quelqu'un qui n'a rien coché, et il ne bloque rien
            depuis le 2026-08-19. */}
        {/* LE TEXTE LIBRE, ET IL PORTE TOUT — ⟳ 2026-09-20.
            Il ne montrait que le HORS-CATALOGUE: un slug coché avait sa
            pastille au-dessus, et l'afficher deux fois aurait été deux fois la
            même réponse. Sans les pastilles, ce filtre ne dédoublonnerait plus
            rien — il CACHERAIT un mot que rien d'autre ne rend, et que plus
            aucun geste ne pourrait retirer. */}
        <TermsEntry
          kind="allergy"
          terms={draft.allergies}
          onChange={(free) => set({ allergies: free, allergiesNone: false })}
        />
      </Section>

      {/* ── 3 · CE QU'ELLE N'AIME PAS ────────────────────────────────────────
          ⚠️ CE N'EST PAS UNE ALLERGIE, et la séparation d'avec la section du
          dessus est le point. Deux tables, deux natures: une allergie est
          MÉDICALE et rejoint l'union de sécurité fail-closed; un dégoût est un
          fait de foyer dont le verrou serveur TAIT le pourquoi. Les fondre
          promettrait une garde de sécurité sur une préférence. Elles étaient
          dans le même bloc replié que le régime — donc indistinctes une fois
          fermé.

          ⚠️ ET ÇA VIT SUR LA LIGNE MEMBRE, pas sur `food_preferences`:
          celle-là est indexée sur `user_id`, donc INATTEIGNABLE pour une bouche
          sans compte — c'est-à-dire pour un enfant, le cas nominal du foyer. */}
      
        {/* ⛔ L'AIDE DE SECTION (« Un dégoût, pas une allergie. ») EST PARTIE
            LE 2026-09-20, sur demande. La distinction qu'elle portait tient
            maintenant à la seule séparation des deux blocs — qui est, elle,
            structurelle: deux tables, deux natures, et le commentaire
            au-dessus dit pourquoi les fondre serait faux. */}
        <Section
          title={t(voiced("household.mouth.tastes", voice), { who })}
        >
          <TermsEntry
            kind="dislike"
            terms={draft.dislikes}
            onChange={(next) => set({ dislikes: next })}
          />
        </Section>

      {/* ── ⑤ L'APPÉTIT, ET CE QU'IL Y A D'AUTRE DANS L'ASSIETTE ─────────
          ⟳ DESCENDUES SOUS LES ALLERGIES ET LES DÉGOÛTS LE 2026-09-01, SUR
          DEMANDE DU PROPRIÉTAIRE — ET C'EST L'INVERSE DE CE QU'IL AVAIT
          DEMANDÉ LE 2026-08-20. Le commentaire d'alors disait « JUSTE SOUS LA
          SECTION DU RÉGIME, ET C'EST UNE DEMANDE EXPLICITE ». Il est réécrit
          plutôt que complété: laisser les deux consignes côte à côte ferait
          restaurer l'ancienne place par le premier lecteur qui citerait la
          plus ancienne.

          ⚠️ CE N'EST PAS LA PLACE QUI AVAIT ÉTÉ REFUSÉE. Le refus du
          2026-08-20 portait sur « plus bas, SOUS LES HABITUDES PAR MOMENT »,
          qui les séparait de ce qu'elles précisent. Ici elles restent AVANT la
          section des moments — elles ont seulement laissé passer les deux
          blocs qui EXCLUENT.

          ── ET ÇA SUIT LA RÈGLE DÉJÀ ÉCRITE ICI ─────────────────────────
          « L'ordre des sections va du plus EXCLUANT au plus informatif »: le
          régime écarte des familles entières, les allergies et les dégoûts
          écartent des aliments. L'appétit et l'assiette, eux, n'écartent rien
          — ils PRÉCISENT. Ils étaient les seuls informatifs coincés entre deux
          excluants; ils sont maintenant du bon côté de la charnière.

          ⛔ LES DEUX RESTENT DEUX BLOCS, jamais fondues: l'assiette attend une
          décision de forme — posée UNE FOIS pour la personne (aujourd'hui) ou
          PAR MOMENT (la forme visée: le déjeuner et le dîner de quelqu'un
          n'ont pas le même pain).

          ⚠️ ELLES ONT BESOIN D'UN CORPS POUR AGIR, et c'est pour ça qu'elles ne
          bloquent rien: sans taille/poids/sexe, `mouthTargetKcal` rend
          `no_body`, le facteur vaut 1, et ni l'une ni l'autre n'a le moindre
          effet. Les exiger ici ferait un mur devant deux champs qui, eux, sont
          exigés ailleurs.

          ⚠️ REMISE UNE FOIS APRÈS AVOIR ÉTÉ EFFACÉE (2026-08-20): un
          `git checkout` sur ce fichier, lancé pour annuler UNE mutation de
          test, a emporté tout le travail non commité — dont un déplacement
          fait par une autre session. Ne fais pas ça ici. */}
      <MouthAppetiteFields
        voice={voice}
        who={who}
        value={{
          dayActivity: draft.dayActivity,
          sportFrequency: draft.sportFrequency,
          appetite: draft.appetite,
        }}
        onChange={(patch) => set(patch)}
      />

      {/* ⛔ « CE QU'IL Y A D'AUTRE DANS L'ASSIETTE » N'EXISTE PLUS.
          Les trois oui/non par personne ont été retirés de l'écran le
          2026-09-01, remplacés par des bulles par moment; les bulles elles-
          mêmes ont été retirées le 2026-09-10.

          ⛔ DÉCISION PRODUIT: le plan dimensionne les aliments qu'il prévoit et
          ne réserve plus d'énergie pour un accompagnement personnel hors plan.
          La phrase qui le dit est sous le bloc « quand … mange, et quoi ».

          ⚠️ `takes_dessert / takes_cheese / takes_bread` RESTENT EN BASE et ne
          sont effacés par personne — l'écran ne les écrit plus et le moteur ne
          les lit plus, ce qui suffit à les neutraliser. */}

      {/* ══════════════════════════════════════════════════════════════════
          4 · QUAND ELLE MANGE, ET QUOI — UNE SEULE QUESTION (2026-09-01)
          ══════════════════════════════════════════════════════════════════

          ── CE QUE CETTE FUSION REMPLACE ────────────────────────────────
          Deux sections se suivaient: « Combien de fois elle mange par jour »,
          qui cochait des moments, puis « Ce qu'elle mange déjà », qui
          redemandait une ligne par moment coché. C'était la même question
          posée deux fois, et rien entre les deux ne disait que la seconde
          DÉPENDAIT de la première: on cochait en haut, le détail apparaissait
          ailleurs, et décocher faisait disparaître une ligne à distance.

          Le détail vit désormais DANS la case qu'il concerne. Une question, un
          endroit, et la dépendance se voit au lieu de se deviner.

          ── ⛔ LE DÉTAIL S'OUVRE AVEC LA CASE, ET C'EST UN ALLER-RETOUR ──
          Trois rédactions, et il faut les connaître toutes les trois pour ne
          pas refaire la deuxième.

            ① accroché à la case — refusé par un test écrit contre la décision
              du 2026-08-19 (« il faut arrêter avec le dépliable »), dont le
              motif est juste: une réponse repliée est une réponse INVISIBLE.
            ② accroché à `declaredSlots` — tous les champs visibles, y compris
              via le repli sur le rythme de la maison. Correct sur le papier,
              et refusé À L'ÉCRAN le 2026-09-01, capture à l'appui: sur un
              compte neuf, `rhythm` est `null`, donc CINQ champs vides et
              ouverts s'empilaient sous cinq cases décochées. La section se
              lisait comme un formulaire de cinq questions au lieu d'une liste
              de moments.
            ③ accroché à la case, à nouveau — demandé explicitement le
              2026-09-01, après avoir vu ②.

          ⚠️ CE N'EST PAS UN RETOUR AU « DÉPLIABLE » DE 2026-08-19, et la
          nuance décide: ce repli-là cachait des RÉPONSES derrière un en-tête
          fermé. Ici, une case décochée veut dire « elle ne mange pas à ce
          moment » — il n'y a pas de réponse cachée, il n'y a pas de question.
          C'est mot pour mot ce que la note de `declaredSlots` dit déjà du
          contrôle « voir les N autres moments », retiré le même jour: « ce
          qu'il révélait sont des moments dont la personne vient de dire qu'ils
          n'existent pas ».

          ⚠️ CE QUE ③ COÛTE, ET C'EST ASSUMÉ: quelqu'un qui n'a rien coché ne
          voit aucun champ. C'est le cas d'un compte neuf, et c'est voulu — la
          case est l'entrée, pas le champ.

          ⛔ ET ON NE PRÉ-COCHE TOUJOURS PAS. Une case cochée d'avance écrirait
          sur la ligne de quelqu'un un fait que personne n'a énoncé — ce que
          `rhythm: null` existe précisément pour ne pas faire.

          ⛔ NE RIEN COCHER N'EST PAS « ELLE NE MANGE JAMAIS ». C'est « comme la
          maison » (`null`), le repli documenté de la ligne membre, et la base
          refuse de toute façon un tableau vide (`empty_rhythm`). La phrase sous
          la liste le DIT, sinon une rangée décochée se lit comme un oubli. */}
      
        <Section
          title={t(voiced("household.mouth.eating", voice), { who })}
          hint={t(voiced("household.mouth.eating_hint", voice), { who })}
        >
          <ul className="space-y-2">
            {EATING_OCCASIONS.map((slot) => {
              const on = (draft.rhythm ?? []).some((r) => r.slot === slot);
              // LE SHAKER EST-IL POSÉ ICI ? C'est la seconde moitié du lot: un
              // apport déclaré sur ce moment doit se VOIR sur ce moment, sinon
              // il vit dans un bloc à part et la journée se lit à deux endroits.
              const shakerHere = draft.shaker !== null &&
                draft.shaker.slot === slot;
              // ══════════════════════════════════════════════════════════
              // FF-060 — ON VERROUILLE UN COMPTE, PAS DES MOMENTS NOMMÉS
              // ══════════════════════════════════════════════════════════
              //
              // ⛔ CE QUI ÉTAIT FAUX AU PREMIER JET, ET MESURÉ À L'ÉCRAN. Je
              // verrouillais `structure.opened`. Sur une fiche où rien n'est
              // encore coché, la dérivation ouvre les quatre moments depuis
              // rien — donc les QUATRE se verrouillaient, et la personne ne
              // pouvait plus jamais dire qu'elle saute le petit-déjeuner.
              // Un produit qui interdit de décrire ses propres repas a cessé
              // d'être un produit.
              //
              // La contrainte réelle n'a jamais été « CES moments-là »: c'est
              // « au moins N moments », parce qu'une assiette a un plafond de
              // masse. Lesquels reste le choix de la personne.
              //
              // ⟳ 2026-09-15 — LE VERROU EST PARTI, ET `locked` AVEC LUI. Voir
              // le pavé de `floorSpeaks`: on propose le compte, on ne le retient
              // pas. Une case de cette liste n'est désactivée que pendant une
              // écriture en cours (`props.busy`).
              return (
                <li
                  key={slot}
                  className={`rounded-card border px-3 py-2 ${
                    on ? "border-ink bg-fig-50" : "border-line"
                  }`}
                >
                  {/* `accent-ink`, ET CE N'EST PAS DÉCORATIF: sans lui, une case
                      cochée prend la couleur d'accent du SYSTÈME — bleue sur
                      les réglages par défaut de macOS et de Windows. */}
                  <label className="flex cursor-pointer items-center gap-2.5">
                    <input
                      id={`mouth-rhythm-${slot}`}
                      type="checkbox"
                      className="h-4 w-4 shrink-0 accent-ink"
                      checked={on}
                      disabled={props.busy}
                      onChange={() => {
                        const current = draft.rhythm ?? [];
                        const next: EatingOccasionSlot[] = on
                          ? current.filter((r) => r.slot !== slot)
                          : [...current, { slot, size: null }];
                        // ⛔ LE VIDE REDEVIENT `null`. Voir la note du champ:
                        // décocher le dernier moment veut dire « finalement,
                        // comme la maison », pas « elle ne mange jamais ».
                        set({
                          rhythm: next.length === 0
                            ? null
                            : EATING_OCCASIONS
                              .filter((s) => next.some((r) => r.slot === s))
                              .map((s) => ({ slot: s, size: null })),
                        });
                      }}
                    />
                    <span className="text-sm font-medium text-ink">
                      {mealCopy(`meals.slot.${slot}` as "meals.slot.breakfast")}
                    </span>
                  </label>

                  {/* ── LE DÉPLIANT: CE QU'ELLE Y PREND DÉJÀ ────────────────
                      ⚠️ IL N'APPARAÎT QUE COCHÉ, et c'est tout l'objet de la
                      fusion. Un champ visible sous un moment décoché
                      demanderait ce qu'on mange à un moment dont on vient de
                      dire qu'il n'existe pas — le défaut exact que le
                      déplacement du 2026-08-19 réparait déjà, une fois.

                      ⚠️ MÊMES PLACEHOLDERS QU'AVANT (`HABIT_PLACEHOLDERS`): le
                      `Record` complet refuse de compiler si un septième moment
                      arrivait sans le sien — la même garde que `ACTIVITY_KEYS`.

                      ⛔ ET UNE ÉTIQUETTE VISIBLE, pas le placeholder seul. Le
                      nom du moment est sur la case au-dessus, il ne dit pas CE
                      QU'ON DEMANDE; et un placeholder disparaît à la première
                      frappe. Même règle que les trois nombres du shaker. */}
                  {on ? (
                    <div className="mt-3 border-t border-line pt-3">
                      {/* ⚠️ L'ÉTIQUETTE NE NOMME PLUS PERSONNE, donc elle n'a
                          plus de jumelle « tu »: « Des habitudes ? » se lit
                          pareil dans les deux voix. Garder un `_you` identique
                          aurait été deux clés pour un seul texte, et une
                          divergence en attente au premier retouchage. */}
                      <Field
                        label={t("household.mouth.habit_field")}
                        htmlFor={`mouth-habit-${slot}`}
                      >
                        <input
                          id={`mouth-habit-${slot}`}
                          type="text"
                          maxLength={120}
                          placeholder={t(HABIT_PLACEHOLDERS[slot])}
                          value={draft.habits[slot] ?? ""}
                          disabled={props.busy}
                          onChange={(e) =>
                            set({
                              habits: {
                                ...draft.habits,
                                [slot]: e.target.value,
                              },
                            })}
                          className={inputClass}
                        />
                      </Field>
                      {/* ── « + REPAS LÉGER » ────────────────────────────
                          ⟳ 2026-09-10 — LES CINQ BULLES D'EXTRAS QUI VIVAIENT
                          ICI ONT ÉTÉ RETIRÉES (pain, fromage, yaourt, fruit,
                          dessert, sur le déjeuner et le dîner). Le plan
                          dimensionne les aliments qu'il prévoit; il ne réserve
                          plus d'énergie pour un accompagnement personnel.

                          ⚠️ TROIS MOMENTS, PAS SIX: une collation pèse déjà
                          0,10 de la journée, la marquer légère demanderait au
                          plan de composer ~40 kcal. « Je ne prends pas de
                          goûter » se dit en ne cochant pas le goûter.

                          ⛔ ET UNE BULLE ÉTEINTE N'EST PAS « NON ». Trois
                          états, deux apparences: jamais touché, touché puis
                          éteint (« ce moment est comme d'habitude »), allumé.
                          Ce qui les sépare est la CLÉ du moment, posée au
                          premier clic — voir `toggleLight`. */}
                      {slotBearsLight(slot) ? (
                        <div className="mt-3">
                          <button
                            type="button"
                            disabled={props.busy}
                            aria-pressed={draft.light[slot] === true}
                            data-mouth-light={slot}
                            onClick={() => set({ light: toggleLight(draft.light, slot) })}
                            className={`rounded-full border px-2.5 py-1 text-xs transition-colors disabled:opacity-50 ${
                              draft.light[slot] === true
                                ? "border-ink bg-ink text-paper"
                                : "border-line-strong bg-paper text-ink-soft hover:border-ink hover:text-ink"
                            }`}
                          >
                            {draft.light[slot] === true ? "" : "+ "}
                            {t("household.mouth.light")}
                          </button>
                          <p className="mt-1.5 text-xs leading-5 text-ink-soft">
                            {t("household.mouth.light_hint")}
                          </p>
                        </div>
                      ) : null}
                      {shakerHere ? (
                        <p className="mt-2 text-xs leading-5 text-ink-soft">
                          {t(
                            voiced("household.mouth.habit_shaker_here", voice),
                            { who },
                          )}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
          {draft.rhythm === null ? (
            <p className="text-xs leading-5 text-ink-soft">
              {t(voiced("household.mouth.rhythm_house", voice), { who })}
            </p>
          ) : null}
          {/* ⟳ 2026-09-15 — « Les portions sont calculées pour les aliments
              prévus dans votre plan. Les ajouts personnels ne sont pas
              inclus. » A ÉTÉ RETIRÉE, sur demande. Elle avait été posée le
              2026-09-10 à la place des cinq bulles d'extras, pour dire ce que
              le plan ne réserve pas. Ce qu'elle coûtait: un paragraphe de
              gris de plus sous une liste qui en portait déjà deux, pour
              répondre à une question que personne ne pose à cet endroit. */}
          {/* ⚠️ ON NE COCHE JAMAIS UN MOMENT SANS LE DIRE — la règle est déjà
              écrite pour le shaker, et elle vaut ici pour la même raison: un
              moment apparu tout seul, sans phrase, se lit comme un bug. */}
          {/* ── LE PLANCHER SE DIT DÈS QU'IL EXISTE — 2026-09-06 ────────────
              ⟳ LA CONDITION EST `floorCount > 0`, PAS « le verrou mord ». Un
              plancher qu'on applique sans le nommer est indiscernable d'une
              lubie du plan: sans cette phrase, la personne ne saurait pas d'où
              vient le goûter coché, ni que le plan lui en ouvrira un.

              ⟳ 2026-09-08 (soir) — TROIS PHRASES EMPILÉES SONT DEVENUES UNE.
              Le bloc rendait `rhythm_derived` + `rhythm_derived_why` +
              `rhythm_floor_locked` à la suite: le chiffre trois fois,
              « cochés » trois fois.

              ⟳ 2026-09-15 — ET IL N'EN RESTE QU'UNE SEULE, POUR TOUT LE MONDE.
              `rhythm_floor_locked` disait « Ils sont donc tenus — ajoutes-en un
              pour pouvoir en retirer »: plus aucune case n'est tenue, donc
              cette phrase décrirait un refus que l'écran n'oppose plus. La clé
              est supprimée des deux paquets — laissée en place, elle serait
              revenue au premier « une phrase par état ». Ce qui reste est le
              FAIT (il faut {count} moments, on les a cochés) et le geste qui
              existe partout: décocher. */}
          {floorSpeaks
            ? (
              <p className="text-xs leading-5 text-ink-soft">
                {t(
                  voiced("household.mouth.rhythm_derived", voice),
                  { who, count: String(floorCount) },
                )}
              </p>
            )
            : null}
          {/* LE SHAKER COMPOSÉ — et la phrase POINTE le bloc du dessous, qui
              est sa sortie: déclarer le sien fait que le plan n'y touche pas. */}
          {props.structure?.shake === "compose"
            ? (
              <p className="text-xs leading-5 text-ink-soft">
                {t(voiced("household.mouth.shake_composed", voice), { who })}
              </p>
            )
            : null}
          {/* ── ⟳ 2026-09-23 · LES À-CÔTÉS — ENTRÉE, FROMAGE, DESSERT, PAIN ──
              Le plan sert un petit à-côté au déjeuner et au dîner, selon
              l'objectif; ce champ dit ce que la personne veut à la place.

              ⛔ DANS CETTE SECTION, PAS DANS UNE À ELLE. La section dit
              « quand … mange, et quoi »: ce qui arrive à côté du plat de midi
              et du soir en fait partie. Un septième cadre changerait aussi le
              compte de sections que `mouthFormDialog.int.test.ts` tient à six
              — et c'est une décision de forme, pas un effet de bord.

              ⚠️ `set({ sideCourses })` ET RIEN D'AUTRE: le brouillon du
              titulaire est DÉRIVÉ, et ce champ remonte parce qu'il est nommé
              dans `SELF_SHEET_FIELDS`. Il part en base avec la fiche, par la
              même liste que les habitudes (`mouthToPersist`). */}
          <div className="border-t border-line pt-4">
            <SideCoursesField
              value={draft.sideCourses}
              onChange={(next) => set({ sideCourses: next })}
              disabled={props.busy}
              voice={voice}
              who={who}
            />
          </div>
        </Section>

      {/* ══════════════════════════════════════════════════════════════════
          5 · LE SHAKER — SA PROPRE SECTION (2026-09-01)
          ══════════════════════════════════════════════════════════════════

          ⚠️ IL VIVAIT AU FOND DE « ce qu'elle mange déjà », ET C'ÉTAIT LE
          MAUVAIS RANG. Cette section-là parle des moments de la journée; le
          shaker est un OBJET qu'on déclare une fois, avec sa marque et ses
          trois nombres. Rangé dessous, il se lisait comme une septième ligne
          d'habitude — et il porte pourtant son propre bouton d'enregistrement,
          ce qu'aucune ligne d'habitude n'a.

          ⛔ IL N'EXISTE QUE LÀ OÙ LE MOTEUR RELIRA QUELQUE CHOSE
          (`shakerPort.kind !== "none"`). ⟳ CE N'EST PLUS « là où il y a un
          bouton »: la fiche d'AJOUT le COLLECTE désormais, et c'est
          « Ajouter à la table » qui l'écrit sur la ligne qu'il vient de créer.
          Voir `ShakerPort` — et le défaut qu'il ferme, signalé le 2026-09-01:
          le shaker était incollectable pour toute personne ajoutée.

          ⚠️ IL PORTE SON PROPRE CADRE, donc pas de `Section` autour: il en
          aurait deux. Le cadre POINTILLÉ quand il n'y a rien, PLEIN quand
          l'objet existe — l'idiome de la fiche d'ajout d'une personne, et la
          seule chose qui distingue « rien encore ici » de « tu as ajouté
          ça ». Il porte en revanche `data-sheet-section`, parce qu'il EST une
          section de la fiche et que le compte de cadres le vérifie.

          ⟳ 2026-09-24 — ET IL NE SE MONTRE QU'À LA PRISE DE MUSCLE. Demandé:
          « pour le reste pas besoin, ça va ramener de la confusion ». La
          proposition « sans insistance » aux autres objectifs est retirée.

          ⚠️ SAUF S'IL EXISTE DÉJÀ. Un shaker enregistré continue d'être compté
          par le moteur quel que soit l'objectif: le cacher à qui change
          d'objectif laisserait un apport compté qu'on ne peut plus ni voir ni
          retirer. */}
      {props.shakerPort.kind !== "none" &&
          (shakerIsForeground(draft.goal) || draft.shaker !== null)
        ? (
        <ShakerFields
          shaker={draft.shaker}
          foreground={shakerIsForeground(draft.goal)}
          onChange={(next) => set({ shaker: next })}
          // ── LE MOMENT, ET L'AJOUT QUI VA AVEC ──────────────────────────
          // ⛔ LE PARENT TRANCHE, PAS LE BLOC. Choisir un moment peut AJOUTER
          // ce moment au rythme, et le rythme n'appartient pas au shaker: le
          // laisser l'écrire ferait un second écrivain sur un champ qui en a
          // déjà un, à deux lignes d'écart.
          onSlot={(slot) => {
            const current = draft.rhythm ?? [];
            const already = slot === "" ||
              current.some((r) => r.slot === slot);
            set({
              shaker: draft.shaker === null
                ? null
                : { ...draft.shaker, slot },
              // ⚠️ L'ORDRE DE LA JOURNÉE, PAS CELUI DES CLICS — la même règle
              // que la case à cocher juste au-dessus. Deux ordres pour une
              // même liste feraient deux affichages du même rythme.
              ...(already ? {} : {
                rhythm: EATING_OCCASIONS
                  .filter((s) =>
                    s === slot || current.some((r) => r.slot === s)
                  )
                  .map((s) => ({ slot: s, size: null })),
              }),
            });
          }}
          // CE QUI EST COCHÉ EN CE MOMENT — pour dire, au clic, qu'un moment
          // non coché sera ajouté. Jamais pour RESTREINDRE la liste: on doit
          // pouvoir nommer un moment qu'on n'a pas encore déclaré, c'est
          // précisément le cas « je mange midi et soir, et j'ai un shaker
          // l'après-midi ».
          rhythm={draft.rhythm}
          // `null` = PAS DE BOUTON ICI, ET LES CHAMPS RESTENT. Voir
          // `ShakerPort`: la fiche d'ajout collecte, la carte écrit.
          onSave={props.shakerPort.kind === "now" ? props.shakerPort.save : null}
          busy={props.busy}
          voice={voice}
          who={who}
        />
      ) : null}

      {/* ⛔ « Fermer cette fenêtre garde ce que tu as tapé » A ÉTÉ RETIRÉ LE
          2026-08-19. La phrase existait pour rassurer sur une CROIX de
          fermeture; le bouton juste en dessous dit la même chose en se
          laissant cliquer, et deux façons de dire « c'est gardé » font douter
          qu'il le soit.

          ⟳ 2026-09-24 — « Terminé » EST DEVENU « Enregistrer », sur demande.
          Le mot est exact: tous les appelants écrivent sur `onClose` (voir
          `SetupPage` et `HouseholdPage`). Seule la fiche d'une personne pas
          encore ajoutée attend « Ajouter » — sa ligne n'existe pas encore.

          ⚠️ ET LE BOUTON EST CENTRÉ: c'est le seul geste de fin de la fenêtre,
          donc il ne s'aligne sur rien d'autre. Collé à gauche sous une colonne
          de sections, il se lisait comme le bouton d'une de ces sections. */}
      <div data-sheet-done="" className="flex justify-center pt-2">
        <Button variant="secondary" disabled={props.busy} onClick={props.onClose}>
          {t("household.mouth.preferences_done")}
        </Button>
      </div>
    </div>
  );
}
