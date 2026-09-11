import React from "react";
import { Navigate } from "react-router-dom";
import { motion, useReducedMotion, useScroll, useTransform } from "framer-motion";
import {
  ArrowDown,
  ArrowUpRight,
  Camera,
  Check,
  ChevronDown,
  CookingPot,
  Leaf,
  LineChart,
  MessageSquareText,
  ShoppingBasket,
  Sparkles,
  Utensils,
} from "lucide-react";
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
import PlanDemo from "../components/home/PlanDemo";
import { DEMO_MEMBERS, type DemoGoal, memberName } from "../components/home/planDemoData";
import { formatPrice } from "../i18n/format";
import { PRICES } from "../i18n/prices";
import { t, type MessageKey } from "../i18n/t";

/**
 * `/` — LA SEULE LANDING DU FOYER (refonte du 2026-09-08).
 *
 * ── CE QUI A CHANGÉ ───────────────────────────────────────────────────────
 * Le hall orientait vers trois pages de vente (`/meal-prep`, `/couples`,
 * `/families`). Elles sont RETIRÉES: une seule page vend, à la personne qui a
 * un objectif individuel (perte de poids, prise de muscle) et pour qui le foyer
 * est l'avantage concret. La copie et les faits produit viennent du brief
 * `scratchpad/2026-09-08-0030-POSITIONNEMENT-landing.md`; l'en-tête du bloc
 * `home.*` de `fr.ts` liste les corrections qui font autorité.
 *
 * ── CE QUE LA PAGE MONTRE, ET DANS QUEL ORDRE ─────────────────────────────
 * Le héros, l'objectif (01), les calculs et LA DÉMONSTRATION du plan (02 —
 * `components/home/PlanDemo`, fidèle aux écrans du produit), le fonctionnement
 * dans l'ordre vécu courses → cuisine → repas (03), le foyer (04), l'imprévu
 * (décrire ou photographier → comptabilisé, sans toucher au planning), les
 * arguments du quotidien, l'offre (05) avec l'accès supplémentaire expliqué
 * AVANT d'être compté, la FAQ, et la clôture.
 *
 * ── LE VISUEL ─────────────────────────────────────────────────────────────
 * ⚠️ Une photographie culinaire dans le héros, ce que la charte §1 interdisait
 * (« aucune photographie sur ce site »). Le brief du 2026-09-08 autorise
 * EXPLICITEMENT l'exploration de visuels culinaires. La condition qui reste
 * tenue est la seule qui compte: LA PREUVE EST LA DÉMONSTRATION, PAS LA PHOTO,
 * et c'est elle qui porte la mention « Exemple illustratif » (`home.plan.
 * example_note`). ⚠️ La légende « Suggestion de présentation » sous chaque
 * image a été RETIRÉE le 2026-09-08 par le propriétaire; ne pas la remettre au
 * nom de la charte, c'est une décision. La palette reste la figue: le
 * jaune/vert du prototype n'était pas une charte validée.
 *
 * ── CE QUI N'A PAS BOUGÉ ──────────────────────────────────────────────────
 * Le visiteur connecté est renvoyé vers son espace (`resolveHomePath`), le
 * `<head>` est celui de `home.seo_*` (recopié dans `index.html`, gardé par
 * `seoHead.int.test.ts`), et la langue vient de l'URL (`/` = fr, `/en` = en).
 */

const GOALS: ReadonlyArray<{ id: DemoGoal; labelKey: MessageKey; noteKey: MessageKey; dirKey: MessageKey }> = [
  { id: "fat_loss", labelKey: "home.goal.fat_loss", noteKey: "home.goal.note.fat_loss", dirKey: "home.dir.fat_loss" },
  { id: "muscle_gain", labelKey: "home.goal.muscle_gain", noteKey: "home.goal.note.muscle_gain", dirKey: "home.dir.muscle_gain" },
];

const FAQ: ReadonlyArray<{ q: MessageKey; a: MessageKey }> = [
  { q: "home.faq.q1", a: "home.faq.a1" },
  { q: "home.faq.q2", a: "home.faq.a2" },
  { q: "home.faq.q3", a: "home.faq.a3" },
  { q: "home.faq.q4", a: "home.faq.a4" },
  { q: "home.faq.q5", a: "home.faq.a5" },
  { q: "home.faq.q6", a: "home.faq.a6" },
  { q: "home.faq.q7", a: "home.faq.a7" },
];

function Section({ id, children, tone = "paper", className = "" }: {
  id?: string;
  children: React.ReactNode;
  tone?: "paper" | "alt";
  className?: string;
}) {
  return (
    // ⚠️ `scroll-mt-28` (112px) EST CE QUI REND LES ANCRES DE L'EN-TÊTE
    // UTILISABLES. Mesuré: l'en-tête est COLLANT et fait 95px (deux rangées);
    // sans marge de défilement, un clic sur « L'abonnement » amène le haut de
    // la section à 0 et la range DERRIÈRE l'en-tête — on atterrit sur une
    // section dont on ne voit pas le titre.
    <section id={id} className={`scroll-mt-28 ${tone === "alt" ? "bg-paper-2" : ""} ${className}`}>
      <div className="mx-auto max-w-6xl px-5 py-14 sm:px-8 sm:py-20">{children}</div>
    </section>
  );
}

function Chapter({ n, children }: { n: string; children: React.ReactNode }) {
  return (
    <p className="eq text-label font-semibold uppercase text-ink-soft">
      <span className="mr-2 text-fig-700">{n}</span>
      {children}
    </p>
  );
}

function Title({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <h2 className={`mt-4 max-w-[18ch] text-balance font-display text-title text-ink ${className}`}>{children}</h2>;
}

/**
 * LE TÉLÉPHONE NE MONTE PAS LES DEUX PHOTOS — décidé le 2026-09-09.
 *
 * ⚠️ UN HOOK ET PAS `hidden lg:block`, ET C'EST TOUTE LA DIFFÉRENCE. Une image
 * masquée en CSS est quand même TÉLÉCHARGÉE: les deux fichiers partent sur le
 * réseau du téléphone pour finir en `display: none`. Non montée, elle ne part
 * pas. La demande était « beaucoup plus optimisé », pas « invisible ».
 *
 * ⚠️ `lg` (1024px) EST LA MÊME BORNE QUE LES GRILLES qu'elles habitent
 * (`lg:grid-cols-…`): sous cette largeur les deux colonnes s'empilent déjà,
 * donc la photo passait sous le texte — une bande décorative qu'il faut
 * traverser pour atteindre la suite.
 *
 * ⚠️ AUCUN RENDU SERVEUR ICI: cette page est montée par Vite côté client, il
 * n'y a pas d'état initial à faire correspondre. Le premier rendu part à
 * `false` puis se corrige au montage — sur un écran large, une frame.
 */
function useWideScreen(): boolean {
  const [wide, setWide] = React.useState(false);
  React.useEffect(() => {
    const query = window.matchMedia?.("(min-width: 1024px)");
    if (!query) return;
    setWide(query.matches);
    const onChange = (event: MediaQueryListEvent) => setWide(event.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);
  return wide;
}

/** Un mot en Young Serif adouci — la seconde moitié d'un titre. */
function Soft({ children }: { children: React.ReactNode }) {
  return <span className="text-fig-700">{children}</span>;
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

function Landing() {
  const reducedMotion = useReducedMotion();
  const [goal, setGoal] = React.useState<DemoGoal>("fat_loss");
  const heroRef = React.useRef<HTMLElement>(null);
  const shouldAnimate = !reducedMotion;
  const { scrollYProgress } = useScroll({ target: heroRef, offset: ["start start", "end start"] });
  const foodY = useTransform(scrollYProgress, [0, 1], [0, 90]);
  const foodRotate = useTransform(scrollYProgress, [0, 1], [-8, 6]);
  const startHref = localeHref("/start");
  const household = formatPrice(PRICES.household);
  const extra = formatPrice(PRICES.claimedProfile);
  const chosen = GOALS.find((g) => g.id === goal) ?? GOALS[0];
  const wide = useWideScreen();

  // Les révélations au défilement — une seule définition, réutilisée.
  // ⚠️ SANS ANIMATION, ON DIT « VISIBLE » EXPLICITEMENT. Un `{}` ne suffit
  // pas: framer-motion garde le dernier style animé, donc une section encore à
  // `opacity: 0` au moment où `shouldAnimate` bascule resterait invisible —
  // mesuré le 2026-09-08, la moitié de la page avait disparu. La bascule est
  // rare depuis le retrait du bouton (l'OS change de réglage en cours de
  // visite), mais elle existe, et la branche coûte une ligne.
  const reveal = shouldAnimate
    ? { initial: { opacity: 0, y: 24 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true, amount: 0.15 }, transition: { duration: 0.6 } }
    : { initial: false as const, animate: { opacity: 1, y: 0 }, transition: { duration: 0 } };

  return (
    <main>
      {/* ── LE HÉROS ────────────────────────────────────────────────────── */}
      <section ref={heroRef} className="relative scroll-mt-28 overflow-hidden" id="top">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-5 pb-10 pt-10 sm:px-8 sm:pt-14 lg:grid-cols-[1.05fr_0.95fr] lg:gap-14 lg:pb-16">
          <div className="min-w-0">
            {/* ⚠️ LES TROIS ANCRES ONT DÉMÉNAGÉ DANS L'EN-TÊTE le 2026-09-08
                (`PublicHeader`, seconde rangée). Elles vivaient ici, au-dessus
                du sur-titre, c'est-à-dire au-dessus du titre de la page: une
                navigation posée dans le contenu qu'elle navigue. Ne pas les
                remettre — elles seraient alors à deux endroits. */}
            <Kicker>{t("home.hero.eyebrow")}</Kicker>
            <h1 className="mt-4 max-w-[14ch] text-balance font-display text-hero text-ink">
              {t("home.hero.title_1")}
              <br />
              <Soft>{t("home.hero.title_2")}</Soft>
            </h1>
            <p className="mt-6 max-w-[46ch] text-lede text-ink-soft">{t("home.hero.lede")}</p>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <ButtonLink to={startHref} variant="brand" className="px-6 py-3 text-[1rem]">
                {t("home.hero.cta")} <ArrowUpRight size={18} aria-hidden="true" />
              </ButtonLink>
            </div>
            <p className="mt-5 text-[13px] text-ink-soft">{t("home.hero.trial", { amount: household })}</p>
          </div>

          {wide && <div className="relative mx-auto w-full max-w-[520px]">
            <p aria-hidden="true" className="mb-3 text-center text-label font-semibold uppercase tracking-[0.18em] text-ink-soft">
              {t("home.hero.label_pleasure")}
            </p>
            <div className="relative">
              <div aria-hidden="true" className="absolute inset-6 rounded-full bg-fig-100 blur-2xl" />
              <motion.img
                src="/landing-assets/hero-chicken-bowl.webp"
                alt={t("home.hero.visual_alt")}
                width="1000"
                height="1000"
                fetchPriority="high"
                // ⚠️ L'IMAGE PORTE LE FOND JAUNE DU PROTOTYPE EN DUR (1000×1000,
                // aucun alpha). Mesuré dans le navigateur: le bol est un disque
                // de rayon 411 px centré en (507, 505). Le découpage en cercle
                // retire le jaune sans retoucher le fichier; le jour où l'image
                // est refaite sur fond transparent, ce `clipPath` part avec.
                className="relative block w-full [clip-path:circle(41%_at_50.7%_50.5%)]"
                style={shouldAnimate ? { y: foodY, rotate: foodRotate } : undefined}
              />
              <div className="absolute left-0 top-6 flex max-w-[16rem] items-center gap-3 rounded-fiche border border-line bg-paper/95 px-4 py-3 shadow-[0_12px_30px_rgba(42,28,35,0.12)] backdrop-blur">
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
          </div>}
        </div>
        {/* ⛔ LA RANGÉE DU BAS DU HÉROS EST VIDE ET RETIRÉE (2026-09-09). Elle
            portait « Pause animations » puis « La suite se savoure » — les deux
            retirés sur demande. Ce que la page GARDE des animations, et qui est
            le vrai plancher: `useReducedMotion()` ci-dessus, plus la règle
            globale `prefers-reduced-motion` de `tokens.css`. */}
      </section>

      {/* ── LE BANDEAU DES TROIS BÉNÉFICES ──────────────────────────────── */}
      <div aria-label={t("home.strip.label")} className="border-y border-line bg-fig-950 text-paper">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-8 gap-y-2 px-5 py-4 text-label font-semibold uppercase tracking-[0.14em] sm:px-8">
          {(["home.strip.goal", "home.strip.calc", "home.strip.house"] as const).map((key) => (
            <span key={key} className="inline-flex items-center gap-2">
              <Check size={14} aria-hidden="true" className="text-fig-300" /> {t(key)}
            </span>
          ))}
        </div>
      </div>

      {/* ── 01 · L'OBJECTIF ─────────────────────────────────────────────── */}
      <Section id="experience">
        <Chapter n="01">{t("home.goal.kicker")}</Chapter>
        <motion.div {...reveal} className="grid items-start gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:gap-14">
          <Title>
            {t("home.goal.title_1")}
            <br />
            <Soft>{t("home.goal.title_2")}</Soft>
          </Title>
          <div className="min-w-0">
            <p className="max-w-[58ch] text-[16px] leading-7 text-ink-soft">{t("home.goal.body_1")}</p>
            <p className="mt-4 max-w-[58ch] text-[16px] font-medium leading-7 text-ink">{t("home.goal.body_2")}</p>
            {/* ⚠️ LES DEUX BOUTONS SONT DANS LE CADRE QU'ILS PILOTENT, depuis le
                2026-09-09. Ils étaient au-dessus, séparés par une marge: sur un
                téléphone, la réponse passait sous la ligne de flottaison et on
                ne voyait pas que le texte du cadre venait de changer. Le
                `aria-live` porte donc maintenant le contrôle ET sa réponse —
                c'est voulu: le libellé du bouton pressé ne change pas, seule la
                réponse bouge, et c'est elle qui doit être annoncée. */}
            <div aria-live="polite" className="mt-6 rounded-fiche border border-line bg-paper-2 p-4">
              <div role="group" aria-label={t("home.goal.aria")} className="mb-4 flex flex-wrap gap-2">
                {GOALS.map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    aria-pressed={goal === g.id}
                    onClick={() => setGoal(g.id)}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] font-medium transition-colors ${
                      goal === g.id ? "border-fig-700 bg-fig-700 text-paper" : "border-line-strong bg-paper text-ink hover:bg-fig-50"
                    }`}
                  >
                    {goal === g.id && <Check size={13} aria-hidden="true" />}
                    {t(g.labelKey)}
                  </button>
                ))}
              </div>
              <p className="text-[15px] leading-6 text-ink">{t(chosen.noteKey)}</p>
              <p className="mt-2 text-[13px] leading-5 text-ink-soft">
                <span className="font-semibold uppercase tracking-wide">{t("home.goal.direction_label")}</span>
                {" : "}
                {t(chosen.dirKey)}
              </p>
            </div>
          </div>
        </motion.div>
      </Section>

      {/* ── 02 · LES CALCULS ET LA DÉMONSTRATION ────────────────────────── */}
      <Section tone="alt">
        <div className="grid items-center gap-8 lg:grid-cols-[1.15fr_0.85fr] lg:gap-14">
          <div>
            <Chapter n="02">{t("home.plan.kicker")}</Chapter>
            <Title>
              {t("home.plan.title_1")}
              <br />
              <Soft>{t("home.plan.title_2")}</Soft>
            </Title>
            <p className="mt-6 max-w-[58ch] text-[16px] leading-7 text-ink-soft">{t("home.plan.body")}</p>
          </div>
          {wide && <motion.figure {...reveal} className="relative overflow-hidden rounded-fiche bg-fig-950 text-paper">
            {/* ⚠️ MÊME DÉFAUT QUE LE HÉROS: le vert profond du prototype est
                dans le fichier. Le plat est un disque de rayon 352 px centré
                en (500, 492); le cercle le garde et laisse le bloc sombre de
                la charte autour. */}
            <img
              src="/landing-assets/salmon-plate.webp"
              alt={t("home.plan.photo_alt")}
              loading="lazy"
              width="1000"
              height="1000"
              className="block aspect-[4/3] w-full object-cover [clip-path:circle(36%_at_50%_49%)]"
            />
            <div className="absolute inset-x-0 top-0 flex items-center justify-between px-5 py-4 text-label font-semibold uppercase tracking-[0.14em]">
              <span>{t("home.plan.photo_kicker")}</span>
              <Leaf size={20} aria-hidden="true" className="text-fig-300" />
            </div>
            <figcaption className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-fig-950 via-fig-950/80 to-transparent px-5 pb-4 pt-10">
              <span className="block text-sm text-fig-300">{t("home.plan.photo_line")}</span>
              <span className="block font-display text-[1.4rem] leading-tight">{t("home.plan.photo_strong")}</span>
            </figcaption>
          </motion.figure>}
        </div>
        <motion.div {...reveal} className="mt-10">
          <PlanDemo goal={goal} />
        </motion.div>
      </Section>

      {/* ── 03 · LE FONCTIONNEMENT, DANS L'ORDRE VÉCU ───────────────────── */}
      <Section>
        <Chapter n="03">{t("home.how.kicker")}</Chapter>
        <div className="grid items-end gap-6 lg:grid-cols-[1fr_1fr]">
          <Title>
            {t("home.how.title_1")}
            <br />
            <Soft>{t("home.how.title_2")}</Soft>
          </Title>
          <p className="max-w-[48ch] text-[16px] leading-7 text-ink-soft lg:pb-2">{t("home.how.lede")}</p>
        </div>
        <ol className="mt-8 grid gap-3 sm:gap-4 md:grid-cols-3">
          {([
            { Icon: ShoppingBasket, n: "01", title: "home.how.shop.title", body: "home.how.shop.body" },
            { Icon: CookingPot, n: "02", title: "home.how.cook.title", body: "home.how.cook.body" },
            { Icon: Utensils, n: "03", title: "home.how.eat.title", body: "home.how.eat.body" },
          ] as const).map(({ Icon, n, title, body }) => (
            // ⚠️ TROIS CARTES COMPACTES, ET UNE SEULE MISE EN PAGE (2026-09-09).
            // Elles étaient verticales — pastille, puis numéro, puis titre à
            // `text-sub`, puis texte —, ce qui donne trois pavés empilés sur un
            // téléphone: « trop grosses sur mobile ». Le titre remonte À CÔTÉ
            // de la pastille et le numéro passe à droite, donc la carte perd
            // une ligne et un cran de titre.
            // ⛔ PAS DEUX MISES EN PAGE PAR POINT DE RUPTURE: il aurait fallu
            // rendre le titre DEUX fois, une par taille. Compacte partout, la
            // carte tient aussi bien dans la grille à trois colonnes.
            <motion.li {...reveal} key={n} className="rounded-fiche border border-line bg-paper p-4 sm:p-5">
              <div className="flex items-center gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-fig-100 text-fig-700">
                  <Icon size={18} strokeWidth={1.7} aria-hidden="true" />
                </span>
                <h3 className="min-w-0 font-display text-[1.15rem] leading-snug text-ink">{t(title)}</h3>
                <span className="ml-auto font-display text-[1.15rem] leading-none text-fig-300">{n}</span>
              </div>
              <p className="mt-3 text-[14px] leading-6 text-ink-soft">{t(body)}</p>
            </motion.li>
          ))}
        </ol>
      </Section>

      {/* ── 04 · LE FOYER ───────────────────────────────────────────────── */}
      <Section id="a-table" tone="alt">
        <div className="grid items-center gap-10 lg:grid-cols-[1fr_1fr] lg:gap-14">
          <div>
            <Chapter n="04">{t("home.house.kicker")}</Chapter>
            <Title>
              {t("home.house.title_1")}
              <br />
              {t("home.house.title_2")}
              <br />
              <Soft>{t("home.house.title_3")}</Soft>
            </Title>
            <p className="mt-6 max-w-[54ch] text-[16px] leading-7 text-ink-soft">{t("home.house.body_1")}</p>
            <p className="mt-4 max-w-[54ch] text-[16px] leading-7 text-ink-soft">{t("home.house.body_2")}</p>
            <a href="#offre" className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-fig-700 hover:underline">
              {t("home.house.cta")} <ArrowUpRight size={16} aria-hidden="true" />
            </a>
          </div>
          <motion.div {...reveal} className="rounded-fiche border border-line bg-paper p-5 sm:p-6">
            <div className="flex items-baseline justify-between text-label font-semibold uppercase text-ink-soft">
              <span className="eq">{t("home.house.table_kicker")}</span>
              <span className="inline-flex items-center gap-1">{t("home.house.table_each")} <ArrowDown size={12} aria-hidden="true" /></span>
            </div>
            <ul className="mt-5 space-y-3">
              {DEMO_MEMBERS.map((member, i) => {
                const Icon = [Utensils, Sparkles, Leaf][i] ?? Utensils;
                return (
                  <li key={member.id} className="flex items-center gap-4 rounded-card border border-line bg-paper-2 px-4 py-3">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-fig-700 font-display text-lg text-paper">
                      {memberName(member.id).slice(0, 1)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium text-ink">{memberName(member.id)}</span>
                      <span className="block text-[13px] text-ink-soft">{t(member.noteKey)}</span>
                    </span>
                    <Icon size={18} aria-hidden="true" className="shrink-0 text-fig-700" />
                  </li>
                );
              })}
            </ul>
            <div className="mt-4 flex items-center gap-3 rounded-card bg-fig-950 px-4 py-3 text-paper">
              <ShoppingBasket size={20} aria-hidden="true" className="text-fig-300" />
              <span className="flex-1 text-sm font-medium">{t("home.house.shared_list")}</span>
              <Check size={18} aria-hidden="true" className="text-fig-300" />
            </div>
            <p className="mt-3 text-[13px] leading-5 text-ink-soft">{t("home.house.note")}</p>
          </motion.div>
        </div>
      </Section>

      {/* ── L'IMPRÉVU ───────────────────────────────────────────────────── */}
      <Section>
        <div className="grid items-start gap-10 lg:grid-cols-[1fr_1fr] lg:gap-14">
          <div>
            <Kicker>{t("home.life.kicker")}</Kicker>
            <Title>
              {t("home.life.title_1")}
              <br />
              <Soft>{t("home.life.title_2")}</Soft>
            </Title>
            <p className="mt-6 max-w-[54ch] text-[16px] leading-7 text-ink-soft">{t("home.life.body")}</p>
          </div>
          {/* ⚠️ `min-w-0` SUR L'ÉLÉMENT DE GRILLE, ET IL EST MESURÉ. Un enfant
              de grille a `min-width: auto` comme un enfant de flex: il refuse
              de descendre sous la largeur MINIMALE de son contenu, et il
              élargit la PISTE avec lui. Mesuré à 320 px sans cette classe: la
              piste passait à 334 px pour une grille de 280, les DEUX colonnes
              débordaient (le titre autant que la boîte) et la page entière
              partait en défilement horizontal — 1.4.10 Reflow. */}
          <motion.div {...reveal} className="min-w-0">
            <UnplannedMealDemo />
          </motion.div>
        </div>
      </Section>

      {/* ── EN BONUS ────────────────────────────────────────────────────── */}
      <Section tone="alt">
        <Kicker>{t("home.bonus.kicker")}</Kicker>
        <Title>{t("home.bonus.title")}</Title>
        <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {([
            ["home.bonus.mental.title", "home.bonus.mental.body"],
            ["home.bonus.balance.title", "home.bonus.balance.body"],
            ["home.bonus.waste.title", "home.bonus.waste.body"],
            ["home.bonus.time.title", "home.bonus.time.body"],
          ] as const).map(([title, body]) => (
            <motion.li {...reveal} key={title} className="rounded-fiche border border-line bg-paper p-5">
              <span className="flex size-9 items-center justify-center rounded-full bg-fig-100 text-fig-700">
                <Check size={16} aria-hidden="true" />
              </span>
              <h3 className="mt-4 text-[1.05rem] font-semibold leading-snug text-ink">{t(title)}</h3>
              <p className="mt-2 text-[14px] leading-6 text-ink-soft">{t(body)}</p>
            </motion.li>
          ))}
        </ul>
      </Section>

      {/* ── 05 · L'OFFRE ────────────────────────────────────────────────── */}
      <Section id="offre">
        <div className="grid items-start gap-10 lg:grid-cols-[1fr_1fr] lg:gap-14">
          <div>
            <Chapter n="05">{t("home.offer.kicker")}</Chapter>
            <Title>
              {t("home.offer.title_1")}
              <br />
              <Soft>{t("home.offer.title_2")}</Soft>
            </Title>
            <p className="mt-6 max-w-[54ch] text-[16px] leading-7 text-ink-soft">{t("home.offer.body")}</p>
            <ul className="mt-6 space-y-2 text-[15px] text-ink">
              <li className="flex items-center gap-2"><Check size={16} aria-hidden="true" className="text-fig-700" /> {t("home.offer.check_trial")}</li>
              <li className="flex items-center gap-2"><Check size={16} aria-hidden="true" className="text-fig-700" /> {t("home.offer.check_commit")}</li>
            </ul>
          </div>

          {/* ⚠️ REMISE À L'ÉCHELLE LE 2026-09-09 — « c'est trop gros par rapport
              au reste de la page ». Le chiffre était à 3rem quand les titres de
              section sont à `text-title` et les cartes de l'étape 03 à
              1,15rem: la carte criait plus fort que la page. Elle garde son
              cadre plein et son ombre — c'est ce qui la distingue —, mais ses
              tailles et son padding s'alignent sur le reste. */}
          <motion.div {...reveal} className="rounded-fiche border border-line-strong bg-paper p-5 shadow-[0_18px_50px_rgba(42,28,35,0.08)] sm:p-6">
            <div className="flex items-baseline justify-between gap-3">
              <strong className="font-display text-[1.15rem] text-ink">{t("home.offer.card.name")}</strong>
              <span className="rounded-full bg-fig-100 px-3 py-1 text-label font-semibold uppercase text-fig-700">{t("home.offer.card.badge")}</span>
            </div>
            {/* ⛔ PLUS D'`aria-live` NI DE PRIX CALCULÉ. Le montant était la
                somme du foyer et d'un sélecteur d'accès; il ne bouge plus, donc
                il n'y a plus rien à annoncer à un lecteur d'écran. */}
            <p className="mt-4 flex items-baseline gap-2">
              <span className="font-display text-[2.1rem] leading-none text-ink">{household}</span>
              <span className="text-[14px] text-ink-soft">{t("home.offer.card.per_month")}</span>
            </p>
            <p className="mt-2 text-[13px] text-ink-soft">{t("home.offer.card.for")}</p>
            <ul className="mt-4 space-y-1.5 text-[14px] leading-6 text-ink">
              {(["home.offer.card.inc_1", "home.offer.card.inc_2", "home.offer.card.inc_3", "home.offer.card.inc_4"] as const).map((key) => (
                <li key={key} className="flex items-start gap-2"><Check size={15} aria-hidden="true" className="mt-1 shrink-0 text-fig-700" /> {t(key)}</li>
              ))}
            </ul>
            <ButtonLink to={startHref} variant="brand" className="mt-5 w-full justify-center px-5 py-2.5 text-[15px]">
              {t("home.offer.card.cta")} <ArrowUpRight size={16} aria-hidden="true" />
            </ButtonLink>
            <p className="mt-3 text-[12px] leading-5 text-ink-soft">{t("home.offer.card.note")}</p>
          </motion.div>
        </div>

        {/* ══════════════════════════════════════════════════════════════════
            L'ACCÈS COACHING INDIVIDUEL — UN SEUL BLOC, ET IL NE CALCULE RIEN.
            ══════════════════════════════════════════════════════════════════
            ⛔ CE QU'IL REMPLACE: un encart à gauche ET un sélecteur dans la
            carte qui ajoutait 1,99 € au prix affiché. Deux endroits, deux
            vocabulaires, et un compteur qui promettait une configuration que
            l'inscription ne reprend pas — « je pense pas que permettre de
            l'ajouter dans le prix ce soit une bonne idée » (2026-09-08).
            ⚠️ SOUS LA GRILLE, PAS DANS LA COLONNE DE GAUCHE: empilé au
            téléphone, il serait passé AVANT le prix du foyer, c'est-à-dire
            l'option avant l'offre. Ici il vient après les deux, dans les deux
            mises en page. */}
        <motion.div {...reveal} className="mt-8 rounded-fiche border border-line bg-paper-2 p-5 sm:p-6">
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <h3 className="font-display text-[1.15rem] text-ink">{t("home.offer.coaching.title")}</h3>
            <span className="text-[15px] font-medium text-fig-700">{t("home.offer.coaching.price", { amount: extra })}</span>
          </div>
          <p className="mt-3 max-w-[62ch] text-[15px] leading-6 text-ink-soft">{t("home.offer.coaching.body")}</p>
          <ul className="mt-5 grid gap-3 sm:grid-cols-3">
            {([
              { Icon: Camera, key: "home.offer.coaching.item_1" },
              { Icon: LineChart, key: "home.offer.coaching.item_2" },
              { Icon: MessageSquareText, key: "home.offer.coaching.item_3" },
            ] as const).map(({ Icon, key }) => (
              <li key={key} className="flex items-start gap-3 rounded-card border border-line bg-paper px-4 py-3">
                <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-fig-100 text-fig-700">
                  <Icon size={16} aria-hidden="true" />
                </span>
                <span className="text-[14px] leading-6 text-ink">{t(key)}</span>
              </li>
            ))}
          </ul>
          <p className="mt-5 max-w-[62ch] text-[13px] leading-5 text-ink-soft">{t("home.offer.coaching.free")}</p>
        </motion.div>
      </Section>

      {/* ── LA FAQ ──────────────────────────────────────────────────────── */}
      <Section id="questions" tone="alt">
        <div className="grid items-start gap-8 lg:grid-cols-[0.7fr_1.3fr] lg:gap-14">
          <div>
            <Kicker>{t("home.faq.kicker")}</Kicker>
            <Title>
              {t("home.faq.title_1")}
              <br />
              <Soft>{t("home.faq.title_2")}</Soft>
            </Title>
          </div>
          <div className="divide-y divide-line rounded-fiche border border-line bg-paper">
            {FAQ.map(({ q, a }) => (
              <details key={q} className="group px-5 py-4">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[16px] font-medium text-ink">
                  {t(q)}
                  <ChevronDown size={18} aria-hidden="true" className="shrink-0 text-ink-soft transition-transform group-open:rotate-180" />
                </summary>
                <p className="mt-3 max-w-[62ch] text-[15px] leading-7 text-ink-soft">{t(a, { household, extra })}</p>
              </details>
            ))}
          </div>
        </div>
      </Section>

      {/* ── LA CLÔTURE — le seul bloc sombre ────────────────────────────── */}
      <section className="on-dark bg-fig-950 text-paper">
        <div className="mx-auto flex max-w-6xl flex-col items-start gap-6 px-5 py-14 sm:px-8 sm:py-20 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="max-w-[22ch] text-balance font-display text-title">{t("home.close.title")}</h2>
            <p className="mt-4 max-w-[48ch] text-[15px] leading-6 text-fig-300">{t("home.close.body", { amount: household })}</p>
          </div>
          <div className="flex flex-wrap items-center gap-5">
            <ButtonLink to={startHref} variant="brand" className="border border-fig-300 px-6 py-3 text-[1rem]">
              {t("home.close.cta")} <ArrowUpRight size={18} aria-hidden="true" />
            </ButtonLink>
            <a href="#top" className="inline-flex items-center gap-1.5 text-sm text-fig-300 hover:text-paper hover:underline">
              {t("home.close.back_to_top")} <ArrowUpRight size={15} aria-hidden="true" />
            </a>
          </div>
        </div>
      </section>
    </main>
  );
}

/**
 * CE QU'ON ENVOIE QUAND UN REPAS N'ÉTAIT PAS PRÉVU — une description, ou une
 * photo. C'est une IMAGE du composeur, pas un parcours.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * ⟳ 2026-09-11 — LE PARCOURS EST RETIRÉ, ET IL FAUT LIRE CE QUI PART AVEC
 * ══════════════════════════════════════════════════════════════════════════
 *
 * La boîte jouait « Comptabiliser » → trois phrases de résultat →
 * « Recommencer ». Retiré sur demande: *« il faut enlever le comptabiliser et
 * l'effet, ça sert à rien »*.
 *
 * ⚠️ CE QUE ÇA COÛTE, écrit ici pour que personne ne le redécouvre: la ligne
 * « Ton planning n'a pas bougé » vivait DANS le résultat, et l'ancien
 * commentaire de ce composant la disait « attendue par le brief ». Elle n'est
 * donc plus dite nulle part sur la page. La promesse « ça compte », elle,
 * survit — `home.life.title_2` (« Il compte aussi. ») et `home.life.body`
 * la portent, au-dessus de cette boîte. Si la phrase du planning doit revenir,
 * sa place est dans le corps, pas derrière un clic.
 *
 * ⛔ LE BOUTON « ENVOYER » N'EN EST PAS UN. Il fait partie du dessin: rien ici
 * n'envoie quoi que ce soit. Un vrai `<button>` inerte sur une page de vente
 * est pire qu'un dessin — on clique, et rien ne répond. Il est donc rendu en
 * `<span aria-hidden>`. Les deux onglets, eux, sont de vrais contrôles: ils
 * changent ce qu'on regarde.
 */

/**
 * LA PHOTO DU PLAT, quand il y en aura une.
 *
 * ⛔ `null` TANT QUE LE FICHIER N'EXISTE PAS, et c'est la seule forme honnête.
 * Demandé: *« mettre une vraie photo, en mode photo d'un plat maison »*. Les
 * deux seules photos du dépôt (`hero-chicken-bowl.webp`, `salmon-plate.webp`)
 * sont DÉJÀ sur cette page, plus haut, et ce sont des prises de vue studio sur
 * fond plat — l'inverse d'un plat maison photographié à table. Les remontrer
 * ici afficherait la même assiette deux fois dans un seul défilement.
 *
 * POUR LA BRANCHER: déposer le fichier dans
 * `frontend/public/landing-assets/`, puis écrire son chemin ici. Rien d'autre.
 * Carré, ~400×400 suffit (elle est rendue à 64 px), `.webp` comme ses deux
 * voisines. Tant que c'est `null`, la vignette reste une pastille d'icône: pas
 * d'image cassée, et pas de fausse photo.
 */
const UNPLANNED_PHOTO_SRC: string | null = null;

function UnplannedMealDemo() {
  const [mode, setMode] = React.useState<"describe" | "photo">("describe");
  return (
    <div role="group" aria-label={t("home.life.demo.aria")} className="rounded-fiche border border-line bg-paper-2 p-5 sm:p-6">
      <p className="eq text-label font-semibold uppercase text-ink-soft">{t("home.life.demo.label")}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        {([
          { id: "describe", Icon: MessageSquareText, label: "home.life.demo.describe" },
          { id: "photo", Icon: Camera, label: "home.life.demo.photo" },
        ] as const).map(({ id, Icon, label }) => (
          <button
            key={id}
            type="button"
            aria-pressed={mode === id}
            onClick={() => setMode(id)}
            className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
              mode === id ? "border-fig-700 bg-fig-700 text-paper" : "border-line-strong text-ink hover:bg-fig-50"
            }`}
          >
            <Icon size={15} aria-hidden="true" /> {t(label)}
          </button>
        ))}
      </div>
      {/* LA BOÎTE EST LE COMPOSEUR: ce qu'on envoie à gauche, le bouton d'envoi
          à droite, sur la même ligne — comme dans l'app. `items-center` et pas
          `items-start`: sur une seule ligne de texte comme sur une vignette de
          64 px, c'est l'alignement qui fait lire les deux comme UNE rangée.
          ⚠️ `min-w-0` sur la partie gauche: sans lui, un enfant de flex refuse
          de descendre sous sa largeur intrinsèque et le « Envoyer » sortirait
          de la boîte à 320 px — le piège que ce dépôt a déjà payé sur le vrai
          composeur. */}
      <div className="mt-4 flex items-center gap-3 rounded-card border border-line bg-paper px-4 py-3">
        <div className="min-w-0 flex-1">
          {mode === "describe"
            ? <p className="text-[15px] leading-6 text-ink">{t("home.life.demo.example")}</p>
            : (
              // ⚠️ `min-w-0` ICI AUSSI, ET SON ABSENCE A ÉTÉ MESURÉE: à 320 px,
              // la rangée « vignette + phrase » débordait la boîte de 13 px et
              // mettait toute la page en défilement horizontal (1.4.10 Reflow).
              // Le `min-w-0` du parent ne suffit pas — CETTE div est elle-même
              // un enfant de flex, donc elle a son propre `min-width: auto` et
              // refuse de descendre sous la largeur de son contenu.
              <div className="flex min-w-0 items-center gap-3">
                {UNPLANNED_PHOTO_SRC
                  ? (
                    <img
                      src={UNPLANNED_PHOTO_SRC}
                      alt={t("home.life.demo.photo_example")}
                      loading="lazy"
                      width="400"
                      height="400"
                      className="size-16 shrink-0 rounded-card object-cover"
                    />
                  )
                  : (
                    <span aria-hidden="true" className="flex size-16 shrink-0 items-center justify-center rounded-card bg-fig-100 text-fig-700">
                      <Camera size={22} />
                    </span>
                  )}
                {/* Sous une vraie photo, la phrase devient son `alt` et n'a plus
                    à être répétée à l'œil: l'image dit déjà ce qu'elle est. */}
                {!UNPLANNED_PHOTO_SRC && (
                  <p className="min-w-0 text-[15px] leading-6 text-ink">
                    {t("home.life.demo.photo_example")}
                  </p>
                )}
              </div>
            )}
        </div>
        <span
          aria-hidden="true"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-fig-700 px-4 py-2 text-sm font-medium text-paper"
        >
          {t("home.life.demo.send")} <ArrowUpRight size={15} />
        </span>
      </div>
    </div>
  );
}

export default HomePage;
