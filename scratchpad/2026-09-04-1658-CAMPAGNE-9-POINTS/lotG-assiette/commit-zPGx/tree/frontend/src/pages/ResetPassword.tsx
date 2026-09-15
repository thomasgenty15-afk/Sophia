import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { Eye, EyeOff, Loader2, Lock } from "lucide-react";

function getErrorMessage(err: unknown, fallback: string) {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === "string" && err) return err;
  return fallback;
}

function hasHashAccessToken(hash: string) {
  return /access_token=/.test(hash || "");
}

const ResetPassword: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const params = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const code = (params.get("code") || "").trim();

  const [loading, setLoading] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      setError(null);
      try {
        // 1) If the URL contains a PKCE code (?code=...), exchange it for a session.
        if (code) {
          const { error: exErr } = await supabase.auth.exchangeCodeForSession(window.location.href);
          if (exErr) throw exErr;
          // Clean URL (remove code) to avoid replays on refresh.
          const clean = new URL(window.location.href);
          clean.searchParams.delete("code");
          window.history.replaceState({}, "", clean.toString());
        } else if (hasHashAccessToken(window.location.hash || "")) {
          // 2) Implicit flow: supabase-js usually auto-detects session in URL hash.
          // Just proceed to session check.
        }

        // 3) Ensure we have a session (recovery session).
        const { data, error: sessErr } = await supabase.auth.getSession();
        if (sessErr) throw sessErr;
        const hasSession = Boolean(data?.session);

        if (!cancelled) {
          setReady(hasSession);
          // If no session, it usually means the link is invalid/expired OR redirect URL not allowlisted.
          if (!hasSession) {
            setError("Invalid or expired link. Request a new reset from the sign-in page.");
          }
        }
      } catch (e) {
        if (!cancelled) {
          setReady(false);
          setError(getErrorMessage(e, "Could not open the reset link."));
        }
      } finally {
        if (!cancelled) setInitializing(false);
      }
    }

    init();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const p1 = password.trim();
      const p2 = password2.trim();
      if (!p1 || !p2) throw new Error("Please enter the password twice.");
      if (p1.length < 8) throw new Error("Password too short (8 characters minimum).");
      if (p1 !== p2) throw new Error("The two passwords do not match.");

      const { error: upErr } = await supabase.auth.updateUser({ password: p1 });
      if (upErr) throw upErr;

      // Optional: sign out the recovery session to force a clean login.
      await supabase.auth.signOut();
      navigate("/auth?reset=1", { replace: true });
    } catch (e) {
      setError(getErrorMessage(e, "Something went wrong while updating the password."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8 font-sans text-slate-900">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <div className="flex flex-col items-center gap-3 mb-8">
          <img src="/apple-touch-icon.png" alt="Sophia Logo" className="w-16 h-16" />
          <div className="flex flex-col items-center">
            <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Sophia</h1>
            <span className="text-[10px] font-bold tracking-[0.2em] text-slate-400 uppercase mt-1">Powered by IKIZEN</span>
          </div>
        </div>
        <h2 className="text-3xl font-bold text-slate-900 mb-2">Reset your password</h2>
        <p className="text-slate-600 max-w-sm mx-auto">
          Choose a new password. The link is valid for a short time only.
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md animate-fade-in-up delay-100">
        <div className="bg-white py-8 px-4 shadow-xl shadow-slate-200 rounded-2xl sm:px-10 border border-slate-100">
        {error && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </div>
        )}

        {initializing ? (
          <div className="flex items-center justify-center gap-2 text-sm text-gray-700 py-8">
            <Loader2 className="w-4 h-4 animate-spin" />
            Checking the link…
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-6">
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">New password</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5 text-slate-400" />
                </div>
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={!ready || loading}
                  className="appearance-none block w-full pl-10 pr-10 py-3 border border-slate-200 rounded-xl placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent sm:text-sm transition-all"
                  placeholder="••••••••"
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 transition-colors"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  disabled={!ready || loading}
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">Confirm the password</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5 text-slate-400" />
                </div>
                <input
                  type={showPassword ? "text" : "password"}
                  value={password2}
                  onChange={(e) => setPassword2(e.target.value)}
                  disabled={!ready || loading}
                  className="appearance-none block w-full pl-10 pr-3 py-3 border border-slate-200 rounded-xl placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent sm:text-sm transition-all"
                  placeholder="••••••••"
                  autoComplete="new-password"
                />
              </div>
            </div>

            <div>
              <button
                type="submit"
                disabled={!ready || loading}
                className="w-full flex justify-center py-4 px-4 border border-transparent rounded-xl shadow-lg text-sm font-bold text-white bg-slate-900 hover:bg-indigo-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed items-center gap-2"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Updating…
                  </>
                ) : (
                  "Update the password"
                )}
              </button>
            </div>

            <div className="text-center">
              <button
                type="button"
                onClick={() => navigate("/auth", { replace: true })}
                className="text-sm font-medium text-slate-500 hover:text-indigo-600"
              >
                Back to sign-in
              </button>
            </div>
          </form>
        )}
        </div>
      </div>
    </div>
  );
};

export default ResetPassword;
