import { createStore } from "zustand/vanilla";
import { useStore } from "zustand";
import { CheckCircle, AlertTriangle } from "lucide-react";

interface Toast {
  id: string;
  level: "info" | "success" | "error";
  text: string;
}
interface ToastState {
  toasts: Toast[];
  push(t: Omit<Toast, "id">): void;
  dismiss(id: string): void;
}
const store = createStore<ToastState>((set) => ({
  toasts: [],
  push: (t) =>
    set((s) => ({
      toasts: [
        ...s.toasts,
        {
          ...t,
          id: `tst_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        },
      ],
    })),
  dismiss: (id) =>
    set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })),
}));

export function notify(level: Toast["level"], text: string) {
  store.getState().push({ level, text });
  setTimeout(() => {
    const cur = store.getState().toasts;
    if (cur.length && cur[0]) store.getState().dismiss(cur[0].id);
  }, 4000);
}

export function ToastHost() {
  const toasts = useStore(store, (s) => s.toasts);
  return (
    <div className="toast-host">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast--${t.level}`}>
          {t.level === "success" ? (
            <CheckCircle size={14} />
          ) : t.level === "error" ? (
            <AlertTriangle size={14} />
          ) : null}
          <span>{t.text}</span>
        </div>
      ))}
    </div>
  );
}
