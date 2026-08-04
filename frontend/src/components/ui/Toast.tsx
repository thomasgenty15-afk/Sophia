import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { CheckCircle2, X } from "lucide-react";

type ToastItem = {
  id: number;
  message: string;
  icon?: ReactNode;
  durationMs?: number;
};

type ToastContextValue = {
  show: (message: string, options?: { icon?: ReactNode; durationMs?: number }) => void;
};

const ToastContext = createContext<ToastContextValue>({
  show: () => {},
});

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(0);

  const show = useCallback(
    (message: string, options?: { icon?: ReactNode; durationMs?: number }) => {
      const id = ++nextId.current;
      setToasts((prev) => [...prev, { id, message, ...options }]);
    },
    [],
  );

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      <div className="fixed bottom-4 left-1/2 z-[9999] flex -translate-x-1/2 flex-col items-center gap-2 pointer-events-none">
        {toasts.map((toast) => (
          <ToastBubble key={toast.id} toast={toast} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastBubble({
  toast,
  onDismiss,
}: {
  toast: ToastItem;
  onDismiss: (id: number) => void;
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
    const timer = setTimeout(() => {
      setVisible(false);
      setTimeout(() => onDismiss(toast.id), 300);
    }, toast.durationMs ?? 3500);
    return () => clearTimeout(timer);
  }, [toast.id, toast.durationMs, onDismiss]);

  return (
    <div
      className={`pointer-events-auto flex items-center gap-2 rounded-full border border-stone-200 bg-white px-4 py-2.5 text-sm font-medium text-stone-800 shadow-lg transition-all duration-300 ${
        visible ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"
      }`}
    >
      {toast.icon ?? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />}
      <span>{toast.message}</span>
      <button
        type="button"
        onClick={() => {
          setVisible(false);
          setTimeout(() => onDismiss(toast.id), 300);
        }}
        className="ml-1 shrink-0 text-stone-400 hover:text-stone-600"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
