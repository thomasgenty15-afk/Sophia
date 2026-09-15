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
import { t, type MessageKey } from "../i18n/t";

/**
 * `/pro` — LE HALL DES PROFESSIONNELS. Refonte « par la douleur » 2026-08-13.
 *
 * UN HALL NE REPREND PAS les douleurs d'un segment: il montre les
 * fonctionnalités principales, chacune accrochée à la douleur COMMUNE qu'elle
 * retire, puis il s'arrête — l'argument complet d'un acheteur appartient à SA
 * page, et les trois portes descendent pour ça dans la clôture. Un hall qui
 * grossit vend aux trois acheteurs à la fois, c'est-à-dire à personne: ≤ 245
 * lignes, pas plus de mots qu'avant, et une GRILLE DE CINQ LIGNES au lieu des
 * quatre bandes d'une page segment. ⚠️ SIX à l'origine: la ligne « chaque ligne
 * cite la conviction » (B27) a été retirée le 2026-08-19 avec la lane qui la
 * tenait — voir le commentaire à sa place, et n'en réécris pas l'équivalent.
 *
 * ⚠️ LE VOCABULAIRE EST LE PIÈGE DE CETTE PAGE: les gens qu'un pro accompagne
 * sont des CLIENTS ici, « élèves » étant le mot de `/coaches` SEULEMENT —
 * l'ancien `pro.proof.title` disait « student », sa clé est supprimée.
 * ⛔ « suivi personnalisé » (S2), ⛔ « votre équipe » (B20: une salle à trois
 * coachs est UN compte), ⛔ marque personnalisée ou white-label (B18/B19),
 * ⛔ canal 1:1 (S1), ⛔ bande de risque ou score d'adhérence (S9, B15),
 * ⛔ chiffre sans source (S8) et surtout de rétention (B31): aucun, nulle part.
 * ⚠️ ÉCARTÉES DE CE HALL EXPRÈS: la note privée sur un client (« utilisée jamais
 * citée » est une promesse de PROMPT, sans vérificateur — B26) et le tap du soir
 * (posé sur un hall, il ressemble à du suivi).
 * ⚠️ LE DOUBLE VERROU EST FORMULÉ COMME L'AUDIT L'IMPOSE (B8b), ligne 03.
 */

const STRUCTURED_DATA = [
  {
    "@context": "https://schema.org", "@type": "WebPage", name: t("pro.seo_title"),
    url: `${LEGAL_ENTITY.siteUrl}/pro`, description: t("pro.seo_description"),
    publisher: organizationStructuredData(),
  },
];

/**
 * Les trois portes — en COMPACT, dans la clôture: elles restent le seul chemin
 * en page vers les trois pages segment. ⚠️ Clés écrites en toutes lettres,
 * jamais par gabarit — même note que dans `HomePage.tsx`.
 */
const DOORS = [
  { to: "/coaches", title: "pro.door.coaches.title", body: "pro.door.coaches.body", cta: "pro.door.coaches.cta" },
  { to: "/gyms", title: "pro.door.gyms.title", body: "pro.door.gyms.body", cta: "pro.door.gyms.cta" },
  { to: "/communities", title: "pro.door.communities.title", body: "pro.door.communities.body", cta: "pro.door.communities.cta" },
] as const;

const Section = ({ children, tone = "paper" }: { children: React.ReactNode; tone?: "paper" | "alt" }) => (
  <section className={tone === "alt" ? "bg-paper-2" : ""}>
    <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-24">{children}</div>
  </section>
);

/**
 * UNE LIGNE DU HALL — deux cellules: la douleur commune, puis ce qui la retire.
 * Le numéro n'est pas un ornement: les six lignes sont ordonnées par force de
 * vente (grille des douleurs), donc l'ordre porte une information. La douleur est
 * en `text-lede`, la réponse en display — un lecteur qui ne lit que la colonne
 * de gauche traverse la page par ce qui lui arrive à LUI.
 * ⚠️ `min-w-0` sur LES DEUX cellules, pas seulement celle de la figure: un
 * enfant de grille a `min-width: auto`, et le plancher de 380 px de
 * `.fig-scroll` remonterait à la piste et ferait défiler LA PAGE (charte §5).
 */
type LineProps = { n: string; pain: MessageKey; title: MessageKey; body: MessageKey; children?: React.ReactNode };
const Line = ({ n, pain, title, body, children }: LineProps) => (
  <li className="grid gap-4 border-t border-line py-9 md:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] md:gap-12">
    <div className="min-w-0">
      <span className="block text-label font-semibold uppercase text-fig-700">{n}</span>
      <p className="mt-3 max-w-[34ch] text-lede leading-7 text-ink">{t(pain)}</p>
    </div>
    <div className="min-w-0">
      <h3 className="font-display text-sub">{t(title)}</h3>
      <p className="mt-3 max-w-[62ch] leading-7 text-ink-soft">{t(body)}</p>
      {children}
    </div>
  </li>
);

/**
 * La figure de la ligne 03: la méthode écrite une fois, relue avant l'envoi.
 * Elle montre un message RETENU, pas une réussite — c'est l'aveu qui rend la
 * garantie croyable, et la seule moitié qu'un lecteur ne peut pas obtenir d'un
 * prompt. ⚠️ GÉOMÉTRIE MESURÉE DANS LA LANGUE LONGUE (le français): boîtes de
 * gauche 176 unités, texte à x=20 ⇒ 164 utilisables; boîtes de droite 142, texte
 * à x=342 ⇒ 118. Le premier jet donnait 132 et 106, et « replaced by your words »
 * (130) sortait. Toute étiquette ajoutée se vérifie DANS LES DEUX LANGUES.
 */
const LockFigure = () => (
  <svg viewBox="0 0 480 210" role="img" aria-labelledby="lock-t" className="w-full">
    <title id="lock-t">{t("pro.fig.alt")}</title>
    <g fill="none" stroke="var(--ill-ink)" strokeWidth="2">
      <rect x="8" y="26" width="176" height="66" rx="8" fill="var(--ill-wash)" />
      <rect x="8" y="122" width="176" height="66" rx="8" fill="var(--ill-paper)" />
      <rect x="220" y="72" width="80" height="70" rx="8" fill="var(--ill-paper)" />
      <rect x="330" y="26" width="142" height="66" rx="8" fill="var(--ill-paper)" />
      <rect x="330" y="122" width="142" height="66" rx="8" fill="var(--ill-wash)" />
      <path d="M184 60h36M184 156h36M300 92h30M300 122h30" stroke="var(--ill-ink-soft)" strokeWidth="1" />
    </g>
    {/* La barre figue: le point où la relecture a lieu. UNE pièce chaude. */}
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
      <SEO title={t("pro.seo_title")} description={t("pro.seo_description")}
        canonical={`${LEGAL_ENTITY.siteUrl}/pro`} structuredData={STRUCTURED_DATA} />
      <PublicHeader />

      {/* ⚠️ LE REPÈRE `main`, AJOUTÉ LE 2026-08-13. Les six pages segment en
          avaient un, les deux halls non — mesuré au rendu. Sans lui, un
          lecteur d'écran n'a aucun « aller au contenu » sur les deux pages
          qui sont justement les portes d'entrée du site. */}
      <main>
      <Section>
        <Kicker>{t("pro.hero.kicker")}</Kicker>
        <h1 className="mt-3 max-w-[22ch] text-balance font-display text-hero">{t("pro.hero.title")}</h1>
        <p className="mt-6 max-w-[58ch] text-lede text-ink-soft">{t("pro.hero.lede")}</p>
        <div className="mt-8">
          <ButtonLink to="/auth?role=coach" variant="brand" className="px-6 py-3 text-[1rem]">{t("pro.hero.cta")}</ButtonLink>
        </div>
        {/* fact: B5 — 20260727235000_keel_billing_seats.sql:110-136 (14 jours, 3
            sièges, puis ça s'arrête seul) · fact: B1 —
            stripe-create-checkout-session:120-125, `legacyTierPriceId = null`. */}
        <p className="mt-5 max-w-[52ch] text-sm leading-6 text-ink-soft">{t("pro.hero.note")}</p>
      </Section>

      <Section>
        <Kicker>{t("pro.lines.kicker")}</Kicker>
        <SectionTitle>{t("pro.lines.title")}</SectionTitle>
        <ul className="mt-12">
          {/* fact: `coaches.doctrine_source = 'house'` (migration 20260806230000)
              · `_shared/keel/doctrine_delegation.ts`, résolu UNE fois et câblé
              aux DEUX endroits qui signent (`doctrine_loader.ts`,
              `keel-coach-broadcast-v1`): un client ne voit jamais deux identités.
              ⏳ Le chemin existe, le CONTENU de la doctrine maison s'écrit
              encore — la ligne le DIT au lieu de le taire. */}
          <Line n="01" pain="pro.line.method.pain" title="pro.line.method.title" body="pro.line.method.body" />
          {/* fact: B10 — TROIS points d'injection depuis le 2026-08-19:
              run.ts:2448 · generate-meal-v1:1729 · generate-household-meal-v1:3569
              — les trois sont `doctrineBlockFor(doctrine)`, relus ce jour-là.
              ⚠️ Le quatrième (`generate-week-plan-v1:618`) est parti avec sa lane,
              retirée faute d'un seul appelant vivant: la copie disait « quatre
              endroits » dont un que l'élève ne pouvait pas atteindre.
              ⚠️ Les huit numéros recopiés de l'audit pointaient des fragments de commentaire:
              revérifiés un par un le 2026-08-13. */}
          <Line n="02" pain="pro.line.daily.pain" title="pro.line.daily.title" body="pro.line.daily.body" />
          {/* fact: B8b, le SENS EST IMPOSÉ. Injection: doctrine.ts:194 et :788-789
              · relecture du chat: `findDoctrineViolations` (doctrine.ts:1077) sur
              le texte visible avant l'envoi, sans modèle dans la boucle. Les
              quatre surfaces NON scannées (relance, récap du soir, bilan du
              dimanche, broadcast — B8) sont la raison pour laquelle la ligne dit
              « dans le chat » et jamais « chaque message ». fact: B9 — chaque
              ligne rouge porte son `instead` dans les mots du coach: la figure. */}
          <Line n="03" pain="pro.line.lock.pain" title="pro.line.lock.title" body="pro.line.lock.body">
            <figure className="m-0 mt-7">
              <div className="fig-scroll"><LockFigure /></div>
              <figcaption className="mt-4 max-w-[62ch] text-sm leading-6 text-ink-soft">{t("pro.fig.caption")}</figcaption>
            </figure>
          </Line>
          {/* fact: B11 — cron `'0 6 * * 1'` (20260803090000:90-116) et
              `renderSynthesisText` PUR (coach_synthesis.ts:516-641): calculée,
              jamais narrée par un modèle · fact: B14 — coach_synthesis.ts:64-65,
              48 h et 120 h sur le dernier message ENTRANT · fact: B17 —
              coach_synthesis_io.ts:171-187, cohorte scopée. ⛔ Rien de S9/B15. */}
          <Line n="04" pain="pro.line.monday.pain" title="pro.line.monday.title" body="pro.line.monday.body" />
          {/* ⚠️ LA LIGNE 05 A ÉTÉ RETIRÉE LE 2026-08-19, ET ELLE NE REVIENT PAS
              REFORMULÉE. Elle portait B27 — « chaque ligne cite la conviction
              qu'elle applique » — adossée au CHECK
              `student_week_plans_doctrine_traceable_check`
              (20260803210000:87-113). Ce CHECK n'a plus d'écrivain: la lane
              `generate-week-plan-v1` a été retirée le même jour, faute d'un
              seul appelant vivant. La garantie n'était donc déjà tenue pour
              PERSONNE — la garder ne l'honorait pas, elle en donnait
              l'apparence.
              ⛔ NE PAS LA REMPLACER PAR UNE PROMESSE ÉQUIVALENTE SUR LES PLATS:
              `generated_from.belief_keys` porte la provenance du PLAN, pas
              d'une ligne, et c'est annoté « jamais exigé, jamais vérifié par un
              CHECK » (_shared/keel/meal_generation.ts). Une page de vente ne
              redit cette garantie que le jour où un CHECK la tient. */}
          {/* fact: B1 (le siège est le seul poste) · fact: B4 —
              stripe-reconcile-seats:18-35 RECALCULE depuis le ledger, jamais un
              incrément. ⛔ Pas de « 6 € quand votre client a payé son année » (B2,
              FAUX: l'intervalle est celui du COACH), ⛔ pas de « positif dès le
              premier client » (B6: zéro client refusé au checkout). */}
          <Line n="05" pain="pro.line.seat.pain" title="pro.line.seat.title" body="pro.line.seat.body" />
        </ul>
      </Section>

      <Section tone="alt">
        {/* fact: B31 — rien dans le dépôt ne mesure le churn contre un témoin.
            Meilleure ligne des trois anciennes pages, gardée telle quelle. */}
        <SectionTitle>{t("pro.close.title")}</SectionTitle>
        <p className="mt-5 max-w-[62ch] leading-7 text-ink-soft">{t("pro.close.body")}</p>
        <div className="mt-8">
          <ButtonLink to="/auth?role=coach" variant="brand" className="px-6 py-3 text-[1rem]">{t("pro.close.cta")}</ButtonLink>
        </div>
        <h3 className="mt-16 font-display text-sub">{t("pro.doors.title")}</h3>
        <ul className="mt-6 grid gap-6 border-t border-line pt-6 sm:grid-cols-3 sm:gap-8">
          {DOORS.map((door) => (
            <li key={door.to} className="min-w-0">
              <Link to={door.to} className="group flex h-full flex-col">
                <span className="font-medium text-ink">{t(door.title)}</span>
                <span className="mt-2 text-sm leading-6 text-ink-soft">{t(door.body)}</span>
                <span className="mt-auto pt-3 text-sm font-medium text-fig-700 group-hover:underline">{t(door.cta)}</span>
              </Link>
            </li>
          ))}
        </ul>
      </Section>
      </main>

      <PublicFooter />
    </div>
  );
}

export default ProPage;
