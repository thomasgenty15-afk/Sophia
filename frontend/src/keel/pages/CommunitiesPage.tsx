import React from "react";
import { Link } from "react-router-dom";
import SEO from "../../components/SEO";
import { LEGAL_ENTITY, organizationStructuredData } from "../../lib/legalEntity";
import { PublicFooter, PublicHeader } from "../components/PublicHeader";
import { ButtonLink } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Kicker, PriceCard, SectionTitle } from "../components/ui/Marketing";
import { t } from "../i18n/t";

/**
 * KEEL — la page de vente pour les PROPRIÉTAIRES DE COMMUNAUTÉ PAYANTE
 * (Skool, Circle, Discord, Kajabi). Troisième porte publique, après `/` (celui
 * qui vend une formation) et `/gyms` (la salle indépendante).
 *
 * ── POURQUOI UNE PAGE À PART, ET PAS UN PARAGRAPHE SUR `/` ────────────────
 * `/` vend à quelqu'un dont le revenu S'ARRÊTE: un cours se paie une fois. Le
 * propriétaire d'une communauté payante n'a pas ce problème — il a déjà le
 * récurrent, ses membres paient tous les mois, et il a déjà prouvé qu'il sait
 * le vendre. Lui servir « transformez votre formation en programme » ne décrit
 * rien de sa vie, et il repère l'erreur de cible en une phrase.
 *
 * SA DOULEUR EST STRUCTURELLE, ET C'EST TOUT L'ANGLE. Une communauté est un
 * FIL: il répond en public, au groupe. L'attention individuelle n'y est pas
 * rare, elle est IMPOSSIBLE — c'est l'architecture, pas l'organisation, et
 * travailler plus ne la produira jamais. Ses membres partent pour ça: pas de
 * résultat personnel. La page le dit dès le titre.
 *
 * ── LES DEUX RÈGLES QUI DÉCIDENT DE CHAQUE SECTION ────────────────────────
 * 1. ON NE DÉNIGRE PAS LA COMMUNAUTÉ, ET ON N'EST PAS SON REMPLAÇANT. C'est
 *    une répartition des rôles, et `RoleSplit` la rend visible en deux
 *    colonnes plutôt qu'en une phrase qu'on pourrait lire de travers: ses
 *    pairs, sa culture et ses posts restent chez lui; on ne prend que ce qu'un
 *    groupe ne saura jamais faire.
 * 2. ON NE LUI DEMANDE RIEN DE REFAIRE. Sa communauté ne bouge pas. Le test de
 *    relecture de cette page est celui-là: quelqu'un qui a 500 membres payants
 *    doit la finir en se disant « je ne touche à rien ». `Boundaries` répond à
 *    la question avant qu'il la pose, et elle est placée AVANT le prix.
 *
 * ── CE QUE LA PAGE NE PROMET PAS (vérifié dans le code le 2026-08-06) ──────
 *   - AUCUNE intégration Skool / Circle / Discord / Kajabi. L'entrée est
 *     `coach-invite-student-v1`: une invitation e-mail par membre. Il n'existe
 *     même pas de « copier le lien » (`InviteDialog` ne voit jamais le token),
 *     donc la page dit « by email » et jamais « by link »;
 *   - aucun encaissement du membre: pas de SKU élève dans
 *     `stripe-create-checkout-session`;
 *   - aucune couche sociale, et c'est dit comme un CHOIX — sa communauté EST
 *     la couche sociale;
 *   - aucun chiffre de rétention. `communities.pricing.why` pose une question,
 *     comme `landing.pricing.why`;
 *   - aucun score d'adhérence ni classement: `evaluate-adherence-v1` est
 *     déprogrammé dans le 1:N (migration 20260803200000), et le panneau du
 *     lundi ne montre que ce que la synthèse calcule vraiment.
 *
 * ── DESIGN ────────────────────────────────────────────────────────────────
 * Identique à `/` et `/gyms`, délibérément: clair uniquement, aucune teinte de
 * marque, chaque couleur saturée est un ÉTAT (emerald / amber / red, les tons
 * du kit Badge). Une troisième page de vente qui inventerait sa palette se
 * lirait comme le site d'une autre société à un clic des deux premières.
 *
 * Les fonds alternent blanc / gray-50 à partir de `Tier` — douze sections
 * d'affilée sur un seul fond deviennent un mur, et cette page en a quatre de
 * plus que `/`. Le hero et `Thread` partagent le blanc parce qu'ils sont une
 * seule idée en deux temps. La seule exception au rythme est le gray-950, et
 * il est dépensé sur le double verrou: un bloc sombre est le seul signal fort
 * dont dispose une page sans couleur d'accent, et l'argument le plus fort est
 * celui qui en a besoin. `Pricing` retombe sur blanc parce que `Boundaries`
 * vient de prendre le gris; sur `/` c'est l'inverse, et dans les deux cas le
 * prix est simplement ce qui ne suit pas un fond identique.
 *
 * `Kicker`, `SectionTitle` et `PriceCard` viennent de `ui/Marketing`, partagés
 * avec les deux autres pages. Les maquettes, elles, restent LOCALES: ce sont de
 * la copie, elles lisent les clés `communities.*`, et une maquette partagée est
 * une maquette qui change de sens sur trois pages quand on en édite une.
 *
 * ── PAS DE REDIRECTION DU VISITEUR CONNECTÉ, CONTRAIREMENT À `/` ──────────
 * Même arbitrage que `/gyms`, et pour la même raison. `/` renvoie un visiteur
 * connecté vers son espace parce que c'est la destination par défaut de tout.
 * `/communities` est un lien qu'on ENVOIE — et le premier à le faire suivre
 * sera un propriétaire connecté qui le transmet à son associé: le renvoyer dans
 * son espace ferait passer le lien pour cassé. `PublicHeader` remplace déjà ses
 * boutons par un retour vers l'app quand quelqu'un est connecté.
 */

// Hoisté hors du rendu: `SEO` garde `structuredData` dans un tableau de
// dépendances de `useEffect`, donc un littéral inline reconstruirait les
// balises <script> à chaque rendu. `t()` est une lecture de table statique.
//
// Le nœud Organization est la déclaration partagée de `lib/legalEntity` — la
// même que font `/`, `/gyms` et `/legal`. Le nœud SoftwareApplication porte
// l'url et la description DE CETTE PAGE; le canonical ci-dessous empêche les
// trois de se lire comme des doublons l'une de l'autre.
const COMMUNITIES_STRUCTURED_DATA = [
  organizationStructuredData(),
  {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Sophia",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    url: `${LEGAL_ENTITY.siteUrl}/communities`,
    description: t("communities.seo_description"),
    inLanguage: "en-GB",
    publisher: organizationStructuredData(),
  },
];

export function CommunitiesPage() {
  return (
    <div className="min-h-screen bg-white text-gray-900">
      <SEO
        title={t("communities.seo_title")}
        description={t("communities.seo_description")}
        canonical={`${LEGAL_ENTITY.siteUrl}/communities`}
        structuredData={COMMUNITIES_STRUCTURED_DATA}
      />

      <PublicHeader />

      <main>
        <Hero />
        <Thread />
        <Tier />
        {/*
          L'ORDRE DES TROIS AXES EST UN ARGUMENT, PAS UN SOMMAIRE.
          Le revenu d'abord (`Tier`), parce que c'est ce qu'on AJOUTE et que
          personne n'écoute une promesse de rétention avant de savoir ce que ça
          rapporte. La rétention ensuite (`RoleSplit`), qui est son problème
          numéro un. Les données en troisième (`MondayData`): elles ne se
          vendent qu'à quelqu'un qui a déjà accepté les deux premières.
        */}
        <RoleSplit />
        <MondayData />
        <Compared />
        {/*
          La voix JUSTE AVANT le bloc sombre, et pas ailleurs. `Voice` nomme
          l'actif; `DoubleLock` est ce qui le protège. Dans l'autre ordre, la
          garantie garderait quelque chose que le lecteur n'a pas encore vu.
        */}
        <Voice />
        <DoubleLock />
        <Doctrine />
        <Boundaries />
        <Pricing />
        <ClosingCall />
      </main>

      <PublicFooter />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Hero
// ---------------------------------------------------------------------------

function Hero() {
  return (
    <section className="border-b border-gray-200">
      <div className="mx-auto grid max-w-6xl gap-12 px-4 py-16 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:py-24">
        <div>
          <Kicker>{t("communities.hero.kicker")}</Kicker>
          <h1 className="mt-3 text-balance text-4xl font-semibold leading-[1.08] tracking-tight sm:text-5xl">
            {t("communities.hero.title")}
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-8 text-gray-600">
            {t("communities.hero.subtitle")}
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <ButtonLink to="/auth?role=coach" variant="primary" className="px-6 py-3 text-base">
              {t("communities.hero.cta_trial")}
            </ButtonLink>
            <ButtonLink to="/auth" variant="secondary" className="px-6 py-3 text-base">
              {t("communities.hero.cta_signin")}
            </ButtonLink>
          </div>
          <p className="mt-4 max-w-md text-sm leading-6 text-gray-500">
            {t("communities.hero.note")}
          </p>
          {/* La porte libre, discrète par construction — même arbitrage que sur
              `/`: cette page vend à celui qui PAIE, et deux offres côte à côte
              le feraient hésiter entre l'une et l'autre. Mais un propriétaire
              de communauté ne mettra pas ses membres sur un produit qu'il n'a
              pas vu de leur côté, donc la porte existe: une ligne de texte, pas
              un troisième bouton. */}
          <p className="mt-3 max-w-md text-sm leading-6 text-gray-500">
            {t("communities.hero.try_prompt")}{" "}
            <Link to="/start" className="font-medium text-gray-900 underline">
              {t("communities.hero.try_cta")}
            </Link>
          </p>
        </div>
        <MondayPanel />
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Le panneau du lundi — l'objet-thèse du hero
// ---------------------------------------------------------------------------

/**
 * Schéma de la page du lundi, dans l'ordre où la synthèse elle-même la rend
 * (`_shared/keel/coach_synthesis.ts`): CONTACT, puis VIVABILITÉ, puis ce que
 * les membres se sont fixé.
 *
 * LA COHORTE EST DE 150, ET CE N'EST PAS UN NOMBRE AU HASARD: ce sont les 3
 * sur 10 d'une communauté de 500 qui prennent le palier coaché — exactement la
 * cohorte de l'exemple chiffré de `Tier`. Deux nombres qui ne concordent pas
 * sur une page de vente, et c'est toute la page qui devient approximative.
 *   contact:   71 + 34 + 45 = 150
 *   vivabilité: 58 + 26 + 11 notés, 55 sans assez de taps = 150
 *
 * PAS DE GRILLE DE PASTILLES, contrairement au panneau de `/`. À 34 élèves une
 * pastille par personne se COMPTE; à 150 elle devient une texture, c'est-à-dire
 * une PROPORTION — et une proportion est à un pas du pourcentage que ce produit
 * refuse d'imprimer. Des lignes chiffrées se lisent à n'importe quelle taille
 * de cohorte, ce qui est précisément le sujet de cette page.
 */
function MondayPanel() {
  return (
    <div>
      <Card padded={false} className="shadow-sm">
        <header className="border-b border-gray-200 px-4 py-3">
          <div className="text-sm font-semibold text-gray-900">
            {t("communities.mock.monday_title")}
          </div>
          <div className="text-xs text-gray-500">
            {t("communities.mock.monday_subtitle")}
          </div>
        </header>

        <PanelBlock label={t("communities.mock.contact_label")}>
          <ul className="divide-y divide-gray-100">
            <CountRow
              tone="positive"
              label={t("communities.mock.contact_in_touch")}
              hint={t("communities.mock.contact_in_touch_hint")}
              count={71}
            />
            <CountRow
              tone="caution"
              label={t("communities.mock.contact_slipping")}
              hint={t("communities.mock.contact_slipping_hint")}
              count={34}
            />
            <CountRow
              tone="critical"
              label={t("communities.mock.contact_silent")}
              hint={t("communities.mock.contact_silent_hint")}
              count={45}
            />
          </ul>
          {/* La légende de l'argument, attachée au bloc contact et pas au pied
              du panneau: c'est ce 45-là qu'elle commente. */}
          <p className="mt-3 text-xs leading-5 text-gray-500">
            {t("communities.mock.contact_caption")}
          </p>
        </PanelBlock>

        <PanelBlock label={t("communities.mock.felt_label")}>
          <ul className="divide-y divide-gray-100">
            <CountRow
              tone="positive"
              label={t("communities.mock.felt_sustainable")}
              count={58}
            />
            <CountRow tone="caution" label={t("communities.mock.felt_strained")} count={26} />
            <CountRow tone="critical" label={t("communities.mock.felt_hard")} count={11} />
            {/* Pas une couleur avec un avis: on refuse de se prononcer, donc la
                pastille est un anneau creux plutôt qu'un état rempli. */}
            <CountRow tone="unknown" label={t("communities.mock.felt_unknown")} count={55} />
          </ul>
        </PanelBlock>

        <div className="border-t border-gray-200 bg-gray-50 px-4 py-3">
          <div className="text-[0.6875rem] font-semibold uppercase tracking-wider text-gray-500">
            {t("communities.mock.intent_label")}
          </div>
          <p className="mt-1 text-sm leading-6 text-gray-700">
            {t("communities.mock.intent_line")}
          </p>
        </div>
      </Card>
      <p className="mt-3 text-xs leading-5 text-gray-500">
        {t("communities.mock.caption")}
      </p>
    </div>
  );
}

function PanelBlock({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-t border-gray-200 px-4 py-3 first-of-type:border-t-0">
      <div className="text-[0.6875rem] font-semibold uppercase tracking-wider text-gray-500">
        {label}
      </div>
      <div className="mt-2">{children}</div>
    </div>
  );
}

/** Les tons du kit Badge, employés ici en bandeau: l'état se voit avant de se lire. */
const STRIPE: Record<string, string> = {
  positive: "bg-emerald-500",
  caution: "bg-amber-500",
  critical: "bg-red-500",
  // `unknown` n'est pas un état, c'est un REFUS DE SE PRONONCER — donc le gris
  // neutre du kit, jamais une couleur qui a un avis. (Le panneau de `/` rend
  // cette bande en anneau creux; ici la bande fait 4px de large, et un anneau
  // de 2px sur 4px de large rend un bloc plein de toute façon.)
  unknown: "bg-gray-300",
};

function CountRow({
  tone,
  label,
  hint,
  count,
}: {
  tone: keyof typeof STRIPE;
  label: string;
  hint?: string;
  count: number;
}) {
  return (
    <li className="flex items-center gap-3 py-2">
      <span className={`h-8 w-1 shrink-0 rounded-full ${STRIPE[tone]}`} aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-gray-900">{label}</span>
        {hint ? <span className="block text-xs text-gray-500">{hint}</span> : null}
      </span>
      <span className="text-base font-semibold tabular-nums text-gray-900">{count}</span>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Le fil — l'architecture, dite tôt et sans détour
// ---------------------------------------------------------------------------

/**
 * Les trois lignes sont des SCÈNES DE COMMUNAUTÉ, pas des questions de
 * nutrition (là où `/` cite trois questions d'élève). Le lecteur doit se
 * reconnaître dans sa propre journée avant qu'on lui parle de produit — et
 * aucune des trois n'est un reproche à sa communauté: ce sont des conséquences
 * mécaniques d'un fil, pas des défauts d'animation.
 */
function Thread() {
  const scenes = [
    t("communities.thread.q1"),
    t("communities.thread.q2"),
    t("communities.thread.q3"),
  ];
  return (
    <section className="border-b border-gray-200">
      <div className="mx-auto max-w-6xl px-4 py-16">
        <Kicker>{t("communities.thread.kicker")}</Kicker>
        <SectionTitle>{t("communities.thread.title")}</SectionTitle>
        <div className="mt-6 grid gap-10 lg:grid-cols-[1fr_1fr] lg:gap-16">
          <p className="max-w-xl text-base leading-7 text-gray-600">
            {t("communities.thread.body")}
          </p>
          <ul className="max-w-xl border-t border-gray-200">
            {scenes.map((scene) => (
              <li
                key={scene}
                className="border-b border-gray-200 py-4 text-lg leading-8 text-gray-900"
              >
                {scene}
              </li>
            ))}
          </ul>
        </div>
        <p className="mt-10 max-w-2xl text-base font-medium leading-7 text-gray-900">
          {t("communities.thread.close")}
        </p>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Le palier — axe 1, le revenu
// ---------------------------------------------------------------------------

/**
 * TROIS LIGNES, PAS TROIS CARTES. Une carte par prix les mettrait au même
 * niveau, alors que ce sont trois choses de nature différente: un prix qui NE
 * BOUGE PAS, un prix qu'il fixe, et un coût qui est le nôtre. L'empilement les
 * lit dans cet ordre, et c'est l'ordre de l'argument.
 *
 * Le fond est gris (registre commercial) et le tableau est encadré: c'est le
 * seul endroit de la page où le lecteur sort sa calculatrice, il doit trouver
 * les nombres sans les chercher.
 */
function Tier() {
  const rows: { label: string; value: string; note: string; ours: boolean }[] = [
    {
      label: t("communities.tier.row1_label"),
      value: t("communities.tier.row1_value"),
      note: t("communities.tier.row1_note"),
      ours: false,
    },
    {
      label: t("communities.tier.row2_label"),
      value: t("communities.tier.row2_value"),
      note: t("communities.tier.row2_note"),
      ours: false,
    },
    {
      label: t("communities.tier.row3_label"),
      value: t("communities.tier.row3_value"),
      note: t("communities.tier.row3_note"),
      ours: true,
    },
  ];
  return (
    <section className="border-b border-gray-200 bg-gray-50">
      <div className="mx-auto max-w-6xl px-4 py-16">
        <Kicker>{t("communities.tier.kicker")}</Kicker>
        <SectionTitle>{t("communities.tier.title")}</SectionTitle>

        <div className="mt-8 grid gap-10 lg:grid-cols-[1fr_auto] lg:items-start lg:gap-16">
          <div className="max-w-xl">
            <p className="text-base leading-7 text-gray-600">{t("communities.tier.body")}</p>
            <p className="mt-6 text-base font-medium leading-7 text-gray-900">
              {t("communities.tier.math")}
            </p>
            <p className="mt-4 text-sm leading-6 text-gray-500">
              {t("communities.tier.math_caption")}
            </p>
          </div>

          <Card padded={false} className="w-full lg:w-96">
            <div className="border-b border-gray-200 px-4 py-3 text-[0.6875rem] font-semibold uppercase tracking-wider text-gray-500">
              {t("communities.tier.example_label")}
            </div>
            <dl className="divide-y divide-gray-100">
              {rows.map((row) => (
                <div key={row.label} className="px-4 py-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <dt className="text-sm font-medium text-gray-900">{row.label}</dt>
                    {/* Le seul chiffre qui nous engage est le nôtre, et il est
                        le seul en noir plein: les deux autres sont des exemples
                        et la légende le dit. */}
                    <dd
                      className={`shrink-0 text-lg font-semibold tabular-nums ${
                        row.ours ? "text-gray-900" : "text-gray-500"
                      }`}
                    >
                      {row.value}
                    </dd>
                  </div>
                  <p className="mt-1 text-xs leading-5 text-gray-500">{row.note}</p>
                </div>
              ))}
            </dl>
          </Card>
        </div>

        <p className="mt-10 max-w-3xl border-t border-gray-200 pt-6 text-base leading-7 text-gray-900">
          {t("communities.tier.billing")}
        </p>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// La répartition des rôles — axe 2, la rétention
// ---------------------------------------------------------------------------

/**
 * LA SECTION LA PLUS FACILE À RATER DE TOUTE LA PAGE.
 *
 * « Tes membres partent, on les retient » se lit comme « ta communauté ne
 * marche pas » — or elle marche: il a prouvé qu'il sait vendre du récurrent.
 * Ce qui ne marche pas, c'est ce qu'un groupe ne saura JAMAIS faire, et c'est
 * la seule chose qu'on prend.
 *
 * Les deux colonnes existent pour que ce partage se VOIE, sans dépendre d'une
 * phrase que le lecteur pourrait lire de travers: à gauche ce qui reste chez
 * lui — et cette colonne est délibérément la première, et aussi longue que
 * l'autre. La relance du 3e jour est réelle (`keel-reengage-v1` part à 72h de
 * silence et compose sur la doctrine publiée du coach), sinon « in your
 * method » serait un mensonge.
 */
function RoleSplit() {
  return (
    <section className="border-b border-gray-200">
      <div className="mx-auto max-w-6xl px-4 py-16">
        <Kicker>{t("communities.roles.kicker")}</Kicker>
        <SectionTitle>{t("communities.roles.title")}</SectionTitle>
        <p className="mt-6 max-w-3xl text-base leading-7 text-gray-600">
          {t("communities.roles.body")}
        </p>

        <dl className="mt-10 grid gap-8 border-t border-gray-200 pt-8 sm:grid-cols-2 sm:gap-12">
          <div>
            <dt className="text-base font-semibold leading-6 text-gray-900">
              {t("communities.roles.group_title")}
            </dt>
            <dd className="mt-2 text-sm leading-6 text-gray-600">
              {t("communities.roles.group_body")}
            </dd>
          </div>
          <div className="sm:border-l sm:border-gray-200 sm:pl-12">
            <dt className="text-base font-semibold leading-6 text-gray-900">
              {t("communities.roles.agent_title")}
            </dt>
            <dd className="mt-2 text-sm leading-6 text-gray-600">
              {t("communities.roles.agent_body")}
            </dd>
          </div>
        </dl>

        <p className="mt-10 max-w-3xl text-base font-medium leading-7 text-gray-900">
          {t("communities.roles.close")}
        </p>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Le lundi — axe 3, ce qu'un fil ne donne jamais
// ---------------------------------------------------------------------------

/**
 * Chacun des trois items correspond à une ligne que `renderSynthesisText`
 * ÉMET vraiment: contact, vivabilité, semaines composées. Rien ici ne décrit un
 * écran qu'on n'a pas — et notamment, l'item 1 dit « names in your member
 * list » et non « names on the Monday page »: la synthèse ne nomme que trois
 * personnes (`TO_CATCH_UP_CAP`), les états par membre se lisent sur la liste de
 * cohorte (`contactStateFor`, écran `/coach`).
 */
function MondayData() {
  const items: { title: string; body: string }[] = [
    { title: t("communities.data.item1_title"), body: t("communities.data.item1_body") },
    { title: t("communities.data.item2_title"), body: t("communities.data.item2_body") },
    { title: t("communities.data.item3_title"), body: t("communities.data.item3_body") },
  ];
  return (
    <section className="border-b border-gray-200 bg-gray-50">
      <div className="mx-auto max-w-6xl px-4 py-16">
        <Kicker>{t("communities.data.kicker")}</Kicker>
        <SectionTitle>{t("communities.data.title")}</SectionTitle>
        <p className="mt-6 max-w-3xl text-base leading-7 text-gray-600">
          {t("communities.data.body")}
        </p>
        <dl className="mt-10 grid gap-8 border-t border-gray-200 pt-8 sm:grid-cols-3 sm:gap-10">
          {items.map((item) => (
            <div key={item.title}>
              <dt className="text-base font-semibold leading-6 text-gray-900">{item.title}</dt>
              <dd className="mt-2 text-sm leading-6 text-gray-600">{item.body}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-10 max-w-3xl text-base font-medium leading-7 text-gray-900">
          {t("communities.data.close")}
        </p>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Ce contre quoi il nous compare
// ---------------------------------------------------------------------------

/**
 * PAS UNE AUTRE IA: un canal Discord de plus, ou un coach humain à recruter.
 * C'est la première objection qu'il formulera, et une page qui l'esquive perd
 * sa crédibilité. Courte exprès — s'y attarder donnerait à l'objection plus de
 * place qu'elle n'en mérite.
 */
function Compared() {
  return (
    <section className="border-b border-gray-200">
      <div className="mx-auto max-w-6xl px-4 py-16">
        <Kicker>{t("communities.compare.kicker")}</Kicker>
        <SectionTitle>{t("communities.compare.title")}</SectionTitle>
        <dl className="mt-8 grid gap-8 border-t border-gray-200 pt-8 sm:grid-cols-2 sm:gap-12">
          <div>
            <dt className="text-base font-semibold leading-6 text-gray-900">
              {t("communities.compare.channel_title")}
            </dt>
            <dd className="mt-2 text-sm leading-6 text-gray-600">
              {t("communities.compare.channel_body")}
            </dd>
          </div>
          <div>
            <dt className="text-base font-semibold leading-6 text-gray-900">
              {t("communities.compare.hire_title")}
            </dt>
            <dd className="mt-2 text-sm leading-6 text-gray-600">
              {t("communities.compare.hire_body")}
            </dd>
          </div>
        </dl>
        <p className="mt-8 max-w-3xl text-base font-medium leading-7 text-gray-900">
          {t("communities.compare.close")}
        </p>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Sa voix — la section propre à cette cible
// ---------------------------------------------------------------------------

/**
 * Ni `/` ni `/gyms` n'ont cette section, et elle est ici parce que le
 * propriétaire de communauté est le seul pour qui la VOIX est l'actif: une
 * marque, un ton, des formules que ses membres reconnaissent au premier
 * paragraphe. Il ne loue pas un modèle, il prête sa voix.
 *
 * LA MAQUETTE MONTRE LES VRAIS CHAMPS de `_shared/keel/doctrine.ts` —
 * `voice.address`, `voice.length` / `voice.emojis`, une entrée de `vocabulary`
 * (terme + sens), et une ligne interdite avec son `instead`. Même règle que le
 * panneau du lundi: on ne montre pas un écran qu'on n'a pas.
 *
 * La dernière phrase ouvre volontairement sur le bloc sombre: elle pose la
 * question à laquelle `DoubleLock` répond, pour que la garantie arrive comme
 * une réponse et non comme une précaution.
 */
function Voice() {
  return (
    <section className="border-b border-gray-200 bg-gray-50">
      <div className="mx-auto max-w-6xl px-4 py-16">
        <Kicker>{t("communities.voice.kicker")}</Kicker>
        <SectionTitle>{t("communities.voice.title")}</SectionTitle>

        <div className="mt-8 grid gap-10 lg:grid-cols-[1fr_auto] lg:items-start lg:gap-16">
          <p className="max-w-xl text-base leading-7 text-gray-600">
            {t("communities.voice.body")}
          </p>
          <VoiceMock />
        </div>

        <p className="mt-10 max-w-3xl border-t border-gray-200 pt-6 text-base leading-7 text-gray-900">
          {t("communities.voice.close")}
        </p>
      </div>
    </section>
  );
}

/**
 * Fond BLANC sur une section grise — la maquette doit se lire comme une surface
 * POSÉE sur la page, pas comme un bloc de la page.
 *
 * La ligne interdite et son remplacement sont appariés visuellement (barre
 * rouge puis barre verte) parce que c'est le couple qui compte: une ligne
 * rouge sans son « à la place » n'est qu'une censure, et c'est exactement ce
 * que le double verrou plus bas montre en action.
 */
function VoiceMock() {
  return (
    <div className="w-full lg:w-96">
      <div className="text-[0.6875rem] font-semibold uppercase tracking-wider text-gray-500">
        {t("communities.voice.mock_label")}
      </div>
      <div className="mt-2 rounded-xl border border-gray-200 bg-white p-4">
        <dl className="grid gap-4">
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-gray-400">
              {t("communities.voice.mock_address_label")}
            </dt>
            <dd className="mt-1 text-sm leading-6 text-gray-700">
              {t("communities.voice.mock_address_value")}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-gray-400">
              {t("communities.voice.mock_term_label")}
            </dt>
            <dd className="mt-1 text-sm leading-6 text-gray-700">
              {t("communities.voice.mock_term_value")}
            </dd>
          </div>
          <div className="border-l-2 border-red-400 pl-3">
            <dt className="text-xs font-semibold uppercase tracking-wide text-gray-400">
              {t("communities.voice.mock_line_label")}
            </dt>
            <dd className="mt-1 text-sm leading-6 text-gray-700">
              {t("communities.voice.mock_line_value")}
            </dd>
          </div>
          <div className="border-l-2 border-emerald-500 pl-3">
            <dt className="text-xs font-semibold uppercase tracking-wide text-gray-400">
              {t("communities.voice.mock_instead_label")}
            </dt>
            <dd className="mt-1 text-sm leading-6 text-gray-900">
              {t("communities.voice.mock_instead_value")}
            </dd>
          </div>
        </dl>
      </div>
      <p className="mt-2 text-xs leading-5 text-gray-500">
        {t("communities.voice.mock_caption")}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Le double verrou — l'unique bloc sombre de la page
// ---------------------------------------------------------------------------

/**
 * Même garantie que sur `/`, et le même arbitrage graphique: `Badge` n'est pas
 * employé ici (ses tons sont faits pour des surfaces claires, et une pastille
 * `bg-red-50` sur gray-950 serait un bloc lumineux). Mêmes sémantiques,
 * réénoncées pour ce fond.
 *
 * La trace montre le mécanisme au lieu de l'affirmer, ce qui est le seul
 * argument recevable après une section qui vient de demander au lecteur de
 * confier sa voix.
 */
function DoubleLock() {
  return (
    <section className="border-b border-gray-200 bg-gray-950 text-white">
      <div className="mx-auto max-w-6xl px-4 py-16 lg:py-20">
        <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">
          {t("communities.lock.kicker")}
        </p>
        <h2 className="mt-2 max-w-3xl text-balance text-2xl font-semibold leading-tight sm:text-3xl">
          {t("communities.lock.title")}
        </h2>
        <p className="mt-4 max-w-2xl text-base leading-7 text-gray-300">
          {t("communities.lock.body")}
        </p>

        <div className="mt-10 grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:gap-14">
          <div className="grid content-start gap-6">
            <dl className="grid gap-6">
              <div className="border-l-2 border-gray-700 pl-4">
                <dt className="text-xs font-semibold uppercase tracking-widest text-gray-400">
                  {t("communities.lock.lock1_tag")}
                </dt>
                <dd className="mt-2 text-base leading-7 text-gray-200">
                  {t("communities.lock.lock1")}
                </dd>
              </div>
              <div className="border-l-2 border-emerald-400 pl-4">
                <dt className="text-xs font-semibold uppercase tracking-widest text-emerald-300">
                  {t("communities.lock.lock2_tag")}
                </dt>
                <dd className="mt-2 text-base leading-7 text-white">
                  {t("communities.lock.lock2")}
                </dd>
              </div>
            </dl>
            {/* La phrase de clôture vit dans cette colonne et pas en pleine
                largeur: la trace est bien plus haute que les deux verrous, et
                une clôture pleine largeur laissait un vide sous eux. */}
            <p className="mt-2 max-w-md text-balance text-lg font-medium leading-8 text-white">
              {t("communities.lock.close")}
            </p>
          </div>

          <div>
            <div className="text-xs font-semibold uppercase tracking-widest text-gray-400">
              {t("communities.lock.trace_label")}
            </div>
            <p className="mt-1 text-xs text-gray-500">
              {t("communities.lock.trace_example")}
            </p>

            <ol className="mt-4 grid gap-3">
              <TraceStep label={t("communities.lock.trace_ask")} tone="neutral">
                {t("communities.lock.trace_ask_text")}
              </TraceStep>
              <TraceStep
                label={t("communities.lock.trace_draft")}
                tone="held"
                chip={t("communities.lock.trace_held")}
              >
                {t("communities.lock.trace_draft_text")}
              </TraceStep>
              <TraceStep label={t("communities.lock.trace_sent")} tone="sent">
                {t("communities.lock.trace_sent_text")}
              </TraceStep>
            </ol>

            <p className="mt-4 text-sm leading-6 text-gray-400">
              {t("communities.lock.trace_note")}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function TraceStep({
  label,
  tone,
  chip,
  children,
}: {
  label: string;
  tone: "neutral" | "held" | "sent";
  chip?: string;
  children: React.ReactNode;
}) {
  const frame = tone === "held"
    ? "border-red-500/60 bg-red-500/5"
    : tone === "sent"
      ? "border-emerald-400/60 bg-emerald-400/5"
      : "border-gray-800 bg-gray-900";
  // Le brouillon retenu est barré, mais il doit rester LISIBLE — tout l'intérêt
  // est que le propriétaire voie ce qui a failli partir en son nom.
  const body = tone === "held"
    ? "text-gray-400 line-through decoration-red-400/70"
    : "text-gray-100";
  return (
    <li className={`rounded-xl border-l-2 border-y border-r ${frame} px-4 py-3`}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">
          {label}
        </span>
        {chip
          ? (
            <span className="shrink-0 rounded-full bg-red-500/15 px-2 py-0.5 text-[0.6875rem] font-medium text-red-300">
              {chip}
            </span>
          )
          : null}
      </div>
      <p className={`mt-1.5 text-base leading-7 ${body}`}>{children}</p>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Doctrine
// ---------------------------------------------------------------------------

function Doctrine() {
  const rules: { title: string; body: string }[] = [
    {
      title: t("communities.doctrine.rule1_title"),
      body: t("communities.doctrine.rule1_body"),
    },
    {
      title: t("communities.doctrine.rule2_title"),
      body: t("communities.doctrine.rule2_body"),
    },
    {
      title: t("communities.doctrine.rule3_title"),
      body: t("communities.doctrine.rule3_body"),
    },
  ];
  return (
    <section className="border-b border-gray-200">
      <div className="mx-auto max-w-6xl px-4 py-16">
        <Kicker>{t("communities.doctrine.kicker")}</Kicker>
        <SectionTitle>{t("communities.doctrine.title")}</SectionTitle>
        <dl className="mt-8 grid gap-8 border-t border-gray-200 pt-8 sm:grid-cols-3 sm:gap-10">
          {rules.map((rule) => (
            <div key={rule.title}>
              <dt className="text-base font-semibold leading-6 text-gray-900">{rule.title}</dt>
              <dd className="mt-2 text-sm leading-6 text-gray-600">{rule.body}</dd>
            </div>
          ))}
        </dl>
        <Card tone="dashed" className="mt-10 sm:p-6">
          <h3 className="text-lg font-semibold text-gray-900">
            {t("communities.doctrine.no_calories_title")}
          </h3>
          <div className="mt-3 grid max-w-4xl gap-4 text-sm leading-6 text-gray-600 sm:grid-cols-2 sm:gap-8">
            <p>{t("communities.doctrine.no_calories_body")}</p>
            <p>{t("communities.doctrine.no_calories_body2")}</p>
          </div>
        </Card>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Les bornes — dites AVANT le prix
// ---------------------------------------------------------------------------

/**
 * LA SECTION QUI DÉCIDE DE LA PAGE POUR CETTE CIBLE.
 *
 * Il arrive avec une question qu'il ne posera pas à voix haute: « qu'est-ce que
 * je vais devoir brancher, migrer, refaire ». La réponse est RIEN, et elle vaut
 * mieux que n'importe quel argument — mais seulement si on donne aussi ce qu'on
 * n'a pas, dans la même respiration. Placée avant le prix parce qu'un « non »
 * découvert après le chiffre annule le chiffre.
 *
 * Les quatre bornes sont des faits du dépôt: aucune intégration (l'entrée est
 * `coach-invite-student-v1`, une invitation e-mail par membre), aucune couche
 * sociale, aucun SKU élève dans `stripe-create-checkout-session`, et un
 * protocole strictement nutritionnel.
 */
function Boundaries() {
  const items: { title: string; body: string }[] = [
    { title: t("communities.not.item1_title"), body: t("communities.not.item1_body") },
    { title: t("communities.not.item2_title"), body: t("communities.not.item2_body") },
    { title: t("communities.not.item3_title"), body: t("communities.not.item3_body") },
    { title: t("communities.not.item4_title"), body: t("communities.not.item4_body") },
  ];
  return (
    <section className="border-b border-gray-200 bg-gray-50">
      <div className="mx-auto max-w-6xl px-4 py-16">
        <Kicker>{t("communities.not.kicker")}</Kicker>
        <SectionTitle>{t("communities.not.title")}</SectionTitle>
        <dl className="mt-8 grid gap-8 border-t border-gray-200 pt-8 sm:grid-cols-2 sm:gap-x-12 lg:grid-cols-4">
          {items.map((item) => (
            <div key={item.title}>
              <dt className="text-base font-semibold leading-6 text-gray-900">{item.title}</dt>
              <dd className="mt-2 text-sm leading-6 text-gray-600">{item.body}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-10 max-w-3xl border-t border-gray-200 pt-6 text-base font-medium leading-7 text-gray-900">
          {t("communities.not.close")}
        </p>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Pricing
// ---------------------------------------------------------------------------

/**
 * UNE SEULE CARTE, comme sur `/` et `/gyms`. Deux cartes obligent le prospect à
 * faire une addition, et une addition sur une page de vente est un endroit où
 * se tromper. Le tarif annuel est une LIGNE sous la carte, pas une seconde
 * carte: c'est une modalité de paiement, pas une seconde offre.
 */
function Pricing() {
  return (
    <section className="border-b border-gray-200">
      <div className="mx-auto max-w-6xl px-4 py-16">
        <Kicker>{t("communities.pricing.kicker")}</Kicker>
        <SectionTitle>{t("communities.pricing.title")}</SectionTitle>
        <div className="mt-8 sm:max-w-sm">
          <PriceCard
            price={t("communities.pricing.seat")}
            period={t("communities.pricing.seat_period")}
            label={t("communities.pricing.seat_label")}
          />
          <p className="mt-3 text-sm leading-6 text-gray-500">
            {t("communities.pricing.annual")}
          </p>
        </div>
        <p className="mt-6 max-w-2xl text-base leading-7 text-gray-600">
          {t("communities.pricing.why")}
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-4">
          <ButtonLink to="/auth?role=coach" variant="primary" className="px-6 py-3 text-base">
            {t("communities.pricing.cta")}
          </ButtonLink>
          <span className="text-sm text-gray-500">
            {t("communities.pricing.trial_note")}
          </span>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Closing call
// ---------------------------------------------------------------------------

function ClosingCall() {
  return (
    <section>
      <div className="mx-auto max-w-6xl px-4 py-20 text-center">
        <h2 className="mx-auto max-w-2xl text-balance text-2xl font-semibold leading-tight sm:text-3xl">
          {t("communities.closing.title")}
        </h2>
        <div className="mt-8 flex justify-center">
          <ButtonLink to="/auth?role=coach" variant="primary" className="px-6 py-3 text-base">
            {t("communities.closing.cta")}
          </ButtonLink>
        </div>
        <p className="mt-4 text-sm text-gray-500">
          {t("communities.closing.signin_prompt")}{" "}
          <a href="/auth" className="font-medium text-gray-900 underline">
            {t("communities.closing.signin_link")}
          </a>
        </p>
      </div>
    </section>
  );
}

export default CommunitiesPage;
