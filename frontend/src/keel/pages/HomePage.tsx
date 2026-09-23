import React from "react";
import { Navigate } from "react-router-dom";
import { ArrowDown, ArrowUpRight, Camera, Check, ChevronDown, MessageSquareText, ShoppingBasket, Sparkles, Utensils } from "lucide-react";
import SEO from "../../components/SEO";
import { useAuth } from "../../context/AuthContext";
import { LEGAL_ENTITY } from "../../lib/legalEntity";
import { localeHref } from "../i18n/links";
import { useSalesStructuredData } from "../seo/salesStructuredData";
import { resolveHomePath, type HomePath } from "../api/postLogin";
import { PublicFooter, PublicHeader } from "../components/PublicHeader";
import ServerUnreachable from "../components/ServerUnreachable";
import { ButtonLink } from "../components/ui/Button";
import { Kicker } from "../components/ui/Marketing";
import PlanDemo, { MealPreview } from "../components/home/PlanDemo";
import ConversationExample from "../components/home/ConversationExample";
import MealBoxHero from "../components/home/MealBoxHero";
import UnplannedStage from "../components/home/UnplannedStage";
import HouseholdStage from "../components/home/HouseholdStage";
import { DEMO_MEMBERS, memberName, type DemoGoal } from "../components/home/planDemoData";
import { formatPrice } from "../i18n/format";
import { PRICES } from "../i18n/prices";
import { t, type MessageKey } from "../i18n/t";

const FAQ: ReadonlyArray<{ q: MessageKey; a: MessageKey }> = [
  { q: "home.faq.q7", a: "home.faq.a7" },
  { q: "home.faq.cancel_q", a: "home.faq.cancel_a" },
  { q: "home.faq.q6", a: "home.faq.a6" },
  { q: "home.faq.q2", a: "home.faq.a2" },
  { q: "home.faq.q4", a: "home.faq.a4" },
];

function Section({ id, children, alternate = false }: {
  id?: string;
  children: React.ReactNode;
  alternate?: boolean;
}) {
  // Clear the sticky header when following the public navigation anchors.
  return <section id={id} className={`scroll-mt-28 ${alternate ? "bg-paper-2" : ""}`}>
    <div className="mx-auto max-w-6xl px-5 py-12 sm:px-8 sm:py-16">{children}</div>
  </section>;
}

function Title({ children }: { children: React.ReactNode }) {
  return <h2 className="max-w-[25ch] text-balance font-display text-title text-ink">{children}</h2>;
}

export function HomePage() {
  const { user } = useAuth();
  const [dest, setDest] = React.useState<HomePath | null>(null);
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
    return () => { cancelled = true; };
  }, [userId]);

  // ⚠️ AVANT LES DEUX RETOURS ANTICIPÉS: un hook appelé après un `return`
  // conditionnel ne s'exécute pas au même rendu, et React refuse.
  const structuredData = useSalesStructuredData("/", t("home.seo_description"));

  if (userId && unreachable) return <ServerUnreachable />;
  if (userId && dest) return <Navigate to={dest} replace />;

  return (
    <div className="min-h-screen bg-paper text-ink">
      <SEO title={t("home.seo_title")} description={t("home.seo_description")} canonical={`${LEGAL_ENTITY.siteUrl}/`} structuredData={structuredData} />
      <PublicHeader />
      <Landing />
      <PublicFooter />
    </div>
  );
}

/**
 * LA PHOTO DU PLAT — LE HÉROS DU 2026-09-18, GARDÉ EN SECOURS.
 *
 * ⟳ DEPUIS LE 2026-09-23, LE HÉROS EST LA BOÎTE EN 3D (`MealBoxHero`). Cette
 * photo n'est plus rendue que si WebGL manque ou si le module 3D ne se charge
 * pas: la page retombe alors exactement sur ce qu'elle montrait avant.
 *
 * ⚠️ L'IMAGE PORTE LE FOND JAUNE DU PROTOTYPE EN DUR (1000×1000, aucun alpha).
 * Mesuré dans le navigateur: le bol est un disque de rayon 411 px centré en
 * (507, 505). Le découpage en cercle retire le jaune sans retoucher le fichier;
 * le jour où l'image est refaite sur fond transparent, ce `clipPath` part avec.
 *
 * ⟳ SANS PARALLAXE: la version d'avant déplaçait la photo au défilement
 * (`framer-motion`). La page n'importe plus cette dépendance, et l'effet n'était
 * de toute façon pas rendu pour qui demande moins d'animations.
 */
function HeroVisual() {
  // ⟳ « LE PLAISIR FAIT PARTIE DU PLAN » A ÉTÉ RETIRÉ LE 2026-09-18 (demande du
  // propriétaire). C'était le sur-titre centré au-dessus de la photo; la clé
  // `home.hero.label_pleasure` reste dans les deux packs, sans lecteur.
  return <div className="relative mx-auto w-full max-w-[460px]">
    <div className="relative">
      <div aria-hidden="true" className="absolute inset-6 rounded-full bg-fig-100 blur-2xl" />
      <img
        src="/landing-assets/hero-chicken-bowl.webp"
        alt={t("home.hero.visual_alt")}
        width="1000"
        height="1000"
        fetchPriority="high"
        className="relative block w-full [clip-path:circle(41%_at_50.7%_50.5%)]"
      />
      <div className="absolute left-0 top-6 flex max-w-[15rem] items-center gap-3 rounded-fiche border border-line bg-paper/95 px-4 py-3 shadow-[0_12px_30px_rgba(42,28,35,0.12)] backdrop-blur">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-fig-100 text-fig-700">
          <Utensils size={18} aria-hidden="true" />
        </span>
        <span className="min-w-0">
          <span className="block text-label font-semibold uppercase text-ink-soft">{t("home.hero.label_menu_kicker")}</span>
          <span className="block text-sm font-medium text-ink">{t("home.hero.label_menu")}</span>
        </span>
      </div>
      <div className="absolute bottom-8 right-0 flex items-center gap-2 rounded-full bg-fig-950 px-4 py-2 text-sm text-paper shadow-[0_12px_30px_rgba(42,28,35,0.25)]">
        <Sparkles size={16} aria-hidden="true" className="text-fig-300" />
        {t("home.hero.label_cooked")}
      </div>
    </div>
  </div>;
}

/** Six sections, one purpose each: promise, example, unplanned meal, follow-up, household, offer. */
function Landing() {
  // L'objectif choisi dans le héros gouverne aussi l'exemple de la section
  // suivante: les grammes de la boîte et ceux de « Exemple de repas » sont les
  // mêmes, ils ne doivent jamais se contredire à l'écran.
  const [goal, setGoal] = React.useState<DemoGoal>("fat_loss");
  const startHref = localeHref("/start");
  const household = formatPrice(PRICES.household);
  const extra = formatPrice(PRICES.claimedProfile);

  return <main>
    <Section id="top">
      {/* ⚠️ 1.08/0.92 ET PAS PLUS À DROITE: la colonne du titre doit garder
          ~560 px à 1440, sinon « prendre du muscle. » (554 px en Young Serif
          58 px, mesuré) passe à la ligne et le titre tient sur quatre lignes. */}
      <div className="grid items-center gap-9 lg:grid-cols-[1.08fr_0.92fr] lg:gap-10">
        <div>
          <Kicker>{t("home.hero.eyebrow")}</Kicker>
          <h1 className="mt-4 max-w-[19ch] text-balance font-display text-[clamp(2.25rem,4.2vw,3.65rem)] leading-[1.14] text-ink">
            {t("home.hero.title_1")} <span className="text-fig-700">{t("home.hero.title_2")}</span>
          </h1>
          <p className="mt-5 max-w-[44ch] text-lede text-ink-soft">{t("home.hero.lede")}</p>
          <div className="mt-7 flex flex-wrap items-center gap-x-5 gap-y-2">
            <ButtonLink to={startHref} variant="brand" className="px-5 py-3 text-base">
              {t("home.hero.cta")} <ArrowUpRight size={18} aria-hidden="true" />
            </ButtonLink>
            <a href="#experience" className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-fig-700 underline underline-offset-4">
              {t("home.hero.example")} <ArrowDown size={16} aria-hidden="true" />
            </a>
          </div>
          <p className="mt-3 text-[13px] leading-5 text-ink-soft">{t("home.hero.trial", { amount: household })}</p>
        </div>
        <MealBoxHero goal={goal} onGoalChange={setGoal} fallback={<HeroVisual />} />
      </div>
    </Section>

    <Section id="experience" alternate>
      <div className="grid items-start gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:gap-14">
        <div>
          <Title>{t("home.plan.title_1")}</Title>
          <p className="mt-4 max-w-[44ch] text-[16px] leading-7 text-ink-soft">{t("home.plan.body")}</p>
        </div>
        {/* ⚠️ L'APERÇU CHIFFRÉ A QUITTÉ LE HÉROS le 2026-09-18 — la photo y est
            revenue. Il reste sur la page, ici, où il est à sa place: c'est la
            section qui promet des quantités, et il les montre avant le flux. */}
        <MealPreview goal={goal} />
      </div>
      <div className="mt-8"><PlanDemo goal={goal} /></div>
    </Section>

    {/* ⚠️ LE REPAS HORS PLAN A SA SECTION — 2026-09-18, DEUXIÈME DÉPLACEMENT.
        Ses deux phrases ont d'abord vécu en légende d'une carte et en note de
        marge; elles portent en fait LE MÊME SUJET, qui n'est ni le suivi ni le
        plan: ce qu'on fait du repas que personne n'avait prévu, et ce que vaut
        une photo comparée à un gramme écrit d'avance. Le titre du produit
        existait déjà (`home.life.*`), la mesure aussi.

        ⚠️ ELLE PASSE AVANT « SOPHIA VIENT VERS TOI » (même jour, demande du
        propriétaire): l'imprévu arrive d'abord, et c'est PARCE QU'il arrive que
        Sophia demande ensuite ce qui a été mangé. Dans l'autre sens, la troisième
        bulle posait sa question avant qu'on ait dit qu'un repas peut sortir du
        plan. Les deux fonds ont suivi l'échange — l'alternance tient à l'ORDRE
        des sections, pas au bloc: la première est claire, la seconde teintée.

        ⛔ AUCUN CONTRÔLE DANS CE BLOC. Les deux moyens sont NOMMÉS, pas offerts:
        le pack porte encore un `home.life.demo.send` (« Envoyer ») de la version
        d'avant — le rendre ici poserait un bouton qui n'envoie rien. */}
    <Section id="imprevu">
      <div className="grid items-center gap-8 lg:grid-cols-2 lg:gap-14">
        <div>
          <Kicker>{t("home.life.kicker")}</Kicker>
          <div className="mt-3"><Title>{t("home.life.title_1")} <span className="text-fig-700">{t("home.life.title_2")}</span></Title></div>
          <p className="mt-4 max-w-[46ch] text-[16px] leading-7 text-ink-soft">{t("home.life.body")}</p>
          <ul className="mt-6 grid gap-3 sm:grid-cols-2">
            {([
              { icon: MessageSquareText, label: "home.life.demo.describe", example: "home.life.demo.example" },
              { icon: Camera, label: "home.life.demo.photo", example: "home.life.demo.photo_example" },
            ] as const).map(({ icon: Icon, label, example }) => <li key={label} className="rounded-fiche border border-line bg-paper p-4">
              <p className="flex items-center gap-2 text-sm font-semibold text-ink">
                <Icon size={16} aria-hidden="true" className="text-fig-700" />{t(label)}
              </p>
              <p className="mt-1 text-[13px] leading-5 text-ink-soft">{t(example)}</p>
            </li>)}
          </ul>
        </div>
        {/* ⟳ 2026-09-23 — LA PHOTO, EN 3D. La scène montre le geste (une photo
            prise à table, ce qui est reconnu, compté); l'encart dessous dit ce
            que ce geste vaut. */}
        <UnplannedStage />
      </div>
      {/* Les deux nombres sont une MESURE (85 analyses réelles, vérité terrain
          USDA — `docs/keel/PHOTO_QUANTIFICATION.md`), jamais une promesse.

          ⟳ 2026-09-23 — SUR TOUTE LA LARGEUR, et SANS LA LIGNE DE SOURCE
          (deux demandes du propriétaire, le même soir). La phrase « Mesuré sur
          85 repas réels… » a quitté l'encart; la clé `home.plan.precision_source`
          reste dans les deux packs, sans lecteur. La mesure, elle, est toujours
          documentée dans le fichier ci-dessus. */}
      <aside className="mt-8 rounded-fiche border border-line-strong bg-paper p-5 sm:p-6 lg:mt-10 lg:px-8">
        <p className="text-label font-semibold uppercase tracking-wide text-fig-700">{t("home.plan.precision_label")}</p>
        <p className="mt-2 text-[15px] leading-6 text-ink">{t("home.plan.precision")}</p>
      </aside>
    </Section>

    <Section alternate>
      <div className="grid items-center gap-7 lg:grid-cols-2 lg:gap-14">
        <div>
          <Kicker>{t("home.reach.kicker")}</Kicker>
          <div className="mt-3"><Title>{t("home.reach.title_1")} <span className="text-fig-700">{t("home.reach.title_2")}</span></Title></div>
          <p className="mt-4 max-w-[42ch] text-[16px] leading-7 text-ink-soft">{t("home.reach.body")}</p>
        </div>
        <ConversationExample />
      </div>
    </Section>

    <Section id="a-table">
      <div className="grid items-center gap-7 lg:grid-cols-2 lg:gap-14">
        <div>
          <Title>{t("home.house.title_1")}</Title>
          <p className="mt-4 max-w-[46ch] text-[16px] leading-7 text-ink-soft">{t("home.house.body_1")}</p>
          {/* ⟳ 2026-09-23 — TROIS BOÎTES, UNE PAR PERSONNE, EN 3D. Elles
              arrivent, se remplissent chacune à sa part et se ferment sur leur
              étiquette: le prénom et le besoin de la carte d'à côté. */}
          <div className="mt-6"><HouseholdStage /></div>
        </div>
        <div className="rounded-fiche border border-line bg-paper p-5">
          <ul className="space-y-3">
            {DEMO_MEMBERS.map((member) => <li key={member.id} className="flex items-center gap-3">
              <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-full bg-fig-100 text-sm font-semibold text-fig-700">{memberName(member.id).slice(0, 1)}</span>
              <span className="min-w-0 text-sm"><strong className="font-semibold text-ink">{memberName(member.id)}</strong><span className="block text-ink-soft">{t(member.noteKey)}</span></span>
            </li>)}
          </ul>
          <p className="mt-4 flex items-center gap-2 border-t border-line pt-4 text-sm font-medium text-fig-700"><ShoppingBasket size={18} aria-hidden="true" />{t("home.house.shared_list")}</p>
        </div>
      </div>

      {/* ⟳ 2026-09-23 — L'ACCÈS SUPPLÉMENTAIRE (1,99 €) A QUITTÉ CETTE SECTION
          pour la FAQ (`home.faq.q4`), demande du propriétaire. La carte montrait
          un supplément AVANT le prix du foyer, à une page qui s'adresse à une
          personne seule; sa dernière ligne ne servait qu'à défaire le doute
          qu'elle créait. La réponse de la FAQ garde cette ligne: sans elle, on
          croit que chaque bouche se paie. Les clés `home.offer.coaching.*`
          restent dans les deux packs, sans lecteur. */}
    </Section>

    <Section id="offre" alternate>
      <div className="mx-auto max-w-2xl rounded-fiche border border-line-strong bg-paper p-6 sm:p-8">
        <Title>{t("home.offer.title_1")}</Title>
        <p className="mt-4 text-lg text-ink">{t("home.offer.price", { amount: household })}</p>
        <p className="mt-4 text-[15px] leading-6 text-ink-soft">{t("home.offer.body")}</p>
        <p className="mt-4 flex items-center gap-2 text-sm text-ink"><Check size={16} aria-hidden="true" />{t("home.offer.check_commit")}</p>
        <ButtonLink to={startHref} variant="brand" className="mt-5 w-full justify-center px-5 py-3 text-base">
          {t("home.hero.cta")} <ArrowUpRight size={18} aria-hidden="true" />
        </ButtonLink>
      </div>
      <div id="questions" className="mx-auto mt-10 max-w-2xl scroll-mt-28">
        <h2 className="mb-3 font-display text-xl text-ink">{t("home.faq.title_1")}</h2>
        <div className="divide-y divide-line">
          {FAQ.map(({ q, a }) => <details key={q} className="group py-4">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[15px] font-medium text-ink">
              {t(q)}<ChevronDown size={18} aria-hidden="true" className="shrink-0 text-ink-soft transition-transform group-open:rotate-180" />
            </summary>
            <p className="mt-3 text-sm leading-6 text-ink-soft">{t(a, { household, extra })}</p>
          </details>)}
        </div>
      </div>
    </Section>
  </main>;
}

export default HomePage;
