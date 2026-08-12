import React from "react";
import { Link, Navigate } from "react-router-dom";
import SEO from "../../components/SEO";
import { useAuth } from "../../context/AuthContext";
import { LEGAL_ENTITY, organizationStructuredData } from "../../lib/legalEntity";
import { resolveHomePath, type HomePath } from "../api/postLogin";
import { PublicFooter, PublicHeader } from "../components/PublicHeader";
import ServerUnreachable from "../components/ServerUnreachable";
import { ButtonLink } from "../components/ui/Button";
import { Kicker, SectionTitle } from "../components/ui/Marketing";
import { t } from "../i18n/t";

/**
 * `/` — LE HALL DU FOYER. Refonte du 2026-08-12.
 *
 * ⚠️ CETTE PAGE A CHANGÉ D'ACHETEUR. Jusqu'ici `/` vendait au COACH; sa copie
 * a déménagé sous `/coaches`, réécrite. Si tu cherches l'ancienne, elle est
 * dans git — ne la ramène pas ici.
 *
 * ── CE QU'EST UN HALL, ET CE QUE ÇA LUI INTERDIT ──────────────────────────
 * Un hall n'est PAS une septième page de vente. Il porte trois choses et
 * s'arrête: la promesse commune aux trois situations, la preuve la plus forte
 * du produit, et les trois portes avec « c'est pour moi si… ». L'argument
 * complet d'un acheteur appartient à SA page.
 *
 * La règle de longueur en découle: un hall ne dépasse pas la moitié d'une page
 * segment (≤ 245 lignes contre 490). Un hall qui grossit est un hall qui a
 * commencé à vendre, et il vend alors aux trois acheteurs à la fois —
 * c'est-à-dire à personne.
 *
 * ── LES SILENCES QUI S'APPLIQUENT ICI ─────────────────────────────────────
 * S8 — un chiffre vient d'une source qu'on peut montrer, ou il n'apparaît pas.
 * S10 — on ne montre pas un écran qu'on n'a pas.
 * §8 n°1 de l'audit — LE PRIX SE DIT, PAS LA DURÉE D'ESSAI ni un bouton
 *   d'achat: le tunnel foyer rend 500 faute de prix Stripe, et `free_until`
 *   gèle tout foyer neuf à J+31 sans chemin pour se dégeler. Promettre
 *   « 30 jours puis vous décidez » serait promettre une décision impossible.
 * C15 — ne JAMAIS écrire « jamais de calories »: le produit en affiche depuis
 *   FF-059, éteintes par défaut derrière quatre verrous.
 */

const STRUCTURED_DATA = [
  {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: t("home.seo_title"),
    url: `${LEGAL_ENTITY.siteUrl}/`,
    description: t("home.seo_description"),
    publisher: organizationStructuredData(),
  },
];

/**
 * Les trois portes du monde du foyer, dans l'ordre du nombre de bouches.
 *
 * ⚠️ LES CLÉS SONT ÉCRITES EN TOUTES LETTRES, jamais construites par gabarit.
 * Un `t(\`home.door.${key}.title\`)` compile — le type accepte le littéral de
 * gabarit — et ne prouve plus rien: la clé absente n'est découverte qu'au
 * rendu, chez un visiteur. C'est le mécanisme entier de `PublicMessages` qui se
 * désarme pour économiser quatre lignes.
 */
const DOORS = [
  {
    to: "/meal-prep",
    label: "home.door.mealprep.label",
    title: "home.door.mealprep.title",
    body: "home.door.mealprep.body",
    cta: "home.door.mealprep.cta",
  },
  {
    to: "/couples",
    label: "home.door.couples.label",
    title: "home.door.couples.title",
    body: "home.door.couples.body",
    cta: "home.door.couples.cta",
  },
  {
    to: "/families",
    label: "home.door.families.label",
    title: "home.door.families.title",
    body: "home.door.families.body",
    cta: "home.door.families.cta",
  },
] as const;

const Section = ({
  children,
  tone = "paper",
}: {
  children: React.ReactNode;
  tone?: "paper" | "alt";
}) => (
  <section className={tone === "alt" ? "bg-paper-2" : ""}>
    <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-24">{children}</div>
  </section>
);

/**
 * La figure du hall: une casserole, deux parts décrites.
 *
 * ⚠️ ANNOTÉE EN MOTS, JAMAIS EN GRAMMES (audit §5.3). Le produit calcule bien
 * des deltas en grammes, mais AUCUN écran ne les rend — FF-043 §11 n°1 le dit
 * mot pour mot. Écrire « 180 g » ici serait montrer un écran qu'on n'a pas.
 */
const PotFigure = () => (
  <svg viewBox="0 0 480 236" role="img" aria-labelledby="pot-t" className="w-full">
    <title id="pot-t">{t("home.fig.alt")}</title>
    <g fill="none" stroke="var(--ill-ink)" strokeWidth="2">
      <circle cx="96" cy="112" r="52" fill="var(--ill-wash)" />
      <path d="M44 102H30a10 10 0 0 0 0 20h14M148 102h14a10 10 0 0 1 0 20h-14" />
      <circle cx="272" cy="62" r="32" fill="var(--ill-paper)" />
      <circle cx="272" cy="164" r="32" fill="var(--ill-paper)" />
      <path d="M146 98 242 68M146 124l96 30" stroke="var(--ill-ink-soft)" strokeWidth="1" />
    </g>
    <g fill="var(--ill-fig)">
      <circle cx="262" cy="54" r="7" />
      <circle cx="282" cy="65" r="7" />
      <circle cx="265" cy="74" r="7" />
      <circle cx="266" cy="157" r="9" />
      <circle cx="283" cy="170" r="9" />
    </g>
    {/* ⚠️ LES LIBELLÉS SONT MESURÉS, PAS ESTIMÉS. Le texte démarre à x=318, ce
        qui laisse 162 unités jusqu'au bord de la grille de 480. À 13px,
        « une part de féculents plus large » en réclamait 190 et sortait de la
        figure — mesuré au rendu, en français, qui est la langue longue ici.
        Toute étiquette ajoutée se vérifie DANS LES DEUX LANGUES. */}
    <g fontSize="13" fill="var(--ill-ink-soft)">
      <text x="96" y="192" textAnchor="middle">{t("home.fig.pot")}</text>
      <text x="318" y="58" fill="var(--ill-ink)">{t("home.fig.one")}</text>
      <text x="318" y="76">{t("home.fig.one_2")}</text>
      <text x="318" y="160" fill="var(--ill-ink)">{t("home.fig.two")}</text>
      <text x="318" y="178">{t("home.fig.two_2")}</text>
    </g>
  </svg>
);

export function HomePage() {
  const { user } = useAuth();
  const [dest, setDest] = React.useState<HomePath | null>(null);
  // `resolveHomePath` rendant `null` veut dire qu'il n'a RIEN lu — le backend
  // est injoignable. On ne navigue pas là-dessus: la destination de repli a
  // besoin du même backend et rendrait un écran vide. On le dit à la place.
  // Un visiteur déconnecté n'atteint jamais cet état; la page de vente
  // ci-dessous est statique et reste servie.
  const [unreachable, setUnreachable] = React.useState(false);
  const userId = user?.id ?? null;

  React.useEffect(() => {
    let cancelled = false;
    setUnreachable(false);
    if (!userId) {
      setDest(null);
      return;
    }
    resolveHomePath(userId).then((path) => {
      if (cancelled) return;
      if (path === null) {
        setUnreachable(true);
        return;
      }
      setDest(path);
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  // La redirection du connecté vaut sur LES DEUX HALLS et sur eux seuls. Les
  // six pages segment ne redirigent pas: ce sont des liens qu'on envoie, et
  // renvoyer un lecteur connecté dans son espace ferait passer le lien pour
  // cassé.
  if (userId && unreachable) return <ServerUnreachable />;
  if (userId && dest) return <Navigate to={dest} replace />;

  return (
    <div className="min-h-screen bg-paper text-ink">
      <SEO
        title={t("home.seo_title")}
        description={t("home.seo_description")}
        canonical={`${LEGAL_ENTITY.siteUrl}/`}
        structuredData={STRUCTURED_DATA}
      />
      <PublicHeader />

      <Section>
        <div className="grid gap-11 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:gap-16">
          <div>
            <Kicker>{t("home.hero.kicker")}</Kicker>
            <h1 className="mt-3 text-balance font-display text-hero">
              {t("home.hero.title")}
            </h1>
            <p className="mt-6 max-w-[62ch] text-lede text-ink-soft">
              {t("home.hero.lede")}
            </p>
            <div className="mt-8">
              <ButtonLink to="/start" variant="brand" className="px-6 py-3 text-base">
                {t("home.hero.cta")}
              </ButtonLink>
            </div>
            {/* fact: C1 — 20260810260000_household_billable_profiles.sql:235-250
                (le maître n'est jamais compté) et :101-105 (plafond 8).
                ⚠️ AUCUNE DURÉE, AUCUN BOUTON D'ACHAT — audit §8 n°1. */}
            <p className="mt-5 max-w-[52ch] text-sm leading-6 text-ink-soft">
              {t("home.hero.price")}
            </p>
          </div>
          {/* fact: C3 — meal_generation.ts:518 `interface CookingSession` ·
              fact: C4 — household_portions.ts:125 `SERVING_DIRECTION`, six
              objectifs, six directions. Annotée en mots: les grammes calculés
              n'atteignent aucun écran (FF-043 §11 n°1). */}
          <figure className="m-0 min-w-0">
            <div className="fig-scroll">
              <PotFigure />
            </div>
            <figcaption className="mt-4 max-w-[62ch] text-sm leading-6 text-ink-soft">
              {t("home.fig.caption")}
            </figcaption>
          </figure>
        </div>
      </Section>

      <Section tone="alt">
        <Kicker>{t("home.proof.kicker")}</Kicker>
        <SectionTitle>{t("home.proof.title")}</SectionTitle>
        {/* fact: C9 — generate-household-meal-v1:1643-1648 et :1674-1680 :
            si l'union des contraintes du foyer est illisible, la génération
            REFUSE (503 `safety_constraints_unreadable`), elle ne devine pas.
            C'est la preuve la plus forte du produit, donc elle est au hall.
            ⚠️ Ni « partout » ni « dans chaque réponse »: `plan_question` ne
            relit pas l'union (FF-046 §7 trou n°8). */}
        <p className="mt-6 max-w-[68ch] text-lede leading-8 text-ink-soft">
          {t("home.proof.body")}
        </p>
      </Section>

      <Section>
        <Kicker>{t("home.doors.kicker")}</Kicker>
        <SectionTitle>{t("home.doors.title")}</SectionTitle>
        {/* Les trois portes. « C'est pour moi si… » plutôt qu'un nom de
            segment: personne ne se reconnaît dans « le solo », tout le monde se
            reconnaît dans une phrase qui décrit sa semaine.
            fact: C13 — onboarding.ts:84 `FunnelBranch = solo | pair | family`:
            les trois portes correspondent à trois branches RÉELLES du parcours
            d'entrée, donc la promesse de la porte est tenue à l'étape d'après. */}
        <ul className="mt-10 grid gap-5 md:grid-cols-3">
          {DOORS.map((door) => (
            <li key={door.to} className="min-w-0">
              <Link
                to={door.to}
                className="group flex h-full flex-col rounded-fiche border border-line bg-paper p-6 transition-colors hover:border-line-strong"
              >
                <span className="eq text-label font-semibold uppercase text-ink-soft">
                  {t(door.label)}
                </span>
                <span className="mt-3 font-display text-sub">{t(door.title)}</span>
                <span className="mt-3 text-sm leading-6 text-ink-soft">
                  {t(door.body)}
                </span>
                <span className="mt-5 text-sm font-medium text-fig-700 group-hover:underline">
                  {t(door.cta)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </Section>

      <Section tone="alt">
        <SectionTitle>{t("home.close.title")}</SectionTitle>
        <p className="mt-5 max-w-[62ch] leading-7 text-ink-soft">
          {t("home.close.body")}
        </p>
        <div className="mt-8">
          <ButtonLink to="/start" variant="brand" className="px-6 py-3 text-base">
            {t("home.close.cta")}
          </ButtonLink>
        </div>
      </Section>

      <PublicFooter />
    </div>
  );
}

export default HomePage;
