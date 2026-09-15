import React from "react";
import SEO from "../../components/SEO";
import { useSalesStructuredData } from "../seo/salesStructuredData";
import { LEGAL_ENTITY } from "../../lib/legalEntity";
import { PublicFooter, PublicHeader } from "../components/PublicHeader";
import { ButtonLink } from "../components/ui/Button";
import { Kicker, PriceCard, SectionTitle } from "../components/ui/Marketing";
import { AccidentsFigure, FigureHead } from "../components/ui/AccidentsFigure";
import { OfferLines } from "../components/ui/OfferLines";
import { StickyCta } from "../components/ui/StickyCta";
// ⚠️ LES CONSTANTES D'ÉNERGIE VIENNENT DU MOTEUR, ELLES NE SONT PAS RETAPÉES.
// C'est le même chemin que `api/onboarding.ts` → `student_age.ts`. Une copie de
// ces nombres dans un composant de page est très exactement la divergence que
// `energy_target_test.ts` empêche déjà entre le back et `weekInFood.ts` — et
// celle que le pack français avait laissée s'installer sur les consignes de
// service, dans l'angle mort d'une garde écrite en anglais seulement.
import {
  directedRange,
  type EnergyTarget,
  maintenanceRange,
} from "../../../../supabase/functions/_shared/keel/energy_target.ts";
import {
  MAX_DAILY_DEFICIT_KCAL,
  MAX_SURPLUS_FRACTION,
} from "../../../../supabase/functions/_shared/keel/meal_envelope.ts";
import {
  energyFloorFor,
  scaleDirectionOf,
} from "../../../../supabase/functions/_shared/keel/weight_pace.ts";
import { ACTIVITY_LEVELS } from "../../../../supabase/functions/_shared/keel/tokens.ts";
import type { ActivityLevel, GoalToken } from "../../../../supabase/functions/_shared/keel/tokens.ts";
import { en } from "../i18n/en";
import { formatNumber, formatPrice } from "../i18n/format";
import { PRICES } from "../i18n/prices";
import { t } from "../i18n/t";
import type { MessageKey } from "../i18n/t";

/**
 * `/meal-prep` — LA PAGE DE QUI PORTE TOUT SEUL: décider, acheter, cuisiner,
 * tenir.
 *
 * ⚠️ ELLE EST ORGANISÉE PAR DOULEUR, PAS PAR FONCTIONNALITÉ (refonte du
 * 2026-08-13, `scratchpad/site/GRILLE-DOULEURS.md` § « Seul »). Quatre bandes,
 * dans un ordre qui est une décision commerciale et pas une table des matières:
 *
 *   1. « Mon objectif n'a aucune traduction dans mon assiette » — le héros.
 *   2. « Décider coûte plus cher que cuisiner » — sessions ET vagues, un seul
 *      argument porté par deux figures.
 *   3. « Un imprévu, et toute la semaine tombe. »
 *   4. Le prix et la clôture.
 *
 * Il n'y a PAS de cinquième bande. L'ancienne bande sombre « ce que ce n'est
 * pas » n'a pas survécu comme bande: son contenu est replié en RÉSERVE au pied
 * de la bande 1, parce que c'est en choisissant un objectif qu'on redoute de
 * retrouver un compteur — le lever plus bas, c'est le lever après le départ.
 * L'honnêteté ne meurt pas avec sa bande, elle change de place.
 *
 * ── CE QUE CETTE PAGE N'A PAS LE DROIT DE PROMETTRE ────────────────────────
 * Chaque interdit a son ancre dans `scratchpad/site/AUDIT-SITE.md`, et chacun a
 * déjà été écrit quelque part dans ce dépôt avant d'en être retiré.
 *
 * · NI DURÉE D'ESSAI NI BOUTON D'ACHAT (§8 n°1). Le prix se DIT, c'est une
 *   décision produit; mais le tunnel rend 500 faute de prix Stripe et
 *   `free_until` gèle tout foyer neuf à J+31 sans chemin de dégel. D'où
 *   l'absence d'`Offer` dans les données structurées: déclarer une offre à un
 *   moteur, c'est promettre un achat qui n'existe pas.
 * · JAMAIS « jamais de calories » (C15, §8 n°2): le produit AFFICHE des kcal
 *   depuis FF-059. Ce qui est vrai: ils sont ÉTEINTS PAR DÉFAUT
 *   (`profiles.energy_display_enabled`) et une chaîne de gardes décide si on
 *   peut les allumer. Le NOMBRE de gardes n'est pas écrit: le brief en annonce
 *   quatre, l'audit en compte cinq, et un chiffre sans source unique n'entre
 *   pas sur une page (S8).
 * · JAMAIS DE GRAMMES (FF-043 §11 n°1): le produit en calcule, ils n'atteignent
 *   AUCUN écran. La démonstration ci-dessous en est la première victime
 *   potentielle — elle montre des PARTS, en mots, et le dit.
 * · JAMAIS « échanger un plat » (§5.1): `REALIGNMENT_ACTIONS` = `shift_dish`,
 *   `no_cook`, `shift_session`, `nothing_to_change`. Il n'y a pas de
 *   « remplacer », et `accident.ts` écrit qu'aucune fonction d'ici ne choisit
 *   un plat.
 * · AUCUN SUIVI DE POIDS, aucune courbe (C16, silence S6) — alors même que le
 *   lecteur vient AVEC un objectif de poids et que la bande 1 le lui demande:
 *   il le pose à l'entrée, la page s'arrête là.
 * · AUCUNE APPLICATION MOBILE (C17): donc aucun cadre de téléphone dans les
 *   figures (F12), et aucun « rien à installer » pour compenser (S4) — cette
 *   phrase se retrouve toujours au-dessus de la chose qu'elle nierait.
 * · AUCUNE ENTRÉE PROMISE COMME IMMÉDIATE (§10): `/start` interroge d'abord
 *   `keel_free_signup_available`, et la porte est fermée si le programme du
 *   coach maison n'est pas publié. Le CTA dit « commencer », pas « en 2 min ».
 *
 * ── DESIGN ────────────────────────────────────────────────────────────────
 * Direction « la fiche » (`docs/keel/CHARTE-VITRINE.md`): la page est faite de
 * CHAMPS et de PLANCHES — une étiquette, une figure, sa légende. Les trois
 * figures sont des illustrations de CONCEPT: la matière vue de dessus (la
 * casserole, les courses), l'écrit vu de face (le plan). Aucune photographie ici
 * ni ailleurs sur le site, et c'est un risque assumé: le produit ne fabrique
 * aucune image, une assiette photographiée serait une assiette que personne n'a
 * cuisinée (CHARTE §1).
 *
 * ⚠️ F8 (« une seule pièce chaude ») SE VÉRIFIE FIGURE PAR FIGURE, PAS PAR
 * FICHIER: l'équerre est factorisée dans `FigureHead` pour que les trois figures
 * ne divergent pas de géométrie, donc le grep de contrôle (`= 2`) rend 4 ici.
 * Chaque figure a bien son équerre partagée et UNE pièce chaude — la casserole,
 * le panier, le plat. La règle de l'échelle (`Ladder`) est HORS figure: c'est un
 * réglage lu dans une fiche, et elle est monochrome exprès.
 */

// Hissé hors du render: `SEO` garde `structuredData` dans une dépendance de
// `useEffect`, et un littéral inline reconstruirait les balises à chaque rendu.
// L'entité légale vient de `lib/legalEntity` — c'est la MÊME déclaration que
// fait `/legal` à un humain, et deux copies manuscrites d'un numéro de TVA sont
// exactement la façon dont elles finissent par se contredire.

export function MealPrepPage() {
  const structuredData = useSalesStructuredData("/meal-prep", t("mealprep.seo_description"));
  return (
    <div className="min-h-screen bg-paper text-ink">
      <SEO
        title={t("mealprep.seo_title")}
        description={t("mealprep.seo_description")}
        canonical={`${LEGAL_ENTITY.siteUrl}/meal-prep`}
        structuredData={structuredData}
      />

      {/* ⚠️ CE COMMENTAIRE DÉCRIVAIT UNE PROP QUE LA PAGE NE PASSE PAS. Il
          annonçait `audience="student"`; le code appelle `<PublicHeader />` nu,
          donc le défaut `"coach"` — et la page rend bien le bouton d'essai coach.
          Le défaut est le bon choix, et `audience` NE VEUT PAS DIRE « page de
          coach »: il veut dire « page de vente », donc les deux mondes, les six
          portes et le geste du monde courant. Les trois pages foyer se sont déjà
          posées en `audience="student"` pour éviter ce bouton, et y ont perdu
          toute la navigation du site (`PublicHeader.tsx:129-147`). */}
      <PublicHeader />

      <main>
        {/* L'ORDRE EST L'ARGUMENT, ET IL A CHANGÉ LE 2026-09-01.
            1. la charge mentale — ce dont on veut être débarrassé;
            2. composé pour vous — la raison de ne pas prendre le gratuit;
            3. l'objectif et son chiffre — le pilotage, une fois qu'on a compris
               ce qu'on pilote;
            4. le plan qui encaisse la vraie vie — la garantie;
            5. le prix.
            Avant, l'objectif ouvrait et la charge mentale venait après: on
            vendait le réglage avant l'appareil. */}
        <Mental />
        <Composed />
        <Goal />
        <Moves />
        <Start />
      </main>

      <PublicFooter />

      {/* LE GESTE, À PORTÉE SUR TÉLÉPHONE — voir `ui/StickyCta.tsx`.
          ⚠️ APRÈS `PublicFooter`, ET C'EST MESURÉ. Posé avant, sa réserve de
          hauteur s'insérait ENTRE le contenu et le pied de page: le pied
          descendait de 80 px et la barre, elle, continuait de recouvrir ses
          deux dernières lignes en bas de course — « Contact » et les mentions
          légales. La réserve ne protège que ce qui la SUIT. */}
      <StickyCta label={t("mealprep.cta")} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Les pièces de mise en page — la grammaire de la fiche
// ---------------------------------------------------------------------------

/** L'enveloppe d'une section. Padding vertical en `pt`/`pb` et JAMAIS en
 *  raccourci: `padding: 84px 0 76px` remet le padding HORIZONTAL à zéro, et le
 *  titre sort des deux côtés de l'écran à 320 px (CHARTE §7). */
function Band({ tone = "", children }: { tone?: string; children: React.ReactNode }) {
  return (
    <section className={tone}>
      <div className="mx-auto max-w-[1200px] px-5 pb-[40px] pt-[44px] sm:px-8 sm:pb-[76px] sm:pt-[84px]">{children}</div>
    </section>
  );
}

/** LA PLANCHE: une figure, puis sa légende sous un filet. Le lecteur qui ne lit
 *  que les titres et les figures doit comprendre l'offre entière, donc la figure
 *  vient AVANT le texte. `fig-scroll` lui donne une largeur plancher de 380 px et
 *  laisse le conteneur défiler dessous: à 320 px, un texte de figure ferait 5 px.
 *
 *  ⚠️ Le nœud racine est l'enfant de grille en bande 2, et c'est lui qui aurait
 *  fait défiler la PAGE: `tokens.css` pose `min-width: 0` sur toute enveloppe
 *  qui a un `.fig-scroll` en enfant DIRECT — ne glisse pas un `<div>` entre les
 *  deux. */
function Plate({ figure, children }: { figure: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-fiche border border-line bg-paper">
      <div className="fig-scroll p-5 sm:p-8">{figure}</div>
      {children && <div className="border-t border-line p-5 sm:p-8">{children}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// LA DÉMONSTRATION — six objectifs, six façons de servir le même plat.
//
// ⚠️ C'EST L'ARGUMENT LE PLUS DUR DE LA PAGE, ET IL NE S'ÉCRIT PAS À LA MAIN.
// Les six consignes sont `SERVING_DIRECTION`
// (`supabase/functions/_shared/keel/household_portions.ts`), rendues MOT POUR
// MOT par les clés `mealprep.dir.*`; `servingDirections.int.test.ts` les
// épingle sur le module et rougit à la première dérive. Le module raconte
// lui-même pourquoi cette ceinture existe: `health` a rendu la chaîne de
// `maintenance` pendant des semaines — un champ qui promet un effet et n'en a
// aucun — sans que rien n'échoue, parce que personne ne relisait la source.
//
// ── LES TROIS AXES SE LISENT, ILS NE SE RECOPIENT PAS ──────────────────────
// Une table `Record<objectif, {protein: …}>` écrite ici serait la SECONDE
// DÉFINITION que le module refuse explicitement (son § D6): elle raconterait ce
// que les chaînes disaient le jour où on l'a tapée. Le lecteur ci-dessous
// applique la MÊME grammaire — un qualificatif gouverne les noms d'axes qui le
// SUIVENT, jusqu'au prochain qualificatif — sur le MÊME vocabulaire fermé de
// dix mots. Changer une direction dans le module change mécaniquement ce que
// cette fiche affiche.
//
// ── POURQUOI LE LECTEUR LIT L'ANGLAIS ET PAS CE QUI EST AFFICHÉ ────────────
// La grammaire du module EST anglaise (dix mots, `QUALIFIERS` + `AXIS_WORDS`).
// Un second lexique français ici serait, encore, une seconde définition — et
// une qui dériverait à la première retouche de traduction. Donc: on LIT
// `en["mealprep.dir.*"]`, la chaîne que le moteur lit lui-même, et on AFFICHE
// `t("mealprep.dir.*")`, la langue du visiteur. Le français est fidèle à
// l'anglais; il n'a pas à être analysable.
//
// ── CE QUE CETTE DÉMONSTRATION N'EST PAS ──────────────────────────────────
// Ni une capture d'écran (S10, §8 n°12): pas de barre d'app, pas de cadre
// d'appareil, aucune de ces chaînes n'est un écran du produit. Ni des grammes
// (FF-043 §11 n°1): le produit en calcule, ils n'atteignent aucun écran. C'est
// une FICHE — la consigne qui gouverne la part.
// ---------------------------------------------------------------------------

/** Les trois composants qu'une consigne sait nommer (`SERVING_AXES`). */
const AXES = ["protein", "starch", "vegetables"] as const;
type Axis = (typeof AXES)[number];

/** L'échelle, du moins au plus (`SERVING_DEMANDS`). L'ORDRE EST LE SENS. */
const LADDER = ["smaller", "moderate", "balanced", "full", "larger"] as const;
type Demand = (typeof LADDER)[number];

// Le vocabulaire fermé du module, à l'identique. `same vegetables` = la part de
// tout le monde, donc l'équilibre.
const QUALIFIERS: Record<string, Demand> = {
  generous: "larger",
  larger: "larger",
  full: "full",
  moderate: "moderate",
  balanced: "balanced",
  same: "balanced",
  smaller: "smaller",
};
const AXIS_WORDS: Record<string, Axis> = {
  protein: "protein",
  starch: "starch",
  vegetable: "vegetables",
  vegetables: "vegetables",
};

/**
 * CE QU'UNE CONSIGNE DEMANDE, AXE PAR AXE. Lecture, jamais recopie.
 *
 * `null` = l'axe n'est pas nommé, donc la consigne n'en demande RIEN. Un axe
 * nommé SANS qualificatif devant lui rend `null` aussi: le module appelle ça
 * `unreadable` et le traite comme un conflit; ici il n'y a pas de casserole à
 * arbitrer, alors les deux se rendent d'un même mot — « rien de demandé ».
 * Jamais une valeur devinée.
 */
function readServingDemands(direction: string): Record<Axis, Demand | null> {
  const out: Record<Axis, Demand | null> = { protein: null, starch: null, vegetables: null };
  let current: Demand | null = null;
  for (const word of direction.toLowerCase().split(/[^a-z]+/).filter(Boolean)) {
    const qualifier = QUALIFIERS[word];
    if (qualifier) {
      current = qualifier;
      continue;
    }
    // `share of every component` — le raccourci qui gouverne les trois axes.
    if (word === "component") {
      for (const axis of AXES) out[axis] = current;
      continue;
    }
    const axis = AXIS_WORDS[word];
    if (axis) out[axis] = current;
  }
  return out;
}

// Les clés sont écrites EN TOUTES LETTRES, jamais construites par gabarit: une
// clé bâtie en `${}` compile et ne prouve plus rien, et le grep « quelles clés
// cette page consomme » ne la trouve pas.
// ⚠️ TROIS, ET PLUS SIX, DEPUIS LE 2026-09-01. `MEMBER_GOALS = GOAL_TOKENS`
// (`household_portions.ts:106`) ne porte plus que `fat_loss`, `maintenance` et
// `muscle_gain`: les quatre nuances ont été retirées le 2026-08-18 et repliées
// (`RETIRED_GOAL_TOKENS`). La page en proposait encore six — donc trois choix
// que le moteur ne sait plus produire, avec une consigne de service inventée
// pour chacun. Le test de parité ne l'a pas vu: il n'itère que sur les clés
// de `SERVING_DIRECTION`, qui en a trois.
const GOALS = [
  { id: "fat_loss", name: "mealprep.goal.fat_loss", direction: "mealprep.dir.fat_loss" },
  { id: "muscle_gain", name: "mealprep.goal.muscle_gain", direction: "mealprep.dir.muscle_gain" },
  { id: "maintenance", name: "mealprep.goal.maintenance", direction: "mealprep.dir.maintenance" },
] as const satisfies ReadonlyArray<{ id: string; name: MessageKey; direction: MessageKey }>;

/**
 * LES QUATRE CRANS D'ACTIVITÉ, dans l'ordre du moteur.
 *
 * ⚠️ ON ITÈRE `ACTIVITY_LEVELS`, on ne recopie pas la liste: un cinquième cran
 * ajouté au moteur doit faire échouer la compilation ici, pas passer inaperçu.
 * Le `Record` typé sur `ActivityLevel` est ce qui le garantit.
 */
const ACTIVITY_LABEL: Record<ActivityLevel, MessageKey> = {
  sedentary: "mealprep.activity.sedentary",
  on_feet: "mealprep.activity.on_feet",
  trains_some: "mealprep.activity.trains_some",
  trains_hard: "mealprep.activity.trains_hard",
};

/** Le poids de départ de la démonstration. Un nombre rond, jamais une mesure. */
/* ⚠️ LES BORNES ET `demoRange` SONT EXPORTÉES POUR ÊTRE TESTÉES, pas pour être
   réutilisées ailleurs. `mealPrepEnergyDemo.int.test.ts` les compare à
   `maintenanceRange` du moteur: sans l'export, le test devrait recopier
   l'arithmétique, c'est-à-dire vérifier une copie contre une autre copie. */
const DEMO_WEIGHT_KG = 72;
export const DEMO_WEIGHT_MIN = 45;
export const DEMO_WEIGHT_MAX = 130;

/**
 * LA FOURCHETTE DU JOUR — CALCULÉE PAR LE MOTEUR, PAS PAR CETTE PAGE.
 *
 * ⚠️ CETTE FONCTION NE FAIT AUCUNE ARITHMÉTIQUE D'ÉNERGIE. Elle appelle
 * `maintenanceRange` puis `directedRange`, tous deux purs et importés tels
 * quels. Le décalage, son arrondi à 50, le refus quand la borne basse passerait
 * sous le plancher: tout ça est le code du moteur, exécuté ici. Une seconde
 * implémentation dans une page de vente, c'est une divergence programmée — ce
 * dépôt l'a déjà payée sur les consignes de service.
 *
 * ── LES TROIS ENTRÉES, ET D'OÙ ELLES VIENNENT ─────────────────────────────
 * Le poids et le cran d'activité sont réglés par le lecteur. Le troisième est
 * l'ÉCART QUOTIDIEN, et c'est le seul endroit où la démonstration doit poser
 * une hypothèse — parce que dans le produit il vient du RYTHME que la personne
 * choisit, et qu'une page de vente n'a pas de rythme à demander.
 *
 * ⚠️ L'HYPOTHÈSE EST NOMMÉE, ET ELLE EST CELLE DU MOTEUR: on montre l'écart le
 * PLUS GRAND que la composition accepte d'exécuter, c'est-à-dire le plafond de
 * `executedPaceFor` — `MAX_DAILY_DEFICIT_KCAL` (500 kcal/j, non débrayable) sur
 * une perte, `MAX_SURPLUS_FRACTION` (+10 %, dérivé d'`ENERGY_BANDS.muscle_gain`)
 * sur une prise. Ce ne sont pas des nombres inventés pour la vitrine: ce sont
 * les bornes qui mordent vraiment. La copie le dit — « au rythme le plus rapide
 * que Sophia accepte », et on peut toujours aller plus doucement.
 *
 * ⛔ ON N'APPELLE PAS `executedPaceFor` LUI-MÊME, et c'est un arbitrage. Il a
 * besoin d'`estimatedMaintenanceFor`, c'est-à-dire du métabolisme de base
 * calculé sur le sexe, l'âge et la taille — les trois entrées que cette page
 * n'a pas et ne demandera pas. On applique donc ses PLAFONDS au milieu de la
 * fourchette affichée, qui estime la même chose à partir de ce que la page sait
 * vraiment. L'écart entre les deux estimations est plus petit que la largeur de
 * la fourchette, ce qui est précisément pourquoi elle est large.
 */
export function demoTarget(
  weightKg: number,
  activity: ActivityLevel | null,
  goalId: GoalToken,
): EnergyTarget {
  const maintenance = maintenanceRange({
    weightKg,
    weightWeekStart: null,
    activityLevel: activity,
  });
  const direction = scaleDirectionOf(goalId);
  // `null` = le plancher le plus prudent des trois (`other`, 1 350 kcal). La
  // page ne demande pas le sexe, et deviner celui d'un visiteur pour desserrer
  // un plancher de sécurité serait le geste inverse de ce que ce plancher est.
  const energyFloorKcal = energyFloorFor(null);

  let dailyDeltaKcal = 0;
  if (maintenance.range !== null && direction !== null) {
    const mid = (maintenance.range.low + maintenance.range.high) / 2;
    dailyDeltaKcal = direction === "up"
      ? mid * MAX_SURPLUS_FRACTION
      // Sur une perte, deux plafonds, et c'est le plus protecteur qui gagne —
      // même règle que `executedPaceFor`.
      : Math.max(0, Math.min(MAX_DAILY_DEFICIT_KCAL, mid - energyFloorKcal));
  }

  return directedRange({
    maintenance,
    direction,
    dailyDeltaKcal,
    energyFloorKcal,
    cancelled: null,
  });
}

const AXIS_LABEL: Record<Axis, MessageKey> = {
  protein: "mealprep.axis.protein",
  starch: "mealprep.axis.starch",
  vegetables: "mealprep.axis.vegetables",
};

const DEMAND_LABEL: Record<Demand | "none", MessageKey> = {
  smaller: "mealprep.demand.smaller",
  moderate: "mealprep.demand.moderate",
  balanced: "mealprep.demand.balanced",
  full: "mealprep.demand.full",
  larger: "mealprep.demand.larger",
  none: "mealprep.demand.none",
};

/**
 * LA RÈGLE — cinq crans, un point posé dessus.
 *
 * Ce n'est PAS une barre remplie: une barre se lit comme un score, et cette
 * page passe la moitié de sa réserve à dire qu'il n'y en a pas. Un point sur
 * une graduation se lit comme un RÉGLAGE, ce que la consigne est. Monochrome
 * pour la même raison — la pièce chaude de cette fiche est l'objectif choisi,
 * et il n'y en a qu'un.
 *
 * `aria-hidden`: le mot à côté porte déjà l'information, en toutes lettres.
 */
function Ladder({ demand }: { demand: Demand | null }) {
  const notches = [6, 24, 42, 60, 78];
  const index = demand ? LADDER.indexOf(demand) : -1;
  return (
    <svg viewBox="0 0 84 12" aria-hidden="true" focusable="false" className="h-3 w-[84px] shrink-0">
      <g fill="none" stroke="var(--ill-ink-soft, #6A5A64)" strokeWidth="1" strokeLinecap="round">
        <path d="M 6 6 L 78 6" />
        {notches.map((x) => <path key={x} d={`M ${x} 3 L ${x} 9`} />)}
      </g>
      {index >= 0 && <circle cx={notches[index]} cy="6" r="4" fill="var(--ill-ink, #23191F)" />}
    </svg>
  );
}

function ServingDemo() {
  // L'ÉTAT INITIAL EST DÉJÀ JUSTE ET DÉJÀ LISIBLE: sans un geste du lecteur, la
  // fiche montre la consigne de `fat_loss` et ses trois axes, lus. Aucun écran
  // vide, aucun « choisissez pour voir ».
  const [goalId, setGoalId] = React.useState<string>(GOALS[0].id);
  const goal = GOALS.find((g) => g.id === goalId) ?? GOALS[0];
  const demands = readServingDemands(en[goal.direction]);

  // LE POIDS ET L'ACTIVITÉ règlent la fourchette d'entretien; l'OBJECTIF la
  // déplace. Les trois entrent dans `demoTarget`, qui appelle le moteur.
  const [weightKg, setWeightKg] = React.useState<number>(DEMO_WEIGHT_KG);
  const [activity, setActivity] = React.useState<ActivityLevel>("on_feet");
  const target = demoTarget(weightKg, activity, goal.id);
  const range = target.range;

  /**
   * ⚠️ LA PORTE « J'AI 18 ANS OU PLUS » A ÉTÉ RETIRÉE LE 2026-09-01, SUR
   * DÉCISION DU PROPRIÉTAIRE, ET IL FAUT LIRE CE QU'ELLE FAISAIT AVANT DE LA
   * REMETTRE OU DE LA REGRETTER.
   *
   * Elle ne protégeait rien: c'était du code client, personne ne vérifiait
   * l'âge de qui cliquait. Son travail était de faire dire à la PAGE la même
   * chose qu'au PRODUIT — `_shared/keel/energy_gate.ts` ferme le chiffre par sa
   * porte ② pour un mineur et pour tout âge inconnu.
   *
   * Ce qui reste, et qui porte maintenant seul cette honnêteté: la RÉSERVE
   * (`mealprep.energy.reserve`), qui dit que dans l'application le chiffre est
   * éteint par défaut et reste fermé tant que la date de naissance est
   * inconnue. ⛔ NE PAS LA RETIRER pour alléger: sans la porte, elle est le
   * seul endroit où la page ne promet pas un écran que le produit refusera.
   *
   * ⚠️ `docs/keel/LEGAL.md` §6.4 bis porte la trace de cette décision et son
   * point ouvert (CAP Code §13, Royaume-Uni). Le retrait de la porte ne le
   * ferme pas — il l'agrandit.
   */

  return (
    <div className="mt-10 overflow-hidden rounded-fiche border border-line-strong bg-paper">
      {/* De VRAIS boutons radio: le clavier (flèches), l'état coché et son
          annonce sont alors ceux du navigateur, pas une imitation. La couleur
          n'est jamais seule à dire lequel est courant — la fiche en dessous le
          nomme, et le lecteur d'écran l'entend du groupe lui-même. */}
      <fieldset className="p-5 sm:p-8">
        {/* ⚠️ `float-left w-full` N'EST PAS DE LA MISE EN PAGE, C'EST UN CORRECTIF.
            Un `<legend>` est positionne NATIVEMENT a cheval sur la bordure du
            `<fieldset>`: le `p-5`/`sm:p-8` du cadre ne s'y applique pas, et
            l'equerre se retrouvait collee au filet du haut (mesure). Le flotter
            en pleine largeur le remet dans le flux normal — et garde la
            semantique fieldset/legend, qui est ce qui fait annoncer le groupe
            par un lecteur d'ecran. */}
        <legend className="eq float-left w-full text-label font-semibold uppercase text-ink-soft">{t("mealprep.demo.legend")}</legend>
        <div className="mt-4 flex flex-wrap gap-2">
          {GOALS.map((g) => (
            <label key={g.id} className="cursor-pointer">
              <input
                type="radio"
                name="mealprep-goal"
                className="peer sr-only"
                checked={g.id === goalId}
                onChange={() => setGoalId(g.id)}
              />
              {/* `rounded-full` est le rayon des BOUTONS dans ce kit, et un
                  choix est un bouton. La figue ne descend jamais dans une
                  pastille d'état — ici elle est sur un contrôle, pas sur un
                  fait. Non coché = le geste secondaire (`line-strong`, 3,84:1,
                  le seuil WCAG 1.4.11 d'un composant); coché = l'aplati de
                  marque (`paper` sur `fig-700`, 9,98:1). */}
              <span className="block rounded-full border border-line-strong px-3 py-1.5 text-sm hover:bg-fig-50 peer-checked:border-fig-700 peer-checked:bg-fig-700 peer-checked:text-paper peer-focus-visible:outline-2 peer-focus-visible:outline-offset-3 peer-focus-visible:outline-fig-600 motion-safe:transition-colors">
                {t(g.name)}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {/* LE POIDS ET LES JOURNÉES — les deux SEULES entrées de la fourchette.
          ⚠️ Elles sont ici et pas dans un formulaire caché parce que le panneau
          « Hypothèses » plus bas promet de dire d'où vient le chiffre: un calcul
          dont on ne voit pas les entrées n'est pas expliqué, il est affirmé. */}
      <fieldset className="border-t border-line p-5 sm:p-8">
        <legend className="eq float-left w-full text-label font-semibold uppercase text-ink-soft">{t("mealprep.demo.body_legend")}</legend>
        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-3">
          {/* ⚠️ `w-full sm:w-auto sm:flex-1` ET PAS `flex-1` SEUL: un enfant de
              flex a `min-width: auto`, donc un curseur `flex-1` refuse de
              descendre sous sa largeur intrinsèque et fait défiler la page à
              320 px. Cicatrice mesurée de ce dépôt. */}
          <input
            type="range"
            aria-label={t("mealprep.demo.body_legend")}
            min={DEMO_WEIGHT_MIN}
            max={DEMO_WEIGHT_MAX}
            step={1}
            value={weightKg}
            onChange={(e) => setWeightKg(Number(e.target.value))}
            className="w-full min-w-0 accent-fig-700 sm:w-auto sm:flex-1"
          />
          <output className="whitespace-nowrap text-sm font-medium text-ink">
            {t("mealprep.demo.weight_value", { kg: String(weightKg) })}
          </output>
        </div>
      </fieldset>

      <fieldset className="border-t border-line p-5 sm:p-8">
        <legend className="eq float-left w-full text-label font-semibold uppercase text-ink-soft">{t("mealprep.demo.activity_legend")}</legend>
        {/* ⚠️ ON ITÈRE `ACTIVITY_LEVELS` DU MOTEUR, pas une liste locale: quatre
            crans ici et cinq là-bas est le genre d'écart que personne ne voit. */}
        <div className="mt-4 flex flex-wrap gap-2">
          {ACTIVITY_LEVELS.map((level) => (
            <label key={level} className="cursor-pointer">
              <input
                type="radio"
                name="mealprep-activity"
                className="peer sr-only"
                checked={level === activity}
                onChange={() => setActivity(level)}
              />
              <span className="block rounded-full border border-line-strong px-3 py-1.5 text-sm hover:bg-fig-50 peer-checked:border-fig-700 peer-checked:bg-fig-700 peer-checked:text-paper peer-focus-visible:outline-2 peer-focus-visible:outline-offset-3 peer-focus-visible:outline-fig-600 motion-safe:transition-colors">
                {t(ACTIVITY_LABEL[level])}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {/* fact: C4 — household_portions.ts:125 `SERVING_DIRECTION` (six consignes
          distinctes) · :264 `readServingDemands` (la grammaire appliquée ici) */}
      {/* `role="status"` EN PLUS de `aria-live`: la région n'est pas seulement
          « vivante », elle EST le résultat du geste. Les trois démonstrations du
          site s'annoncent de la même façon — voir `CoachesPage.tsx:384`. */}
      <div className="border-t border-line p-5 sm:p-8" role="status" aria-live="polite">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <p className="text-label font-semibold uppercase text-ink-soft">{t("mealprep.demo.direction_label")}</p>
          <p className="text-sm font-medium text-ink">{t(goal.name)}</p>
        </div>
        <p className="mt-3 max-w-[46ch] text-lede text-ink">{t(goal.direction)}</p>
        <dl className="mt-7 grid gap-4 sm:grid-cols-3 sm:gap-8">
          {AXES.map((axis) => (
            <div key={axis} className="border-t border-line pt-3">
              <dt className="text-label font-semibold uppercase text-ink-soft">{t(AXIS_LABEL[axis])}</dt>
              <dd className="mt-2 flex items-center gap-3">
                <Ladder demand={demands[axis]} />
                <span className="min-w-0 text-sm">{t(DEMAND_LABEL[demands[axis] ?? "none"])}</span>
              </dd>
            </div>
          ))}
        </dl>
      </div>

      {/* ══ LA FOURCHETTE DU JOUR ═══════════════════════════════════════════
          ⚠️ DERRIÈRE UN GESTE, ET LE POURQUOI EST DANS `adultConfirmed`.
          Avant le geste, la démonstration tourne entièrement — la consigne de
          service, les trois axes, le poids, les journées. C'est le NOMBRE, et
          lui seul, qui attend: c'est exactement le périmètre de la porte ② du
          moteur, qui « ferme le CHIFFRE et ne ferme RIEN d'autre — le plan
          sort, la conversation continue ». */}
      <div className="border-t border-line p-5 sm:p-8">
        <p className="text-label font-semibold uppercase text-ink-soft">{t("mealprep.energy.label")}</p>

        <div role="status" aria-live="polite">
          {/* ⛔ UNE FOURCHETTE, JAMAIS UN POINT. Ne pas rendre la moyenne, ne
              pas ajouter de barre, ne pas colorer: « aucun reste, aucun
              verdict » sont deux des trois interdits du module d'énergie, et ce
              sont des arguments de vente. */}
          {/* ⚠️ LE NOMBRE ET SA BASE SONT LE MÊME MESSAGE, et la clé est nommée
              par la base — la règle d'`energyBasis.int.test.ts`. Conséquence
              assumée sur la typographie: la ligne n'est plus un `text-4xl` nu,
              parce qu'un chiffre géant suivi d'une phrase minuscule est
              exactement la hiérarchie qui invite à retirer la phrase. */}
          <p className="mt-3 max-w-[24ch] font-display text-title leading-[1.15] text-ink">
            {range === null
              ? t("mealprep.energy.no_range")
              : target.direction === null
              ? t("mealprep.energy.range_weight", { low: formatNumber(range.low), high: formatNumber(range.high) })
              : t("mealprep.energy.range_directed", { low: formatNumber(range.low), high: formatNumber(range.high) })}
          </p>

          {/* CE QUE L'OBJECTIF A FAIT À LA FOURCHETTE — et quand il n'a rien
              fait, POURQUOI. `directionGap` est nommé par le moteur, jamais
              déduit ici: `below_energy_floor` veut dire que le déficit aurait
              poussé la borne basse sous le plancher de ce corps, et le moteur
              REFUSE plutôt que de raboter. C'est un argument, pas une panne. */}
          <p className="mt-3 max-w-[52ch] text-[15px] leading-6 text-ink-soft">
            {/* ⚠️ « L'OBJECTIF A ÉTÉ DEMANDÉ MAIS N'A RIEN DÉPLACÉ » SE LIT SUR
                DEUX MOTIFS DIFFÉRENTS DU MOTEUR, et il faut les traiter
                ENSEMBLE — mesuré par le test à 45 kg. Selon l'ordre des
                garde-fous de `directedRange`, un corps déjà proche de son
                plancher rend soit `below_energy_floor` (le décalage aurait
                percé le plancher), soit `no_pace` (l'écart exécutable est déjà
                tombé à zéro AVANT d'être décalé). Les deux disent la même chose
                au lecteur, et `keep()` remet `direction` à `null` dans les deux
                cas: on compare donc la direction DEMANDÉE à celle qui est
                sortie. Ne pas tester `directionGap` seul — ça laisse le cas
                `no_pace` tomber dans la phrase neutre, qui ne dit rien à
                quelqu'un qui vient de choisir « perdre du gras ». */}
            {scaleDirectionOf(goal.id) !== null && target.direction === null
              ? t("mealprep.energy.floor_held")
              : target.direction === "down"
              ? t("mealprep.energy.moved_down")
              : target.direction === "up"
              ? t("mealprep.energy.moved_up")
              : t("mealprep.energy.basis")}
          </p>

          {/* ⚠️ LE PANNEAU « D'OÙ VIENT CE CHIFFRE » ET LA RÉSERVE ONT ÉTÉ
              RETIRÉS LE 2026-09-01, sur décision du propriétaire, en même temps
              que la porte 18+. Six clés sont parties avec eux.

              ⛔ CE QUI A ÉTÉ SAUVÉ, ET POURQUOI IL NE DOIT PAS PARTIR AUSSI:
              l'HYPOTHÈSE DE RYTHME est repliée dans la ligne au-dessus
              (`moved_down` / `moved_up`). Un chiffre montré sans son hypothèse
              est un chiffre faux — celui-ci est l'écart le PLUS RAPIDE que la
              composition accepte d'exécuter, pas l'écart moyen, et le lecteur
              doit pouvoir le savoir sans ouvrir quoi que ce soit.

              ⚠️ CE QUI EST PERDU, ÉCRIT ICI POUR QUE PERSONNE NE LE REDÉCOUVRE:
              la page ne dit plus que le produit garde ce chiffre ÉTEINT PAR
              DÉFAUT et FERMÉ tant que la date de naissance est inconnue
              (`energy_gate.ts`, porte ②, 91 % de la base). Quelqu'un qui
              s'inscrit après avoir vu cette fourchette peut donc ne jamais la
              retrouver dans l'application. C'est un écart page/produit assumé,
              pas un oubli. */}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Les quatre bandes
// ---------------------------------------------------------------------------

/**
 * BANDE 1 — « Mon objectif n'a aucune traduction dans mon assiette. »
 *
 * C'est le héros, et c'est la section qui manquait entièrement à cette page.
 * Elle porte le seul `h1`, la démonstration, et la RÉSERVE sombre — dans cet
 * ordre, parce que la peur du compteur arrive juste après le choix d'objectif.
 */
/**
 * BANDE 2 — « Est-ce que je mange bien ? »
 *
 * ⚠️ BANDE NEUVE (2026-09-01). C'est la deuxième raison d'achat du segment, et
 * la page ne la disait NULLE PART: elle vendait l'organisation (bande 1) et le
 * pilotage (bande 3), en sautant la question qui est entre les deux.
 *
 * ⛔ ELLE PROMET LA COMPOSITION, JAMAIS LE RÉSULTAT. Pas de « tous les
 * apports », pas de « à coup sûr », aucun taux de couverture, aucun bilan. Deux
 * raisons qui se cumulent, et il faut les deux: `LEGAL.md` §6.1 interdit la
 * promesse de résultat, et `coverage` compte les aliments CONNUS et pas les
 * PESÉS (69 % contre 96 % mesurés) — un taux affiché serait faux en plus d'être
 * interdit.
 *
 * ⛔ PAS DE FIGURE. Ce qu'il y aurait à dessiner — une part plus grande pour
 * l'un que pour l'autre — est très exactement « une proportion que le produit
 * ne calcule pas pour l'écran » (charte §5). La démonstration de la bande 3 le
 * montre déjà, avec les vraies entrées.
 */
function Composed() {
  return (
    <Band tone="bg-paper-2">
      <Kicker>{t("mealprep.composed.kicker")}</Kicker>
      <SectionTitle>{t("mealprep.composed.title")}</SectionTitle>
      <div className="mt-8 grid gap-6 sm:mt-10 lg:grid-cols-2 lg:gap-16">
        {/* fact: la part est composée sur le corps ET l'activité de la personne
            qui la mange — `household_portions.ts` (l'enveloppe par bouche) et
            `ACTIVITY_KCAL_PER_KG` (quatre crans, 26 à 36 kcal/kg). */}
        <div className="min-w-0">
          {/* L'ÉQUILIBRE D'ABORD — c'est l'argument principal de la bande, et
              il porte sur la PRÉSENCE des trois composantes.
              fact: `SERVING_DIRECTION` / `readServingDemands`
              (`household_portions.ts`): la direction règle la PART de chaque
              composante, jamais son existence. */}
          <p className="max-w-[62ch] text-[15px] leading-7 text-ink-soft">{t("mealprep.composed.body")}</p>
          {/* Puis la TAILLE — l'autre chose que le moteur compose vraiment. */}
          <p className="mt-4 max-w-[62ch] text-[15px] leading-7 text-ink-soft">{t("mealprep.composed.body_size")}</p>
        </div>
        <div className="min-w-0">
          <p className="max-w-[62ch] text-[15px] leading-7 text-ink-soft">{t("mealprep.composed.body_2")}</p>
          {/* La réserve EST l'argument: aucun bilan rendu. Elle se pose sous le
              claim qu'elle borne, jamais en pied de bande. */}
          <p className="mt-5 max-w-[62ch] border-t border-line pt-5 text-[15px] leading-7 text-ink">
            {t("mealprep.composed.note")}
          </p>
        </div>
      </div>
    </Band>
  );
}

function Goal() {
  return (
    <Band>
      {/* fact: C13 — onboarding.ts:88 `FunnelBranch` (branche `solo`) */}
      <Kicker>{t("mealprep.plate.kicker")}</Kicker>
      {/* ⚠️ CE N'EST PLUS LE HÉROS DEPUIS LE 2026-09-01, ET C'EST TOUT LE LOT.
          L'objectif ouvrait la page; il est descendu en TROISIÈME position, sur
          l'ordre d'achat du segment: on achète d'abord la fin de la charge
          mentale (bande 1), puis la certitude que ce qu'on mange est composé
          pour soi (bande 2), et seulement ensuite le pilotage par l'objectif.
          Vendre le pilotage à quelqu'un qui n'a pas encore vu à quoi on le
          soulage, c'est vendre un réglage avant l'appareil.
          Conséquences: plus de `<h1>` ici (il vit dans `Mental`), et le CTA ne
          se répète plus dans cette bande — il est en haut et en bas de page. */}
      <SectionTitle>{t("mealprep.plate.title")}</SectionTitle>
      {/* fact: C4 — household_portions.ts (les directions de service) · C14:
          l'objectif est posé à l'entrée (onboarding.ts) */}
      <p className="mt-5 max-w-[62ch] text-lede text-ink-soft">{t("mealprep.plate.lede")}</p>

      <ServingDemo />

      {/* ══ L'ENCART SOMBRE — CE QUE L'OBJECTIF FAIT VRAIMENT ════════════════
          ⚠️ LE SEUL BLOC SOMBRE DE LA PAGE. La charte en autorise UN par page;
          celui-ci le consomme, et il n'y en aura pas d'autre.
          ⛔ AUCUN LIEN, AUCUN BOUTON À L'INTÉRIEUR: `fig-600` tombe à 2,3:1 sur
          `on-dark`. Le geste est en haut et en bas de page.

          Il porte les deux faits que la démonstration ne peut pas montrer, et
          il les porte au mot près:

          1. LE RENVERSEMENT DU 2026-08-18 (`CALORIE_REVERSAL` §7, exécuté par
             `household_portions.ts`): « la cible contraint les GRAMMAGES, pas
             le choix des plats ». C'est la moitié qui rassure — on ne se
             retrouve pas avec une liste d'aliments de régime.
          2. LE REPAS NON CUISINÉ. Il s'ajoute en photo ou en le décrivant, et
             il entre dans le JOURNAL (`protocol_events`).

          ⛔ ET CE QU'IL NE DIT PAS, QUI EST LA MOITIÉ QUI COMPTE: que la photo
          donne des calories. Interdit sans négociation par `LEGAL.md` §6.4 —
          biais mesuré de −26,6 % sur une photo nue, et du côté flatteur — et
          structurellement impossible: `api/mealPhoto.ts` ne déclare AUCUN champ
          numérique, il rend une bande de portion. */}
      <section className="on-dark mt-12 rounded-fiche bg-fig-950 p-6 sm:mt-14 sm:p-10">
        <Kicker onDark>{t("mealprep.drive.kicker")}</Kicker>
        <h3 className="mt-4 max-w-[24ch] font-display text-sub leading-[1.2] text-paper">
          {t("mealprep.drive.title")}
        </h3>
        <div className="mt-6 grid gap-6 lg:grid-cols-2 lg:gap-14">
          {/* fact: `CALORIE_REVERSAL` §7 — la cible contraint les grammages. */}
          <p className="max-w-[52ch] text-[15px] leading-7 text-fig-300">{t("mealprep.drive.grams")}</p>
          {/* fact: `protocol_events` — trois chemins d'entrée écrivent le même
              journal. ⛔ Aucune calorie ne sort d'une photo. */}
          <p className="max-w-[52ch] text-[15px] leading-7 text-fig-300">{t("mealprep.drive.logged")}</p>
        </div>
      </section>

      {/* ⚠️ LE BLOC « CE QUE TU NE TROUVERAS PAS ICI » A ÉTÉ RETIRÉ LE
          2026-09-01, et il ne se remet pas. Il vendait « les chiffres sont
          éteints par défaut » comme une VALEUR — c'est-à-dire la position que
          `docs/keel/CALORIE_REVERSAL.md` a RENVERSÉE le 2026-08-06: le produit
          ne refuse plus le chiffre, il refuse le chiffre NU, celui qui voyage
          sans dire s'il est un calcul (2,3 % d'erreur) ou une estimation photo
          (−26,6 % de biais). Le code applique encore l'interdiction totale, et
          c'est volontaire — mais une page de vente ne doit pas faire un
          argument d'un état transitoire qu'on a décidé de quitter.
          L'en-tête du hall porte déjà l'interdit: jamais « pas de calories ».
          ⚠️ La page n'a donc plus de bloc sombre. La charte en autorise UN par
          page, elle n'en exige aucun. */}
    </Band>
  );
}

/**
 * BANDE 1, LE HÉROS — « Décider coûte plus cher que cuisiner. »
 *
 * ⚠️ CETTE BANDE ÉTAIT LA DEUXIÈME JUSQU'AU 2026-09-01. Elle monte parce que
 * c'est la douleur n°1 du segment: la charge mentale de l'arbitrage quotidien,
 * courses comprises. Le propriétaire a posé l'ordre d'achat réel, et il ne
 * commence pas par l'objectif — il commence par ce dont on veut être débarrassé.
 *
 * Elle contenait déjà les deux moitiés de la promesse (la cuisson ET les
 * courses) et ses deux figures sont bonnes: rien n'a été redessiné, la bande a
 * gagné un `<h1>`, un chapô, le geste et l'offre.
 */
function Mental() {
  return (
    <Band>
      <Kicker>{t("mealprep.week.kicker")}</Kicker>
      <div className="mt-3 grid gap-8 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-16">
        {/* Le seul h1 de la page. Young Serif n'a qu'une graisse: la hiérarchie
            se fait à la taille et à l'espace, jamais au gras.
            ⚠️ CE TITRE EST RECOPIÉ MOT POUR MOT SUR LA PORTE DU HALL
            (`home.door.solo.label`). Une porte qui promet un autre titre que
            celui de la page derrière ne s'ouvre pas deux fois. */}
        <h1 className="max-w-[15ch] text-balance font-display text-hero">{t("mealprep.week.title")}</h1>
        <div className="lg:border-l lg:border-line lg:pl-10">
          <p className="max-w-[62ch] text-lede text-ink-soft">{t("mealprep.mental.lede")}</p>
          {/* CTA unique de la page, répété une fois en clôture et jamais mis en
              concurrence avec une seconde offre.
              fact: §10 — `/start` est la seule porte d'inscription libre */}
          <p className="mt-6"><ButtonLink to="/start" variant="brand">{t("mealprep.cta")}</ButtonLink></p>
          <OfferLines audience="solo" className="mt-4" />
        </div>
      </div>
      <div className="mt-10 grid gap-6 sm:mt-12 lg:grid-cols-2 lg:gap-10">
        <Plate figure={<SessionFigure />}>
          {/* fact: C3 — meal_generation.ts:522 · CookingSessions.tsx:48 */}
          <p className="max-w-[62ch]">{t("mealprep.week.body")}</p>
        </Plate>
        <Plate figure={<WavesFigure />}>
          {/* fact: C5 — meal_generation.ts:730, grocery_waves.ts:211 (MAX_FRIDGE_DAYS = 3) */}
          <p className="max-w-[62ch]">{t("mealprep.week.waves")}</p>
        </Plate>
      </div>
    </Band>
  );
}

/** BANDE 4 — « Un imprévu, et toute la semaine tombe. » */
function Moves() {
  return (
    <Band tone="bg-paper-2">
      <Kicker>{t("mealprep.moves.kicker")}</Kicker>
      {/* fact: C7 — accident.ts:995-1004 `REALIGNMENT_ACTIONS` */}
      <SectionTitle>{t("mealprep.moves.title")}</SectionTitle>
      <div className="mt-8 sm:mt-10">
        <Plate
          figure={
            <AccidentsFigure
              idPrefix="mp-f3"
              label={t("mealprep.fig.moves.label")}
              title={t("mealprep.fig.moves.title")}
              desc={t("mealprep.fig.moves.desc")}
              mealLabel={t("mealprep.fig.moves.dish")}
              sessionLabel={t("mealprep.fig.moves.session")}
              shoppingLabel={t("mealprep.fig.moves.shopping")}
            />
          }
        >
          {/* DEUX COLONNES, ET LES DEUX TEXTES SONT ÉQUILIBRÉS EXPRÈS.
              `mealprep.moves.note` (« aucun plat de remplacement n'est choisi à
              votre place ») a été retirée le 2026-09-01, et la colonne qu'elle
              laissait vide a été reprise par la SECONDE MOITIÉ de l'argument:
              à gauche les accidents qui touchent un repas ou une cuisson, à
              droite celui qui menace la semaine entière.
              ⚠️ Les deux clés sont de longueur voisine, et doivent le rester —
              c'est ce qui fait tenir la grille.
              fact: C7 — `REALIGNMENT_ACTIONS` (accident.ts) + les boutons
              déterministes du chat. */}
          <div className="grid gap-6 sm:grid-cols-2 sm:gap-12">
            <p className="max-w-[62ch]">{t("mealprep.moves.body")}</p>
            <p className="max-w-[62ch]">{t("mealprep.moves.body_2")}</p>
          </div>
        </Plate>
      </div>
    </Band>
  );
}

/** BANDE 5 — le prix, et la seule porte. */
function Start() {
  // Les quatre clés restent LITTÉRALES: écrites en gabarit, un grep « quelles
  return (
    <Band>
      <Kicker>{t("mealprep.start.kicker")}</Kicker>
      {/* fact: C1 — 20260810260000_household_billable_profiles.sql:235-250 */}
      <SectionTitle>{t("mealprep.start.title")}</SectionTitle>
      <div className="mt-8 grid gap-8 sm:mt-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-16">
        {/* Une seule carte, pas de liste de fonctionnalités, pas de second
            palier: une carte faite pour être comparée invite le lecteur à
            chercher le plan qui lui manque (règle de `PriceCard`).

            ⚠️ L'ENVELOPPE `self-start` N'EST PAS DÉCORATIVE. `PriceCard` pose
            `h-full` sur sa `Card`, et un enfant de grille s'étire par défaut:
            à 1280 px la carte prenait toute la hauteur de la colonne voisine
            — 500 px de cadre pour trois lignes. L'enveloppe est le nouvel
            enfant de grille, elle se dimensionne au contenu, et `h-full` y
            vaut « la hauteur de ce que je contiens ». */}
        <div className="self-start">
          <PriceCard
            price={formatPrice(PRICES.household)}
            period={t("mealprep.start.period")}
            label={t("mealprep.start.price_label")}
          />
        </div>
        <div>
          {/* fact: PIVOT-FOYER §5 + C1 — le maître n'est jamais compté */}
          <p className="max-w-[62ch]">{t("mealprep.start.body")}</p>

          {/* ⚠️ LA FICHE « CE QU'ON TE DEMANDE » A ÉTÉ RETIRÉE LE 2026-09-01,
              AVEC SES CINQ CLÉS (`asks_label`, `ask_name`, `ask_birthdate`,
              `ask_goal`, `ask_allergies`). Elle annonçait QUATRE champs; le
              parcours réel en pose treize avant le premier plan en solo, vingt-
              deux à deux, trente-huit pour une famille de quatre — compté sur
              les questions `weight: "wrong"` de `api/onboarding.ts`, celles qui
              rendraient le plan FAUX si elles manquaient. Sous-annoncer
              l'effort ne réduit pas l'abandon: il le déplace au milieu du
              formulaire, là où le lecteur a déjà payé de son temps.
              La décision du propriétaire (2026-09-01) est de ne PAS chiffrer
              l'effort d'entrée sur les pages de vente — donc on ne le corrige
              pas, on ne le dit plus. La place revient à l'offre. */}
          <OfferLines audience="solo" className="mt-8" />

          {/* fact: §10 — `/start` interroge `keel_free_signup_available`: aucune
              entrée n'est promise comme immédiate, et le libellé ne chiffre rien */}
          <p className="mt-8"><ButtonLink to="/start" variant="brand">{t("mealprep.cta")}</ButtonLink></p>
          <p className="mt-4 max-w-[52ch] text-sm text-ink-soft">{t("mealprep.start.note")}</p>
        </div>
      </div>
    </Band>
  );
}

// ---------------------------------------------------------------------------
// Les figures
//
// Grille 480×240 pour les trois (F1) — 480 est ce qui rend les figures
// comparables d'une page à l'autre du site, on ne change pas la largeur.
// Deux épaisseurs et deux seulement: 2 = le contour d'une chose réelle,
// 1 = une annotation ou un détail interne (F2). Coordonnées entières (F5).
// Aucun dégradé, aucun filtre, aucune ombre, aucune opacité (F7). Aucune
// couleur d'état: ni émeraude, ni ambre, ni rouge, ni bleu (F10).
//
// Le `font-family` n'est PAS déclaré: `<text>` hérite la famille du document,
// donc Public Sans, et une famille écrite ici serait un quatrième endroit où
// la typographie de la marque peut diverger.
//
// ⚠️ `max-w-[560px]` EST UN PLAFOND, ET IL MANQUAIT: `tokens.css` donne un
// PLANCHER de 380 px, rien au-dessus. Sur une planche de 1200 px le SVG
// s'étirait à 1070 (mesuré) et le libellé de figure passait à 25 px — plus
// gros que le chapô. 560 px le tient à ~13 px, sa taille de dessin.
// ---------------------------------------------------------------------------

/** L'équerre et le libellé de la figure, même géométrie pour les trois.
 *  Elle n'encadre pas, elle OUVRE — et elle ne flotte jamais seule: il y a
 *  toujours un mot à sa droite. Une équerre sans libellé est un défaut. */

/**
 * FIGURE 1 — une session de cuisine, et les repas qu'elle couvre.
 *
 * La matière est vue DE DESSUS, strictement orthogonale (F3). Le peigne qui
 * relie la casserole aux contenants est à 0° et 90° — aucun oblique, donc
 * aucune occasion de dériver (F4).
 *
 * ⚠️ LES CONTENANTS SONT LE MÊME ÉLÉMENT, APPELÉ TROIS FOIS. C'est la garde de
 * F9: « c'est la même cuisson » est tenu par la structure du fichier et pas par
 * la vigilance du relecteur, et aucun des trois ne peut prendre une taille qui
 * affirmerait une mesure que le produit ne calcule pas. Leurs deux compartiments
 * sont égaux pour la même raison — inégaux, ils auraient dessiné un ratio.
 * Le NOMBRE trois n'est pas une quantité promise: c'est le pluriel de « repas ».
 */
function SessionFigure() {
  return (
    <svg viewBox="0 0 480 240" role="img" aria-labelledby="mp-f1-t mp-f1-d" className="mx-auto block w-full max-w-[560px]">
      <title id="mp-f1-t">{t("mealprep.fig.session.title")}</title>
      <desc id="mp-f1-d">{t("mealprep.fig.session.desc")}</desc>
      <defs>
        <g id="mp-box">
          <rect x="0" y="0" width="150" height="44" rx="12" fill="var(--ill-paper, #FBF8FA)" stroke="var(--ill-ink, #23191F)" strokeWidth="2" />
          <rect x="12" y="10" width="61" height="24" rx="4" fill="var(--ill-wash, #EFE0E9)" stroke="var(--ill-ink-soft, #6A5A64)" strokeWidth="1" />
          <rect x="77" y="10" width="61" height="24" rx="4" fill="var(--ill-wash, #EFE0E9)" stroke="var(--ill-ink-soft, #6A5A64)" strokeWidth="1" />
        </g>
      </defs>

      <FigureHead label={t("mealprep.fig.session.label")} />

      {/* LA CASSEROLE — la seule pièce chaude du dessin. Même géométrie que
          l'étalon: c'est la même casserole d'une page du site à l'autre. */}
      <g stroke="var(--ill-fig, #632C4C)" strokeWidth="2" strokeLinejoin="round">
        <rect x="26" y="135" width="32" height="18" rx="9" fill="var(--ill-paper, #FBF8FA)" />
        <rect x="150" y="135" width="32" height="18" rx="9" fill="var(--ill-paper, #FBF8FA)" />
        <circle cx="104" cy="144" r="54" fill="var(--ill-paper, #FBF8FA)" />
      </g>
      <circle cx="104" cy="144" r="42" fill="var(--ill-wash, #EFE0E9)" />
      <text x="104" y="222" textAnchor="middle" fontSize="12" fill="var(--ill-ink-soft, #6A5A64)">{t("mealprep.fig.session.pot")}</text>

      {/* LE PEIGNE — annotation, donc épaisseur 1. */}
      <g fill="none" stroke="var(--ill-ink-soft, #6A5A64)" strokeWidth="1" strokeLinecap="round">
        <path d="M 184 146 L 286 146" />
        <path d="M 252 86 L 252 206" />
        <path d="M 252 86 L 286 86" />
        <path d="M 252 206 L 286 206" />
      </g>

      <text x="286" y="52" fontSize="9" fontWeight="600" letterSpacing="1" fill="var(--ill-ink-soft, #6A5A64)">{t("mealprep.fig.session.covers")}</text>
      <use href="#mp-box" x="286" y="64" />
      <use href="#mp-box" x="286" y="124" />
      <use href="#mp-box" x="286" y="184" />
    </svg>
  );
}

/**
 * FIGURE 2 — les courses en vagues, le long des jours.
 *
 * Les deux paniers sont le même `<use>`: une vague est une vague, la seconde
 * n'est pas « plus petite ». Le premier empan couvre TROIS crans, et c'est la
 * seule longueur de cette page qui affirme une mesure — elle est au tableau
 * des faits (MAX_FRIDGE_DAYS = 3), donc elle a le droit d'être une géométrie.
 * Le second empan reste OUVERT à droite, exprès: fermé, il aurait affirmé que
 * la seconde vague couvre quatre jours, ce que rien ne calcule.
 */
function WavesFigure() {
  const days = [64, 126, 188, 250, 312, 374, 436];
  return (
    <svg viewBox="0 0 480 240" role="img" aria-labelledby="mp-f2-t mp-f2-d" className="mx-auto block w-full max-w-[560px]">
      <title id="mp-f2-t">{t("mealprep.fig.waves.title")}</title>
      <desc id="mp-f2-d">{t("mealprep.fig.waves.desc")}</desc>
      <defs>
        {/* LE PANIER — la pièce chaude, déclarée une fois sur le groupe pour
            que les deux appels n'en fassent pas deux couleurs. */}
        <g id="mp-wave" stroke="var(--ill-fig, #632C4C)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round">
          <path d="M 14 16 A 12 12 0 0 1 38 16" fill="none" />
          <rect x="0" y="16" width="52" height="36" rx="10" fill="var(--ill-wash, #EFE0E9)" />
        </g>
      </defs>

      <FigureHead label={t("mealprep.fig.waves.label")} />

      <g fontSize="9" fontWeight="600" letterSpacing="1" fill="var(--ill-ink-soft, #6A5A64)">
        <text x="100" y="60">{t("mealprep.fig.waves.first")}</text>
        <text x="317" y="60">{t("mealprep.fig.waves.next")}</text>
      </g>
      <use href="#mp-wave" x="100" y="66" />
      <use href="#mp-wave" x="317" y="66" />

      {/* LES DEUX EMPANS et leurs descentes — annotation, épaisseur 1, angles
          droits uniquement. Les retours verticaux ferment le premier empan;
          le second n'en a qu'un, à gauche. */}
      <g fill="none" stroke="var(--ill-ink-soft, #6A5A64)" strokeWidth="1" strokeLinecap="round">
        <path d="M 126 118 L 126 146" />
        <path d="M 343 118 L 343 146" />
        <path d="M 64 152 L 64 146 L 188 146 L 188 152" />
        <path d="M 250 152 L 250 146 L 436 146" />
        <path d="M 64 170 L 436 170" />
        {days.map((x) => <path key={x} d={`M ${x} 164 L ${x} 176`} />)}
      </g>

      <g fontSize="9" fontWeight="600" letterSpacing="1" fill="var(--ill-ink-soft, #6A5A64)">
        <text x="126" y="196" textAnchor="middle">{t("mealprep.fig.waves.fresh")}</text>
        <text x="436" y="196" textAnchor="end">{t("mealprep.fig.waves.week")}</text>
      </g>
    </svg>
  );
}

/**
 * FIGURE 3 — les trois gestes qu'une semaine accepte.
 *
 * L'écrit (le plan, un soir, une session) est vu DE FACE, strictement plat
 * (F3). Ce n'est PAS une maquette de produit: aucune de ces chaînes n'est
 * citée du code, donc rien ici ne se donne pour une capture d'écran (S10, et
 * l'interdit §8 n°12 — une paraphrase présentée comme un écran).
 *
 * Le plat est un `<use>` unique: c'est le même objet qui se décale au premier
 * geste et qui part avec sa session au deuxième. Au troisième, il n'est pas
 * là — et c'est le MOT qui porte l'absence, pas une couleur (F10).
 */
/* ⚠️ `MovesFigure` ET `wrapLabel` ONT DÉMÉNAGÉ LE 2026-09-01 vers
   `components/ui/AccidentsFigure.tsx`, et `FigureHead` avec eux. Ce qu'ils
   dessinent — les trois accidents de `FF-057` — n'appartient à aucune page:
   `/couples` montre exactement les mêmes. Chaque page garde ses CLÉS i18n et
   les passe en props. Voir l'en-tête du fichier partagé pour l'arbitrage
   contre la charte §6. */


export default MealPrepPage;
