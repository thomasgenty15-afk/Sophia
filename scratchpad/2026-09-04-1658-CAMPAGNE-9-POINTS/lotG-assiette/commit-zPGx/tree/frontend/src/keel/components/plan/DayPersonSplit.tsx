import React from "react";

import type { GeneratedDish } from "../../api/mealGeneration";
import { mealCopy, nameList } from "../../api/mealLabels";
import type { DayDishEntry, DayEaterMark, DaySlotGroup } from "../../lib/planDaySlots";

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
  renderDish: (
    dish: GeneratedDish,
    key: string,
    annotation: DishAnnotation,
  ) => React.ReactNode;
}

/**
 * ══════════════════════════════════════════════════════════════════════════
 * CE QU'ON ÉCRIT AUTOUR D'UN PLAT — DESCENDU À LA CARTE, PLUS RENDU ICI.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ── LE DÉFAUT, VU À L'ÉCRAN LE 2026-08-20 ─────────────────────────────────
 * « C'est entre les deux, on comprend pas. » Les annotations flottaient SOUS
 * la carte, rattachées à elle par la seule PROXIMITÉ: 4 px sous leur carte
 * contre 12 px jusqu'à la suivante. Trois fois plus loin, et ça n'a pas suffi.
 *
 * ⛔ ET CE N'EST PAS UNE QUESTION D'ÉCART. La carte porte une BORDURE et un
 * fond: tout ce qui est dehors se lit comme n'appartenant à personne, quel que
 * soit le nombre de pixels. On ne bat pas une frontière dure avec de l'espace.
 * Un pied encadré collé sous la carte a été essayé avant, et rejeté — « l'UI
 * est horrible »: un second bloc chromé À CÔTÉ d'une carte fait DEUX objets là
 * où il n'y en a qu'un.
 *
 * La seule position qui dit « ceci appartient à ce plat » est DEDANS. La carte
 * y range déjà trois blocs de la même famille (le geste du jour, la
 * provenance, les contenants); celui-ci est le quatrième, et il ne crée aucune
 * frontière neuve.
 *
 * ⚠️ CE COMPOSANT NE REND DONC PLUS RIEN AUTOUR DU PLAT. Il PLACE les cartes
 * sous le bon en-tête et il calcule ce qu'elles doivent porter — c'est ce qui
 * rend structurellement impossible qu'un objectif ou un chiffre de corps entre
 * dans la séparation.
 */
export interface DishAnnotation {
  /** Les bouches à table. `[]` = rien à marquer (voir `DayDishEntry.eaters`). */
  eaters: readonly DayEaterMark[];
  /**
   * Les parts écrites par le moteur, prénom compris.
   *
   * ⚠️ `name: null` VEUT DIRE « L'EN-TÊTE L'A DÉJÀ DIT », et c'est calculé ici
   * parce que c'est ici qu'on sait ce que l'en-tête nomme. La carte ne peut pas
   * le savoir: elle ne voit ni la voie ni ses voisines.
   */
  shares: readonly { memberId: string; name: string | null; note: string }[];
}

export default function DayPersonSplit(props: DayPersonSplitProps) {
  const { group } = props;
  const slot = group.slot ?? "no_slot";

  // ── LE CHEMIN ORDINAIRE: RIEN N'EST DÉDIÉ ───────────────────────────────
  // Pas de voies, pas d'en-têtes — mais les MARQUEURS, eux, sont ici et nulle
  // part ailleurs: c'est le seul endroit où le plat ne dit pas déjà pour qui il
  // est. Dans une voie nommée, l'en-tête l'a déjà dit, et répéter les prénoms
  // sous chaque carte serait la répétition que ce composant existe pour éviter.
  if (!group.separated) {
    return (
      <>
        {[...group.table, ...group.unnamed].map((entry, i) => (
          <Entry
            key={`${slot}-${i}`}
            entry={entry}
            render={props.renderDish}
            id={`${slot}-${i}`}
            marks
            // Aucun en-tête ici: rien n'a encore nommé personne.
            soleEater={null}
          />
        ))}
      </>
    );
  }

  return (
    <>
      <div className="space-y-3">
        {group.table.length > 0 && (
          <Lane
            /* ══════════════════════════════════════════════════════════════
               ⛔ « POUR LA TABLE » N'EST DIT QUE SI LA TABLE ENTIÈRE Y MANGE.
               ══════════════════════════════════════════════════════════════
               Dès qu'une bouche a son plat à elle, la casserole commune n'est
               plus « la table »: sur un foyer de deux, elle est UNE personne,
               et l'en-tête affirmait un partage qui n'avait pas lieu. Les
               parts juste dessous disaient déjà le contraire depuis C4.

               ⚠️ LE REPLI RESTE « Pour la table », et il est honnête: sans
               prénom à joindre (plan relu sans ses parts, ou moment où chaque
               bouche nommée mange à part), tout ce qu'on sait de ce plat est
               `member_id === null` — littéralement « pas à quelqu'un ». */
            label={group.tableIsEveryone || group.tableEaters.length === 0
              ? mealCopy("meals.day_person.table")
              : mealCopy("meals.day_person.members", {
                names: nameList(group.tableEaters.map((e) => e.name)),
              })}
            entries={group.table}
            render={props.renderDish}
            id={`${slot}-table`}
            // ⚠️ SEULEMENT QUAND L'EN-TÊTE NE NOMME QU'UNE PERSONNE. À deux
            // prénoms dans l'en-tête, effacer les prénoms des parts rendrait
            // deux lignes « — ta part de poulet » indiscernables l'une de
            // l'autre, et c'est justement ce qu'on sert à deux personnes
            // différentes.
            soleMember={group.tableEaters.length === 1
              ? group.tableEaters[0].memberId
              : null}
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
            // L'en-tête dit « Pour Christèle »; la part juste dessous n'a pas
            // besoin de redire « Christèle — ». Le prénom sortait TROIS fois
            // dans le même bloc (en-tête, boîte de la carte, ligne de part).
            soleMember={person.memberId}
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
          soleEater={null}
          // ⚠️ AUCUN MARQUEUR ICI, ET CE N'EST PAS UN OUBLI: `eaters` est vide
          // sur un plat dédié à une bouche que le plan ne nomme plus. Le passer
          // à `marks` ne rendrait rien; l'omettre le dit.
          marks={false}
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
  render: (
    dish: GeneratedDish,
    key: string,
    annotation: DishAnnotation,
  ) => React.ReactNode;
  id: string;
  memberId?: string;
  /**
   * LA BOUCHE QUE CET EN-TÊTE NOMME, SI ELLE EST SEULE. `null` dès qu'il en
   * nomme plusieurs — voir le commentaire à l'appel: deux parts anonymes se
   * confondraient, et ce sont deux assiettes différentes.
   */
  soleMember: string | null;
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
            soleEater={props.soleMember}
            // L'EN-TÊTE DE LA VOIE A DÉJÀ NOMMÉ. Des pastilles répétant les
            // mêmes prénoms trois centimètres plus bas seraient du bruit sur la
            // surface que ce lot existe pour rendre lisible.
            marks={false}
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
  render: (
    dish: GeneratedDish,
    key: string,
    annotation: DishAnnotation,
  ) => React.ReactNode;
  id: string;
  /**
   * LES PASTILLES DE PRÉNOMS SOUS LE PLAT. REQUISE, jamais optionnelle: un
   * défaut à `false` les aurait fait disparaître chez l'appelant qui oublie —
   * exactement le lot construit-branché-désarmé que ce dépôt a déjà payé — et
   * un défaut à `true` les aurait doublées sous chaque voie déjà nommée.
   * L'appelant DIT si le plat s'annonce déjà lui-même.
   */
  marks: boolean;
  /**
   * LA BOUCHE QUE L'EN-TÊTE AU-DESSUS NOMME DÉJÀ, SI ELLE EST SEULE.
   *
   * ── LE DÉFAUT (mesuré sur le rendu, 2026-08-19) ────────────────────────
   * Dans une voie dédiée, le bloc disait « Pour Christèle » (l'en-tête),
   * « Boîte Christèle — 340 g » (la carte) puis « Christèle — ta part de
   * poulet » (la part). Trois fois le même prénom en quatre lignes, sur la
   * surface même que ce lot existe pour rendre lisible.
   *
   * ⚠️ `null` DÈS QUE L'EN-TÊTE EN NOMME PLUSIEURS. À deux, effacer les
   * prénoms des parts rendrait deux lignes identiques pour deux assiettes
   * différentes — un défaut bien pire que la répétition.
   */
  soleEater: string | null;
}) {
  const { entry } = props;
  // LE PRÉNOM DE LA PART EST-IL DÉJÀ ÉCRIT AU-DESSUS ?
  //
  // ⚠️ LA CONDITION EST AUSSI COURTE QUE ÇA, ET C'EST VÉRIFIÉ. On avait écrit
  // `shares.length === 1 && shares[0].memberId === soleEater`; la mutation a
  // montré que ces deux clauses ne pouvaient PAS tomber — une voie qui ne
  // nomme qu'une bouche ne porte, par construction du modèle, que la part de
  // cette bouche-là (`eatsHere`). Une clause qu'aucune mutation ne fait mordre
  // n'est pas une garde, c'est un décor qui donne l'air d'en avoir une.
  //
  // LA LIGNE QUI DÉCIDE VRAIMENT est chez l'appelant: `soleMember` vaut `null`
  // dès que l'en-tête nomme plusieurs bouches. Les deux tests de ce lot la
  // tiennent — mutée, elle efface les prénoms de deux parts différentes.
  const nameIsAbove = props.soleEater !== null;
  return (
    <div>
      {/* ══════════════════════════════════════════════════════════════════
          TOUT PASSE PAR LA CARTE — IL N'Y A PLUS RIEN AUTOUR (2026-08-21).
          ══════════════════════════════════════════════════════════════════
          Les marqueurs et les parts se rendaient ICI, sous la carte, à 4 px.
          « C'est entre les deux, on comprend pas »: contre une bordure, aucun
          écart ne rattache quoi que ce soit. Voir `DishAnnotation`.

          ⚠️ CE QUI EST CALCULÉ RESTE CALCULÉ ICI, et c'est le partage: ce
          composant sait ce que l'en-tête nomme (`soleEater`) et si le plat
          s'annonce déjà lui-même (`marks`) — la carte, elle, ne voit ni sa voie
          ni ses voisines. Elle reçoit donc une liste PRÊTE, jamais la règle. */}
      {props.render(entry.dish, props.id, {
        // ⚠️ VIDÉ QUAND L'APPELANT DIT QUE LE PLAT S'ANNONCE DÉJÀ: dans une
        // voie nommée, l'en-tête a écrit le prénom trois centimètres plus haut.
        eaters: props.marks ? entry.eaters : [],
        shares: entry.shares.map((share) => ({
          memberId: share.memberId,
          // `null` = déjà dit au-dessus. La ligne garde son `memberId`: la
          // jointure reste auditable même quand le prénom ne se lit plus.
          name: nameIsAbove ? null : share.name,
          note: share.note,
        })),
      })}
    </div>
  );
}
