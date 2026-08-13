import React from "react";
import SEO from "../../components/SEO";
import { LEGAL_ENTITY, organizationStructuredData } from "../../lib/legalEntity";
import { PublicFooter, PublicHeader } from "../components/PublicHeader";
import { ButtonLink } from "../components/ui/Button";
import { Kicker, PriceCard, SectionTitle } from "../components/ui/Marketing";
import { en } from "../i18n/en";
import { formatPrice } from "../i18n/format";
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
const MEALPREP_STRUCTURED_DATA = [organizationStructuredData()];

export function MealPrepPage() {
  return (
    <div className="min-h-screen bg-paper text-ink">
      <SEO
        title={t("mealprep.seo_title")}
        description={t("mealprep.seo_description")}
        canonical={`${LEGAL_ENTITY.siteUrl}/meal-prep`}
        structuredData={MEALPREP_STRUCTURED_DATA}
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
        <Goal />
        <Week />
        <Moves />
        <Start />
      </main>

      <PublicFooter />
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
// cette page consomme » ne la trouve pas. Les six identifiants sont ceux de
// `MEMBER_GOALS`, dans l'ordre du CHECK `student_goals_goal_check`.
const GOALS = [
  { id: "fat_loss", name: "mealprep.goal.fat_loss", direction: "mealprep.dir.fat_loss" },
  { id: "muscle_gain", name: "mealprep.goal.muscle_gain", direction: "mealprep.dir.muscle_gain" },
  { id: "recomposition", name: "mealprep.goal.recomposition", direction: "mealprep.dir.recomposition" },
  { id: "performance", name: "mealprep.goal.performance", direction: "mealprep.dir.performance" },
  { id: "health", name: "mealprep.goal.health", direction: "mealprep.dir.health" },
  { id: "maintenance", name: "mealprep.goal.maintenance", direction: "mealprep.dir.maintenance" },
] as const satisfies ReadonlyArray<{ id: string; name: MessageKey; direction: MessageKey }>;

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

  return (
    <div className="mt-10 overflow-hidden rounded-fiche border border-line-strong bg-paper">
      {/* De VRAIS boutons radio: le clavier (flèches), l'état coché et son
          annonce sont alors ceux du navigateur, pas une imitation. La couleur
          n'est jamais seule à dire lequel est courant — la fiche en dessous le
          nomme, et le lecteur d'écran l'entend du groupe lui-même. */}
      <fieldset className="p-5 sm:p-8">
        <legend className="eq text-label font-semibold uppercase text-ink-soft">{t("mealprep.demo.legend")}</legend>
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
function Goal() {
  return (
    <Band>
      {/* fact: C13 — onboarding.ts:88 `FunnelBranch` (branche `solo`) */}
      <Kicker>{t("mealprep.plate.kicker")}</Kicker>
      <div className="mt-5 grid gap-8 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-16">
        {/* Le seul h1 de la page. Young Serif n'a qu'une graisse: la hiérarchie
            se fait à la taille et à l'espace, jamais au gras. */}
        <h1 className="max-w-[15ch] text-balance font-display text-hero">{t("mealprep.plate.title")}</h1>
        <div className="lg:border-l lg:border-line lg:pl-10">
          {/* fact: C4 — household_portions.ts:125 (six directions) · C14:
              l'objectif est posé à l'entrée (onboarding.ts:97-103 et :211-290) */}
          <p className="max-w-[62ch] text-lede text-ink-soft">{t("mealprep.plate.lede")}</p>
          {/* CTA unique de la page, répété une fois en clôture et jamais mis en
              concurrence avec une seconde offre.
              fact: §10 — `/start` est la seule porte d'inscription libre */}
          <p className="mt-6"><ButtonLink to="/start" variant="brand">{t("mealprep.cta")}</ButtonLink></p>
          {/* fact: C1 — 20260810260000_household_billable_profiles.sql:235-250 */}
          <p className="mt-4 max-w-[52ch] text-sm text-ink-soft">{t("mealprep.plate.price_note")}</p>
          {/* fact: §10 — `/start` interroge `keel_free_signup_available`: la porte est
              fermée tant que le programme du coach maison n'est pas publié. */}
          <p className="mt-2 max-w-[52ch] text-[13px] leading-5 text-ink-soft">{t("mealprep.plate.reserve")}</p>
        </div>
      </div>

      <ServingDemo />
      {/* La réserve de la démonstration: ni écran, ni grammes.
          fact: FF-043 §11 n°1 — les grammes sont calculés, aucun écran ne les rend */}
      <p className="mt-6 max-w-[62ch] text-ink-soft">{t("mealprep.demo.note")}</p>

      {/* LE BLOC SOMBRE — un seul par page, et il est dépensé ICI, sur la bande
          qui vient de demander un objectif. Le lecteur a déjà désinstallé un
          compteur; c'est le moment où il se demande s'il en retrouve un. */}
      <div className="on-dark mt-10 rounded-fiche bg-fig-950 p-5 text-paper sm:mt-12 sm:p-8">
        <Kicker onDark>{t("mealprep.quiet.kicker")}</Kicker>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 sm:gap-10">
          {/* fact: C15 — components/plan/EnergyReadout.tsx:42-45 + 20260812230000:60 (défaut
              false) · energy_gate.ts:228-249 (la chaîne de gardes) */}
          <p className="max-w-[62ch]">{t("mealprep.quiet.numbers")}</p>
          {/* fact: S9 — l'évaluateur d'adhérence est déprogrammé en 1:N (20260803200000) */}
          <p className="max-w-[62ch]">{t("mealprep.quiet.ranking")}</p>
        </div>
      </div>
    </Band>
  );
}

/**
 * BANDE 2 — « Décider coûte plus cher que cuisiner. »
 *
 * Les sessions de cuisine ET les vagues de courses sont UN SEUL argument: on
 * décide moins. Les deux figures existaient déjà et sont bonnes; ce qui a
 * changé, c'est qu'elles ne portent plus deux sections mais deux moitiés d'une
 * même phrase.
 */
function Week() {
  return (
    <Band tone="bg-paper-2">
      <Kicker>{t("mealprep.week.kicker")}</Kicker>
      {/* fact: C3 — meal_generation.ts:522 `interface CookingSession` */}
      <SectionTitle>{t("mealprep.week.title")}</SectionTitle>
      <div className="mt-8 grid gap-6 sm:mt-10 lg:grid-cols-2 lg:gap-10">
        <Plate figure={<SessionFigure />}>
          {/* fact: C3 — meal_generation.ts:522 · CookingSessions.tsx:48 */}
          <p className="max-w-[62ch]">{t("mealprep.week.body")}</p>
        </Plate>
        <Plate figure={<WavesFigure />}>
          {/* fact: C5 — meal_generation.ts:730, grocery_waves.ts:211 (MAX_FRIDGE_DAYS = 3) */}
          <p className="max-w-[62ch]">{t("mealprep.week.waves")}</p>
          {/* La réserve honnête de C5, écrite plutôt que tue: le front MASQUE
              les vagues quand il n'y en a qu'une (ShoppingListPanel.tsx:128).
              Promettre « des vagues » à qui n'en verra qu'une ment pour rien. */}
          <p className="mt-4 max-w-[62ch] text-ink-soft">{t("mealprep.week.reserve")}</p>
        </Plate>
      </div>
    </Band>
  );
}

/** BANDE 3 — « Un imprévu, et toute la semaine tombe. » */
function Moves() {
  return (
    <Band>
      <Kicker>{t("mealprep.moves.kicker")}</Kicker>
      {/* fact: C7 — accident.ts:995-1004 `REALIGNMENT_ACTIONS` */}
      <SectionTitle>{t("mealprep.moves.title")}</SectionTitle>
      <div className="mt-8 sm:mt-10">
        <Plate figure={<MovesFigure />}>
          <div className="grid gap-6 sm:grid-cols-2 sm:gap-12">
            {/* fact: C7 — accident.ts:995-1004 + chat/deterministic_buttons.ts */}
            <p className="max-w-[62ch]">{t("mealprep.moves.body")}</p>
            {/* fact: §5.1 — accident.ts:52-55 « aucune fonction d'ici ne choisit un plat » */}
            <p className="max-w-[62ch] text-ink-soft">{t("mealprep.moves.note")}</p>
          </div>
        </Plate>
      </div>
    </Band>
  );
}

/** BANDE 4 — le prix, et la seule porte. */
function Start() {
  // Les quatre clés restent LITTÉRALES: écrites en gabarit, un grep « quelles
  // clés cette page consomme » ne les trouve plus, et le jour où l'une bouge
  // c'est le rendu qui échoue, pas la compilation.
  const asks = [t("mealprep.start.ask_name"), t("mealprep.start.ask_birthdate"),
    t("mealprep.start.ask_goal"), t("mealprep.start.ask_allergies")];
  return (
    <Band tone="bg-paper-2">
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

          {/* LA FICHE VIERGE — ce qu'on demande à l'entrée, et rien de plus.
              Aucune durée annoncée: rien ne la mesure dans le dépôt (C14, D5),
              et « 90 secondes » serait un chiffre sans source. Des libellés en
              lecture, jamais un formulaire: le compte se crée sur `/start`. */}
          <div className="mt-8 rounded-fiche border border-line bg-paper p-5 sm:p-6">
            <p className="eq text-label font-semibold uppercase text-ink-soft">{t("mealprep.start.asks_label")}</p>
            {/* fact: C14 — onboarding.ts:97-103 et :211-290 */}
            <ul className="mt-4">
              {asks.map((ask) => (
                <li key={ask} className="border-t border-line py-3 text-sm first:border-t-0 first:pt-0">{ask}</li>
              ))}
            </ul>
          </div>

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
function FigureHead({ label }: { label: string }) {
  return (
    <>
      <path d="M 8 32 L 8 16 A 8 8 0 0 1 16 8 L 32 8" fill="none" stroke="var(--ill-fig, #632C4C)" strokeWidth="2" strokeLinecap="round" />
      <text x="44" y="26" fontSize="11" fontWeight="600" letterSpacing="1.2" fill="var(--ill-ink-soft, #6A5A64)">{label}</text>
    </>
  );
}

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
function MovesFigure() {
  const soft = "var(--ill-ink-soft, #6A5A64)";
  const cards: Array<{ x: number; label: string; kind: "dish" | "session" | "none" }> = [
    { x: 24, label: t("mealprep.fig.moves.dish"), kind: "dish" },
    { x: 176, label: t("mealprep.fig.moves.session"), kind: "session" },
    { x: 328, label: t("mealprep.fig.moves.tonight"), kind: "none" },
  ];
  return (
    <svg viewBox="0 0 480 240" role="img" aria-labelledby="mp-f3-t mp-f3-d" className="mx-auto block w-full max-w-[560px]">
      <title id="mp-f3-t">{t("mealprep.fig.moves.title")}</title>
      <desc id="mp-f3-d">{t("mealprep.fig.moves.desc")}</desc>
      <defs>
        <g id="mp-dish"><rect x="0" y="0" width="32" height="20" rx="4" fill="var(--ill-wash, #EFE0E9)" stroke="var(--ill-fig, #632C4C)" strokeWidth="2" /></g>
      </defs>

      <FigureHead label={t("mealprep.fig.moves.label")} />

      {cards.map((card) => (
        <g key={card.x} fill="none" stroke={soft} strokeWidth="1">
          <rect x={card.x} y="52" width="128" height="128" rx="12" fill="var(--ill-paper, #FBF8FA)" />
          {card.kind === "none"
            ? (
              // UN SEUL SOIR, et rien dedans. La carte n'a pas de destination
              // parce que rien ne se déplace: c'est la STRUCTURE qui porte le
              // geste, le mot en dessous le nomme, la couleur ne le porte pas.
              <>
                <rect x={card.x + 40} y="72" width="48" height="76" rx="4" />
                <rect x={card.x + 48} y="100" width="32" height="20" rx="4" />
              </>
            )
            : (
              // DEUX SOIRS: celui qu'on quitte, celui où l'on va. Sans la case
              // d'arrivée, la flèche pointait hors de la carte, vers rien.
              <>
                <rect x={card.x + 12} y="72" width="48" height="76" rx="4" />
                <rect x={card.x + 68} y="72" width="48" height="76" rx="4" />
                {card.kind === "session"
                  ? (
                    <>
                      <rect x={card.x + 16} y="92" width="40" height="36" rx="4" />
                      <rect x={card.x + 72} y="92" width="40" height="36" rx="4" />
                    </>
                  )
                  : <rect x={card.x + 76} y="100" width="32" height="20" rx="4" />}
                <use href="#mp-dish" x={card.x + 20} y="100" />
                {/* La flèche est DESSINÉE et non tapée: U+2192 n'a de glyphe
                    dans aucune des deux familles de la marque (CHARTE §3). */}
                <g strokeLinecap="round" strokeLinejoin="round">
                  <path d={`M ${card.x + 40} 164 L ${card.x + 88} 164`} />
                  <path d={`M ${card.x + 83} 160 L ${card.x + 88} 164 L ${card.x + 83} 168`} />
                </g>
              </>
            )}
          <text x={card.x + 64} y="206" textAnchor="middle" stroke="none" fontSize="9" fontWeight="600" letterSpacing="1" fill={soft}>{card.label}</text>
        </g>
      ))}
    </svg>
  );
}

export default MealPrepPage;
