import { t } from "../i18n/t";

/**
 * KEEL — the screen for "we could read nothing".
 *
 * WHY THIS EXISTS. A signed-in user reloaded the app while the backend was
 * down. Every request failed at the transport layer, `resolveHomePath` could
 * not read either role row, and its fallback sent them to `/account` — the
 * legacy consumer page, which needs the same dead backend and therefore
 * rendered an empty shell. The user saw an old product with blank fields and
 * no explanation, and concluded their account was broken. A backend that is
 * down must not be indistinguishable from a bug in the user's own data.
 *
 * SOBER, AND HONEST ABOUT WHOSE FAULT IT IS. Same register as the 404: no
 * illustration, no apology, one way forward. The retry is a full reload rather
 * than a re-run of the resolver alone, because the failed reads are rarely the
 * only casualties — the auth session refresh, the shell's own queries and
 * anything already mounted are in the same state, and half a recovery is how
 * you get a page that renders but lies.
 *
 * It deliberately does NOT auto-retry on a timer. The user is looking at a
 * static screen; a silent loop that flips them into the app mid-read is worse
 * than a button they press when they are ready.
 */
export default function ServerUnreachable() {
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-lg flex-col justify-center px-6 py-16">
      <h1 className="text-2xl font-semibold text-gray-900">
        {t("server_unreachable.title")}
      </h1>
      <p className="mt-3 text-sm leading-6 text-gray-600">
        {t("server_unreachable.body")}
      </p>
      <div className="mt-6">
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="inline-flex items-center rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
        >
          {t("server_unreachable.retry")}
        </button>
      </div>
    </main>
  );
}
