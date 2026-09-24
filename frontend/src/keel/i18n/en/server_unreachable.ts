// Seed anglais — le namespace `server_unreachable`, et lui seul.
// Assemblé dans `../en.ts`; une clé `server_unreachable.*` ne vit qu'ici (`dictionaryChunks.int.test.ts`).

export const enServerUnreachable = {
  // ── THE BACKEND IS UNREACHABLE ───────────────────────────────────────────
  // Shown when `resolveHomePath` could read NOTHING (see postLogin.ts branch
  // 4). Two things this copy must do, both learnt from the bug that created
  // it. First, name the side the fault is on: the observed failure looked
  // exactly like a broken account — an old product's shell with dead fields —
  // and the user's first thought was that they had lost something. Second,
  // give the one action that helps. No apology, no "oops", no support address
  // for a condition that clears itself: the retry IS the remedy.
  "server_unreachable.title": "We can't reach the server.",
  "server_unreachable.body":
    "Your account and your data are untouched — the app just can't read anything right now. This is usually a few seconds.",
  "server_unreachable.retry": "Try again",
  // Same fact on /auth, where the sign-in itself succeeded and only the
  // routing read failed: the user must not conclude their password was wrong.
  "server_unreachable.after_signin":
    "You're signed in, but we can't reach the server to open your space. Try again in a moment.",
} as const
