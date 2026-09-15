import { Link } from "react-router-dom";
import SEO from "../../components/SEO";
import { LEGAL_ENTITY, organizationStructuredData } from "../../lib/legalEntity";
import { PublicFooter, PublicHeader } from "../components/PublicHeader";
import { Kicker, PriceCard, SectionTitle } from "../components/ui/Marketing";
import { formatPrice } from "../i18n/format";
import { PRICES } from "../i18n/prices";
import { t, type MessageKey } from "../i18n/t";

/**
 * /gyms — le gérant d'une salle indépendante. Box, salle de force, studio hybride.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * ⚠️ CE SEGMENT A ÉTÉ RECADRÉ LE 2026-08-13. NE LE « RÉPARE » PAS EN Y REMETTANT
 *    UN COACH.
 *
 * La version précédente vendait à une salle QUI COACHE: son héros disait « you
 * coach three hours a week, they eat twenty-one meals without you », et sa
 * section `Fit` disait « it only works if the method is YOURS ». Les deux
 * supposaient que la salle a une méthode et l'enseigne.
 *
 * La grille des douleurs (`scratchpad/site/GRILLE-DOULEURS.md`, section
 * « Salles ») a tranché l'inverse, et c'est le titre de la section: **une salle
 * n'est PAS un coach.** Elle vend une salle, pas une méthode, et ses clients
 * n'ont pour la plupart AUCUN coach. Le mécanisme « accompagner un client de
 * salle après ses trois heures » a été retiré du plan pour cette raison exacte.
 *
 * Conséquences, et elles sont structurelles:
 *   · Le héros parle de ce que le CLIENT fait (il s'entraîne, il mange), jamais
 *     de ce que la salle coache.
 *   · `Fit` n'a pas été réécrite, elle a été RETOURNÉE: la salle n'a pas de
 *     méthode à prêter, elle DÉLÈGUE (`House`, bande 3). C'est le seul argument
 *     neuf de la page, et c'est le bloc sombre.
 *   · Le vocabulaire est CLIENTS. « Élève » appartient à `/coaches`, où
 *     quelqu'un a choisi un professeur. ⛔ Jamais « votre équipe » (B20).
 *     ⛔ « Suivi personnalisé » est interdit partout.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * ── LA FORME: QUATRE BANDES, UNE PAR DOULEUR, PUIS L'OFFRE ───────────────────
 *   1 `Pain`   — « mes clients s'entraînent sérieusement et mangent au hasard ».
 *                Les anciennes sections `Money` et `Daily` se replient DEDANS:
 *                le revenu n'est pas une douleur (c'est ce qui rend la réponse
 *                achetable) et « réveillé à neuf heures un mardi » n'est pas un
 *                argument séparé (c'est ce que « tenu chaque jour » veut dire).
 *   2 `Monday` — « je les perds sans les voir partir ».
 *   3 `House`  — « je n'ai pas de méthode à prêter, ni la légitimité d'en
 *                écrire une ». Bloc sombre, un seul par page.
 *   4 `Offer`  — le prix ET la clôture, fusionnés. Un seul CTA, deux fois.
 *
 * ── CE QUI A ÉTÉ SUPPRIMÉ, ET POURQUOI ÇA NE REVIENT PAS ─────────────────────
 * `Lock` (le double verrou) appartient à `/coaches` (douleur 03) et au hall
 * `/pro` (ligne 03). La grille ne l'a PAS donnée à `/gyms`, et une salle qui
 * délègue à la doctrine de la maison n'a aucune ligne rouge à elle: la section
 * contredirait la bande 3. Sa figure (`FigTrace`) est partie avec elle.
 * `FigThread` (le fil du soir) est partie aussi: le tap du soir posé sur une
 * page de vente ressemble à du suivi, ce que la grille reproche déjà à `/pro`.
 *
 * ── TROIS CLAIMS SONT RETIRÉS DE CETTE PAGE. NE PAS LES RÉÉCRIRE ─────────────
 * B2 « 6 € quand votre MEMBRE a payé son année » — FAUX, l'intervalle annuel est
 * celui du COACH (`stripe-create-checkout-session:124-125` lit `body.interval`,
 * posé par les boutons de facturation du coach); remplacé par B3 dans
 * `gyms.price.annual`. · B16 « quelles convictions vos clients tiennent ou
 * lâchent » — RIEN ne le calcule; `source_belief_key` a un seul lecteur front et
 * c'est la semaine de l'élève (`weekPlan.ts:36-37`). Supprimé, sans remplacement.
 * · B18 « c'est votre nom sur les messages » — FAUX, l'agent s'appelle Sophia
 * partout et il n'existe AUCUNE personnalisation de marque: ni colonne, ni
 * écran, ni chaîne. ⛔ Et surtout pas de white-label (B19). La bande 3 dit
 * l'exact contraire, et c'est vérifiable: l'agent signe « Sophia ».
 *
 * ── LES SILENCES (audit §9). Les douze lient; quatre mordent ici ─────────────
 * S4 aucun « rien à installer / rien à connecter » sous quelque forme que ce
 * soit — la phrase de l'ancien `gyms.hero.note` est partie avec. · S8 aucun
 * chiffre sans source, ET SURTOUT AUCUN CHIFFRE DE RÉTENTION: B31 est la
 * meilleure ligne des trois anciennes pages et elle est portée VERBATIM dans
 * `gyms.money.close`. · S9 aucune bande de risque, aucune tuile « on track »,
 * aucun score d'adhérence. · S10 une maquette cite le vrai champ mot pour mot,
 * ou ce n'est pas une maquette (`FigMonday`). · S12 aucun SKU client dans
 * Stripe, et `gyms.price.billing_note` le dit à voix haute.
 *
 * ⚠️ B12/B13 — LA PAGE NE PRÉTEND NULLE PART CITER LA SYNTHÈSE. B13 est la
 * violation nommée de l'interdit §8 n°12 (paraphraser en annonçant du verbatim:
 * le moteur dit « built », pas « wrote »). Ce qui est cité ici l'est dans la
 * figure, et seulement des libellés d'écran vérifiés un par un.
 *
 * DESIGN — `docs/keel/CHARTE-VITRINE.md`, direction « la fiche ». Fond clair, UN
 * bloc sombre (la délégation), l'équerre qui ouvre ce qui est SPÉCIFIÉ, quatre
 * figures. ⛔ Aucune photographie: le produit ne fabrique aucune image, donc une
 * assiette ici serait une assiette que personne n'a cuisinée — et une fausse
 * photo d'assiette peinte en `emerald-300`/`amber-200` a DÉJÀ été trouvée et
 * retirée sur cette page (CHARTE §5). Aucune couleur d'état en décor, jamais.
 * Et `/gyms` est un lien qu'on a REÇU: pas de redirection si l'on est connecté,
 * sinon le lien transféré a l'air cassé.
 */

// Hoisted: `SEO` holds `structuredData` in a `useEffect` dependency array, so an inline
// literal would rebuild the <script> tags on every render.
const GYMS_STRUCTURED_DATA = [
  organizationStructuredData(),
  {
    "@context": "https://schema.org", "@type": "SoftwareApplication", name: "Sophia",
    applicationCategory: "BusinessApplication", operatingSystem: "Web", inLanguage: "en-GB",
    url: `${LEGAL_ENTITY.siteUrl}/gyms`, description: t("gyms.seo_description"),
    publisher: organizationStructuredData(),
  },
];

export function GymsLandingPage() {
  return (
    <div className="min-h-screen bg-paper text-ink">
      <SEO title={t("gyms.seo_title")} description={t("gyms.seo_description")}
        canonical={`${LEGAL_ENTITY.siteUrl}/gyms`} structuredData={GYMS_STRUCTURED_DATA} />
      <PublicHeader />
      <main>
        <Pain />
        <Monday />
        <House />
        <Offer />
      </main>
      <PublicFooter />
    </div>
  );
}

/** ⚠️ Padding en propriétés SÉPARÉES, jamais en raccourci: mesuré à 320 px sur la maquette
 *  de la charte, `padding: 84px 0 76px` remet le padding horizontal à zéro. */
const SHELL = "mx-auto max-w-[1200px] px-5 pb-10 pt-11 sm:px-8 sm:pb-[76px] sm:pt-[84px]";
const BODY = "text-base leading-[1.6]";
const TWO_COL = "mt-8 grid gap-10 lg:grid-cols-[1fr_auto] lg:items-start lg:gap-16";

function Section({ alt = false, children }: { alt?: boolean; children: React.ReactNode }) {
  return (
    <section className={alt ? "bg-paper-2" : "bg-paper"}>
      <div className={SHELL}>{children}</div>
    </section>
  );
}

/** Sur les 280 px utiles d'un 320, le texte d'une figure tombe à 5-7 px: `fig-scroll` lui
 *  donne une largeur plancher et fait défiler SON conteneur, jamais la page. `min-w-0` sur
 *  l'enveloppe est la seconde moitié de la garde — sans lui, `min-width: auto` remonte le
 *  plancher de 380 px jusqu'à la piste de grille et c'est la PAGE qui défile. */
function Figure({ children, dark = false }: { children: React.ReactNode; dark?: boolean }) {
  return <div className={dark ? "fig-scroll on-dark" : "fig-scroll"}>{children}</div>;
}

/** Un seul CTA sur la page, répété deux fois, sans offre concurrente à côté. */
function Cta({ labelKey }: { labelKey: MessageKey }) {
  const cls =
    "inline-flex items-center justify-center rounded-full bg-fig-700 px-6 py-3 text-[1rem] font-medium text-paper transition-colors hover:bg-fig-800";
  return <Link to="/auth?role=coach" className={cls}>{t(labelKey)}</Link>;
}

/**
 * BANDE 1 — douleur 01: « mes clients s'entraînent sérieusement et mangent au hasard ».
 *
 * Besoin: que la moitié qui décide du résultat soit couverte SANS embaucher un
 * nutritionniste. Réponse: un palier nutrition tenu chaque jour, que la salle vend et
 * facture ce qu'elle veut. Les trois mouvements de la bande sont donc: la douleur (le
 * héros), « tenu chaque jour » (ce que le client reçoit), et « vous le vendez » (ce que
 * la salle encaisse). Aucun n'est une bande à part: ce sont les trois moitiés d'une même
 * réponse.
 */
function Pain() {
  return (
    <Section>
      <div className="grid gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:gap-16">
        <div>
          <Kicker>{t("gyms.hero.eyebrow")}</Kicker>
          <h1 className="mt-4 max-w-[18ch] text-balance font-display text-hero">{t("gyms.hero.title")}</h1>
          {/* fact: 3 × 7 est l'arithmétique du monde, pas un chiffre du dépôt. Et c'est le
              CLIENT qui s'entraîne — la salle ne coache pas (grille, section « Salles »). */}
          <p className="mt-6 max-w-[62ch] text-lede text-ink-soft">{t("gyms.hero.lede")}</p>
          <div className="mt-8"><Cta labelKey="gyms.hero.cta" /></div>
          {/* fact: B5 — 20260727235000_keel_billing_seats.sql:110-136 */}
          <p className="mt-4 max-w-[52ch] text-sm text-ink-soft">{t("gyms.hero.trial_note")}</p>
        </div>
        <div className="min-w-0"><Figure><FigWeek /></Figure></div>
      </div>

      {/* Les deux moitiés de la réponse — « tenu chaque jour » et « vous le vendez » —
          s'empilent dans la colonne de texte, la figure tient l'autre. Mesuré: en deux
          colonnes de texte à égalité, la colonne courte laissait 500 px de blanc mort
          sous elle à 1280. */}
      <div className={TWO_COL.replace("mt-8", "mt-14 border-t border-line pt-10")}>
        <div className="max-w-[62ch]">
          <h2 className="font-display text-sub">{t("gyms.day.title")}</h2>
          {/* fact: B10 — TROIS points d'injection depuis le 2026-08-19:
              run.ts:2448 (chat) · generate-meal-v1:1729 ·
              generate-household-meal-v1:3569 — les trois sont `doctrineBlockFor(doctrine)`.
              ⚠️ Le quatrième (`generate-week-plan-v1`) est parti avec sa lane.
              ⚠️ Les huit numéros recopiés de l'audit pointaient des fragments de commentaire:
              revérifiés un par un le 2026-08-13. ⛔ Jamais « chaque message » (B7/B8). */}
          <p className={`mt-4 ${BODY} text-ink-soft`}>{t("gyms.day.body")}</p>
          <h2 className="mt-10 border-t border-line pt-8 font-display text-sub">{t("gyms.money.title")}</h2>
          {/* fact: B1 — stripe-create-checkout-session:120-125 (le siège est le seul poste) ;
              B4 — stripe-reconcile-seats:18-35 recalcule depuis le registre, jamais un incrément */}
          <p className={`mt-4 ${BODY} text-ink-soft`}>{t("gyms.money.body")}</p>
        </div>
        <div className="min-w-0 lg:w-[460px]">
          {/* fact: B30 — juste ET étiqueté « exemple »: c'est la paire qui rend crédible */}
          <Figure><FigMoney /></Figure>
          <p className="mt-3 text-sm text-ink-soft">{t("gyms.money.caption")}</p>
        </div>
      </div>

      {/* fact: B31 — VERBATIM, et c'est délibéré: rien dans le dépôt ne mesure le churn
          contre un témoin, et c'est ici qu'un chiffre inventé se vendrait le mieux (S8). */}
      <p className="mt-12 max-w-[62ch] border-t border-line pt-8 text-lede text-ink">
        {t("gyms.money.close")}
      </p>
    </Section>
  );
}

/**
 * BANDE 2 — douleur 02: « je les perds sans les voir partir ».
 *
 * ⛔ Aucune bande de risque, aucune tuile « on track », aucun score d'adhérence (S9, B15):
 * l'évaluateur d'adhérence est déprogrammé en 1:N, donc la valeur est nulle et l'afficher
 * serait vendre un chiffre mort. Le seul « chiffre » de la figure est son ABSENCE, citée
 * mot pour mot.
 */
function Monday() {
  return (
    <Section alt>
      <Kicker>{t("gyms.monday.eyebrow")}</Kicker>
      <SectionTitle>{t("gyms.monday.title")}</SectionTitle>
      <div className={TWO_COL}>
        <div className="max-w-[62ch]">
          {/* fact: B11 — cron '0 6 * * 1' (20260803090000_pivot_nutrition_crons.sql:90-116),
              `renderSynthesisText` est PURE (coach_synthesis.ts:12-19,516-641) ;
              B14 — CONTACT_SLIPPING_AFTER_HOURS = 48 / CONTACT_SILENT_AFTER_HOURS = 120
              (coach_synthesis.ts:64-65), mesurés sur le dernier ENTRANT */}
          <p className={`${BODY} text-ink-soft`}>{t("gyms.monday.body")}</p>
          <p className={`mt-6 ${BODY}`}>{t("gyms.monday.close")}</p>
          {/* fact: B17 — coach_synthesis_io.ts:171-187 (coach_clients.coach_id = :coachId) */}
          {/* ⚠️ Le filet est sur l'ENVELOPPE, pas sur le paragraphe: `.eq::before` se pose à
              `top: 0.18em` de la boîte, donc un `pt-6` sur le même élément fait flotter
              l'équerre 24 px au-dessus de son mot — et une équerre sans mot à sa droite est
              un défaut, pas une décoration (CHARTE §4). Mesuré ici. */}
          <div className="mt-8 border-t border-line pt-6">
            <p className={`eq ${BODY}`}>{t("gyms.monday.scope")}</p>
          </div>
        </div>
        <div className="min-w-0 lg:w-[420px]">
          {/* fact: S10 — mot pour mot: coach.weekly.title / .flagged_title / .no_number ·
              coach.flag.slipping_contact / .silent_5d / .coverage_below_gate */}
          <Figure><FigMonday /></Figure>
          <p className="mt-3 text-sm text-ink-soft">{t("gyms.monday.fig_caption")}</p>
        </div>
      </div>
    </Section>
  );
}

/**
 * BANDE 3 — douleur 03: « je n'ai pas de méthode à prêter, et pas la légitimité d'en
 * écrire une ». LE SEUL ARGUMENT NEUF DE LA PAGE, d'où le bloc sombre.
 *
 * C'est l'ancienne section `Fit` RETOURNÉE. Elle affirmait « ça ne marche que si la
 * méthode est la vôtre » — vrai pour un coach, faux pour une salle, qui n'en a pas.
 *
 * ── L'ANCRE, ET POURQUOI ELLE TIENT ─────────────────────────────────────────────
 * `coaches.doctrine_source = 'house'` (migration `20260806230000_doctrine_delegation.sql`).
 * La résolution vit dans `_shared/keel/doctrine_delegation.ts` — une seule définition de
 * « qui signe », et elle est câblée aux DEUX endroits qui signent:
 *   · `doctrine_loader.ts:362` — le bloc de prompt ET la substitution du verrou de sortie ;
 *   · `keel-coach-broadcast-v1:111` — le message hebdomadaire à la cohorte.
 * Le module dit pourquoi les deux, et c'est le claim de `gyms.house.sign_body`: câblée
 * dans un seul, la délégation donnerait au MÊME client un agent qui signe « Sophia » en
 * conversation et « Marc » sur sa diffusion, la même semaine.
 *
 * La bascule est réversible dans les deux sens (`coach-doctrine-v1`, action
 * `set_doctrine_source`; écran `DoctrineStartDialog.tsx`) et la doctrine éventuellement
 * publiée avant n'est PAS touchée — elle dort.
 *
 * ⏳ LA RÉSERVE N'EST PAS NÉGOCIABLE. Le chemin existe; le CONTENU de cette doctrine de
 * maison est en cours d'établissement. Une page qui promet une méthode maison déjà écrite
 * ment aujourd'hui, et `gyms.house.reserve` est ce qui l'empêche.
 *
 * ⛔ Pas de section « double verrou » ici: une salle qui délègue n'a aucune ligne rouge à
 * elle, donc rien à garantir en son nom. La réserve le dit en une ligne, pas en section.
 */
function House() {
  return (
    <section className="bg-fig-950 text-paper">
      <div className={SHELL}>
        <Kicker onDark>{t("gyms.house.eyebrow")}</Kicker>
        <h2 className="mt-3 max-w-2xl text-balance font-display text-title">{t("gyms.house.title")}</h2>
        <div className="mt-10 grid gap-10 lg:grid-cols-2 lg:items-start lg:gap-16">
          <div className="max-w-[62ch]">
            {/* fact: coaches.doctrine_source = 'house' — 20260806230000_doctrine_delegation.sql.
                L'agent signe du nom de la maison, jamais de celui de la salle: c'est une
                DÉLÉGATION assumée, pas « une doctrine générique qui devient la vôtre ». */}
            <p className={`${BODY} text-fig-300`}>{t("gyms.house.body")}</p>
            <dl className="mt-8 grid gap-6 border-t border-fig-700 pt-8">
              {/* fact: doctrine_delegation.ts — resolveDoctrineOwner appelée par
                  doctrine_loader.ts:362 ET keel-coach-broadcast-v1:111 */}
              <div className="border-l-2 border-fig-300 pl-4">
                <dt className="font-display text-sub">{t("gyms.house.sign_title")}</dt>
                <dd className={`mt-2 max-w-[52ch] ${BODY} text-fig-300`}>{t("gyms.house.sign_body")}</dd>
              </div>
              {/* fact: B20 — la tenancy est coach → coach_clients → student: ni entité salle,
                  ni roster multi-coach. C'est écrit ici pour que « votre équipe » ne
                  s'installe jamais dans une édition ultérieure. */}
              <div className="border-l-2 border-fig-300 pl-4">
                <dt className="font-display text-sub">{t("gyms.house.one_title")}</dt>
                <dd className={`mt-2 max-w-[52ch] ${BODY} text-fig-300`}>{t("gyms.house.one_body")}</dd>
              </div>
            </dl>
          </div>
          <div className="min-w-0"><Figure dark><FigHouse /></Figure></div>
        </div>
        {/* fact: réversible dans les deux sens (coach-doctrine-v1 `set_doctrine_source`), la
            doctrine publiée avant n'est pas touchée (decideDoctrineOwner) ; et ⏳ le contenu
            de la doctrine de maison est EN COURS D'ÉTABLISSEMENT — ne pas retirer cette
            seconde phrase tant que ce n'est pas faux. */}
        <p className={`mt-12 max-w-[62ch] border-t border-fig-700 pt-8 ${BODY}`}>
          {t("gyms.house.reserve")}
        </p>
      </div>
    </section>
  );
}

/**
 * BANDE 4 — le prix ET la clôture, fusionnés. Le siège est le seul poste, et la page se
 * ferme sur la phrase qui la résume, pas sur une seconde offre.
 */
function Offer() {
  return (
    <Section>
      <Kicker>{t("gyms.price.eyebrow")}</Kicker>
      <SectionTitle>{t("gyms.price.title")}</SectionTitle>
      {/* `lg:items-start`: `PriceCard` porte `h-full`, donc sans ça la carte s'étire à la
          hauteur de la colonne voisine et laisse 150 px de vide sous son dernier mot. */}
      <div className="mt-8 grid gap-10 lg:grid-cols-[auto_1fr] lg:items-start lg:gap-16">
        <div className="sm:max-w-sm">
          {/* fact: B1 — 7 €/client/mois, aucun forfait plateforme */}
          <PriceCard price={formatPrice(PRICES.seat)} period={t("gyms.price.seat_period")} label={t("gyms.price.seat_label")} />
          {/* fact: B3 — un SIÈGE payé à l'année. ⚠️ Correction du claim FAUX B2, qui était ici */}
          <p className="mt-3 text-sm text-ink-soft">{t("gyms.price.annual")}</p>
        </div>
        <div className="max-w-[62ch]">
          {/* fact: B4 — on cesse de payer au siège éteint ; B6 — zéro client = `no_billable_seat` */}
          <p className={`${BODY} text-ink-soft`}>{t("gyms.price.why")}</p>
          {/* fact: S12 — aucun SKU client dans stripe-create-checkout-session */}
          <p className="mt-4 text-sm text-ink-soft">{t("gyms.price.billing_note")}</p>
          <div className="mt-8 flex flex-wrap items-center gap-4">
            <Cta labelKey="gyms.price.cta" />
            {/* fact: B5 — 14 jours, 3 clients, puis ça s'arrête */}
            <span className="text-sm text-ink-soft">{t("gyms.price.trial_note")}</span>
          </div>
        </div>
      </div>
      {/* Pas de « Sign in » ici: `PublicHeader` porte déjà cette porte, et un second lien à
          côté du seul CTA de la page serait une seconde offre. */}
      <p className="mt-12 max-w-[36ch] border-t border-line pt-8 text-balance font-display text-sub">
        {t("gyms.close.line")}
      </p>
    </Section>
  );
}

// LES FIGURES. Deux épaisseurs (2 = le contour d'une chose réelle, 1 = une annotation),
// angles fermés, coordonnées entières, cinq jetons, `FIG` exactement DEUX fois par figure
// (l'équerre et un seul objet), ni dégradé ni ombre ni `opacity`, et jamais émeraude,
// ambre, rouge ni bleu — ces quatre familles appartiennent aux ÉTATS du produit.

const FONT = "var(--font-sans)";
const INK = "var(--ill-ink, #23191F)";
const SOFT = "var(--ill-ink-soft, #6A5A64)";
const PAPER = "var(--ill-paper, #FBF8FA)";
const WASH = "var(--ill-wash, #EFE0E9)";
const FIG = "var(--ill-fig, #632C4C)";

/** L'équerre n'encadre jamais, elle ouvre, et ne flotte JAMAIS seule: il y a toujours un mot à
 *  sa droite. Sans `label` — la maquette — c'est le titre de l'app à l'intérieur de la
 *  surface dont elle ouvre le coin, et le bras passe de 32 à 40. */
function Eq({ label }: { label?: MessageKey }) {
  const arm = label ? 32 : 40;
  return (
    <>
      <path d={`M 8 ${arm} L 8 16 A 8 8 0 0 1 16 8 L ${arm} 8`} fill="none" stroke={FIG} strokeWidth="2" strokeLinecap="round" />
      {label ? <text x="44" y="26" fontSize="11" fontWeight="600" letterSpacing="1.2" fill={SOFT}>{t(label)}</text> : null}
    </>
  );
}

/** Figure 1 — la semaine d'un CLIENT. Concept, 480×240. Les 21 repas sont la pièce chaude;
 *  COMPTABLES et non proportionnels — aucune forme n'affirme une mesure que le produit ne
 *  calcule pas, et 3 × 7 est l'arithmétique du monde, pas un chiffre du dépôt.
 *
 *  ⚠️ Les libellés ont changé avec l'acheteur: la rangée du haut est ce que le client fait
 *  DANS la salle, pas ce que la salle coache. */
function FigWeek() {
  return (
    <svg viewBox="0 0 480 240" role="img" aria-labelledby="fw-t fw-d" fontFamily={FONT}>
      <title id="fw-t">{t("gyms.fig.week_t")}</title>
      <desc id="fw-d">{t("gyms.fig.week_d")}</desc>
      <Eq label="gyms.fig.week_label" />
      <g fontSize="9" fontWeight="600" letterSpacing="1" fill={SOFT}>
        <text x="40" y="68">{t("gyms.fig.week_row1")}</text>
        <text x="40" y="148">{t("gyms.fig.week_row2")}</text>
      </g>
      {/* Trois choses réelles, contour de 2, sur trois des sept colonnes: à droite, le week-end. */}
      <g fill={PAPER} stroke={INK} strokeWidth="2" strokeLinejoin="round">
        {[40, 160, 280].map((x) => <rect key={x} x={x} y={80} width={56} height={32} rx={4} />)}
      </g>
      <g fill={FIG}>
        {[0, 1, 2, 3, 4, 5, 6].map((c) =>
          [0, 1, 2].map((r) => (
            <rect key={`${c}-${r}`} x={61 + c * 60} y={160 + r * 24} width={14} height={14} rx={4} />
          )),
        )}
      </g>
    </svg>
  );
}

/** Figure 2 — l'exemple chiffré (B30). Document vu de face, 480×240. Ce n'est PAS une
 *  maquette: aucun écran ne rend cette addition, et la parer de la surface de l'app en
 *  ferait un écran qu'on n'a pas. */
function FigMoney() {
  const row = (y: number, label: MessageKey, value: MessageKey, total = false) => (<>
    <text x="44" y={y} fontSize={total ? 13 : 11} fill={INK}>{t(label)}</text>
    <text x="436" y={y} fontSize="13" textAnchor="end" fill={total ? FIG : INK}>{t(value)}</text>
  </>);
  return (
    <svg viewBox="0 0 480 240" role="img" aria-labelledby="fm-t fm-d" fontFamily={FONT}>
      <title id="fm-t">{t("gyms.fig.money_t")}</title>
      <desc id="fm-d">{t("gyms.fig.money_d")}</desc>
      <Eq label="gyms.fig.money_label" />
      <rect x="24" y="48" width="432" height="176" rx="12" fill={PAPER} stroke={SOFT} strokeWidth="1" />
      {row(80, "gyms.fig.money_uptake_label", "gyms.fig.money_uptake_value")}
      {row(134, "gyms.fig.money_in_label", "gyms.fig.money_in_value")}
      {row(162, "gyms.fig.money_out_label", "gyms.fig.money_out_value")}
      {row(200, "gyms.fig.money_keep_label", "gyms.fig.money_keep_value", true)}
      <g fontSize="9" fill={SOFT}>
        <text x="44" y="96">{t("gyms.fig.money_uptake_hint")}</text>
        <text x="44" y="216">{t("gyms.fig.money_keep_hint")}</text>
      </g>
      <g stroke={SOFT} strokeWidth="1">
        <path d="M 44 110 L 436 110" />
        <path d="M 44 176 L 436 176" />
      </g>
    </svg>
  );
}

/** Figure 3 — le lundi. MAQUETTE DE PRODUIT, 480×248; le filet de 2 est l'idiome de l'app
 *  (`border-l-2`, CoachWeeklyPage.tsx:306). Les pastilles d'état sont en CONTOUR SOURD et
 *  jamais dans leur couleur: pas d'instant sur une page de vente, le MOT porte l'état. Et
 *  la troisième ligne montre l'ABSENCE d'un chiffre — c'est S9 rendu visible. */
function FigMonday() {
  const rows: [MessageKey, MessageKey, MessageKey, boolean][] = [
    ["gyms.fig.monday_n1", "gyms.fig.monday_r1", "gyms.fig.monday_s1", true],
    ["gyms.fig.monday_n2", "gyms.fig.monday_r2", "gyms.fig.monday_s2", true],
    ["gyms.fig.monday_n3", "gyms.fig.monday_r3", "gyms.fig.monday_s3", false],
  ];
  return (
    <svg viewBox="0 0 480 248" role="img" aria-labelledby="fk-t fk-d" fontFamily={FONT}>
      <title id="fk-t">{t("gyms.fig.monday_t")}</title>
      <desc id="fk-d">{t("gyms.fig.monday_d")}</desc>
      <Eq />
      <rect x="8" y="8" width="464" height="232" rx="16" fill={WASH} stroke={SOFT} strokeWidth="1" />
      <text x="28" y="46" fontSize="15" fontWeight="600" fill={FIG}>{t("gyms.fig.monday_app")}</text>
      <rect x="24" y="64" width="432" height="158" rx="12" fill={PAPER} stroke={SOFT} strokeWidth="1" />
      <text x="40" y="88" fontSize="9" fontWeight="600" letterSpacing="0.9" fill={SOFT}>
        {t("gyms.fig.monday_worth")}
      </text>
      {rows.map(([name, reason, state, pill], i) => {
        const y = 118 + i * 42;
        return (
          <g key={name}>
            <path d={`M 40 ${y - 13} L 40 ${y + 5}`} stroke={SOFT} strokeWidth="2" strokeLinecap="round" />
            <text x="56" y={y} fontSize="11" fontWeight="600" fill={INK}>{t(name)}</text>
            <text x="140" y={y} fontSize="11" fill={SOFT}>{t(reason)}</text>
            {pill ? <rect x="286" y={y - 11} width="52" height="16" rx="8" fill="none" stroke={SOFT} strokeWidth="1" /> : null}
            <text x={pill ? 312 : 286} y={y} fontSize="9" textAnchor={pill ? "middle" : "start"} fill={SOFT}>{t(state)}</text>
          </g>
        );
      })}
    </svg>
  );
}

/**
 * Figure 4 — LA DÉLÉGATION ET LA SIGNATURE. CONCEPT sur fond sombre, 480×220.
 *
 * C'est la figure de l'argument neuf, et elle a UN seul travail: montrer que la salle
 * n'écrit rien, et qu'un seul nom sort aux deux endroits où un client rencontre un nom.
 * D'où la carte de gauche VIDE (contour de 2, remplissage nul: une chose réelle qui ne
 * contient rien) et la fourche qui alimente les deux surfaces, chacune signée.
 *
 * ⚠️ CONCEPT, donc elle a le droit d'être sur du sombre — une MAQUETTE DE PRODUIT n'y a
 * jamais droit (le produit est en clair uniquement, un écran sombre montrerait un produit
 * qui n'existe pas). `.on-dark` remonte la pièce chaude de 2,4:1 à 8,06:1, et `--ill-ink`
 * n'y est PAS utilisable: sur fond sombre, le contour d'une chose réelle est `PAPER`.
 *
 * ⛔ La flèche est DESSINÉE et non écrite: U+2192 n'existe dans aucune des deux polices.
 * La fourche entière est UN seul `<path>` — la pièce chaude est un objet, pas six.
 */
function FigHouse() {
  const surface = (y: number, label: MessageKey) => (<>
    <rect x="254" y={y} width="202" height="52" rx="12" fill="none" stroke={PAPER} strokeWidth="2" />
    <text x="270" y={y + 24} fontSize="9" fontWeight="600" letterSpacing="1" fill={SOFT}>{t(label)}</text>
    <text x="270" y={y + 42} fontSize="12" fill={PAPER}>{t("gyms.fig.house_sign")}</text>
  </>);
  return (
    <svg viewBox="0 0 480 220" role="img" aria-labelledby="fh-t fh-d" fontFamily={FONT}>
      <title id="fh-t">{t("gyms.fig.house_t")}</title>
      <desc id="fh-d">{t("gyms.fig.house_d")}</desc>
      <Eq label="gyms.fig.house_label" />
      {/* Ce que la salle a écrit: une chose réelle, et elle est vide. */}
      <rect x="24" y="76" width="148" height="68" rx="12" fill="none" stroke={PAPER} strokeWidth="2" />
      <text x="42" y="104" fontSize="9" fontWeight="600" letterSpacing="1" fill={SOFT}>{t("gyms.fig.house_gym")}</text>
      <text x="42" y="126" fontSize="12" fill={PAPER}>{t("gyms.fig.house_gym_v")}</text>
      {/* La fourche — un seul objet chaud, pointes comprises. */}
      <path
        d="M 180 110 L 206 110 M 206 74 L 206 158 M 206 74 L 246 74 M 206 158 L 246 158 M 238 68 L 246 74 L 238 80 M 238 152 L 246 158 L 238 164"
        fill="none" stroke={FIG} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      />
      {surface(48, "gyms.fig.house_s1")}
      {surface(132, "gyms.fig.house_s2")}
    </svg>
  );
}

export default GymsLandingPage;
