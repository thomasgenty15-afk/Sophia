import { t, type MessageKey } from "../../i18n/t";

/**
 * LES MESSAGES QUE SOPHIA ENVOIE D'ELLE-MÊME — refonte du 2026-09-18.
 *
 * ── CE QUI A CHANGÉ, ET POURQUOI ──────────────────────────────────────────
 * Le bloc montrait une question POSÉE à Sophia et sa réponse. La section vend
 * maintenant l'inverse: elle écrit la première. Une boîte de dialogue où c'est
 * l'utilisateur qui parle d'abord dit exactement le contraire du titre.
 *
 * ⚠️ LES TROIS BULLES SONT LES TROIS CANAUX QUI PARTENT VRAIMENT — `thaw_reminder`,
 * `weigh_in` et `slot_meal` dans `keel-proactive-v1`. Une quatrième bulle
 * inventée serait une promesse sans expéditeur, et c'est le genre de copie que
 * le modèle KEEL interdit (aucune attente promise, aucun message qui n'existe pas).
 *
 * ⚠️ AUCUN CONTRÔLE ICI: pas de bouton, pas de champ. C'est une illustration
 * annoncée « Exemple fictif », et `homeUnplannedDemo.int.test.ts` le garde.
 *
 * ⟳ LA LÉGENDE NE DIT PLUS QUE « EXEMPLE FICTIF » (2026-09-18, deux retraits).
 * Elle a porté la phrase sur la désactivation des messages — une porte de sortie
 * sous une carte qui vient d'expliquer pourquoi ils servent — puis celle du repas
 * hors plan, partie dans SA PROPRE SECTION (`home.life.*`, `#imprevu`), avec la
 * mesure qui va avec. Ce qui reste est ce que la carte doit dire d'elle-même:
 * qu'elle est inventée.
 */
const MESSAGES: ReadonlyArray<{ when: MessageKey; text: MessageKey }> = [
  { when: "home.reach.thaw.title", text: "home.reach.bubble.thaw" },
  { when: "home.reach.weigh.title", text: "home.reach.bubble.weigh" },
  { when: "home.reach.slot.title", text: "home.reach.bubble.slot" },
];

export default function ConversationExample() {
  return <figure className="rounded-fiche border border-line bg-paper-2 p-5 sm:p-6">
    <ul className="space-y-4">
      {MESSAGES.map(({ when, text }) => <li key={when}>
        <p className="text-label font-semibold uppercase tracking-wide text-ink-soft">{t(when)}</p>
        <div className="mt-1 flex items-start gap-3">
          <span aria-hidden="true" className="flex size-8 shrink-0 items-center justify-center rounded-full bg-fig-700 text-sm font-semibold text-paper">S</span>
          <p className="rounded-card border border-line bg-paper px-4 py-3 text-sm leading-6 text-ink">{t(text)}</p>
        </div>
      </li>)}
    </ul>
    <figcaption className="mt-4 border-t border-line pt-3 text-xs leading-5 text-ink-soft">
      {t("home.reach.example_note")}
    </figcaption>
  </figure>;
}
