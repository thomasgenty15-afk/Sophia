// KEEL UI — LES TROIS ACCIDENTS QU'UNE SEMAINE ENCAISSE.
//
// ── POURQUOI CETTE FIGURE EST PARTAGÉE, ALORS QUE LA CHARTE DIT L'INVERSE ──
// `CHARTE-VITRINE.md` §6: « Rien de spécifique à une page n'entre dans les
// primitives communes […] une maquette partagée change de sens sur deux pages
// quand on en édite une. » La règle est juste, et cette figure est l'exception
// qu'elle décrit mal.
//
// Ce qu'elle DESSINE n'appartient à aucune page: c'est la procédure accident du
// PRODUIT (`FF-057`, « les quatre entrées »), identique pour quelqu'un qui vit
// seul et pour un couple — un repas sauté, une cuisson sautée, des courses non
// faites. Une maquette qui n'a pas de sens propre à une page ne peut pas en
// changer d'une page à l'autre; ce qu'elle risque, c'est de DIVERGER en deux
// copies, et ce dépôt vient de payer exactement ça sur les consignes de service
// en français.
//
// ⚠️ CE QUI RESTE LOCAL À CHAQUE PAGE: les CLÉS i18n. On partage le dessin, pas
// la copie — chaque page nomme ses trois accidents dans son propre namespace,
// et peut les dire autrement à un solo et à un couple.
//
// ⚠️ ET ELLE VIT DANS `ui/` ET PAS DANS `Marketing.tsx`, pour la même raison
// que `OfferLines`: `pageSeams.int.test.ts` suit le graphe d'imports COMPLET
// d'une route, et un littéral `mealprep.*` dans un fichier importé par les
// quatre pages professionnelles les ferait rougir. Ici, aucune clé n'entre —
// tout arrive en props.

/**
 * L'ÉQUERRE ET LE LIBELLÉ D'UNE PLANCHE.
 *
 * ⚠️ EXPORTÉE PARCE QUE `/meal-prep` LA PARTAGE AVEC SES DEUX AUTRES FIGURES.
 * Elle vivait là-bas; la laisser en double ferait diverger la géométrie de
 * l'équerre entre les planches d'une même page — c'est exactement pour ça
 * qu'elle avait été factorisée en premier lieu.
 */
export function FigureHead({ label }: { label: string }) {
  return (
    <>
      <path d="M 8 32 L 8 16 A 8 8 0 0 1 16 8 L 32 8" fill="none" stroke="var(--ill-fig, #632C4C)" strokeWidth="2" strokeLinecap="round" />
      <text x="44" y="26" fontSize="11" fontWeight="600" letterSpacing="1.2" fill="var(--ill-ink-soft, #6A5A64)">{label}</text>
    </>
  );
}

/**
 * PLIE UN LIBELLÉ DE FIGURE SUR AU PLUS DEUX LIGNES.
 *
 * Coupe au mot le plus proche du milieu, pour que les deux lignes soient de
 * longueurs voisines — une coupe « au premier mot qui déborde » produit une
 * ligne longue et un orphelin, ce qui se lit plus mal que pas de coupe.
 * Un libellé d'un seul mot n'est pas coupé: il n'y a rien à couper, et un
 * mot brisé en deux serait pire que le débordement.
 */
function wrapLabel(label: string): string[] {
  const words = label.split(" ");
  if (words.length < 2) return [label];
  let best = 1;
  let bestGap = Infinity;
  for (let cut = 1; cut < words.length; cut++) {
    const gap = Math.abs(
      words.slice(0, cut).join(" ").length - words.slice(cut).join(" ").length,
    );
    if (gap < bestGap) {
      bestGap = gap;
      best = cut;
    }
  }
  return [words.slice(0, best).join(" "), words.slice(best).join(" ")];
}

export function AccidentsFigure(props: {
  /** Le libellé d'équerre de la planche. */
  label: string;
  /** Son nom accessible, et sa description. */
  title: string;
  desc: string;
  /** Les trois accidents, du plus petit au plus grand. */
  mealLabel: string;
  sessionLabel: string;
  shoppingLabel: string;
  /**
   * ⚠️ LES `id` DES DEUX NŒUDS `aria-labelledby` SONT UN PARAMÈTRE, ET C'EST
   * OBLIGATOIRE. Deux figures sur une même page — ou la même figure montée deux
   * fois — produiraient deux `id` identiques, et un lecteur d'écran suivrait le
   * premier pour les deux. Chaque page passe le sien.
   */
  idPrefix: string;
}) {
  const soft = "var(--ill-ink-soft, #6A5A64)";
  const ink = "var(--ill-ink, #23191F)";
  const dash = "4 3";

  /**
   * LES TROIS ACCIDENTS QUE LE PRODUIT ENCAISSE, PAR AMPLITUDE CROISSANTE.
   *
   * ⚠️ ILS ÉTAIENT DEUX JUSQU'AU 2026-09-01, ET C'ÉTAIT INCOMPLET — pas
   * seulement illisible. `FF-057` §« Les quatre entrées » en nomme un
   * troisième, et c'est le plus grave: « une vague de courses déclarée non
   * faite — la seule entrée qui menace le plan ENTIER, et pas un seul repas ».
   * Le code la câble (`chat/accident_tap.ts :: shiftProposalAfterShoppingLater`).
   * La figure d'avant montrait « décaler un plat » et « décaler la session »
   * et taisait la seule chose qui puisse faire tomber une semaine.
   *
   * ⚠️ L'ORDRE EST L'ARGUMENT. De gauche à droite, ce qui tombe grandit: un
   * repas, puis une cuisson et ce qu'elle nourrit, puis les courses et tout ce
   * qui en dépend. Le lecteur voit la chaîne s'allonger, et c'est ça qui dit
   * « le plan tient à chaque étage », pas les trois libellés.
   *
   * ⛔ ON NE DESSINE PAS LA RÉPARATION. Trois cartes qui montreraient chacune
   * un départ ET une arrivée feraient six colonnes de 40 unités: sous le
   * plancher de lisibilité. La réparation est le TEXTE à côté de la figure —
   * et c'est le bon partage, parce qu'elle n'est pas la même pour les trois.
   */
  const cards: Array<{ x: number; label: string; basket: boolean; pot: boolean; dishes: number }> = [
    { x: 24, label: props.mealLabel, basket: false, pot: false, dishes: 1 },
    { x: 176, label: props.sessionLabel, basket: false, pot: true, dishes: 3 },
    { x: 328, label: props.shoppingLabel, basket: true, pot: true, dishes: 3 },
  ];

  /** Les trois emplacements d'assiette, du bas vers le haut. */
  const DISH_Y = [186, 164, 142];

  return (
    <svg viewBox="0 0 480 262" role="img" aria-labelledby={`${props.idPrefix}-t ${props.idPrefix}-d`} className="mx-auto block w-full max-w-[560px]">
      <title id={`${props.idPrefix}-t`}>{props.title}</title>
      <desc id={`${props.idPrefix}-d`}>{props.desc}</desc>

      <FigureHead label={props.label} />

      {cards.map((card) => {
        const cx = card.x + 64;
        return (
          <g key={card.x} fill="none" stroke={soft} strokeWidth="1">
            <rect x={card.x} y="52" width="128" height="160" rx="12" fill="var(--ill-paper, #FBF8FA)" />

            {/* LE PANIER — seulement sur la carte des courses. */}
            {card.basket && (
              <>
                <path d={`M ${cx - 9} 72 a 9 9 0 0 1 18 0`} stroke={ink} strokeWidth="2" />
                <rect x={cx - 17} y="72" width="34" height="20" rx="3" stroke={ink} strokeWidth="2" strokeDasharray={dash} />
                <path d={`M ${cx} 92 L ${cx} 106`} />
              </>
            )}

            {/* LA CASSEROLE — sur les courses et sur la cuisson. */}
            {card.pot && (
              <>
                <rect x={cx - 24} y="112" width="12" height="8" rx="4" stroke={ink} strokeWidth="2" />
                <rect x={cx + 12} y="112" width="12" height="8" rx="4" stroke={ink} strokeWidth="2" />
                <circle cx={cx} cy="116" r="14" stroke={ink} strokeWidth="2" strokeDasharray={dash} />
                <path d={`M ${cx} 130 L ${cx} 138`} />
              </>
            )}

            {/* LES ASSIETTES — une, ou trois. En pointillé: ce qui n'aura pas
                lieu si personne ne le dit. */}
            {DISH_Y.slice(0, card.dishes).map((y) => (
              <rect key={y} x={cx - 22} y={y - 7} width="44" height="14" rx="3" stroke={ink} strokeWidth="2" strokeDasharray={dash} />
            ))}
            {/* Le peigne qui relie les trois assiettes à ce qui les produit. */}
            {card.dishes > 1 && card.pot && (
              <path d={`M ${cx} 138 L ${cx} ${DISH_Y[card.dishes - 1]}`} />
            )}

            {/* ⚠️ LE LIBELLÉ SE PLIE SUR DEUX LIGNES, ET C'EST MESURÉ. Une carte
                fait 128 unités; « DES COURSES NON FAITES » à 12 unités avec un
                interlettre de 1 en demande ~176, donc les trois libellés se
                chevauchaient au rendu. On ne réduit pas la taille pour compenser:
                le plancher de cette page est 12 unités (à 375 px, 12 rend 9,5 px
                et 9 rendrait 7,1 — la bande que `.fig-scroll` existe pour
                éviter). On plie donc le TEXTE, pas la typographie.
                Le pli est calculé, jamais écrit dans la clé: une clé qui porte
                sa propre coupure de ligne se casse à la première traduction. */}
            {wrapLabel(card.label).map((line, i) => (
              <text
                key={line}
                x={cx}
                y={232 + i * 15}
                textAnchor="middle"
                stroke="none"
                fontSize="12"
                fontWeight="600"
                letterSpacing="1"
                fill={soft}
              >
                {line}
              </text>
            ))}
          </g>
        );
      })}
    </svg>
  );
}
