import { isFrenchLocale } from "./locale.ts";
import {
  lifecycleEmailCta,
  lifecycleEmailShell,
  type RenderedLifecycleEmail,
} from "./lifecycle_email.ts";

// FF-063 LOT 5 — L'ACTIVATION: LES DEUX ENDROITS OÙ ON PERD LES GENS.
//
// ── LE PREMIER TROU: L'ENTONNOIR PAS FRANCHI ────────────────────────────
// Quelqu'un crée un compte, arrive sur `/app/setup`, et s'arrête. Le signal
// est exact et il n'y en a qu'un: AUCUNE ligne `student_goals` — le même test
// que `hasAnsweredTheFunnel` (`frontend/src/keel/api/postLogin.ts:88`) et que
// la garde de route. Il n'existe aucune granularité d'abandon en base: pas de
// `setup_step`, pas de drapeau de progression, l'étape courante est un
// `useState` local. On sait donc « pas fini », jamais « fini à moitié ».
//
// ⚠️ H+24, PAS J+7. À J+7, la personne a oublié pourquoi elle s'est inscrite,
// et le mail devient une relance froide. La relance utile arrive le lendemain,
// pendant que l'intention est encore là — et sa promesse est vérifiable:
// FF-060 dérive la reprise des FAITS en base, donc « rien de ce que tu as
// répondu n'est à refaire » est vrai.
//
// J+7 existe quand même, mais ce n'est plus une relance: c'est une QUESTION,
// et elle ne porte aucun bouton. Un bouton la transformerait en seconde
// relance, et une question avec un bouton n'obtient pas de réponse.
//
// ── LE SECOND TROU: UN PLAN COMPOSÉ, RIEN APRÈS ─────────────────────────
// Le pire des deux, parce que la personne a TOUT fait: elle a répondu, elle a
// composé, elle a son plan. Et le produit ne sait pas si elle a cuisiné.
//
// ⚠️ CE QU'ON N'A PAS LE DROIT D'ÉCRIRE ICI. `has_any_trace = false` veut dire
// « aucune écriture » — pas « n'est pas revenue ». Lire son plan ne laisse
// AUCUNE trace dans ce dépôt. Un e-mail qui dirait « tu n'es pas revenu »
// serait donc faux pour quiconque a ouvert son plan tous les matins sans
// toucher une case. La seule phrase honnête est une question: est-ce que tu as
// cuisiné ? Et sa réponse sert même si la personne ne revient jamais.

/** Les trois moments de l'activation. */
export type ActivationSegment =
  | "funnel_unfinished_h24"
  | "funnel_unfinished_d7"
  | "first_plan_no_trace";

export interface ActivationFacts {
  /** `auth.users.email_confirmed_at`, ou `null` si l'adresse n'est pas confirmée. */
  confirmedAt: string | null;
  /** Une ligne `student_goals` existe-t-elle ? */
  hasGoals: boolean;
  /** Les plans vivants (`retired_at is null`). */
  livePlanCount: number;
  /** Le dernier jour couvert, ou `null`. */
  lastCoveredDay: string | null;
  /** Une case de cuisson, de courses ou un retour de plan existe-t-il ? */
  hasAnyTrace: boolean;
}

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

/**
 * Quel moment de l'activation, s'il y en a un ?
 *
 * L'ordre compte: quelqu'un qui n'a pas franchi l'entonnoir ne peut pas avoir
 * de plan, mais l'inverse n'est pas garanti — un compte peut porter un plan et
 * perdre sa ligne d'objectif (suppression manuelle, migration). On teste donc
 * l'entonnoir en premier et on ne retombe jamais dessus.
 */
export function activationSegmentFor(
  facts: ActivationFacts,
  todayLocal: string,
  now: Date,
): ActivationSegment | null {
  if (!facts.hasGoals) {
    // Une adresse non confirmée n'a jamais reçu le mail de bienvenue: lui
    // écrire « tu n'as pas fini » serait le PREMIER mot qu'on lui adresse, et
    // il parlerait d'un échec.
    if (!facts.confirmedAt) return null;
    const age = now.getTime() - Date.parse(facts.confirmedAt);
    if (!Number.isFinite(age)) return null;

    // Des fenêtres d'exactement 24 h, parce que le job passe une fois par jour
    // et par personne (à son heure locale). Plus large, quelqu'un pourrait
    // tomber deux fois dedans; plus étroit, il pourrait passer entre.
    if (age >= 1 * DAY_MS && age < 2 * DAY_MS) return "funnel_unfinished_h24";
    if (age >= 7 * DAY_MS && age < 8 * DAY_MS) return "funnel_unfinished_d7";
    return null;
  }

  // Le premier plan, et le silence complet après lui. `> 1` sort d'ici: à
  // partir du second plan, on est dans la fin de couverture ou le décrochage,
  // et ce n'est plus la même question.
  if (
    facts.livePlanCount === 1 &&
    !facts.hasAnyTrace &&
    facts.lastCoveredDay !== null &&
    facts.lastCoveredDay < todayLocal
  ) {
    return "first_plan_no_trace";
  }

  return null;
}

// ---------------------------------------------------------------------------
// LA COPIE
// ---------------------------------------------------------------------------

export interface ActivationEmailArgs {
  firstName: string | null;
  /** L'URL absolue de l'entonnoir (`/app/setup`) — utilisée par H+24 seul. */
  setupUrl: string;
  /** L'URL absolue de désinscription, jeton et `?lang=` compris. */
  unsubscribeUrl: string;
  locale: string;
}

function h24French(args: ActivationEmailArgs): RenderedLifecycleEmail {
  const name = args.firstName?.trim() || null;
  return {
    subject: "Il te reste trois questions",
    html: lifecycleEmailShell(
      [
        `        <p>${name ? `Hello ${name},` : "Hello,"}</p>`,
        "",
        "        <p>Tu as créé ton compte hier et tu n'as pas fini de répondre.",
        "        C'est court : ta date de naissance, ta taille, et la direction",
        "        que tu veux prendre.</p>",
        "",
        "        <p>Rien de ce que tu as déjà posé n'est à refaire — tu reprends",
        "        exactement où tu t'es arrêté, et ça se termine par ton premier",
        "        plan.</p>",
        "",
        lifecycleEmailCta(args.setupUrl, "Reprendre"),
        "",
        "        <p><strong>Sophia</strong></p>",
      ].join("\n"),
      { unsubscribeHref: args.unsubscribeUrl, locale: args.locale },
    ),
  };
}

function h24English(args: ActivationEmailArgs): RenderedLifecycleEmail {
  const name = args.firstName?.trim() || null;
  return {
    subject: "Three questions left",
    html: lifecycleEmailShell(
      [
        `        <p>${name ? `Hello ${name},` : "Hello,"}</p>`,
        "",
        "        <p>You created your account yesterday and did not finish",
        "        answering. It is short: your date of birth, your height, and the",
        "        direction you want to take.</p>",
        "",
        "        <p>Nothing you already answered is lost — you pick up exactly",
        "        where you stopped, and it ends with your first plan.</p>",
        "",
        lifecycleEmailCta(args.setupUrl, "Pick up where I left off"),
        "",
        "        <p><strong>Sophia</strong></p>",
      ].join("\n"),
      { unsubscribeHref: args.unsubscribeUrl, locale: args.locale },
    ),
  };
}

/**
 * J+7. ⛔ AUCUN BOUTON, ET C'EST LE POINT.
 *
 * À sept jours, la relance est faite. Ce qui reste utile est de savoir POURQUOI
 * quelqu'un s'est arrêté — et un bouton vers l'app transforme la question en
 * troisième relance, ce qui la fait mourir. On demande une phrase, on dit qu'on
 * prend, et on s'arrête là.
 */
function d7French(args: ActivationEmailArgs): RenderedLifecycleEmail {
  const name = args.firstName?.trim() || null;
  return {
    subject: "Une question, et je te laisse",
    html: lifecycleEmailShell(
      [
        `        <p>${name ? `Hello ${name},` : "Hello,"}</p>`,
        "",
        "        <p>Tu t'es inscrit il y a une semaine et tu n'es pas allé au",
        "        bout. C'est très bien — mais j'aimerais comprendre.</p>",
        "",
        "        <p><strong>Qu'est-ce qui t'a arrêté ?</strong> Trop de",
        "        questions, pas le bon moment, pas ce que tu cherchais, autre",
        "        chose ?</p>",
        "",
        "        <p>Réponds à ce message en une phrase, même brutale. Je prends,",
        "        et ça change ce qu'on construit.</p>",
        "",
        "        <p><strong>Sophia</strong></p>",
      ].join("\n"),
      { unsubscribeHref: args.unsubscribeUrl, locale: args.locale },
    ),
  };
}

function d7English(args: ActivationEmailArgs): RenderedLifecycleEmail {
  const name = args.firstName?.trim() || null;
  return {
    subject: "One question, then I'll leave you alone",
    html: lifecycleEmailShell(
      [
        `        <p>${name ? `Hello ${name},` : "Hello,"}</p>`,
        "",
        "        <p>You signed up a week ago and did not get to the end. That is",
        "        completely fine — but I would like to understand.</p>",
        "",
        "        <p><strong>What stopped you?</strong> Too many questions, wrong",
        "        moment, not what you were looking for, something else?</p>",
        "",
        "        <p>Reply to this message in one sentence, however blunt. I'll",
        "        take it, and it changes what we build.</p>",
        "",
        "        <p><strong>Sophia</strong></p>",
      ].join("\n"),
      { unsubscribeHref: args.unsubscribeUrl, locale: args.locale },
    ),
  };
}

/**
 * Un plan composé, aucune trace après.
 *
 * ⛔ NE DIT JAMAIS « tu n'es pas revenu ». Le produit ne le sait pas: lire son
 * plan ne laisse aucune trace. La seule affirmation vraie est qu'on n'a pas de
 * retour — et la seule phrase utile est une question dont la réponse sert même
 * si la personne ne revient jamais.
 */
function firstPlanFrench(args: ActivationEmailArgs): RenderedLifecycleEmail {
  const name = args.firstName?.trim() || null;
  return {
    subject: "Est-ce que tu as cuisiné ?",
    html: lifecycleEmailShell(
      [
        `        <p>${name ? `Hello ${name},` : "Hello,"}</p>`,
        "",
        "        <p>Tu as composé ton premier plan, et je n'ai aucun retour",
        "        dessus. Ce n'est pas un reproche — c'est juste que je ne sais",
        "        pas ce qu'il a donné.</p>",
        "",
        "        <p><strong>Est-ce que tu as cuisiné ?</strong> Et si oui,",
        "        qu'est-ce qui a coincé : les quantités, le temps, les courses,",
        "        le goût ?</p>",
        "",
        "        <p>Une phrase en réponse à ce message me suffit, et c'est ce qui",
        "        rend le plan suivant meilleur.</p>",
        "",
        "        <p><strong>Sophia</strong></p>",
      ].join("\n"),
      { unsubscribeHref: args.unsubscribeUrl, locale: args.locale },
    ),
  };
}

function firstPlanEnglish(args: ActivationEmailArgs): RenderedLifecycleEmail {
  const name = args.firstName?.trim() || null;
  return {
    subject: "Did you cook it?",
    html: lifecycleEmailShell(
      [
        `        <p>${name ? `Hello ${name},` : "Hello,"}</p>`,
        "",
        "        <p>You built your first plan, and I have no feedback on it.",
        "        That is not a complaint — I simply do not know how it went.</p>",
        "",
        "        <p><strong>Did you cook it?</strong> And if you did, what got in",
        "        the way: the amounts, the time, the shopping, the taste?</p>",
        "",
        "        <p>One sentence in reply to this message is enough, and it is",
        "        what makes the next plan better.</p>",
        "",
        "        <p><strong>Sophia</strong></p>",
      ].join("\n"),
      { unsubscribeHref: args.unsubscribeUrl, locale: args.locale },
    ),
  };
}

export function renderActivationEmail(
  segment: ActivationSegment,
  args: ActivationEmailArgs,
): RenderedLifecycleEmail {
  const fr = isFrenchLocale(args.locale);
  if (segment === "funnel_unfinished_h24") {
    return fr ? h24French(args) : h24English(args);
  }
  if (segment === "funnel_unfinished_d7") {
    return fr ? d7French(args) : d7English(args);
  }
  return fr ? firstPlanFrench(args) : firstPlanEnglish(args);
}
