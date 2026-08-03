import React from "react";
import { Link } from "react-router-dom";

/**
 * PIVOT — la 404, et pourquoi elle arrive AVANT toute suppression de route.
 *
 * ANNEXE A.6 point 1: le routeur n'avait aucune route catch-all. Conséquence
 * AUJOURD'HUI, avant même d'avoir démonté quoi que ce soit: n'importe quelle
 * URL inconnue — une faute de frappe, un vieux lien d'email, un bookmark —
 * rend un écran BLANC. Pas un message, pas un lien de retour: rien. C'est déjà
 * un défaut, pas seulement une dette de cutover.
 *
 * Et c'est le prérequis du démontage legacy: le jour où `/dashboard`,
 * `/onboarding-v2` ou `/upgrade` disparaissent, chaque lien encore en
 * circulation (emails de rétention, historique de navigateur, messages
 * WhatsApp déjà envoyés) tombe ici. Sans cette page, la suppression d'une
 * route se manifeste chez l'utilisateur comme une panne du site.
 *
 * SOBRE ET SANS EXCUSE: pas d'illustration, pas de "oups". La page dit ce qui
 * s'est passé et donne UN chemin de retour. Elle ne devine pas non plus où
 * l'utilisateur voulait aller — un redirect automatique vers `/` sur une URL
 * inconnue empêche de comprendre qu'on s'est trompé de lien.
 */
export default function NotFoundPage() {
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-lg flex-col justify-center px-6 py-16">
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
        404
      </p>
      <h1 className="mt-2 text-2xl font-semibold text-gray-900">
        This page does not exist.
      </h1>
      <p className="mt-3 text-sm leading-6 text-gray-600">
        The link you followed is out of date, or the address has a typo. Nothing
        is broken on your side.
      </p>
      <div className="mt-6">
        <Link
          to="/"
          className="inline-flex items-center rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
        >
          Go back home
        </Link>
      </div>
    </main>
  );
}
