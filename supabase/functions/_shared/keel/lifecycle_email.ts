import { isFrenchLocale } from "./locale.ts";
import { localDateInZone, localHourInZone } from "./local_date.ts";
import { sendResendEmail } from "../resend.ts";

// FF-063 LOT 2 — LE SOCLE D'ENVOI DES E-MAILS DE CYCLE DE VIE.
//
// UN SEUL endroit décide si un e-mail de cycle de vie part. Les quatre
// écrivains d'e-mails existants (`send-welcome-email`, `account-deletion-v1`,
// `coach-invite-student-v1`, `account-export-v1`) portent chacun leur propre
// version de la même relecture — et c'est acceptable parce qu'ils sont
// TRANSACTIONNELS: ils exécutent une demande, ils n'ont ni consentement à
// respecter ni cadence à tenir. Ce module est pour les autres.
//
// ── CE QUE « CYCLE DE VIE » VEUT DIRE, ET CE QUE ÇA CHANGE ────────────────
// Un e-mail de cycle de vie est un e-mail que PERSONNE N'A DEMANDÉ: « ton plan
// se termine demain », « on ne t'a pas vu depuis quinze jours ». Il relève donc
// du consentement, il a besoin d'une sortie, et il a besoin d'un plafond.
// Un reçu Stripe, une réinitialisation de mot de passe ou un export de données
// ne passent JAMAIS par ici: les couper laisserait quelqu'un sans trace écrite
// d'une chose qu'il a lui-même déclenchée.
//
// ── POURQUOI CE MODULE VIT DANS `_shared/keel/` ET PAS `_shared/` ─────────
// `scripts/agent-gate.sh:193-212` ne lance `deno test` que sur `_shared/keel/`.
// `_shared/lifecycle_emails_locale_test.ts` — la garde de parité des quatre
// e-mails transactionnels — n'est donc lancée par personne, et on le découvre
// en lisant le gate, pas en le regardant verdir. Les gardes de ce lot sont
// posées là où elles TOURNENT.

// ---------------------------------------------------------------------------
// LE VOCABULAIRE
// ---------------------------------------------------------------------------

/**
 * Les types d'e-mail de cycle de vie, vocabulaire FERMÉ.
 *
 * R6 en esprit: chaque valeur est écrite par une branche nommée du job, a une
 * copie dans DEUX langues, et se relit dans `communication_logs.type`. Un type
 * ouvert produirait des lignes de journal que personne ne sait interpréter
 * six mois plus tard — c'est exactement ce qu'on lit aujourd'hui dans les
 * quatre `trial_ended_j_plus_*` d'un produit qui n'existe plus.
 */
export const LIFECYCLE_EMAIL_TYPES = [
  // S1 — inscrit, entonnoir pas franchi.
  "funnel_unfinished_h24",
  "funnel_unfinished_d7",
  // S2 — un plan composé, aucune trace après.
  "first_plan_no_trace",
  // S3 — la fin de couverture. Le cœur de la séquence.
  "coverage_ends_tomorrow",
  "coverage_lapsed_d3",
  // S4 — le décrochage long.
  "long_lapse_d14",
  // S5 — le désabonnement (émis par le webhook Stripe, pas par le cron).
  "cancel_intent",
  "cancel_effective",
  // S6 — la fin d'essai.
  "trial_ends_tomorrow",
  "trial_ended_d1",
  "trial_ended_d4",
] as const;

export type LifecycleEmailType = typeof LIFECYCLE_EMAIL_TYPES[number];

const LIFECYCLE_TYPE_SET: ReadonlySet<string> = new Set(LIFECYCLE_EMAIL_TYPES);

export function isLifecycleEmailType(value: string): value is LifecycleEmailType {
  return LIFECYCLE_TYPE_SET.has(value);
}

/**
 * L'ORDRE TOTAL. Une personne, un e-mail par passage — et quand deux segments
 * matchent, c'est cette liste qui tranche, pas l'ordre des `if` d'une boucle.
 *
 * Elle contient les ONZE types, y compris les deux que le cron n'émet jamais
 * (`cancel_*`, émis par le webhook Stripe): un ordre partiel serait un ordre
 * qu'on croit total, et le jour où un segment de plus arrive on saurait où le
 * ranger sans relire le job.
 *
 * ── LES TROIS ARBITRAGES QUI NE SONT PAS ÉVIDENTS ───────────────────────
 * 1. `cancel_*` et `trial_*` PASSENT DEVANT TOUT. Ils portent un fait sur
 *    l'ACCÈS: écrire « ton plan se termine demain » à quelqu'un dont
 *    l'abonnement s'arrête ce soir se lit comme une insulte.
 * 2. `coverage_ends_tomorrow` PASSE DEVANT `first_plan_no_trace`. C'est le
 *    seul e-mail de la séquence qui arrive AVANT le problème; le reporter
 *    d'un jour lui retire toute sa valeur, alors qu'une question peut attendre.
 * 3. `first_plan_no_trace` PASSE DEVANT `coverage_lapsed_d3`, et les deux se
 *    recouvrent vraiment: un premier plan jamais touché qui s'est terminé il y
 *    a exactement trois jours coche les deux. Le premier gagne parce qu'il est
 *    PLUS SPÉCIFIQUE — « tu n'as jamais rien coché » dit quelque chose que
 *    « rien de prévu depuis trois jours » ne dit pas — et parce que sa
 *    question sert même si la personne ne revient jamais.
 */
export const LIFECYCLE_PRIORITY: readonly LifecycleEmailType[] = [
  "cancel_intent",
  "cancel_effective",
  "trial_ends_tomorrow",
  "trial_ended_d1",
  "trial_ended_d4",
  "coverage_ends_tomorrow",
  "first_plan_no_trace",
  "coverage_lapsed_d3",
  "funnel_unfinished_h24",
  "funnel_unfinished_d7",
  "long_lapse_d14",
];

/**
 * Le gagnant parmi les segments qui matchent, ou `null` si aucun.
 *
 * Un candidat inconnu de `LIFECYCLE_PRIORITY` est IGNORÉ plutôt que rangé en
 * dernier: se retrouver au bout d'une liste par défaut est exactement la façon
 * dont un nouveau type n'est jamais envoyé sans que personne le remarque.
 */
export function chooseLifecycleSegment(
  candidates: ReadonlyArray<LifecycleEmailType | null>,
): LifecycleEmailType | null {
  const present = new Set(candidates.filter(Boolean) as LifecycleEmailType[]);
  for (const type of LIFECYCLE_PRIORITY) {
    if (present.has(type)) return type;
  }
  return null;
}

/**
 * Les motifs de refus. FERMÉS eux aussi, et c'est ce qui rend le compte-rendu
 * du job lisible: `skipped_by_reason` nomme pourquoi personne n'a reçu, et
 * « zéro envoi » cesse d'être indistinguable d'une panne.
 */
export type LifecycleRefusal =
  /** La personne a coupé les e-mails de cycle de vie. */
  | "opted_out"
  /** Compte en attente de suppression: aucun traitement proactif (RGPD). */
  | "deletion_pending"
  /** Adresse éphémère de banc QA (`@example.com`). */
  | "ephemeral"
  /** Aucune adresse: rien à faire, et ce n'est pas une erreur. */
  | "no_email"
  /** Ce type est déjà parti pour cette personne (et cette clé de dédup). */
  | "already_sent"
  /** Quatre e-mails sur trente jours glissants: c'est le plafond. */
  | "monthly_cap"
  /** Moins de soixante-douze heures depuis le dernier. */
  | "too_soon"
  /** Un message in-app est déjà parti aujourd'hui, dans SA journée. */
  | "proactive_spoke_today";

export type LifecycleVerdict =
  | { ok: true }
  | { ok: false; reason: LifecycleRefusal };

// ---------------------------------------------------------------------------
// LA CADENCE — les trois nombres, et le seul endroit où ils vivent
// ---------------------------------------------------------------------------

/**
 * Quatre e-mails de cycle de vie par personne, sur trente jours glissants.
 *
 * Décidé par le propriétaire le 2026-09-09. Le chiffre n'est pas une mesure,
 * c'est un arbitrage: assez pour couvrir une fin de plan, une relance et une
 * fin d'essai dans le même mois, jamais assez pour saturer. Il est GLOBAL —
 * tous types confondus — parce qu'un plafond par famille se contourne en
 * ajoutant une famille.
 */
export const LIFECYCLE_MONTHLY_CAP = 4;

/** La fenêtre glissante du plafond, en jours. */
export const LIFECYCLE_CAP_WINDOW_DAYS = 30;

/**
 * Jamais deux e-mails de cycle de vie en moins de soixante-douze heures.
 *
 * Le plafond mensuel seul autoriserait quatre envois le même jour, ce qui est
 * la forme la plus efficace de faire cliquer sur « spam ».
 */
export const LIFECYCLE_QUIET_HOURS = 72;

/**
 * L'heure LOCALE d'envoi. Le job est horaire (un job quotidien ne servirait
 * correctement qu'un seul fuseau) et n'agit que sur les personnes dont c'est
 * cette heure-là chez elles.
 */
export const LIFECYCLE_SEND_HOUR = 10;

const HOUR_MS = 3_600_000;

// ---------------------------------------------------------------------------
// LA DÉCISION — pure, testable, sans base
// ---------------------------------------------------------------------------

/**
 * Tout ce que la décision a besoin de savoir. L'appelant le charge; la
 * décision ne lit rien elle-même.
 *
 * La séparation n'est pas décorative: les sept refus se testent ici en
 * quelques lignes, alors qu'un `if` dans une boucle de balayage demanderait
 * une pile Supabase et une fixture par cas.
 */
export interface LifecycleCadenceFacts {
  /** `profiles.lifecycle_emails_opted_out_at`. */
  optedOutAt: string | null;
  /** `profiles.account_status`. */
  accountStatus: string | null;
  /** L'adresse de destination, déjà résolue. */
  email: string | null;
  /**
   * Ce type est-il DÉJÀ parti pour cette personne ?
   *
   * Requête à part, et pas un filtre sur `recentSentAt`: la dédup est « à
   * vie » (on n'envoie pas deux fois « ton entonnoir n'est pas fini »), alors
   * que le plafond est glissant. Les confondre ferait repartir un e-mail
   * unique au trente-et-unième jour.
   */
  alreadySent: boolean;
  /** Les instants d'envoi des `LIFECYCLE_CAP_WINDOW_DAYS` derniers jours. */
  recentSentAt: readonly string[];
  /**
   * Un message proactif in-app est-il déjà parti dans SA journée locale ?
   *
   * `keel-proactive-v1` et `keel-reengage-v1` parlent déjà dans l'app. Sans
   * cette ligne, la même remarque arrive deux fois le même jour par deux
   * canaux — et la personne ne voit pas deux systèmes, elle voit un produit
   * qui insiste.
   */
  proactiveSpokeToday: boolean;
}

/** `true` si l'adresse est une bouche de banc QA. */
export function isEphemeralEmail(email: string | null | undefined): boolean {
  return String(email ?? "").trim().toLowerCase().endsWith("@example.com");
}

/**
 * Faut-il envoyer ?
 *
 * ⚠️ L'ORDRE DES SEPT REFUS EST LE CONTRAT. Il va du plus définitif au plus
 * conjoncturel, et c'est ce qui rend `skipped_by_reason` interprétable: une
 * personne comptée en `monthly_cap` n'est PAS une personne qui s'est
 * désinscrite, et si le plafond passait en premier on ne le saurait jamais.
 */
export function decideLifecycleSend(
  facts: LifecycleCadenceFacts,
  now: Date,
): LifecycleVerdict {
  if (facts.optedOutAt) return { ok: false, reason: "opted_out" };

  if (String(facts.accountStatus ?? "") === "deletion_pending") {
    return { ok: false, reason: "deletion_pending" };
  }

  const email = String(facts.email ?? "").trim();
  if (!email) return { ok: false, reason: "no_email" };
  if (isEphemeralEmail(email)) return { ok: false, reason: "ephemeral" };

  if (facts.alreadySent) return { ok: false, reason: "already_sent" };

  const nowMs = now.getTime();
  const sent = facts.recentSentAt
    .map((iso) => Date.parse(iso))
    .filter((ms) => Number.isFinite(ms));

  // Le plafond AVANT le silence de 72 h: « quatre ce mois-ci » est un fait sur
  // le mois, « le dernier était hier » est un fait sur la journée. Les deux
  // refusent, mais le premier est celui qu'on veut lire dans un compte-rendu.
  const inWindow = sent.filter(
    (ms) => nowMs - ms <= LIFECYCLE_CAP_WINDOW_DAYS * 24 * HOUR_MS,
  );
  if (inWindow.length >= LIFECYCLE_MONTHLY_CAP) {
    return { ok: false, reason: "monthly_cap" };
  }

  const mostRecent = sent.length > 0 ? Math.max(...sent) : null;
  if (mostRecent !== null && nowMs - mostRecent < LIFECYCLE_QUIET_HOURS * HOUR_MS) {
    return { ok: false, reason: "too_soon" };
  }

  if (facts.proactiveSpokeToday) {
    return { ok: false, reason: "proactive_spoke_today" };
  }

  return { ok: true };
}

/**
 * Est-ce l'heure d'écrire à cette personne ?
 *
 * ⚠️ POSTURE `null` ⇒ NON, et c'est une TROISIÈME posture assumée sur le même
 * calcul. `local_date.ts` JETTE sur un fuseau illisible parce qu'une
 * composition de plan rangée au mauvais jour est pire qu'une composition
 * absente. Ici, un fuseau illisible ne doit ni faire tomber le balayage de la
 * flotte entière, ni autoriser un envoi: on se tait pour cette personne, et le
 * job continue. C'est la posture de `reengagement_io.ts::localHourFor`, reprise
 * ici plutôt qu'importée — ce module ne peut pas tirer le client Gemini et la
 * livraison de chat que `reengagement_io.ts` embarque.
 */
export function isLifecycleSendHour(
  timezone: string | null,
  now: Date,
  hour: number = LIFECYCLE_SEND_HOUR,
): boolean {
  const zone = String(timezone ?? "").trim();
  if (!zone) return false;
  try {
    return localHourInZone(zone, now) === hour;
  } catch {
    return false;
  }
}

/**
 * La journée locale de cette personne, ou `null` si son fuseau est illisible.
 *
 * Sert à la garde `proactive_spoke_today`, qui compare à
 * `proactive_job_state.last_sent_local_date`. Un `null` ici veut dire « on ne
 * sait pas quel jour il est chez elle » — l'appelant ne doit alors pas envoyer,
 * pour la même raison que ci-dessus.
 */
export function lifecycleLocalDate(
  timezone: string | null,
  now: Date,
): string | null {
  const zone = String(timezone ?? "").trim();
  if (!zone) return null;
  try {
    return localDateInZone(zone, now);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// LES ADRESSES
// ---------------------------------------------------------------------------

/**
 * La racine des liens d'e-mail.
 *
 * ⚠️ DÉPLACÉE ICI DEPUIS `send-welcome-email/index.ts:16-21`, MOT POUR MOT,
 * repli compris. Durcir le repli en `throw` au passage aurait changé le
 * comportement du seul e-mail qui part aujourd'hui — un durcissement se décide,
 * il ne se ramasse pas en déménageant une fonction. Ce que ça coûte est écrit:
 * sans `APP_BASE_URL`, les liens pointent sur le domaine deviné ci-dessous.
 */
export function appBaseUrl(): string {
  return (Deno.env.get("APP_BASE_URL") ?? "https://sophia-coach.ai").trim()
    .replace(/\/+$/, "");
}

/**
 * Le lien de désinscription d'un destinataire.
 *
 * `lang` est PORTÉ PAR L'URL parce que `/unsubscribe` n'est pas une surface
 * routée par langue (voir `i18n/localeRoutes.ts`): c'est une porte
 * fonctionnelle, et les portes suivent le visiteur par `?lang=`. Sans ce
 * paramètre, quelqu'un dont le navigateur est anglais lirait un écran anglais
 * au bout d'un e-mail français.
 */
export function unsubscribeUrl(token: string, locale: string): string {
  const lang = isFrenchLocale(locale) ? "fr" : "en";
  return `${appBaseUrl()}/unsubscribe?token=${
    encodeURIComponent(token)
  }&lang=${lang}`;
}

/**
 * Un jour calendaire (`YYYY-MM-DD`) écrit en toutes lettres, dans la langue du
 * compte: « dimanche 13 septembre », « Sunday 13 September ».
 *
 * ⚠️ `timeZone: "UTC"` N'EST PAS UN OUBLI, C'EST LA CORRECTION. La date qu'on
 * reçoit est DÉJÀ le jour local de la personne — elle sort de `ends_on`, qui
 * est un `date` et pas un instant. La reformater dans un fuseau la décalerait
 * une seconde fois: `new Date("2026-09-13")` vaut minuit UTC, et rendu à
 * New York ça donne le 12. C'est exactement pour ça que
 * `account_lifecycle.ts::formatAccountDate` n'est pas réutilisée ici: elle
 * formate un INSTANT, ce qui est le bon geste pour une date de purge et le
 * mauvais pour un jour de calendrier.
 *
 * L'année est absente: un plan se termine dans les jours qui viennent, et
 * « 2026 » dans cette phrase est du bruit.
 */
export function formatLocalDay(day: string, locale: string): string {
  const tag = isFrenchLocale(locale) ? "fr-FR" : "en-GB";
  try {
    return new Intl.DateTimeFormat(tag, {
      weekday: "long",
      day: "numeric",
      month: "long",
      timeZone: "UTC",
    }).format(new Date(`${day}T00:00:00Z`));
  } catch {
    return day;
  }
}

// ---------------------------------------------------------------------------
// LA COQUILLE
// ---------------------------------------------------------------------------

/**
 * Le pied de page de désinscription. Deux packs ENTIERS, jamais des fragments
 * interpolés: « Tu reçois cet e-mail parce que… » et sa version anglaise ne
 * diffèrent pas que par les mots, et une phrase composée par concaténation se
 * lit comme une machine dans au moins une des deux langues.
 */
function unsubscribeFooter(href: string, locale: string): string {
  const fr = isFrenchLocale(locale);
  const line = fr
    ? "Tu reçois cet e-mail parce que tu as un compte Sophia."
    : "You are getting this email because you have a Sophia account.";
  const cta = fr
    ? "Ne plus recevoir ces e-mails"
    : "Stop these emails";
  return [
    `        <hr style="margin: 32px 0 16px; border: 0; border-top: 1px solid #E3DAE0;" />`,
    `        <p style="font-size: 13px; line-height: 20px; color: #6A5A64; margin: 0;">`,
    `          ${line}`,
    `          <a href="${href}" style="color: #6A5A64;">${cta}</a>.`,
    `        </p>`,
  ].join("\n");
}

/**
 * La coquille HTML commune à tous les e-mails de cycle de vie.
 *
 * Les couleurs sont celles de la marque (`docs/keel/CHARTE-VITRINE.md` §2):
 * `ink` pour le texte, `ink-soft` pour le secondaire, `fig-700` pour le bouton
 * plein. Les e-mails existants portent un bouton noir et un texte `#333`, qui
 * ne sont d'aucune charte — on ne les retouche pas ici, mais ce qui naît
 * aujourd'hui naît à la bonne couleur.
 *
 * ⛔ AUCUNE IMAGE. Un e-mail dont la mise en page dépend d'une image se lit mal
 * chez la moitié des clients mail, qui les bloquent par défaut.
 */
export function lifecycleEmailShell(
  body: string,
  opts: { unsubscribeHref: string; locale: string },
): string {
  return [
    `      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #23191F; line-height: 1.6; max-width: 560px; margin: 0 auto; padding: 8px;">`,
    body,
    unsubscribeFooter(opts.unsubscribeHref, opts.locale),
    `      </div>`,
  ].join("\n");
}

/**
 * Ce que rend un module de copie. UNE seule définition pour les onze types:
 * chaque famille l'a d'abord déclarée chez elle, et deux formes identiques qui
 * vivent dans deux fichiers finissent par diverger sur un champ.
 */
export interface RenderedLifecycleEmail {
  subject: string;
  html: string;
}

/** Le bouton plein, aux couleurs de la marque. */
export function lifecycleEmailCta(url: string, label: string): string {
  return `        <p style="margin: 24px 0;">
          <a href="${url}" style="background-color: #632C4C; color: #FBF8FA; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold; display: inline-block;">
            ${label}
          </a>
        </p>`;
}

// ---------------------------------------------------------------------------
// L'ENVOI
// ---------------------------------------------------------------------------

/**
 * Ce qu'un envoi peut valoir.
 *
 * `suppressed` existe parce que `sendResendEmail` rend `ok: true` quand il n'a
 * RIEN envoyé — livraison coupée (`EMAIL_DELIVERY_ENABLED=0`) ou banc de test
 * (`MEGA_TEST_MODE`, actif par défaut sur toute pile locale). Compter ça comme
 * `sent` ferait croire à chaque run local qu'un e-mail est parti. C'est le
 * défaut que `coach-invite-student-v1:338-346` a déjà nommé.
 */
export type LifecycleSendState = "sent" | "suppressed" | "failed";

// deno-lint-ignore no-explicit-any
type Db = any;

/**
 * Envoie, puis journalise — DANS CET ORDRE, et la ligne de journal n'existe
 * QUE si l'envoi a réussi.
 *
 * C'est l'invariant des quatre écrivains existants, et il porte tout le
 * système de dédup: une ligne écrite avant l'envoi transformerait un échec
 * réseau en « déjà envoyé », c'est-à-dire en e-mail perdu pour toujours.
 */
export async function sendLifecycleEmail(
  admin: Db,
  args: {
    userId: string;
    email: string;
    type: LifecycleEmailType;
    subject: string;
    html: string;
    senderEmail?: string;
    /**
     * La clé qui rend un type répétable, écrite dans
     * `metadata.dedup_key` et relue par `loadLifecycleCadenceFacts`.
     * Absente = ce type ne part qu'une fois par personne, à vie.
     */
    dedupKey?: string | null;
    /** Ce qui explique l'envoi, pour qu'un journal se relise dans six mois. */
    metadata?: Record<string, unknown>;
  },
): Promise<LifecycleSendState> {
  const out = await sendResendEmail({
    to: args.email,
    subject: args.subject,
    html: args.html,
    from: args.senderEmail,
    maxAttempts: 6,
  });

  if (!out.ok) return "failed";

  // deno-lint-ignore no-explicit-any
  const suppressed = Boolean((out as any).skipped);
  await admin.from("communication_logs").insert({
    user_id: args.userId,
    channel: "email",
    type: args.type,
    status: suppressed ? "skipped" : "sent",
    metadata: {
      ...(args.metadata ?? {}),
      // deno-lint-ignore no-explicit-any
      resend_id: (out as any).data?.id ?? null,
      skipped: suppressed,
      dedup_key: args.dedupKey ?? null,
    },
  });

  return suppressed ? "suppressed" : "sent";
}

/**
 * Charge les faits de cadence d'une personne.
 *
 * Trois lectures, et pas une de plus. La quatrième qu'on serait tenté
 * d'ajouter — « a-t-elle un abonnement actif ? » — n'appartient pas à la
 * cadence: elle appartient au segment qui la pose.
 */
export async function loadLifecycleCadenceFacts(
  admin: Db,
  args: {
    userId: string;
    type: LifecycleEmailType;
    dedupKey?: string | null;
    /** La journée locale de la personne, ou `null` si le fuseau est illisible. */
    localDate: string | null;
    now: Date;
    /**
     * La ligne `profiles`, quand l'appelant l'a DÉJÀ. Le job de balayage la
     * lit pour tout le monde à chaque page; la relire ici doublerait une
     * requête par candidat. Absente, on la lit — c'est le cas du webhook
     * Stripe, qui part d'un abonnement et pas d'un profil.
     */
    profile?: {
      email?: string | null;
      account_status?: string | null;
      lifecycle_emails_opted_out_at?: string | null;
    } | null;
  },
): Promise<LifecycleCadenceFacts> {
  let profile = args.profile ?? null;
  if (!profile) {
    const { data } = await admin
      .from("profiles")
      .select("email, account_status, lifecycle_emails_opted_out_at")
      .eq("id", args.userId)
      .maybeSingle();
    profile = data ?? null;
  }

  let dedupQuery = admin
    .from("communication_logs")
    .select("id")
    .eq("user_id", args.userId)
    .eq("type", args.type)
    .limit(1);
  if (args.dedupKey) {
    // Le patron de `account-deletion-v1:336-343`: la clé fait repartir un type
    // pour un ÉPISODE nouveau, sans jamais autoriser un doublon dans le même.
    dedupQuery = dedupQuery.eq("metadata->>dedup_key", args.dedupKey);
  }
  const { data: already } = await dedupQuery;

  const since = new Date(
    args.now.getTime() - LIFECYCLE_CAP_WINDOW_DAYS * 24 * HOUR_MS,
  ).toISOString();
  // ⚠️ `.in(type, LIFECYCLE_EMAIL_TYPES)` — LA CADENCE NE COMPTE QUE LES
  // E-MAILS DE CYCLE DE VIE, jamais les transactionnels.
  //
  // Trouvé en construisant le lot 5, et ce n'était pas une subtilité: le mail
  // de BIENVENUE part à la confirmation d'adresse, et la relance d'entonnoir
  // vise H+24. Compter le premier dans la fenêtre de silence rendait le second
  // impossible — la séquence d'activation se bloquait elle-même, en silence, et
  // le compte-rendu aurait dit `too_soon` sans que personne comprenne pourquoi.
  //
  // Le raisonnement tient au-delà du cas: un reçu Stripe, une réinitialisation
  // de mot de passe ou un export de données sont des e-mails que la personne a
  // DEMANDÉS. Les faire entrer dans un plafond de sollicitation reviendrait à
  // punir quelqu'un d'avoir utilisé son compte.
  const { data: recent } = await admin
    .from("communication_logs")
    .select("created_at")
    .eq("user_id", args.userId)
    .eq("channel", "email")
    .in("type", LIFECYCLE_EMAIL_TYPES)
    .gte("created_at", since)
    .order("created_at", { ascending: false });

  // La garde inter-canaux. `localDate === null` la laisse à `false` — la garde
  // d'heure (`isLifecycleSendHour`) a déjà refusé cette personne en amont, et
  // deux refus pour le même fuseau illisible brouilleraient le compte-rendu.
  let proactiveSpokeToday = false;
  if (args.localDate) {
    const { data: proactive } = await admin
      .from("proactive_job_state")
      .select("job")
      .eq("user_id", args.userId)
      .eq("last_sent_local_date", args.localDate)
      .limit(1);
    proactiveSpokeToday = Array.isArray(proactive) && proactive.length > 0;
  }

  return {
    optedOutAt: profile?.lifecycle_emails_opted_out_at ?? null,
    accountStatus: profile?.account_status ?? null,
    email: profile?.email ?? null,
    alreadySent: Array.isArray(already) && already.length > 0,
    recentSentAt: (recent ?? [])
      .map((row: { created_at: string | null }) => row.created_at)
      .filter((iso: string | null): iso is string => Boolean(iso)),
    proactiveSpokeToday,
  };
}
