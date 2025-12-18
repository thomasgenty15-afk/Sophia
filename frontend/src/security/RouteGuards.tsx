import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { isPrelaunchLockdownEnabled } from "./prelaunch";

function buildRedirectQuery(pathname: string, search: string) {
  const dest = `${pathname}${search || ""}`;
  const params = new URLSearchParams();
  params.set("redirect", dest);
  return params.toString();
}

export function RequireUser({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return null;
  if (!user) {
    return <Navigate to={`/auth?${buildRedirectQuery(location.pathname, location.search)}`} replace />;
  }
  return <>{children}</>;
}

export function RequireAppAccess({ children }: { children: React.ReactNode }) {
  const { user, loading, isAdmin } = useAuth();
  const location = useLocation();
  const lockdown = isPrelaunchLockdownEnabled();

  if (loading) return null;

  // Always require a signed-in user for the app routes
  if (!user) {
    return <Navigate to={`/auth?${buildRedirectQuery(location.pathname, location.search)}`} replace />;
  }

  // In prelaunch, only internal admins can access the app
  if (lockdown) {
    if (isAdmin === null) return null; // admin check pending
    if (!isAdmin) return <Navigate to="/auth?forbidden=1" replace />;
  }

  return <>{children}</>;
}

export function RequireAdmin({ children }: { children: React.ReactNode }) {
  const { user, loading, isAdmin } = useAuth();
  const location = useLocation();

  if (loading) return null;
  if (!user) {
    return <Navigate to={`/auth?${buildRedirectQuery(location.pathname, location.search)}`} replace />;
  }
  if (isAdmin === null) return null;
  if (!isAdmin) return <Navigate to="/auth?forbidden=1" replace />;
  return <>{children}</>;
}


