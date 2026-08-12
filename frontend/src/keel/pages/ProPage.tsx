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
 * `/pro` — LE HALL DES PROFESSIONNELS. Refonte du 2026-08-12.
 *
 * Même forme que `/` (voir son en-tête pour ce qu'un hall s'interdit): la
 * promesse commune, la preuve la plus forte, les trois portes. ≤ 245 lignes.
 *
 * ── LES SILENCES DE CE MONDE, QUI S'APPLIQUENT ICI AUSSI ──────────────────
 * S1 — il n'existe AUCUN canal 1:1 coach → élève, et cette absence est le
 *   produit, pas un manque. Rien ici ne doit évoquer une boîte de réception,
 *   une file de réponses ou un « votre coach vous répondra ».
 * S2 — le vocabulaire est élèves / cohorte / votre méthode / votre voix.
 *   Jamais « vos clients », jamais « suivi personnalisé ».
 * S8 — un chiffre vient d'une source qu'on peut montrer, ou il n'apparaît pas.
 * S10 — on ne montre pas un écran qu'on n'a pas.
 * B18/B19 — il n'existe AUCUNE personnalisation de marque: ni colonne, ni
 *   écran, ni chaîne. Ne jamais dériver vers « sous votre marque ».
 * B20 — une salle à trois coachs est UN compte coach. Jamais « votre équipe ».
 *
 * ⚠️ LA FORMULATION DU DOUBLE VERROU EST CELLE DE L'AUDIT (B8b), et pas celle
 * que les trois anciennes pages employaient. « La doctrine entre à chaque
 * message » est faux (un seul appelant, le composeur — routers.ts:540-547 le
 * dit), et « chaque message sortant est vérifié » est faux aussi (quatre
 * surfaces scannées, quatre non scannées). Ce qui est écrit ici est vrai.
 */

const STRUCTURED_DATA = [
  {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: t("pro.seo_title"),
    url: `${LEGAL_ENTITY.siteUrl}/pro`,
    description: t("pro.seo_description"),
    publisher: organizationStructuredData(),
  },
];

/**
 * Les trois portes du monde pro.
 *
 * ⚠️ Clés écrites en toutes lettres, jamais construites par gabarit — voir la
 * même note dans `HomePage.tsx`.
 */
const DOORS = [
  {
    to: "/coaches",
    label: "pro.door.coaches.label",
    title: "pro.door.coaches.title",
    body: "pro.door.coaches.body",
    cta: "pro.door.coaches.cta",
  },
  {
    to: "/gyms",
    label: "pro.door.gyms.label",
    title: "pro.door.gyms.title",
    body: "pro.door.gyms.body",
    cta: "pro.door.gyms.cta",
  },
  {
    to: "/communities",
    label: "pro.door.communities.label",
    title: "pro.door.communities.title",
    body: "pro.door.communities.body",
    cta: "pro.door.communities.cta",
  },
] as const;

const Section = ({
  children,
  tone = "paper",
}: {
  children: React.ReactNode;
  tone?: "paper" | "alt" | "dark";
}) => (
  <section
    className={
      tone === "alt" ? "bg-paper-2" : tone === "dark" ? "on-dark bg-fig-950 text-paper" : ""
    }
  >
    <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-24">{children}</div>
  </section>
);

/**
 * La figure du hall: la méthode écrite une fois, relue avant l'envoi.
 *
 * Elle montre un message RETENU, pas une réussite: c'est l'aveu qui rend la
 * garantie croyable, et c'est la seule des deux moitiés qu'un lecteur ne peut
 * pas obtenir d'un prompt.
 */
const LockFigure = () => (
  <svg viewBox="0 0 480 210" role="img" aria-labelledby="lock-t" className="w-full">
    <title id="lock-t">{t("pro.fig.alt")}</title>
    {/* ⚠️ GÉOMÉTRIE MESURÉE DANS LA LANGUE LONGUE (le français).
        Boîtes de gauche: 176 unités de large, texte à x=20 ⇒ 164 utilisables.
        Boîtes de droite: 142, texte à x=342 ⇒ 118 utilisables. Le premier jet
        donnait 132 et 106, et « replaced by your words » (130) sortait de la
        figure — vu au rendu, pas au calcul. Toute étiquette ajoutée se vérifie
        dans les DEUX langues avant d'être livrée. */}
    <g fill="none" stroke="var(--ill-ink)" strokeWidth="2">
      <rect x="8" y="26" width="176" height="66" rx="8" fill="var(--ill-wash)" />
      <rect x="8" y="122" width="176" height="66" rx="8" fill="var(--ill-paper)" />
      <rect x="220" y="72" width="80" height="70" rx="8" fill="var(--ill-paper)" />
      <rect x="330" y="26" width="142" height="66" rx="8" fill="var(--ill-paper)" />
      <rect x="330" y="122" width="142" height="66" rx="8" fill="var(--ill-wash)" />
      <path d="M184 60h36M184 156h36M300 92h30M300 122h30" stroke="var(--ill-ink-soft)" strokeWidth="1" />
    </g>
    {/* La barre figue: le point où la relecture a lieu. Une seule pièce chaude
        par figure — règle de la charte. */}
    <rect x="220" y="72" width="5" height="70" fill="var(--ill-fig)" />
    <g fontSize="12" fill="var(--ill-ink-soft)">
      <text x="20" y="58" fill="var(--ill-ink)">{t("pro.fig.method")}</text>
      <text x="20" y="76">{t("pro.fig.method_2")}</text>
      <text x="20" y="154" fill="var(--ill-ink)">{t("pro.fig.lines")}</text>
      <text x="20" y="172">{t("pro.fig.lines_2")}</text>
      <text x="262" y="112" textAnchor="middle" fill="var(--ill-ink)">{t("pro.fig.check")}</text>
      <text x="342" y="58" fill="var(--ill-ink)">{t("pro.fig.sent")}</text>
      <text x="342" y="154" fill="var(--ill-ink)">{t("pro.fig.held")}</text>
      <text x="342" y="172">{t("pro.fig.held_2")}</text>
    </g>
  </svg>
);

export function ProPage() {
  const { user } = useAuth();
  const [dest, setDest] = React.useState<HomePath | null>(null);
  // Voir `HomePage.tsx`: `null` veut dire « rien lu », pas « pas d'espace ».
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

  if (userId && unreachable) return <ServerUnreachable />;
  if (userId && dest) return <Navigate to={dest} replace />;

  return (
    <div className="min-h-screen bg-paper text-ink">
      <SEO
        title={t("pro.seo_title")}
        description={t("pro.seo_description")}
        canonical={`${LEGAL_ENTITY.siteUrl}/pro`}
        structuredData={STRUCTURED_DATA}
      />
      <PublicHeader />

      <Section>
        <div className="grid gap-11 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:gap-16">
          <div>
            <Kicker>{t("pro.hero.kicker")}</Kicker>
            <h1 className="mt-3 text-balance font-display text-hero">
              {t("pro.hero.title")}
            </h1>
            <p className="mt-6 max-w-[62ch] text-lede text-ink-soft">
              {t("pro.hero.lede")}
            </p>
            <div className="mt-8">
              <ButtonLink
                to="/auth?role=coach"
                variant="brand"
                className="px-6 py-3 text-base"
              >
                {t("pro.hero.cta")}
              </ButtonLink>
            </div>
            {/* fact: B5 — 20260727235000_keel_billing_seats.sql:110-136 :
                14 jours, 3 élèves, puis ça s'arrête tout seul.
                fact: B1 — stripe-create-checkout-session:120-125 : le siège est
                le seul poste, il n'y a pas de forfait plateforme. */}
            <p className="mt-5 max-w-[52ch] text-sm leading-6 text-ink-soft">
              {t("pro.hero.note")}
            </p>
          </div>
          {/* fact: B8b — la formulation tenable du double verrou.
              Injection: run.ts:1441,2503 · generate-week-plan-v1:338,541 ·
              generate-meal-v1:576,1038 · generate-household-meal-v1:1602,2249.
              Relecture du chat: keel_output_locks.ts:307 via `finalVisibleText`
              (run.ts:2820), déterministe, sans modèle dans la boucle. */}
          <figure className="m-0 min-w-0">
            <div className="fig-scroll">
              <LockFigure />
            </div>
            <figcaption className="mt-4 max-w-[62ch] text-sm leading-6 text-ink-soft">
              {t("pro.fig.caption")}
            </figcaption>
          </figure>
        </div>
      </Section>

      <Section tone="dark">
        <Kicker onDark>{t("pro.proof.kicker")}</Kicker>
        <SectionTitle>{t("pro.proof.title")}</SectionTitle>
        {/* fact: B9 — keel_output_locks.ts:99-113 et run.ts:2825-2834 : chaque
            ligne rouge porte son `instead`, dans les mots du coach, signé de son
            nom. L'élève ne reçoit jamais un refus, jamais un « demande à ton
            coach » — ce qui compte double puisque ce canal n'existe pas (S1). */}
        <p className="mt-6 max-w-[68ch] text-lede leading-8 text-paper/80">
          {t("pro.proof.body")}
        </p>
      </Section>

      <Section>
        <Kicker>{t("pro.doors.kicker")}</Kicker>
        <SectionTitle>{t("pro.doors.title")}</SectionTitle>
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
        <SectionTitle>{t("pro.close.title")}</SectionTitle>
        {/* fact: B31 — rien dans le dépôt ne mesure le churn contre un témoin.
            C'est la meilleure ligne des trois anciennes pages, et elle est
            reprise telle quelle sur les quatre surfaces du monde pro. */}
        <p className="mt-5 max-w-[62ch] leading-7 text-ink-soft">
          {t("pro.close.body")}
        </p>
        <div className="mt-8">
          <ButtonLink
            to="/auth?role=coach"
            variant="brand"
            className="px-6 py-3 text-base"
          >
            {t("pro.close.cta")}
          </ButtonLink>
        </div>
      </Section>

      <PublicFooter />
    </div>
  );
}

export default ProPage;
