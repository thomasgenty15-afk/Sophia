import React from "react";

import type { GeneratedDish } from "../../api/mealGeneration";
import { mealCopy } from "../../api/mealLabels";
import type { DayDishEntry, DaySlotGroup } from "../../lib/planDaySlots";

// ═══════════════════════════════════════════════════════════════════════════
// LOT 3 — « POUR LA TABLE » / « POUR UNTEL », AU MOMENT ET DANS LE JOUR.
//
// « Dans le cas où c'est un foyer et que 2 personnes ne mangent pas le même
// plat, alors il faut une séparation claire de ce qu'il y a à préparer pour
// les deux plats. Faut que ce soit clean, lisible rapidement. » — 2026-08-17.
//
// ── CE COMPOSANT PLACE, IL NE LIT PAS ──────────────────────────────────────
// Il ne touche AUCUN champ d'un plat: le rendu de la carte lui est passé
// (`renderDish`), et il se contente de mettre les cartes sous le bon en-tête.
// Ce n'est pas une élégance, c'est la ceinture: un objectif, un poids ou une
// calorie ne peut pas entrer dans un composant qui ne lit rien du plat. Le
// câblage de la carte (préparations, session, coche, chiffres) reste chez
// `PlanDayBlock`, où il était déjà.
//
// ── LE CAS MAJORITAIRE NE PAIE RIEN ────────────────────────────────────────
// Un moment sans plat dédié se rend EXACTEMENT comme avant ce lot: les cartes,
// à la suite, sans en-tête et sans encadrement. Poser « Pour la table » sur un
// dîner que tout le monde mange serait du bruit sur le chemin le plus fréquent
// du produit (l'entrée est à une bouche).
//
// ── ⛔ UN PLAT COMMUN NE SE RÉPÈTE PAS SOUS CHAQUE BOUCHE ──────────────────
// Quand Zoé a son petit-déjeuner et que la table en a un autre, on rend DEUX
// blocs: le plat de la table dans l'un, le sien dans l'autre. On ne recopie
// pas le plat commun sous son prénom — le moteur ne compose qu'un plat pour la
// table quand rien ne diverge, et le répéter affirmerait une individualisation
// qu'il n'a pas faite (option rejetée n°3 du rapport du 2026-08-14).
// ═══════════════════════════════════════════════════════════════════════════

export interface DayPersonSplitProps {
  group: DaySlotGroup;
  /**
   * LE RENDU D'UNE CARTE, FOURNI PAR L'APPELANT. REQUIS, jamais optionnel: un
   * défaut ferait de ce composant un placeur de rien du tout chez qui
   * l'oublierait, et le moment disparaîtrait sans un rouge.
   */
  renderDish: (dish: GeneratedDish, key: string) => React.ReactNode;
}

export default function DayPersonSplit(props: DayPersonSplitProps) {
  const { group } = props;
  const slot = group.slot ?? "no_slot";

  // ── LE CHEMIN ORDINAIRE: RIEN N'EST DÉDIÉ, RIEN NE CHANGE ────────────────
  if (!group.separated) {
    return (
      <>
        {[...group.table, ...group.unnamed].map((entry, i) => (
          <Entry key={`${slot}-${i}`} entry={entry} render={props.renderDish} id={`${slot}-${i}`} />
        ))}
      </>
    );
  }

  return (
    <>
      <div className="space-y-3">
        {group.table.length > 0 && (
          <Lane
            label={mealCopy("meals.day_person.table")}
            entries={group.table}
            render={props.renderDish}
            id={`${slot}-table`}
          />
        )}
        {group.people.map((person) => (
          <Lane
            key={person.memberId}
            // ⚠️ LE PRÉNOM EST INTERPOLÉ DANS LE GABARIT DU PACK, jamais
            // concaténé en code: « Pour {name} » et « For {name} » ne mettent
            // pas leurs mots dans le même ordre partout, et un prénom n'est
            // JAMAIS traduit — il vient de la ligne membre (F5).
            label={mealCopy("meals.day_person.member", { name: person.name })}
            entries={person.entries}
            render={props.renderDish}
            id={`${slot}-${person.memberId}`}
            // LA JOINTURE EST AUDITABLE DANS LE DOM sans relire le code —
            // même geste que `data-preparation-id` sur la carte d'un plat. Le
            // slug ne s'affiche pas: il ne veut rien dire à table.
            memberId={person.memberId}
          />
        ))}
      </div>
      {/* ── LES PLATS QU'ON NE SAIT PAS NOMMER ──────────────────────────────
          Attribués à une bouche que le plan ne nomme plus. Ils se rendent
          tels quels, HORS des voies étiquetées: les ranger sous « pour la
          table » dirait d'eux une chose fausse, et leur inventer un prénom
          serait pire. */}
      {group.unnamed.map((entry, i) => (
        <Entry
          key={`${slot}-unnamed-${i}`}
          entry={entry}
          render={props.renderDish}
          id={`${slot}-unnamed-${i}`}
        />
      ))}
    </>
  );
}

/**
 * UNE VOIE — un en-tête, et ce qui se prépare dessous.
 *
 * Le filet vertical est ce qui rend la séparation lisible d'un regard: sans
 * lui, deux en-têtes et quatre cartes se lisent comme une liste, et il faut
 * compter pour savoir où s'arrête ce qui est à Zoé.
 */
function Lane(props: {
  label: string;
  entries: readonly DayDishEntry[];
  render: (dish: GeneratedDish, key: string) => React.ReactNode;
  id: string;
  memberId?: string;
}) {
  return (
    <div data-member-id={props.memberId}>
      <p className="text-label font-semibold uppercase tracking-wide text-ink-soft">
        {/* `break-words`: le prénom vient de la ligne membre et n'a aucune
            longueur garantie — la contrainte qui gouverne est 320 px. */}
        <span className="break-words">{props.label}</span>
      </p>
      <div className="mt-1 space-y-3 border-l-2 border-line-strong pl-3">
        {props.entries.map((entry, i) => (
          <Entry
            key={`${props.id}-${i}`}
            entry={entry}
            render={props.render}
            id={`${props.id}-${i}`}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * UN PLAT, ET CE QUE CHACUN EN PREND.
 *
 * ── LES PARTS SONT SOUS LE PLAT, PAS DANS UN TABLEAU AILLEURS ─────────────
 * C'est tout l'objet du lot: « à table » récitait les parts loin du plan, et
 * la grille « qui mange quoi » les met à côté du plat — ici elles sont sous le
 * geste, dans le jour où on le fait.
 *
 * ⚠️ VIDE = SILENCE, ET C'EST VOULU. Aucune bouche ne diverge sur ce plat-là:
 * écrire « comme la table » sous chaque prénom ferait dire au moteur une chose
 * qu'il n'a pas dite, et remplirait le jour d'une ligne que plus personne ne
 * lirait.
 */
function Entry(props: {
  entry: DayDishEntry;
  render: (dish: GeneratedDish, key: string) => React.ReactNode;
  id: string;
}) {
  const { entry } = props;
  return (
    <div>
      {props.render(entry.dish, props.id)}
      {entry.shares.length > 0 && (
        <ul className="mt-1 flex flex-col gap-0.5 pl-3">
          {entry.shares.map((share) => (
            <li
              key={share.memberId}
              data-share-member-id={share.memberId}
              className="break-words text-xs text-ink-soft"
            >
              {/* Le prénom, puis l'instruction. Deux fragments et pas un
                  gabarit: il n'y a aucune grammaire ici — c'est une colonne
                  aplatie, exactement comme la liste des moments sans plat de
                  `PlanDayBlock` (« {moment} — {motif} »). */}
              <span className="font-medium text-ink">{share.name}</span>
              {" — "}
              {share.note}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
