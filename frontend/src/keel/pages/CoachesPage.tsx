import { useId, useState, type ReactNode } from "react";
import SEO from "../../components/SEO";
import { LEGAL_ENTITY, organizationStructuredData } from "../../lib/legalEntity";
import { PublicFooter, PublicHeader } from "../components/PublicHeader";
import { ButtonLink } from "../components/ui/Button";
import { Kicker, PriceCard, SectionTitle } from "../components/ui/Marketing";
import { formatPrice } from "../i18n/format";
import { PRICES } from "../i18n/prices";
import { t } from "../i18n/t";

/**
 * /coaches — LA PAGE DU PRATICIEN QUI VEND UNE FORMATION.
 *
 * L'acheteur paie et décide ; un élève n'arrive jamais ici.
 *
 * ── QUATRE BANDES, ET UNE SECTION = UNE LIGNE DE LA GRILLE ──────────────
 * Refonte « par la douleur » du 2026-08-13. La page avait SEPT sections
 * organisées par fonctionnalité ; elle en a QUATRE, organisées par douleur, et
 * `scratchpad/site/GRILLE-DOULEURS.md` ne donne que trois lignes à `/coaches` :
 *
 *   BANDE 1 · douleur 01 — « ma formation se termine, l'accompagnement meurt
 *             avec elle ». La méthode enregistrée une fois répond tous les
 *             jours ; ce qui se vendait une fois devient ce qu'on paie chaque
 *             mois. C'est le héros, et son titre n'a jamais été le problème.
 *   BANDE 2 · douleur 02 — « mes élèves ont une question le mardi soir ».
 *             Quatre points d'injection (B10), VRAI et sous-vendu.
 *   BANDE 3 · douleur 03 — « une IA dira le contraire de ce que j'enseigne ».
 *             Le bloc sombre est dépensé ICI, sur la seule GARANTIE de la page,
 *             et il porte la démonstration interactive.
 *   BANDE 4 · le prix ET la clôture, fusionnés. Un seul CTA, le même qu'en haut.
 *
 * ── LES DEUX SECTIONS COUPÉES, ET CE N'EST PAS PARCE QU'ELLES SONT FAUSSES ──
 * · `Monday` (« le lundi en une page ») est VRAIE (B11, B12, B14) et elle est
 *   partie : la grille l'a donnée à `/gyms` (douleur 02) et au hall `/pro`
 *   (ligne 04), pas ici. Une section = une ligne, et il n'y en a que trois.
 * · `Note` (la note 1:1 du coach sur un élève) est partie parce que la grille
 *   l'a explicitement ÉCARTÉE du monde pro : « utilisée, jamais citée » est une
 *   promesse de PROMPT sans vérificateur déterministe (B26,
 *   `_shared/keel/coach_note.ts:126-128`). On ne vend pas une garantie qui n'en
 *   est pas sur la page dont le sujet EST la différence entre les deux.
 *
 * ── LES SILENCES DÉLIBÉRÉS, REPRIS TELS QUELS (AUDIT §9) ────────────────
 * Chacun a coûté un incident. « Ça ne se voit pas » n'en lève aucun.
 *
 *  S1  Aucun canal 1:1 élève vers coach, et cette absence EST le produit : rien
 *      ici n'évoque une boîte, une file de réponses, un « il te répondra ».
 *      Elle est dite deux fois à l'AFFIRMATIVE (`hero.note`, `day.reserve`),
 *      parce qu'un coach cherche la boîte avant de croire à son absence.
 *  S2  ⚠️ RÈGLE AMENDÉE LE 2026-08-13 — LIS-LA AVANT DE « RÉPARER » UN MOT.
 *      Elle disait: « élèves / cohorte / ta méthode / ta voix. JAMAIS *ton
 *      client*, JAMAIS *suivi personnalisé* ». Les deux interdits n'avaient
 *      pas la même valeur, et un seul survit.
 *
 *      « SUIVI PERSONNALISÉ » RESTE INTERDIT, partout, sans exception: le
 *      produit ne suit personne individuellement, et le promettre est le
 *      mensonge le plus coûteux du lot.
 *
 *      « CLIENT » EST DÉSORMAIS LE MOT JUSTE — SAUF ICI. La règle a été
 *      écrite quand le seul acheteur était un coach qui vend une formation.
 *      La vitrine en a trois, et deux n'enseignent rien: une SALLE a des
 *      clients qui paient un abonnement, pas des élèves, et écrire « tes
 *      élèves » sur `/gyms` décrit une relation qui n'existe pas — c'est ce
 *      qui a fait écrire une douleur fausse pendant toute la première version
 *      (« après mes trois heures de coaching », alors que la plupart de ces
 *      gens n'ont jamais eu de coach).
 *
 *      DONC: `/gyms` et `/pro` disent CLIENTS. Cette page-ci garde ÉLÈVES,
 *      parce qu'ici ils ont choisi quelqu'un pour apprendre de lui — et c'est
 *      exactement ce qu'elle vend.
 *  S3  L'espace de l'élève est en PULL : il compose quand il l'ouvre. Dit dans
 *      `day.reserve` (« tes élèves ouvrent leur espace »).
 *  S4  NE JAMAIS réintroduire un « rien à ouvrir / rien à installer » : trois
 *      brouillons l'ont posé une rangée au-dessus de ce qu'il niait.
 *  S5  NE JAMAIS écrire « rien n'arrive la nuit » — faux : les heures calmes
 *      (21 h-8 h) ne couvrent que la relance ; le tap du soir tombe à 21 h 50.
 *  S6  Rien ne promet ce qui n'est pas PROUVÉ : silence tenu sur le suivi de
 *      poids (chemins d'écriture et de lecture en désaccord).
 *  S8  Un chiffre vient d'une source qu'on peut montrer, ou il n'apparaît pas.
 *      La page n'en porte plus que quatre — 14, 3, 7 €, 6 € — et les quatre
 *      sont ancrés. ⛔ Aucun chiffre de rétention (B31) : c'est la meilleure
 *      ligne de la page et elle dit précisément qu'on n'en a pas.
 *  S9  Aucune bande de risque ni tuile « on track » : elles viennent de
 *      l'évaluateur d'adhérence, débranché du 1:N par `20260803200000`.
 *      ⛔ Et rien ne dit « quelles parties de ta méthode tes élèves tiennent
 *      ou lâchent » : RIEN ne le calcule (B16).
 *  S10 Une maquette reprend le vrai champ MOT POUR MOT, ou ce n'est pas une
 *      maquette. Conséquence sur la démonstration du verrou: elle a la forme
 *      d'une FICHE À CHAMPS REMPLIS, jamais celle d'une capture — ni barre
 *      d'app, ni bulle de chat, ni cadre de téléphone. Ce qu'elle montre du
 *      produit (retenue déterministe, substitution, signature) est le
 *      mécanisme ; ce qu'elle montre de l'exemple est un champ que le coach
 *      remplit, et c'est étiqueté comme tel.
 *  S11 `docs/keel/LEGAL.md` §6.4 : jamais de comptage calorique par photo.
 *  S12 Aucun SKU élève : d'où « nous ne facturons jamais ton élève ».
 *
 * S7 est le seul silence RENVERSÉ, en connaissance de cause : « aucune teinte
 * d'accent ». La vitrine a `fig-700` (325°). Ce que la règle protégeait reste
 * vrai — la figue N'ENTRE JAMAIS DANS UNE PASTILLE, et aucune figure n'emploie
 * émeraude, ambre, rouge ni bleu. Ne retire pas la couleur en croyant réparer.
 * Autorité : `docs/keel/CHARTE-VITRINE.md` §2.
 *
 * ── TROIS CHOSES QU'ELLE NE FAIT PLUS, VOLONTAIREMENT ───────────────────
 * · Aucune redirection d'un visiteur connecté : l'adresse d'arrivée d'un compte
 *   n'est plus ici.
 * · Un seul CTA, répété DEUX fois : `/start` vend une autre offre à un autre
 *   acheteur.
 * · Le « double verrou » n'est plus symétrique : l'injection est une CONSIGNE,
 *   la relecture un MÉCANISME, dans cet ordre (B7/B8 → B8b). L'aveu est ce qui
 *   rend la garantie croyable ; la sur-vendre la ruinait.
 */
const COACHES_STRUCTURED_DATA = [
  organizationStructuredData(),
  {
    "@context": "https://schema.org", "@type": "SoftwareApplication", name: "Sophia",
    applicationCategory: "BusinessApplication", operatingSystem: "Web", inLanguage: "en-GB",
    url: `${LEGAL_ENTITY.siteUrl}/coaches`, description: t("coaches.seo_description"),
    publisher: organizationStructuredData(),
  },
];

export function CoachesPage() {
  return (
    <div className="min-h-screen bg-paper text-ink">
      <SEO
        title={t("coaches.seo_title")}
        description={t("coaches.seo_description")}
        canonical="https://sophia-coach.ai/coaches"
        structuredData={COACHES_STRUCTURED_DATA}
      />
      <PublicHeader />
      <main>
        <Hero />
        <Day />
        <Lock />
        <Price />
      </main>
      <PublicFooter />
    </div>
  );
}

/** Padding vertical par classes de bloc, jamais par le raccourci `padding` :
 *  `padding: 84px 0 76px` remet l'horizontal à zéro à 320 px (CHARTE §7). */
const Section = ({ children, dark = false }: { children: ReactNode; dark?: boolean }) => (
  <section className={dark ? "on-dark bg-fig-950 text-paper" : "border-b border-line"}>
    <div className="mx-auto max-w-[1200px] px-5 pt-11 pb-10 md:px-8 md:pt-21 md:pb-19">{children}</div>
  </section>
);

/** Le seul CTA de la page, répété une fois en clôture. */
const Cta = ({ label }: { label: string }) => (
  <ButtonLink to="/auth?role=coach" variant="brand" className="px-6 py-3 text-[1rem]">{label}</ButtonLink>
);

/** Une figure et sa légende. `fig-scroll` donne au SVG un plancher de 380 px et
 *  laisse le CONTENEUR défiler dessous : sur les 280 px utiles d'un téléphone de
 *  320, son texte tomberait sinon à 5 px.
 *  ⚠️ `min-w-0` est la moitié manquante du plancher : sans lui, c'est la PAGE qui
 *  défile en largeur (mesuré à 320 px : 420 px de contenu). L'élément de grille
 *  est ce `<figure>`, dont le `min-width: auto` fait grandir la piste jusqu'au
 *  plancher du SVG. Même piège que `flex-1` sur un input. */
const Figure = ({ children, caption }: { children: ReactNode; caption?: string }) => (
  <figure className="m-0 min-w-0">
    <div className="fig-scroll">{children}</div>
    {caption ? <figcaption className="mt-4 max-w-[62ch] text-sm leading-6 text-ink-soft">{caption}</figcaption> : null}
  </figure>
);

// ---------------------------------------------------------------------------
// BANDE 1 — douleur 01 : la formation se termine, l'accompagnement meurt avec.
// ---------------------------------------------------------------------------

const Hero = () => (
  <Section>
    <div className="grid gap-11 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:gap-16">
      <div>
        <Kicker>{t("coaches.hero.kicker")}</Kicker>
        <h1 className="mt-3 text-balance font-display text-hero">{t("coaches.hero.title")}</h1>
        <p className="mt-6 max-w-[62ch] text-lede text-ink-soft">{t("coaches.hero.lede")}</p>
        <div className="mt-8"><Cta label={t("coaches.hero.cta")} /></div>
        {/* fact: B5 — 20260727235000_keel_billing_seats.sql:110-136 (14 jours,
            3 élèves) · fact: B32 — coach-invite-student-v1:5-32 : invitation
            e-mail, aucun lien à copier · S1, à l'affirmative. */}
        <p className="mt-5 max-w-[52ch] text-sm leading-6 text-ink-soft">{t("coaches.hero.note")}</p>
      </div>
      {/* fact: B28 — la clé de cache est le HASH DU CONTENU
          (_shared/keel/doctrine.ts:38-43), donc une correction est visible au
          message suivant ; le rollback COPIE une version passée dans une neuve
          (coach-doctrine-v1/index.ts:1262-1295) sans perdre l'historique. */}
      <Figure caption={t("coaches.hero.fig_caption")}><AfterFigure /></Figure>
    </div>
  </Section>
);

// ---------------------------------------------------------------------------
// BANDE 2 — douleur 02 : mes élèves ont une question le mardi soir.
// ---------------------------------------------------------------------------

const Day = () => (
  <Section>
    <Kicker>{t("coaches.day.kicker")}</Kicker>
    <SectionTitle>{t("coaches.day.title")}</SectionTitle>
    <div className="mt-8 grid gap-11 lg:grid-cols-[1fr_1fr] lg:gap-16">
      <div>
        {/* Trois QUESTIONS D'ÉLÈVE, pas trois arguments : elles se lisent en une
            seconde et elles remplacent trois « statistiques » sans source (S8). */}
        <ul className="max-w-[52ch] border-t border-line">
          {[t("coaches.day.q1"), t("coaches.day.q2"), t("coaches.day.q3")].map((q) => (
            <li key={q} className="border-b border-line py-4 text-lg leading-7">{q}</li>
          ))}
        </ul>
        <p className="mt-6 max-w-[62ch] leading-7 text-ink-soft">{t("coaches.day.body")}</p>
        {/* La réserve honnête de cette bande : S1 (aucun canal 1:1 élève vers
            coach — `docs/keel/MODEL.md:33-34`) et S3 (l'espace élève est en
            PULL). Elle n'affaiblit pas l'argument, elle EST l'argument : ce qui
            répond le mardi soir répond sans toi. */}
        <p className="mt-6 max-w-[62ch] leading-7">{t("coaches.day.reserve")}</p>
      </div>
      {/* fact: B10 — TROIS points d'injection depuis le 2026-08-19 :
          sophia-brain/router/run.ts:2448 (le chat, via `doctrineBlockFor`) ·
          generate-meal-v1/index.ts:1729 · generate-household-meal-v1/index.ts:3569.
          ⚠️ Le quatrième, `generate-week-plan-v1`, a été RETIRÉ : aucun appelant
          vivant. La figure ci-contre est passée de quatre sorties à trois.
          ⚠️ « la doctrine entre à chaque message » serait FAUX (B7) :
          `withKeelDoctrineBlock` (run.ts:2353) n'a qu'UN appelant, le composeur
          (run.ts:7386). D'où « quatre endroits », jamais « partout ». */}
      <Figure><MethodFigure /></Figure>
    </div>
  </Section>
);

// ---------------------------------------------------------------------------
// BANDE 3 — douleur 03 : une IA dira le contraire de ce que j'enseigne.
// ---------------------------------------------------------------------------

/** LE BLOC SOMBRE — un seul par page, dépensé ici : c'est le seul argument du
 *  voisinage qui soit une GARANTIE et pas une promesse, et personne d'autre ne
 *  vend la relecture avant envoi. Il porte la démonstration. */
const Lock = () => (
  <Section dark>
    <Kicker onDark>{t("coaches.lock.kicker")}</Kicker>
    <h2 className="mt-3 max-w-[24ch] text-balance font-display text-title">{t("coaches.lock.title")}</h2>
    <div className="mt-8 grid gap-9 lg:grid-cols-[0.8fr_1.2fr] lg:items-start lg:gap-14">
      <div className="grid content-start gap-6">
        {/* fact: B8/B8b — un prompt est une consigne, pas une garantie. Le
            dépôt l'écrit lui-même : `_shared/keel/doctrine.ts:11-15`
            (« a very good instruction and a very bad guarantee »). */}
        <p className="max-w-[62ch] leading-7 text-fig-300">{t("coaches.lock.body")}</p>
        {/* ⚠️ fact: B8b — FORMULATION IMPOSÉE, dans son sens, mot pour mot.
            « Chaque message sortant est vérifié » est FAUX (B8) : quatre
            surfaces sont scannées — chat (keel_output_locks.ts:307), repas
            (meal_generation.ts:2441), semaines (week_plan_generation.ts:743),
            reco du jour (daily_recommendation.ts:520) — et QUATRE ne le sont
            pas : relance, récap du soir, bilan du dimanche, broadcast coach.
            D'où : la méthode ENTRE partout (consigne), le CHAT est RELU
            (mécanisme). La démonstration ci-contre porte donc sur le chat, et
            elle le dit. */}
        <p className="max-w-[62ch] text-lede">{t("coaches.lock.scope")}</p>
        {/* La réserve honnête de cette bande, sous la démonstration en pile
            mobile : le repli générique n'est JAMAIS signé quand le coach n'a
            rien écrit à la place (keel_output_locks.ts:202-209 —
            `usedCoachWords` gouverne la signature), et il n'invente aucune
            porte de retour (`DOCTRINE_BLOCK_FALLBACK_EN`, :151-164). */}
        <p className="max-w-[62ch] leading-7 text-fig-300">{t("coaches.lock.reserve")}</p>
      </div>
      <LockDemo />
    </div>
  </Section>
);

/**
 * ⭐ LA DÉMONSTRATION — la ligne rouge qui mord, et celle qui laisse passer.
 *
 * ── CE QU'ELLE A LE DROIT DE MONTRER ──────────────────────────────────────
 * Le MÉCANISME est du produit et se montre tel quel :
 *   · la retenue est DÉTERMINISTE, sans modèle dans la boucle —
 *     `_shared/keel/doctrine.ts:17-19` et `findDoctrineViolations` (:1077) ;
 *   · le message ENTIER est remplacé, jamais amputé d'une phrase —
 *     `skills/_shared/keel_output_locks.ts:37-41` ;
 *   · le remplacement est l'`instead` du coach, LITTÉRALEMENT ce que l'élève
 *     lit — `doctrine.ts:180-203`, appliqué par `resolveDoctrineReplacement`
 *     (`keel_output_locks.ts:183-201`) ;
 *   · la signature est un SUFFIXE, et seulement quand ce sont les mots du
 *     coach — `signAsCoach` (`keel_output_locks.ts:212-230`).
 *
 * L'EXEMPLE (la ligne rouge, ce qu'on dit à la place) est un CHAMP QUE LE COACH
 * REMPLIT. D'où la forme d'une fiche à champs remplis — étiquette au-dessus,
 * valeur en dessous — et jamais celle d'une capture d'écran : ni barre d'app,
 * ni bulle de chat, ni cadre de téléphone (S10, AUDIT §8 n°12, CHARTE §5).
 *
 * ── LE CAS QUI PASSE, ET C'EST LE PLUS BEAU DÉTAIL DU MODULE ──────────────
 * Le verrou tourne avec les EXCEPTIONS DE NÉGATION activées par défaut, et
 * c'est délibéré (`doctrine.ts:25-36`, `:1072-1076`, épinglé par
 * `doctrine_test.ts`) : « ton coach ne fait pas de six petits repas » DOIT
 * passer — cette phrase-là est la doctrine EN TRAIN DE FONCTIONNER. Le danger
 * est le PLAIDOYER, pas le mot. Un lecteur pro qui ne voit que la morsure
 * conclut « c'est un filtre de mots-clés, il rendra mon agent muet sur ma
 * propre méthode » ; les deux cas ensemble ferment cette objection.
 *
 * ⛔ CE QU'ELLE N'A PAS LE DROIT DE DIRE. B18 est FAUX : « c'est ton nom sur les
 * messages » ne s'écrit pas. L'agent s'appelle Sophia partout, et le nom du
 * coach n'apparaît qu'à DEUX endroits, dont cette substitution — c'est-à-dire
 * exactement ce que cette fiche montre, et rien de plus. Aucun white-label,
 * aucun « sous ta marque » (B19).
 *
 * ── LE PLANCHER TECHNIQUE ─────────────────────────────────────────────────
 * · Sans un geste du lecteur, l'état initial est DÉJÀ juste : le cas qui mord
 *   est celui qui est sélectionné au montage.
 * · De vrais `<input type="radio">` : un groupe est UNE tabulation, les flèches
 *   naviguent, et `aria-checked` est natif — l'état est ANNONCÉ, pas seulement
 *   coloré. La sortie est un `role="status" aria-live="polite"`.
 * · L'anneau de focus global est `fig-600`, qui tombe à 2,3:1 sur `fig-950` :
 *   il est REMPLACÉ ici par `fig-300` (8,06:1). Un `<input>` n'est de toute
 *   façon pas couvert par `:where(a, button, [tabindex])` de `tokens.css`.
 * · Séparateurs en `fig-700` (décoratif, 1,7:1) ; bordures de CONTRÔLE en
 *   `fig-300` (8,06:1 — WCAG 1.4.11 exige 3:1). Même partage que
 *   `line` / `line-strong` sur fond clair.
 * · Aucune transition, aucune animation : rien à neutraliser sous
 *   `prefers-reduced-motion`. Aucune dépendance ajoutée.
 */
const LockDemo = () => {
  const [held, setHeld] = useState(true);
  const groupName = useId();
  // Les deux cas sont écrits en toutes lettres : une clé construite par gabarit
  // compile et ne prouve plus rien (SOCLE §5).
  const cases = [
    { bites: true, draft: t("coaches.lock.demo.draft_a") },
    { bites: false, draft: t("coaches.lock.demo.draft_b") },
  ];
  return (
    <div className="min-w-0">
      <div className="min-w-0 rounded-fiche border border-fig-300 p-4 sm:p-6">
        <p className="eq eq-on-dark text-label font-semibold uppercase text-fig-300">
          {t("coaches.lock.demo.eq")}
        </p>

        {/* CE QUE LE COACH A ÉCRIT — deux champs remplis, et c'est tout ce que la
            fiche emprunte au produit côté saisie. */}
        <p className="mt-5 text-label font-semibold uppercase text-paper">
          {t("coaches.lock.demo.written_label")}
        </p>
        <dl className="mt-3 grid gap-5 sm:grid-cols-2">
          <DemoField label={t("coaches.lock.demo.line_label")}>{t("coaches.lock.demo.line_value")}</DemoField>
          {/* fact: B9 — `instead` est LITTÉRALEMENT ce que l'élève lit quand le
              verrou remplace une réponse (_shared/keel/doctrine.ts:196-203). */}
          <DemoField label={t("coaches.lock.demo.instead_label")}>{t("coaches.lock.demo.instead_value")}</DemoField>
        </dl>

        {/* `<fieldset>` SANS bordure : une bordure de fieldset est découpée par sa
            légende, donc le filet de séparation vit sur l'enveloppe. */}
        <div className="mt-6 border-t border-fig-700 pt-5">
          <fieldset className="min-w-0">
            <legend className="text-label font-semibold uppercase text-paper">
              {t("coaches.lock.demo.group_label")}
            </legend>
            <div className="mt-3 grid gap-2">
              {cases.map((c) => (
                <label
                  key={c.draft}
                  className="flex min-w-0 cursor-pointer items-start gap-3 rounded-card border border-fig-300 px-3 py-3 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-fig-300 sm:px-4"
                >
                  <input
                    type="radio"
                    name={groupName}
                    className="sr-only"
                    checked={held === c.bites}
                    onChange={() => setHeld(c.bites)}
                  />
                  {/* Le témoin est DESSINÉ, pas coloré : sur une page de vente il
                      n'y a pas d'état, donc pas de pastille de couleur (CHARTE §2
                      — la figue n'entre jamais dans une pastille). */}
                  <span aria-hidden="true" className="mt-1.5 grid h-4 w-4 shrink-0 place-items-center rounded-full border border-fig-300">
                    {held === c.bites ? <span className="h-2 w-2 rounded-full bg-fig-300" /> : null}
                  </span>
                  <span className={`min-w-0 leading-7 ${held === c.bites ? "font-medium text-paper" : "text-fig-300"}`}>
                    {c.draft}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        </div>

        {/* CE QUE L'ÉLÈVE LIT. Le verdict est un MOT, jamais une couleur. */}
        <div role="status" aria-live="polite" className="mt-6 min-w-0 border-t border-fig-700 pt-5">
          <p className="text-label font-semibold uppercase text-paper">{t("coaches.lock.demo.out_label")}</p>
          <p className="mt-3 text-lede font-medium">
            {held ? t("coaches.lock.demo.verdict_a") : t("coaches.lock.demo.verdict_b")}
          </p>
          <p className="mt-3 max-w-[52ch] leading-7">
            {held ? t("coaches.lock.demo.instead_value") : t("coaches.lock.demo.draft_b")}
          </p>
          {/* La signature suit les MOTS DU COACH, jamais autre chose
              (keel_output_locks.ts:200,326-331). Pas de nom, pas de signature. */}
          {held ? <p className="mt-3 text-sm text-fig-300">{t("coaches.lock.demo.sign")}</p> : null}
          <p className="mt-4 max-w-[52ch] text-sm leading-6 text-fig-300">
            {held ? t("coaches.lock.demo.why_a") : t("coaches.lock.demo.why_b")}
          </p>
        </div>
      </div>
      {/* La légende de la fiche, HORS de la fiche : dedans elle se confondait
          avec le « pourquoi », qui lui change avec le cas choisi. */}
      <p className="mt-4 max-w-[62ch] text-sm leading-6 text-fig-300">{t("coaches.lock.demo.foot")}</p>
    </div>
  );
};

/** Un champ de fiche : l'étiquette au-dessus, la valeur en dessous — la
 *  grammaire de `Field` dans `MealPrepPage`, locale à cette page (une primitive
 *  partagée change de sens sur deux pages quand on en édite une). */
const DemoField = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="min-w-0">
    <dt className="text-label font-semibold uppercase text-fig-300">{label}</dt>
    <dd className="mt-2 max-w-[52ch] leading-7">{children}</dd>
  </div>
);

// ---------------------------------------------------------------------------
// BANDE 4 — le prix ET la clôture. Elles fusionnent : la dernière phrase de la
// page est son titre de section, et le CTA d'en haut est répété une fois.
// ---------------------------------------------------------------------------

const Price = () => (
  <Section>
    <Kicker>{t("coaches.price.kicker")}</Kicker>
    <SectionTitle>{t("coaches.price.title")}</SectionTitle>
    {/* UNE SEULE CARTE, ET C'EST LE MESSAGE : il y en avait deux, et l'addition
        avait un point mort à ~13 élèves que l'essai fait démarrer à 3.
        fact: B1 — stripe-create-checkout-session/index.ts:121-126
        (`legacyTierPriceId = null` sur le chemin coach, seul
        `STRIPE_PRICE_ID_COACH_SEAT_*` est réclamé) : le siège est le seul poste. */}
    <div className="mt-8 grid gap-11 lg:grid-cols-[auto_1fr] lg:items-start lg:gap-16">
      <div className="sm:max-w-sm">
        {/* ⚠️ LA CARTE A BESOIN D'UN PARENT À ELLE, ET C'EST MESURÉ.
            `PriceCard` rend un `Card` en `h-full` (`height: 100%`). Posée en
            enfant DIRECT d'un élément de grille qui porte aussi un frère, la
            hauteur en pourcentage se résout contre la piste, la piste se
            dimensionne sur la carte seule, et le frère DÉBORDE sous l'élément
            suivant — mesuré à 320 px : 291 px de contenu dans une piste de
            247 px, donc 44 px de chevauchement sur le paragraphe d'à côté.
            Un bloc intermédiaire à hauteur automatique referme le cycle. */}
        <div><PriceCard
          price={formatPrice(PRICES.seat)}
          period={t("coaches.price.seat_period")}
          label={t("coaches.price.seat_label")}
        /></div>
        {/* fact: B3 — 6 € le SIÈGE payé à l'année. ⛔ JAMAIS B2 (« quand ton
            élève a payé son année ») : l'intervalle vient de `body.interval`
            (stripe-create-checkout-session/index.ts:124-126), posé par les
            boutons DU COACH (CoachBillingPage.tsx:255-274). */}
        <p className="mt-4 max-w-[46ch] text-sm leading-6 text-ink-soft">
          {formatPrice(PRICES.seatYearly)} {t("coaches.price.yearly")}
        </p>
      </div>
      <div className="grid content-start gap-6">
        {/* fact: B4 — stripe-reconcile-seats:18-35 : un RECALCUL depuis le
            ledger, jamais un incrément, donc on arrête de payer le mois où l'on
            éteint un siège · fact: B6 — un coach à ZÉRO élève est refusé au
            checkout (`no_billable_seat`, stripe-create-checkout-session:443-449) :
            « positif dès le premier élève » ne s'écrit pas sans cette réserve,
            alors on écrit la réserve · S12 — aucun SKU élève. */}
        <p className="max-w-[62ch] leading-7 text-ink-soft">{t("coaches.price.body")}</p>
        {/* fact: B31 — rien dans le dépôt ne mesure le churn contre un témoin.
            La meilleure ligne des trois pages actuelles ; conservée verbatim. */}
        <p className="max-w-[62ch] text-lede">{t("coaches.price.no_number")}</p>
        <div className="flex flex-wrap items-center gap-4">
          <Cta label={t("coaches.price.cta")} />
          {/* fact: B5 — 20260727235000_keel_billing_seats.sql:110-136. */}
          <span className="text-sm text-ink-soft">{t("coaches.price.trial_note")}</span>
        </div>
      </div>
    </div>
  </Section>
);

// ---------------------------------------------------------------------------
// LES FIGURES — règles de `docs/keel/CHARTE-VITRINE.md` §5. Grille de 480, deux
// épaisseurs et pas trois (2 = une chose réelle, 1 = une annotation), angles
// fermés, coordonnées entières, cinq jetons, UNE pièce chaude par figure. Une
// sixième couleur voudrait dire que la figure est fausse, pas la palette trop
// courte. Elles sont LOCALES à cette page.
// ---------------------------------------------------------------------------
const INK = "var(--ill-ink, #23191F)";
const SOFT = "var(--ill-ink-soft, #6A5A64)";
const PAPER = "var(--ill-paper, #FBF8FA)";
const WASH = "var(--ill-wash, #EFE0E9)";
const FIG = "var(--ill-fig, #632C4C)";

/** L'équerre ET son libellé, indissociables : elle n'encadre pas, elle ouvre, et
 *  elle ne flotte jamais seule. Elle porte la première des deux occurrences de
 *  `--ill-fig` de la figure ; la seconde est le sujet. */
const EqLabel = (p: { d: string; x: number; y: number; children: string }) => (
  <>
    <path d={p.d} fill="none" stroke={FIG} strokeWidth="2" strokeLinecap="round" />
    <text x={p.x} y={p.y} fontSize="11" fontWeight="600" letterSpacing="1.2" fill={SOFT}>{p.children}</text>
  </>
);

/** Trois tailles et pas une de plus : 13 = valeur, 11 = ligne, 9 = étiquette. */
const Tx = (p: { x: number; y: number; s: 9 | 11 | 13; fill?: string; children: string }) => (
  <text x={p.x} y={p.y} fontSize={p.s} fill={p.fill ?? INK}
        fontWeight={p.s === 9 ? 600 : undefined} letterSpacing={p.s === 9 ? 1 : undefined}>
    {p.children}
  </text>
);

/**
 * BANDE 1 — LA FORMATION QUI S'ARRÊTE, LA MÉTHODE QUI CONTINUE.
 *
 * Deux lignes sur une même durée, et un trait vertical : la dernière vidéo.
 * La formation est une boîte FERMÉE qui bute dessus. La méthode est la même
 * boîte, ENREGISTRÉE AU MÊME MOMENT, mais elle ne se referme pas à droite : son
 * arête basse traverse le trait et devient la ligne du temps qui continue. Un
 * seul tracé, une seule pièce chaude — et c'est la même grammaire que
 * l'équerre, qui n'encadre jamais et ouvre toujours.
 *
 * ⚠️ Rien ici n'est une mesure (CHARTE §5) : les traits internes disent « des
 * modules » et « des jours », pas un nombre de modules ni un nombre de jours.
 * Aucun montant n'est dessiné — « ce qui se vendait une fois devient ce qu'on
 * paie chaque mois » est une phrase du chapô, pas une courbe (S8).
 */
const AfterFigure = () => (
  <svg viewBox="0 0 480 236" className="h-auto w-full max-w-[560px]" role="img"
       aria-labelledby="fig-after-t fig-after-d">
    <title id="fig-after-t">{t("coaches.fig.after.title")}</title>
    <desc id="fig-after-d">{t("coaches.fig.after.desc")}</desc>
    <EqLabel d="M 8 32 L 8 16 A 8 8 0 0 1 16 8 L 32 8" x={44} y={26}>{t("coaches.fig.after.eq")}</EqLabel>

    {/* LA DERNIÈRE VIDÉO — tracée en premier : l'arête droite de la formation
        la recouvre, et c'est le dessin de « elle s'arrête là ». */}
    <path d="M 284 60 L 284 208" fill="none" stroke={SOFT} strokeWidth="1" />
    <Tx x={292} y={52} s={9} fill={SOFT}>{t("coaches.fig.after.end")}</Tx>

    {/* LA FORMATION — fermée des quatre côtés, et pleine (le lavis se lit
        « plein »). Elle ne dépasse pas le trait. */}
    <Tx x={24} y={52} s={9} fill={SOFT}>{t("coaches.fig.after.course")}</Tx>
    <rect x="24" y="64" width="260" height="48" rx="12" fill={WASH} stroke={INK} strokeWidth="2" />
    <Tx x={40} y={93} s={13}>{t("coaches.fig.after.modules")}</Tx>
    <g fill="none" stroke={SOFT} strokeWidth="1" strokeLinecap="round">
      {[170, 188, 206, 224, 242, 260].map((x) => <path key={x} d={`M ${x} 78 L ${x} 98`} />)}
    </g>

    {/* LA MÉTHODE — un seul tracé : la boîte s'ouvre à droite et son arête
        basse devient la ligne qui continue. */}
    <Tx x={24} y={132} s={9} fill={SOFT}>{t("coaches.fig.after.method")}</Tx>
    <g fill="none" stroke={FIG} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M 284 144 L 36 144 A 12 12 0 0 0 24 156 L 24 180 A 12 12 0 0 0 36 192 L 448 192" />
      <path d="M 440 186 L 448 192 L 440 198" />
    </g>
    <Tx x={40} y={173} s={13}>{t("coaches.fig.after.recorded")}</Tx>
    <g fill="none" stroke={SOFT} strokeWidth="1" strokeLinecap="round">
      {[300, 320, 340, 360, 380, 400, 420].map((x) => <path key={x} d={`M ${x} 192 L ${x} 202`} />)}
    </g>
    <Tx x={296} y={220} s={11}>{t("coaches.fig.after.every_day")}</Tx>
  </svg>
);

/**
 * BANDE 2 — LA MÉTHODE ET LES TROIS CHOSES QU'ELLE COMPOSE.
 *
 * La distribution est un BUS à 0° et 90° : des obliques vers des hauteurs
 * différentes n'auraient pas pu tomber sur des angles fermés. Les sorties sont
 * le même rectangle, répété — une taille dessinée est une affirmation de
 * mesure, et rien ici ne mesure laquelle pèse le plus.
 */
const MethodFigure = () => (
  <svg viewBox="0 0 480 240" className="h-auto w-full max-w-[560px]" role="img"
       aria-labelledby="fig-method-t fig-method-d">
    <title id="fig-method-t">{t("coaches.fig.method.title")}</title>
    <desc id="fig-method-d">{t("coaches.fig.method.desc")}</desc>
    <EqLabel d="M 8 32 L 8 16 A 8 8 0 0 1 16 8 L 32 8" x={44} y={26}>{t("coaches.fig.method.eq")}</EqLabel>
    <rect x="24" y="56" width="192" height="160" rx="12" fill={WASH} stroke={FIG} strokeWidth="2" />
    <Tx x={40} y={80} s={9} fill={SOFT}>{t("coaches.fig.method.source")}</Tx>
    <Tx x={40} y={106} s={13}>{t("coaches.fig.method.l1")}</Tx>
    <Tx x={40} y={130} s={13}>{t("coaches.fig.method.l2")}</Tx>
    <Tx x={40} y={154} s={13}>{t("coaches.fig.method.l3")}</Tx>
    <Tx x={40} y={178} s={13}>{t("coaches.fig.method.l4")}</Tx>
    {/* ⚠️ TROIS SORTIES DEPUIS LE 2026-08-19, ET LA GÉOMÉTRIE A SUIVI. La
        quatrième était « la semaine qu'ils composent »: sa lane a été retirée
        (aucun appelant vivant). Le pas de 48 et la largeur sont inchangés;
        seul le bus se recentre sur 136, qui est le milieu du bloc d'entrée
        (y=56, h=160). Une figure qui garde quatre boîtes pour trois sorties
        affirme une mesure que le produit ne rend plus. */}
    <g fill="none" stroke={SOFT} strokeWidth="1" strokeLinecap="round">
      <path d="M 216 136 L 252 136" />
      <path d="M 252 88 L 252 184" />
      {[88, 136, 184].map((y) => <path key={y} d={`M 252 ${y} L 284 ${y}`} />)}
    </g>
    <rect x="284" y="68" width="172" height="40" rx="12" fill={PAPER} stroke={INK} strokeWidth="2" />
    <Tx x={300} y={93} s={13}>{t("coaches.fig.method.out1")}</Tx>
    <rect x="284" y="116" width="172" height="40" rx="12" fill={PAPER} stroke={INK} strokeWidth="2" />
    <Tx x={300} y={141} s={13}>{t("coaches.fig.method.out2")}</Tx>
    <rect x="284" y="164" width="172" height="40" rx="12" fill={PAPER} stroke={INK} strokeWidth="2" />
    <Tx x={300} y={189} s={13}>{t("coaches.fig.method.out3")}</Tx>
  </svg>
);

export default CoachesPage;
