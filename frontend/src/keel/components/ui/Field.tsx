import React from "react";

// KEEL UI — form field chrome. The label/hint/control stack every KEEL form
// repeats, plus the shared control classes so <input>, <select> and <textarea>
// all carry the same border, focus ring and disabled state.

export const inputClass =
  "block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm " +
  "text-gray-900 placeholder-gray-400 focus:border-gray-900 focus:outline-none " +
  "focus:ring-1 focus:ring-gray-900 disabled:bg-gray-50 disabled:text-gray-500";

export function Field({
  label,
  hint,
  error,
  htmlFor,
  className = "",
  children,
}: {
  label: string;
  /** Grey helper line under the control. */
  hint?: string;
  /** Red line under the control; wins over `hint`. */
  error?: string;
  htmlFor?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <label
        htmlFor={htmlFor}
        className="mb-1 block text-sm font-medium text-gray-700"
      >
        {label}
      </label>
      {children}
      {error ? (
        <p className="mt-1 text-xs text-red-700">{error}</p>
      ) : hint ? (
        <p className="mt-1 text-xs leading-5 text-gray-500">{hint}</p>
      ) : null}
    </div>
  );
}

export default Field;
