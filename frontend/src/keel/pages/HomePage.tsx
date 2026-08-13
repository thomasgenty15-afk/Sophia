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
 * `/` — LE HALL DU FOYER. Refondu « par la douleur » le 2026-08-13.
 *
 * CE QU'EST UN HALL, ET POURQUOI IL NE GROSSIT PAS. Il ne répète PAS les
 * douleurs d'un segment: il montre les fonctionnalités principales, chacune
 * accrochée à la douleur COMMUNE qu'elle retire, et il s'arrête — l'argument
 * complet d'un acheteur appartient à SA page, où mènent les trois portes de la
 * clôture. Deux plafonds tenus au chiffre: ≤ 245 LIGNES et ≤ 450 MOTS RENDUS.
 * Un hall qui grossit a commencé à vendre, donc aux trois acheteurs à la fois,
 * c'est-à-dire à personne.
 *
 * LA FORME EST UNE FICHE, PAS UNE GRILLE DE CARTES: sept cartes se liraient
 * comme sept produits, sept champs séparés par des filets se lisent comme UN
 * document (charte §1). UN SEUL est estampé sombre — `fig-950`, un bloc par
 * page, dépensé SUR un champ et jamais en plus — et il ne porte NI LIEN NI
 * MARQUE: `.on-dark` ne remonte pas `--ill-ink` et `fig-600` y tombe à 2,3:1.
 * INTERDITS QUE RIEN NE RAPPELLE ICI: C15 jamais « jamais de calories » (faux
 * depuis FF-059) · C17 aucune app mobile · S4 aucun « rien à installer »; tout
 * autre claim porte son ancre au-dessus de son champ.
 */

const STRUCTURED_DATA = [{
  "@context": "https://schema.org",
  "@type": "WebPage",
  name: t("home.seo_title"),
  url: `${LEGAL_ENTITY.siteUrl}/`,
  description: t("home.seo_description"),
  publisher: organizationStructuredData(),
}];

/**
 * Les trois portes, descendues dans la clôture et mises en compact. ⚠️ ELLES NOMMENT LA
 * SITUATION, PAS LE SEGMENT: personne ne se dit « je suis un solo » (le mot reste au code,
 * `FunnelBranch = solo | pair | family`). ⚠️ CLÉS EN TOUTES LETTRES: `t(\`…${k}\`)` compile et ne prouve rien.
 */
const DOORS = [
  { to: "/meal-prep", label: "home.door.solo.label", note: "home.door.solo.note" },
  { to: "/couples", label: "home.door.pair.label", note: "home.door.pair.note" },
  { to: "/families", label: "home.door.family.label", note: "home.door.family.note" },
] as const;

const Section = ({ children, tone = "paper" }: { children: React.ReactNode; tone?: "paper" | "alt" }) => (
  <section className={tone === "alt" ? "bg-paper-2" : ""}>
    <div className="mx-auto max-w-6xl px-5 py-14 sm:px-8 sm:py-20">{children}</div>
  </section>
);

/**
 * LA MARQUE D'UN CHAMP — plus petite qu'une figure de section, et SANS TEXTE. ⚠️ NI GRILLE DE
 * 480 NI `.fig-scroll`, ET C'EST RAISONNÉ: les deux existent pour garder lisible le TEXTE d'une
 * figure (charte §5). Une marque qui n'en porte aucun n'a besoin d'aucun des deux, et imposer le
 * plancher de 380 px à cinq marques poserait cinq barres de défilement à 320 px. Corollaire
 * gagné: aucun libellé à re-mesurer en français.
 */
const Mark = ({ id, label, children }: { id: string; label: string; children: React.ReactNode }) => (
  <svg viewBox="0 0 120 80" role="img" aria-labelledby={id} fill="none" stroke="var(--ill-ink)" strokeWidth="2" className="h-auto w-[120px] max-w-full">
    <title id={id}>{label}</title>
    {children}
  </svg>
);

/**
 * La figure du champ 04 — la seule vraie figure de la page. ⚠️ ANNOTÉE EN MOTS, JAMAIS EN
 * GRAMMES (audit §5.3): le produit calcule des deltas en grammes, AUCUN écran ne les rend
 * (FF-043 §11 n°1). ⚠️ LIBELLÉS MESURÉS: le texte démarre à x=318, soit 162 unités jusqu'au bord
 * de la grille de 480; à 13px, « une part de féculents plus large » en réclamait 190 et sortait
 * — mesuré EN FRANÇAIS, la langue longue. Toute étiquette ajoutée se vérifie DANS LES DEUX.
 */
const PotFigure = () => (
  <svg viewBox="0 0 480 236" role="img" aria-labelledby="pot-t" className="w-full max-w-[560px]">
    <title id="pot-t">{t("home.fig.alt")}</title>
    <g fill="none" stroke="var(--ill-ink)" strokeWidth="2">
      <circle cx="96" cy="112" r="52" fill="var(--ill-wash)" /><path d="M44 102H30a10 10 0 0 0 0 20h14M148 102h14a10 10 0 0 1 0 20h-14" />
      <circle cx="272" cy="62" r="32" fill="var(--ill-paper)" /><circle cx="272" cy="164" r="32" fill="var(--ill-paper)" />
      <path d="M146 98 242 68M146 124l96 30" stroke="var(--ill-ink-soft)" strokeWidth="1" />
    </g>
    <g fill="var(--ill-fig)">
      <circle cx="262" cy="54" r="7" /><circle cx="282" cy="65" r="7" /><circle cx="265" cy="74" r="7" /><circle cx="266" cy="157" r="9" /><circle cx="283" cy="170" r="9" />
    </g>
    <g fontSize="13" fill="var(--ill-ink-soft)">
      <text x="96" y="192" textAnchor="middle">{t("home.fig.pot")}</text>
      <text x="318" y="58" fill="var(--ill-ink)">{t("home.fig.one")}</text><text x="318" y="76">{t("home.fig.one_2")}</text>
      <text x="318" y="160" fill="var(--ill-ink)">{t("home.fig.two")}</text><text x="318" y="178">{t("home.fig.two_2")}</text>
    </g>
  </svg>
);

/**
 * UN CHAMP DE LA FICHE. Trois cellules dès `lg`: la douleur | le mécanisme | la marque. La 3e
 * piste reste allouée même vide, pour que les sept champs gardent la même mesure — c'est ce qui
 * les fait lire comme un document. `min-w-0` partout: `min-width: auto` sur un enfant de grille
 * fait défiler LA PAGE (charte §5, mesuré à 100 px de débordement à 320 px).
 */
function Field(props: {
  pain: string; title: string; body: string; note?: string; mark?: React.ReactNode; dark?: boolean; children?: React.ReactNode;
}) {
  const soft = props.dark ? "text-fig-300" : "text-ink-soft";
  return (
    <div className={props.dark ? "on-dark -mx-5 bg-fig-950 px-5 py-10 text-paper sm:mx-0 sm:rounded-fiche sm:px-8" : "border-t border-line py-10"}>
      <div className="grid gap-4 sm:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] sm:gap-9 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.1fr)_120px] lg:items-center lg:gap-12">
        <p className={`min-w-0 max-w-[30ch] text-[15px] leading-6 ${soft}`}>{props.pain}</p>
        <div className="min-w-0">
          <h2 className={`font-display text-sub ${props.dark ? "text-paper" : "text-ink"}`}>{props.title}</h2>
          <p className={`mt-2 max-w-[52ch] text-[15px] leading-6 ${soft}`}>{props.body}</p>
          {props.note ? <p className={`mt-3 max-w-[52ch] text-[13px] leading-5 ${soft}`}>{props.note}</p> : null}
        </div>
        <div className="min-w-0">{props.mark}</div>
      </div>
      {props.children}
    </div>
  );
}

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
      <SEO title={t("home.seo_title")} description={t("home.seo_description")} canonical={`${LEGAL_ENTITY.siteUrl}/`} structuredData={STRUCTURED_DATA} />
      <PublicHeader />

      {/* ⚠️ LE REPÈRE `main`, AJOUTÉ LE 2026-08-13. Les six pages segment en
          avaient un, les deux halls non — mesuré au rendu. Sans lui, un
          lecteur d'écran n'a aucun « aller au contenu » sur les deux pages
          qui sont justement les portes d'entrée du site. */}
      <main>
      <Section>
        <Kicker>{t("home.hero.kicker")}</Kicker>
        <h1 className="mt-3 max-w-[17ch] text-balance font-display text-hero">{t("home.hero.title")}</h1>
        <p className="mt-6 max-w-[52ch] text-lede text-ink-soft">{t("home.hero.lede")}</p>
        <div className="mt-8"><ButtonLink to="/start" variant="brand" className="px-6 py-3 text-[1rem]">{t("home.hero.cta")}</ButtonLink></div>
        {/* fact: C1 — 20260810260000:235-250 (maître jamais compté), :101-105 (plafond 8). ⚠️ AUCUNE DURÉE,
            AUCUN BOUTON D'ACHAT (§8 n°1) · réserve du §10: `/start` interroge d'abord `keel_free_signup_available`. */}
        <p className="mt-5 max-w-[52ch] text-sm leading-6 text-ink-soft">{t("home.hero.price")}</p>
        <p className="mt-2 max-w-[52ch] text-[13px] leading-5 text-ink-soft">{t("home.hero.reserve")}</p>
      </Section>

      <Section tone="alt">
        <Kicker>{t("home.fiche.kicker")}</Kicker>
        <div className="mt-8">
          {/* fact: C4 — `SERVING_DIRECTION` (household_portions.ts:125): six objectifs, six consignes DISTINCTES. */}
          <Field pain={t("home.goal.pain")} title={t("home.goal.title")} body={t("home.goal.body")} mark={<Mark id="mk-goal" label={t("home.mark.goal")}>
            <circle cx="22" cy="40" r="16" /><circle cx="60" cy="40" r="16" /><circle cx="98" cy="40" r="16" />
            <g fill="var(--ill-fig)" stroke="none"><path d="M22 40V24a16 16 0 0 1 16 16Z" /><path d="M60 40V24a16 16 0 0 1 0 32Z" /><path d="M98 40V24a16 16 0 1 1-16 16Z" /></g></Mark>} />
          {/* fact: C3 — `interface CookingSession` (meal_generation.ts:522): l'unité du plan est la session et pas le plat, et `runThrough` porte l'ordre réel des gestes. */}
          <Field pain={t("home.sessions.pain")} title={t("home.sessions.title")} body={t("home.sessions.body")} mark={<Mark id="mk-ses" label={t("home.mark.sessions")}>
            <path d="M8 62h104M14 62v-6M30 62v-6M46 62v-6M62 62v-6M78 62v-6M94 62v-6M110 62v-6" stroke="var(--ill-ink-soft)" strokeWidth="1" />
            <g fill="var(--ill-fig)" stroke="none"><rect x="16" y="22" width="30" height="32" /><rect x="72" y="22" width="30" height="32" /></g></Mark>} />
          {/* fact: C5 — `MAX_FRIDGE_DAYS = 3` (meal_generation.ts:730), appliqué en grocery_waves.ts:211. ⚠️ RÉSERVE
              OBLIGATOIRE: `wavesAreMeaningful` (ShoppingListPanel.tsx:128) MASQUE les vagues quand il n'y en a qu'une. */}
          <Field pain={t("home.waves.pain")} title={t("home.waves.title")} body={t("home.waves.body")} note={t("home.waves.note")} mark={<Mark id="mk-wav" label={t("home.mark.waves")}>
            <path d="M8 64h104" stroke="var(--ill-ink-soft)" strokeWidth="1" /><path d="M52 72v6h32v-6" stroke="var(--ill-fig)" />
            <rect x="10" y="32" width="28" height="32" rx="3" /><rect x="52" y="46" width="16" height="18" rx="3" /><rect x="84" y="38" width="24" height="26" rx="3" /></Mark>} />
          {/* fact: C4 — household_portions.ts:125,563 · HouseholdPage.tsx:1838-1855. fact: C9 —
              generate-household-meal-v1:1643-1648 et :1674-1680: union illisible ⇒ 503 `safety_constraints_unreadable`,
              la génération REFUSE au lieu de deviner. La preuve la plus forte du produit vit SOUS le champ qu'elle prouve,
              un hall n'ayant pas de sections. ⚠️ Ni « partout » ni « dans chaque réponse »: `plan_question` ne relit pas
              l'union (FF-046 §7 n°8). */}
          <Field pain={t("home.pot.pain")} title={t("home.pot.title")} body={t("home.pot.body")} note={t("home.pot.note")}>
            <figure className="m-0 mt-7 min-w-0"><div className="fig-scroll"><PotFigure /></div></figure>
          </Field>
          {/* fact: C8 — 20260810260000:179-190 (`user_id = null`): une bouche existe sans compte ni écran. fact: C1 —
              `keel_household_max_mouths()` = 8 (:101-105), et le foyer est à 12,99 €/mois quel que soit ce nombre. LE
              BLOC SOMBRE EST ICI: ni lien ni marque dedans (voir l'en-tête). */}
          <Field dark pain={t("home.mouths.pain")} title={t("home.mouths.title")} body={t("home.mouths.body")} />
          {/* fact: FF-048 §3 — le profil réclamé donne DEUX choses et deux seules: la lecture du plan et le droit de poser
              SON objectif; +2 €/mois (C1, stripe-create-checkout-session:451-471). ⛔ PAS DE SUIVI, PAS DE COURBE — les
              mesures corporelles sont hors périmètre (C16 / S6). */}
          <Field pain={t("home.claim.pain")} title={t("home.claim.title")} body={t("home.claim.body")} mark={<Mark id="mk-acc" label={t("home.mark.account")}>
            <rect x="8" y="14" width="104" height="52" rx="6" /><path d="M24 32h20M24 44h34M24 56h26" stroke="var(--ill-ink-soft)" strokeWidth="1" />
            <g stroke="var(--ill-fig)"><rect x="70" y="24" width="34" height="32" rx="4" /><circle cx="87" cy="35" r="5" /><path d="M78 50a9 9 0 0 1 18 0" /></g></Mark>} />
          {/* fact: FF-010 — `_shared/keel/household_turn_context.ts` charge le plan du foyer qui COUVRE aujourd'hui
              (`student_generated_meals`:396) et les restrictions de qui parle (:549).
              fact: VINGT MESSAGES, PAS VINGT ÉCHANGES — `RECENT_HISTORY_MESSAGE_LIMIT = 20`
              (`_shared/chat/recent_history.ts:52-63`). ⚠️ La réserve disait « vingt échanges », ce qui
              était faux DEUX FOIS: l'unité est le message (donc ~10 échanges), et cette borne est le
              PLAFOND et pas la fenêtre — son propre commentaire l'écrit, et les consommateurs recoupent
              ensuite à 15, 8 et 6. « Au plus » est le seul mot qui rende les deux. ⛔ ON NE MONTRE
              PAS l'accusé de réception d'une photo: il passe encore hors du moteur, en anglais figé. */}
          <Field pain={t("home.chat.pain")} title={t("home.chat.title")} body={t("home.chat.body")} note={t("home.chat.note")} mark={<Mark id="mk-chat" label={t("home.mark.chat")}>
            <rect x="8" y="8" width="66" height="18" rx="9" /><rect x="46" y="32" width="66" height="18" rx="9" />
            <rect x="8" y="56" width="54" height="18" rx="9" fill="var(--ill-fig)" stroke="none" /></Mark>} />
        </div>
      </Section>

      <Section>
        <SectionTitle>{t("home.close.title")}</SectionTitle>
        <p className="mt-5 max-w-[62ch] leading-7 text-ink-soft">{t("home.close.body")}</p>
        <div className="mt-8"><ButtonLink to="/start" variant="brand" className="px-6 py-3 text-[1rem]">{t("home.close.cta")}</ButtonLink></div>
        {/* fact: C13 — onboarding.ts:88 `FunnelBranch = solo | pair | family`: trois branches RÉELLES du parcours d'entrée, donc la promesse de chaque porte est tenue à l'étape d'après. */}
        <p className="eq mt-12 text-label font-semibold uppercase text-ink-soft">{t("home.doors.kicker")}</p>
        <ul className="mt-4 grid gap-px overflow-hidden rounded-fiche border border-line bg-line sm:grid-cols-3">
          {DOORS.map((door) => (
            <li key={door.to} className="min-w-0 bg-paper"><Link to={door.to} className="group flex h-full flex-col p-5 transition-colors hover:bg-fig-50">
                <span className="font-display text-sub text-fig-700 group-hover:underline">{t(door.label)}</span>
                <span className="mt-2 text-sm leading-6 text-ink-soft">{t(door.note)}</span>
            </Link></li>
          ))}
        </ul>
      </Section>
      </main>

      <PublicFooter />
    </div>
  );
}

export default HomePage;
