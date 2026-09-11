import React from "react";
import { Link, useSearchParams } from "react-router-dom";
import SEO from "../../components/SEO";
import {
  type UnsubscribeOutcome,
  unsubscribeFromLifecycleEmails,
} from "../api/unsubscribe";
import { PublicFooter, PublicHeader } from "../components/PublicHeader";
import { t } from "../i18n/t";

// FF-063 LOT 1 — /unsubscribe?token=…
//
// La sortie des e-mails de cycle de vie. Troisième page publique du produit,
// après `/join` et `/join-household`, et elle existe pour la même raison
// qu'elles: la personne à qui elle s'adresse N'A PAS DE SESSION, et lui
// demander de se connecter reviendrait à ne pas lui offrir de sortie du tout.
// Quelqu'un qui ne veut plus de nos mails ne va pas retrouver son mot de passe
// pour nous le dire — il clique sur « spam », et c'est la réputation du
// domaine d'envoi qui paie, pour TOUT ce qui part, reçus compris.
//
// ── POURQUOI ÇA S'EXÉCUTE AU MONTAGE, SANS BOUTON DE CONFIRMATION ─────────
// Un écran « es-tu sûr ? » ajoute une marche à quelqu'un qui vient d'exprimer
// un refus. Le risque qu'il couvrirait — un scanner de liens qui visite l'URL
// et désinscrit à l'insu de la personne — ne se réalise pas ici: la coupure
// passe par un appel RPC en JavaScript, qu'un `GET` de scanner n'exécute pas.
// Le jour où on ajoute un `List-Unsubscribe-Post`, c'est LUI qui portera le
// geste sans JavaScript, et ce choix-ci sera à relire.
//
// ── CE QUE CETTE PAGE NE DIT JAMAIS ──────────────────────────────────────
// Ni prénom, ni adresse, ni « ce lien a expiré ». La RPC rend un booléen et
// rien d'autre, exprès: une page publique qui rendrait un fait sur le compte
// transformerait un jeton de confort en oracle. Le prix à payer est qu'un
// jeton inconnu et un jeton révoqué se lisent pareil — c'est voulu.
//
// ── LA LANGUE VIENT DE `?lang=`, PAS DE L'URL ────────────────────────────
// `/unsubscribe` n'entre PAS dans `LOCALE_ROUTED_PATHS` (voir l'en-tête de
// `i18n/localeRoutes.ts`): c'est une porte fonctionnelle, pas une surface
// indexée. Le lien de l'e-mail porte donc `?lang=fr` ou `?lang=en`, que
// `initUiLocale` lit au démarrage — la même mécanique que `/start` et `/join`.

/** `null` tant que la décision n'est pas rendue — c'est l'écran d'attente. */
type Phase = UnsubscribeOutcome | null;

export default function UnsubscribePage(): React.ReactElement {
  const [params] = useSearchParams();
  const token = (params.get("token") ?? "").trim();
  const [phase, setPhase] = React.useState<Phase>(null);

  React.useEffect(() => {
    let cancelled = false;
    void unsubscribeFromLifecycleEmails(token).then((outcome) => {
      if (!cancelled) setPhase(outcome);
    });
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (phase === null) {
    return <Screen title={t("unsubscribe.working.title")} body={t("unsubscribe.working.body")} />;
  }

  if (phase === "done") {
    return (
      <Screen
        title={t("unsubscribe.done.title")}
        body={t("unsubscribe.done.body")}
      >
        {/* Ce qui CONTINUE, dit tout de suite. Sans cette phrase, quelqu'un qui
            attend un reçu Stripe croit l'avoir coupé lui-même. */}
        <p className="mt-4 text-base leading-7 text-ink-soft">
          {t("unsubscribe.done.still")}
        </p>
        <p className="mt-8 text-base leading-7 text-ink-soft">
          <Link to="/" className="font-medium text-fig-700 underline">
            {t("unsubscribe.done.home_cta")}
          </Link>
        </p>
      </Screen>
    );
  }

  if (phase === "no_token") {
    return <Screen title={t("unsubscribe.no_token.title")} body={t("unsubscribe.no_token.body")} />;
  }

  if (phase === "unknown") {
    return <Screen title={t("unsubscribe.unknown.title")} body={t("unsubscribe.unknown.body")} />;
  }

  return (
    <Screen
      title={t("unsubscribe.unreachable.title")}
      body={t("unsubscribe.unreachable.body")}
    >
      <p className="mt-8 text-base leading-7 text-ink-soft">
        <button
          type="button"
          onClick={() => globalThis.location.reload()}
          className="font-medium text-fig-700 underline"
        >
          {t("unsubscribe.unreachable.retry")}
        </button>
      </p>
    </Screen>
  );
}

/**
 * Un seul gabarit pour les cinq états. Le titre EST la situation du lecteur,
 * et c'est le seul `h1` de la page.
 *
 * `noindex` et pas de `canonical`: chaque URL réelle de cette route porte un
 * jeton dans sa query string, et une URL indexée serait un interrupteur vivant
 * dans un résultat de recherche. Même motif que `/join`.
 */
function Screen(
  { title, body, children }: {
    title: string;
    body: string;
    children?: React.ReactNode;
  },
): React.ReactElement {
  return (
    <div className="flex min-h-screen flex-col bg-paper">
      {/* `description` reprend le corps de l'écran plutôt qu'une clé à elle:
          la page est `noindex`, donc cette phrase n'est lue par aucun moteur —
          une clé de plus à traduire dans deux packs pour un texte que personne
          ne voit serait une dette sans lecteur. */}
      <SEO title={title} description={body} robots="noindex,nofollow" />
      <PublicHeader audience="student" />
      <main className="flex-1">
        <section>
          <div className="mx-auto max-w-2xl px-4 pb-16 pt-12 sm:pt-20">
            <h1 className="text-3xl font-semibold leading-[1.1] tracking-tight text-ink text-balance sm:text-4xl">
              {title}
            </h1>
            <p className="mt-6 text-lg leading-8 text-ink-soft">{body}</p>
            {children}
          </div>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}
