import { create } from "zustand";

interface CreationStore {
  selectedShotId: string | null;
  setSelectedShotId: (shotId: string | null) => void;
}

export const useCreationStore = create<CreationStore>((set) => ({
  selectedShotId: null,
  setSelectedShotId: (selectedShotId) => set({ selectedShotId })
}));
