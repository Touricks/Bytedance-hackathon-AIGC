import { createStore } from "zustand/vanilla";
import { useStore } from "zustand";
import type { FocusedStep } from "./urlState.js";

export interface FocusState {
  shotId: string | null;
  step: FocusedStep | null;
  setFocus: (next: Partial<Pick<FocusState, "shotId" | "step">>) => void;
  reset: () => void;
}

export function createFocusStore() {
  return createStore<FocusState>((set) => ({
    shotId: null,
    step: null,
    setFocus: (next) => set((prev) => ({ ...prev, ...next })),
    reset: () => set({ shotId: null, step: null }),
  }));
}

// React-side hook bound to a singleton store, exported separately so unit tests
// can construct their own store without React.
const singleton = createFocusStore();
export function useFocusStore<T>(selector: (s: FocusState) => T): T {
  return useStore(singleton, selector);
}
export function getFocusStore() {
  return singleton;
}
