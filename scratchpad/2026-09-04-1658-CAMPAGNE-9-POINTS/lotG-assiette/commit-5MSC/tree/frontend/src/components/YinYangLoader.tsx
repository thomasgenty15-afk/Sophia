import React from 'react';

interface YinYangLoaderProps {
  label?: string;
  className?: string;
  symbolClassName?: string;
  labelClassName?: string;
}

const YinYangLoader = ({
  label = 'Chargement...',
  className = '',
  symbolClassName = '',
  labelClassName = '',
}: YinYangLoaderProps) => {
  return (
    <div
      className={`flex flex-col items-center justify-center gap-4 ${className}`.trim()}
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      <img
        src="/apple-touch-icon.png"
        alt=""
        className={`w-24 h-24 rounded-full animate-[spin_2.6s_linear_infinite] ${symbolClassName}`.trim()}
        aria-hidden="true"
      />
      {label ? (
        <p className={`text-sm font-medium text-slate-500 ${labelClassName}`.trim()}>{label}</p>
      ) : null}
    </div>
  );
};

export default YinYangLoader;
