import { mealCopy } from "../../api/mealLabels";
import { householdMeasureOf } from "../../lib/householdMeasure";
import type { BoxEnergyView } from "../../api/mealEnergy";
import type { BoxLine, BoxSideLine } from "../../lib/mealBoxes";

// LE BOXING — UNE LIGNE PAR CONTENANT, C'EST-À-DIRE PAR REPAS **ET** PAR GROUPE.
//
// ── POURQUOI LE GRAMME EST ICI, ET NULLE PART AILLEURS ─────────────────────
// C'est TOUT le protocole: on pèse UNE fois, au moment de la mise en boîtes,
// donc l'instruction vit là où le geste se fait — devant la casserole, à la
// session de cuisine. Le jour J, un plat NOMME son contenant; il ne redit pas
// comment le remplir, et depuis le 2026-08-20 il ne porte plus aucun chiffre.
//
// ── CE QUI A CHANGÉ LE 2026-08-20: LE PLURIEL (v4) ─────────────────────────
// Un repas produit N contenants — un par GROUPE de mangeurs. Le foyer de
// Casimir, Odalric, Wilfrid et Peregrine (qui a un objectif) sort DEUX bacs par
// repas: celui de Peregrine, et celui des trois autres.
//
// ⛔ ET LE NOMBRE DE NOMS DÉCIDE DE CE QUE LE GRAMME VEUT DIRE. Un seul nom: la
// boîte EST sa portion, on l'ouvre et on mange. Plusieurs: c'est la quantité du
// BAC, et personne n'est visé. Le `· pour n` est ce qui le dit à l'écran —
// c'est la seule marque de la distinction, et elle est volontairement discrète:
// un badge ou une couleur en ferait un statut, alors que c'est une précision de
// lecture.
//
// ⛔ AUCUN POURQUOI, ET C'EST STRUCTUREL. Ce composant ne reçoit que des
// prénoms, un libellé de repas, des termes et des grammes (`BoxLine`): il n'a
// aucun champ où un objectif ou un poids pourrait entrer. Les grammes qu'il
// rend sont des grammes d'ALIMENT — la même famille que « 400 g de cuisses de
// poulet » sur une liste de courses (F7/F8, FF-047).
//
// ── ⟳ 2026-09-04 · LE KCAL D'UNE BOÎTE À UN NOM, ET POURQUOI CE N'EST PAS UN
// POURQUOI ─────────────────────────────────────────────────────────────────
// Décision de l'utilisateur: « dès qu'il y a un objectif de perte ou de gain de
// poids, c'est affiché, peu importe qui regarde ». Ce composant peut donc
// recevoir, par `boxEnergy`, le kcal d'un contenant à UN nom — et il le rend
// sur cette ligne-là seulement. Ce n'est pas une brèche de la phrase au-dessus:
// ce kcal est une QUANTITÉ DU PLAN (`plan_quantities`, les kcal du plat au
// prorata des grammes de la boîte), de la même famille que les grammes. Il ne
// dit ni le poids, ni la taille, ni le besoin de personne. Ce qu'il révèle —
// qu'une bouche a un objectif — est assumé par la décision.
// ⛔ JAMAIS SUR UN BAC PARTAGÉ: ses grammes sont une quantité de bac, pas la
// portion de quelqu'un, et un kcal dessus aurait l'air personnel sans l'être.
// Le serveur ne rend d'ailleurs jamais de chiffre pour un couvercle à
// plusieurs noms (`canEmitBoxEnergy`, docs/keel/BOITES-PAR-REPAS.md).
// ⛔ CE COMPOSANT NE DÉCIDE PAS DU DROIT DE VOIR. Il rend ce qu'on lui donne;
// quand la porte d'une bouche est fermée, il n'y a rien à lui donner.
//
// ⛔ AUCUNE COULEUR D'ÉTAT. Une pesée n'est ni un verdict ni une alerte: c'est
// une donnée, comme un jour de cuisine et une durée. La frontière est portée par
// le filet et l'espace (charte §2).
//
// ⛔ AUCUN MARQUEUR NUMÉROTÉ (01/02/03) SUR LES CONTENANTS. Ils forment un
// ENSEMBLE, pas une séquence: rien ne dit de remplir celui de jeudi avant celui
// de vendredi, et une numérotation affirmerait un ordre que le plan n'a pas
// écrit. Le COMPTE, lui, est une information — on sort ses bacs avant de
// commencer — et c'est pour ça qu'il est en tête et que le reste ne l'est pas.
//
// ── RENDU PAR TROIS ÉCRANS, ÉCRIT UNE FOIS ────────────────────────────────
// « Tes sessions de cuisine », le bloc session de la vue par jour, et la carte
// d'un plat montrent le MÊME objet. Trois rendus du même contenant finissent par
// diverger, et ici la divergence se paierait sur des grammes.

export function BoxTable(
  { lines, context, boxEnergy, headless }: {
    lines: readonly BoxLine[];
    /**
     * ⟳ 2026-09-23 — SANS SA LIGNE DE TITRE (« Boxing · 15 contenants… »),
     * parce que la section repliable qui la contient (`FoldSection`) la porte
     * déjà. `undefined` = la table dit son titre, comme partout ailleurs.
     */
    headless?: boolean;
    /**
     * ⟳ 2026-09-04 — le kcal d'un contenant à UN nom, quand sa bouche y a
     * droit. `undefined` = aucune énergie n'a voyagé (porte fermée ou écran qui
     * ne la charge pas): rien ne se rend, et rien ne le signale.
     */
    boxEnergy?: (boxId: string) => BoxEnergyView | null;
    /**
     * ══════════════════════════════════════════════════════════════════════
     * OÙ CETTE TABLE EST POSÉE — et donc CE QU'ELLE A LE DROIT DE DIRE.
     * ══════════════════════════════════════════════════════════════════════
     *
     * `session` = **le Boxing**. On est devant les casseroles, avec des bacs
     * vides: le compte, les couvercles, et ce qu'on met dedans.
     *
     * `dish` = **la carte d'un repas**. On est devant le frigo le jour J: le
     * couvercle à chercher, et RIEN D'AUTRE. ⛔ Aucun gramme — le contenant EST
     * la portion, et réafficher un chiffre ici ferait ressortir la balance à
     * chaque repas, c'est-à-dire exactement ce que le protocole existe pour
     * éviter (arbitrage 2026-08-20).
     *
     * ⚠️ REQUISE, jamais optionnelle: un défaut `session` remettrait des
     * grammes sur toute carte dont l'appelant oublie la prop, et un défaut
     * `dish` viderait le Boxing — aucun des deux n'est sûr, donc il n'y en a
     * pas.
     */
    context: "session" | "dish" | "doses";
  },
) {
  // MUETTE QUAND IL N'Y A RIEN À METTRE EN BOÎTE, et c'est le cas majoritaire:
  // tout plan écrit avant le 2026-08-19, toute lane individuelle, et tout plat
  // cuisiné de zéro le jour même. Un en-tête au-dessus du vide se lirait comme
  // une panne.
  if (lines.length === 0) return null;
  // ⚠️ DÉRIVÉ DES LIGNES, jamais passé par l'appelant: deux façons de compter
  // la même chose divergent, et c'est celle qu'on regarde le moins qui garde
  // l'ancienne. `BoxLine.frozen` est la seule autorité (lue de `uses[].kept`).
  const frozenCount = lines.filter((l) => l.frozen).length;
  return (
    <div className="mt-3 rounded-card border border-line bg-paper-2 px-3 py-2">
      {!headless && (
      <div className="flex flex-wrap items-baseline gap-x-2">
        <p className="text-label font-semibold uppercase tracking-wide text-ink-soft">
          {mealCopy(
            context === "doses"
              ? "meals.doses.title"
              : context === "dish"
              ? "meals.boxes.title_dish"
              : "meals.boxes.title",
          )}
        </p>
        {/* ── LE COMPTE, EN TÊTE ET NULLE PART AILLEURS ────────────────────
            On sort ses bacs AVANT de commencer, pas au milieu. C'est la seule
            chose qu'on veut savoir avant d'avoir lu une seule ligne.
            ⚠️ Boxing seulement: sur la carte d'un plat, les contenants sont
            deux au plus et ils sont sous les yeux — les compter serait du
            bruit. */}
        {context === "session" && (
          <span className="text-label tabular-nums text-ink-soft">
            {/* Deux clés, jamais un suffixe fabriqué en code (R7): « zéro » et
                « un » ne se disent pas pareil d'une langue à l'autre. Même
                patron que les courses du jour. */}
            {lines.length === 1
              ? mealCopy("meals.boxes.count_one")
              : mealCopy("meals.boxes.count_many", { n: lines.length })}
          </span>
        )}
        {/* ══════════════════════════════════════════════════════════════
            COMBIEN PARTENT AU CONGÉLATEUR — 2026-09-04.
            ══════════════════════════════════════════════════════════════
            On sort ses bacs avant de commencer; on veut savoir dans le même
            regard combien iront au congélateur, parce que ça décide du geste
            (et parfois du contenant qu'on choisit).

            ⛔ ARMÉ PAR UNE PRÉMISSE, MUET SINON. Zéro contenant congelé ⇒
            aucune ligne — « 0 à congeler » apprendrait à ne plus lire cette
            place, et un plan à deux sessions n'a rien à congeler par
            construction.
            ⚠️ BOXING SEULEMENT, comme le compte à côté: sur la carte d'un
            plat, les contenants sont deux au plus et chacun porte déjà sa
            propre marque. */}
        {context === "session" && frozenCount > 0 && (
          <span className="text-label tabular-nums text-ink-soft">
            {mealCopy("meals.boxes.freeze_count", { n: frozenCount })}
          </span>
        )}
      </div>
      )}
      {/* ⛔ 2026-09-25 — LA CLÉ DE LECTURE « Grammes d'aliment cuit, par
          contenant… » EST RETIRÉE, sur demande du propriétaire. */}
      {/* ══════════════════════════════════════════════════════════════════
          UN FILET ENTRE DEUX CONTENANTS — VU À L'ÉCRAN LE 2026-08-20.
          ══════════════════════════════════════════════════════════════════
          Avec un simple `gap`, vingt contenants coulaient en un seul pavé: le
          couvercle d'un bac et les composants du précédent se lisaient à la
          même distance, et il fallait relire pour savoir où un bac finissait.
          Or c'est LA question qu'on se pose ici — on en remplit un à la fois.

          ⚠️ UN FILET, PAS UNE CARTE PAR BAC. Vingt cartes empilées feraient
          vingt cadres dans un cadre; le filet et l'espace suffisent, et c'est
          l'idiome de la charte (§2: la frontière est portée par le filet et
          l'espace, jamais par un remplissage de plus). */}
      <ul className="mt-2 flex flex-col">
        {lines.map((line) => (
          <BoxRow
            key={line.id}
            line={line}
            context={context}
            // ⛔ LA LIGNE À UN NOM SEULEMENT. Un bac partagé ne demande jamais
            // son chiffre, même quand la fonction le connaîtrait.
            energy={!line.shared && boxEnergy ? boxEnergy(line.id) : null}
          />
        ))}
      </ul>
    </div>
  );
}

/**
 * UN CONTENANT — son couvercle, et ce qu'on met dedans.
 *
 * ⚠️ LE COUVERCLE EST UNE CHAÎNE ENTIÈRE (`line.lid`), PAS TROIS FRAGMENTS
 * ASSEMBLÉS ICI. C'est ce qui garantit qu'il est identique au caractère près
 * dans le Boxing et sur la carte du repas — et cette égalité-là n'est pas une
 * élégance: on tient un bac dans la main et on cherche la même suite de mots à
 * l'écran. `lib/mealBoxes.ts` le construit une fois; ce fichier ne fait que
 * l'afficher. (⟳ 2026-09-25 — un essai sur trois lignes a été défait, sur
 * demande: le couvercle reste sur UNE ligne, des deux côtés.)
 *
 * ⚠️ ET IL SE REDIT SUR LA CARTE DU REPAS, QUI PORTE DÉJÀ SON JOUR, SON MOMENT
 * ET SON TITRE. La redondance est le point: le couvercle n'informe pas, il se
 * fait RECONNAÎTRE.
 */
function BoxRow(
  { line, context, energy }: {
    line: BoxLine;
    context: "session" | "dish" | "doses";
    energy: BoxEnergyView | null;
  },
) {
  return (
    <li
      // `data-box-id` N'EST PAS UN ORNEMENT DE TEST — c'est l'identifiant de ce
      // contenant. Il ne s'affiche pas (un slug de couvercle ne veut rien dire à
      // table) mais il rend la ligne auditable dans le DOM.
      data-box-id={line.id}
      className="flex flex-col gap-1 border-t border-line pt-2.5 text-sm text-ink first:border-t-0 first:pt-0"
    >
      <span className="flex flex-wrap items-baseline gap-x-2 break-words">
        <span className="font-medium">
          {/* ⟳ 2026-09-21 — LES DOSES D'UN PLAT SANS CUISSON : le prénom
              suffit. Le couvercle (« Thomas — Mardi Petit-déjeuner — Petit-
              suisse… ») répète le jour, le moment et le titre qui sont trois
              lignes plus haut ; il n'y a aucune boîte à étiqueter. */}
          {context === "doses" && line.eatersLabel !== ""
            ? line.eatersLabel
            : line.lid !== ""
            ? line.lid
            : mealCopy("meals.boxes.lid_unnamed")}
        </span>
        {/* ── CE QUI DIT QUE LE NOMBRE DÉCRIT UN BAC ───────────────────────
            Le seul geste qui distingue les deux lectures du gramme, et il est
            volontairement minuscule: un badge ou une couleur en ferait un
            statut. Absent sur un contenant à un seul nom — son couvercle suffit
            à dire que c'est une portion. */}
        {/* ⟳ 2026-09-04 — LE CHIFFRE DU CONTENANT, SUR LA LIGNE À UN NOM.
            Même cran et même gris que « · pour n »: c'est une précision de
            lecture, pas un statut. Le nombre sort d'un champ typé et entre
            dans un `<span>` — jamais dans une phrase composée (R4). */}
        {/* ⟳ 2026-09-16 — PAS DE KCAL SUR UN CONTENANT PARTIEL. L'énergie est
            celle du REPAS (part de marmite + accompagnements du jour) ; l'écrire
            à côté d'un contenant qui ne tient que la part de marmite ferait
            lire 1 213 kcal sur 588 g de dinde. */}
        {energy !== null && !line.partial && (
          <span className="text-label tabular-nums text-ink-soft">
            {mealCopy("meals.boxes.energy", { n: energy.kcal })}
          </span>
        )}
        {/* ⟳ 2026-09-23 — CE QUI COMPLÈTE LA BOÎTE DANS UNE AUTRE SESSION,
            nommé et daté, jamais pesé ici. Mesuré sur le plan `404d64b5`: le
            mercredi faisait peser le saumon cuit le vendredi. Voir
            `fromOtherSessions` (`mealBoxes.ts`). */}
        {context === "session" && line.fromOtherSessions.map((part) => (
          <span key={`${part.term}|${part.dayLabel ?? ""}`} className="text-label text-ink-soft">
            {part.dayLabel === null
              ? mealCopy("meals.boxes.with_other_session_undated", { what: part.term })
              : mealCopy("meals.boxes.with_other_session", { what: part.term, day: part.dayLabel })}
          </span>
        ))}
        {line.shared && (
          <span className="text-label tabular-nums text-ink-soft">
            {mealCopy("meals.boxes.for_n", { n: line.eaterCount })}
          </span>
        )}
        {/* ── CE CONTENANT VA AU CONGÉLATEUR ──────────────────────────────
            Sur le couvercle, à côté du nom, parce que c'est là qu'on décide
            quoi en faire une fois rempli. Même forme que le marqueur « pour
            n »: un `text-label` discret, jamais un badge coloré — ce n'est ni
            une alerte ni un statut, c'est une instruction de rangement.

            ⛔ IL SE REND SUR LES DEUX SURFACES, Boxing ET carte du plat, et
            c'est voulu: le geste de remplir et le geste de sortir sont à
            quatre jours d'écart, et `DishCard` ne dit que le second (« sors-la
            du congélateur la veille »). Dire l'un sans l'autre laissait une
            part au frigo pendant six jours. */}
        {line.frozen && (
          <span className="text-label text-ink-soft">
            {mealCopy("meals.boxes.freeze")}
          </span>
        )}
      </span>
      {/* ══════════════════════════════════════════════════════════════════
          CE QU'ON MET DEDANS — BOXING SEULEMENT.
          ══════════════════════════════════════════════════════════════════
          ⚠️ LES GRAMMES S'EMPILENT EN COLONNE, `tabular-nums`, poussés à
          droite par `justify-between`. On coche en pesant: des nombres qui
          s'alignent se comparent d'un coup d'œil, et c'est la seule chose qui
          compte avec une balance dans une main.

          ⚠️ `min-w-0` SUR LE TERME. C'est un enfant de flex, donc sa largeur
          minimale vaut `auto` par défaut et un mot composé long pousserait le
          gramme hors de la carte à 320 px (cicatrice `flex-child-min-width-auto`
          du dépôt). `break-words` fait le reste.

          ⚠️ MUET SUR UN PLAN v2 RELU (aucun `item`): on montre alors le total,
          qui est la seule chose vraie qu'on puisse en tirer. Pas de « ? », pas
          de ligne inventée. */}
      {/* ⟳ 2026-09-21 — ET LES DOSES: un plat sans cuisson n'a pas de boîte à
          sortir ; ce qu'il faut lire entre les personnes, c'est le dosage —
          et le kcal pour celles qui ont un objectif (le back ne l'émet que
          pour une direction, `keel.meal_energy.box_gate`). */}
      {(context === "session" || context === "doses") && line.items.length > 0 && (
        <ul className="flex flex-col gap-0.5">
          {line.items.map((item, i) => {
            // La mesure de cuisine de CETTE ligne. `null` = rien à dire.
            const measure = householdMeasureOf(item.ml);
            // ⟳ 2026-09-22 — ce que cette part de casserole contient, s'il y a à dire.
            const parts = item.parts ?? null;
            return (
            <li key={`${item.term}-${i}`} className="flex flex-col">
            <span className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 break-words text-ink-soft">{item.term}</span>
              {/* ══════════════════════════════════════════════════════════
                  ⟳ 2026-09-22 · UN LIQUIDE SE VERSE, IL NE SE PÈSE PAS.
                  ══════════════════════════════════════════════════════════
                  « huile de colza — 6 g » est juste et inexécutable: personne
                  ne pèse 6 g d'huile. La cuillère vient du VOLUME calculé par
                  le moteur depuis la fiche de l'aliment (`BoxItem.ml`), jamais
                  d'une devinette sur le libellé.

                  ⛔ ELLE S'AJOUTE AU GRAMME, ELLE NE LE REMPLACE PAS. Le
                  gramme est la grandeur du plan — celle qui a servi au calcul
                  d'énergie et qui se vérifie; la cuillère est le geste. Garder
                  les deux est ce qui empêche un arrondi de cuisine de devenir
                  le chiffre du plan.
                  ⚠️ MUETTE SUR TOUT CE QUI NE SE VERSE PAS, et c'est la
                  quasi-totalité des lignes: un blanc de poulet n'a pas de
                  volume, et un plan d'avant ce lot n'en porte aucun. */}
              <span className="flex shrink-0 items-baseline gap-2">
                {measure !== null && (
                  <span className="text-label tabular-nums text-ink-soft">
                    {mealCopy(measure.key, { n: measure.n })}
                  </span>
                )}
                <span className="tabular-nums text-ink-soft">
                  {mealCopy("meals.boxes.grams", { n: item.grams })}
                </span>
              </span>
            </span>
            {/* ══════════════════════════════════════════════════════════
                ⟳ 2026-09-22 · CE QUE CETTE PART DE CASSEROLE CONTIENT.
                ══════════════════════════════════════════════════════════
                « dont poulet ~110 g, légumes ~140 g ». Demande du
                propriétaire: la ligne « Poulet rôti aux légumes — 261 g » ne
                disait pas combien de poulet et combien de légumes on met dans
                la boîte. Les fractions viennent du moteur; ici, une
                multiplication et un arrondi (`lib/mealBoxes.ts`).
                ⛔ UNE INFORMATION, PAS UNE PESÉE: le tilde et le gris le disent,
                et le gramme à droite reste la seule quantité qu'on pèse. */}
            {parts !== null && (
              <span
                data-box-parts
                className="flex flex-wrap gap-x-1 text-label text-ink-soft"
              >
                <span>{mealCopy("meals.boxes.parts")}</span>
                {parts.map((part, k) => (
                  <span key={`${part.kind}-${part.term ?? ""}`} className="tabular-nums">
                    {mealCopy("meals.boxes.part", {
                      term: part.term ?? mealCopy("meals.boxes.part_vegetables"),
                      n: part.grams,
                    })}
                    {k < parts.length - 1 ? "," : ""}
                  </span>
                ))}
              </span>
            )}
            </li>
            );
          })}
        </ul>
      )}
      {context === "session" && line.items.length === 0 && line.total > 0 && (
        <span className="tabular-nums text-ink-soft">
          {mealCopy("meals.boxes.grams", { n: line.total })}
        </span>
      )}
      {/* ⟳ 2026-09-23 — LES À-CÔTÉS, APRÈS CE QU'ON MET DANS LE PLAT.
          ⟳ 2026-09-25 — AU BOXING SEULEMENT: sur la carte d'un repas (boîtes
          ou doses), ils sont montés sous le titre du plat (`DishCard`). */}
      {context === "session" && (
        <SideCourseBlock
          // ⚠️ `?? []` POUR LES MONTAGES DE TEST SEULEMENT: `oneLine` pose
          // toujours `sides`, mais des `BoxLine` fabriquées par `as` dans des
          // tests hors `tsc` n'ont pas la clé. Voir `sidesOfDish`.
          sides={line.sides ?? []}
        />
      )}
    </li>
  );
}

/**
 * ══════════════════════════════════════════════════════════════════════════
 * ⟳ 2026-09-23 — LA LIGNE « À CÔTÉ » D'UN CONTENANT.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Entrée, fromage, dessert, pain: ce qui se mange avec le plat sans être dans
 * le plat. Une ligne par personne — « 1 × pomme, comté ~30 g » sous sa boîte à
 * elle, « Christèle : 1 × yaourt nature » sous un bac commun.
 *
 * ⟳ 2026-09-25 — AU BOXING SEULEMENT. Sur la carte d'un repas, les à-côtés
 * sont la deuxième ligne du titre (`DishCard`, `dishSideSummary`): c'est le
 * jour même, devant la carte, qu'on prend la pomme ou qu'on coupe les 30 g de
 * fromage, et on le lit sans ouvrir le détail.
 *
 * ⚠️ AU BOXING (`session`), ce sont des parts de CASSEROLE (une soupe), et
 * elles se pèsent comme les autres: le terme à gauche, le gramme exact aligné à
 * droite. `oneLine` n'y laisse arriver que celles-là.
 *
 * ⛔ AUCUNE PROVENANCE, AUCUNE COULEUR D'ÉTAT: `BoxSideLine` n'a aucun champ
 * qui dise d'où vient l'aliment, et le gris est celui des autres précisions.
 *
 * MUETTE SUR `[]`: un plan d'avant ce lot rend exactement le HTML d'avant.
 */
function SideCourseBlock({ sides }: { sides: readonly BoxSideLine[] }) {
  if (sides.length === 0) return null;
  return (
    <div data-box-sides className="flex flex-col gap-0.5">
      <span className="text-label font-semibold uppercase tracking-wide text-ink-soft">
        {mealCopy("meals.boxes.side_courses")}
      </span>
      <ul className="flex flex-col gap-0.5">
        {sides.map((side) => (
          <li
            key={side.memberId}
            // Même jointure auditable que les contenants: par identifiant,
            // jamais par prénom rendu.
            data-side-member-id={side.memberId}
            className="flex flex-col text-ink-soft"
          >
            {side.name !== null && (
              <span className="break-words font-medium text-ink">{side.name}</span>
            )}
            {side.items.map((item, i) => (
              <span
                key={`${item.term}-${i}`}
                className="flex items-baseline justify-between gap-3"
              >
                {item.unitCount === null
                  ? (
                    <>
                      <span className="min-w-0 break-words">{item.term}</span>
                      <span className="shrink-0 tabular-nums">
                        {mealCopy("meals.boxes.grams", { n: item.grams })}
                      </span>
                    </>
                  )
                  : <span className="min-w-0 break-words">{item.label}</span>}
              </span>
            ))}
          </li>
        ))}
      </ul>
    </div>
  );
}
