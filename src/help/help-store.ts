import { create } from "zustand";
import { persist } from "zustand/middleware";

interface HelpState {
  /** The first-visit tour was finished or skipped. */
  tourDone: boolean;
  /** Topic ids whose first-visit tip was dismissed. */
  seenTips: string[];
  /** Turns all first-visit tips off. */
  tipsOff: boolean;
  tourOpen: boolean;
  panelOpen: boolean;
  openTour: () => void;
  closeTour: () => void;
  setPanel: (open: boolean) => void;
  dismissTip: (id: string) => void;
  setTipsOff: (off: boolean) => void;
  resetTips: () => void;
}

export const useHelp = create<HelpState>()(
  persist(
    (set) => ({
      tourDone: false,
      seenTips: [],
      tipsOff: false,
      tourOpen: false,
      panelOpen: false,
      openTour: () => set({ tourOpen: true }),
      closeTour: () => set({ tourOpen: false, tourDone: true }),
      setPanel: (panelOpen) => set({ panelOpen }),
      dismissTip: (id) => set((s) => ({ seenTips: s.seenTips.includes(id) ? s.seenTips : [...s.seenTips, id] })),
      setTipsOff: (tipsOff) => set({ tipsOff }),
      resetTips: () => set({ seenTips: [], tipsOff: false }),
    }),
    { name: "serat:help", partialize: (s) => ({ tourDone: s.tourDone, seenTips: s.seenTips, tipsOff: s.tipsOff }) },
  ),
);
