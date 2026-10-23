import { toast } from "@heroui/react";
import { useMemo } from "react";
import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";
import {
  DomainError,
  emptyDb,
  migrate,
  SCHEMA_VERSION,
  stockSummaries,
  transact,
  type Db,
  type ID,
  type Item,
  type Partner,
  type StockSummary,
} from "@/domain";
import { buildDemoDb } from "@/domain/seed";

/** Kept from the product's former name so existing browsers keep their data. */
export const STORAGE_KEY = "mebelos:db";

/** localStorage wrapper that never throws (private mode, quota exceeded, blocked storage). */
const safeStorage: StateStorage = {
  getItem: (name) => {
    try {
      return localStorage.getItem(name);
    } catch {
      return null;
    }
  },
  setItem: (name, value) => {
    try {
      localStorage.setItem(name, value);
    } catch (err) {
      console.error(err);
      toast.danger("Device storage is full or blocked", {
        description: "Your latest changes are not saved permanently. Export a backup in Settings.",
      });
    }
  },
  removeItem: (name) => {
    try {
      localStorage.removeItem(name);
    } catch {
      /* ignore */
    }
  },
};

type SuccessMessage<R> = string | ((result: R) => string) | undefined;

interface DbState {
  db: Db;
  /** True while the database still holds the bundled demo data. */
  isDemo: boolean;
  /** False until the visitor has chosen between the sample workshop and their own. */
  onboarded: boolean;
  /**
   * Runs a domain mutation atomically. Domain errors are shown as a toast and leave the
   * database untouched; returns the mutation result, or undefined on failure.
   */
  run: <R>(fn: (draft: Db) => R, success?: SuccessMessage<R>) => R | undefined;
  replace: (db: Db, opts?: { isDemo?: boolean }) => void;
  resetDemo: () => void;
  clearAll: () => void;
  /** Welcome screen choices. */
  startDemo: () => void;
  startFresh: (companyName: string) => void;
}

export const useDbStore = create<DbState>()(
  persist(
    (set, get) => ({
      db: buildDemoDb(),
      isDemo: true,
      onboarded: false,
      run: (fn, success) => {
        try {
          const { db, result } = transact(get().db, fn);
          set({ db });
          const msg = typeof success === "function" ? success(result) : success;
          if (msg) toast.success(msg);
          return result;
        } catch (err) {
          if (err instanceof DomainError) {
            toast.danger(err.message);
          } else {
            console.error(err);
            toast.danger("Something unexpected went wrong", {
              description: err instanceof Error ? err.message : String(err),
            });
          }
          return undefined;
        }
      },
      replace: (db, opts) => set({ db: migrate(db), isDemo: opts?.isDemo ?? false }),
      resetDemo: () => set({ db: buildDemoDb(), isDemo: true }),
      clearAll: () => set({ db: emptyDb(), isDemo: false }),
      startDemo: () => set({ onboarded: true }),
      startFresh: (companyName) => {
        const db = emptyDb();
        db.settings.companyName = companyName.trim() || db.settings.companyName;
        set({ db, isDemo: false, onboarded: true });
      },
    }),
    {
      name: STORAGE_KEY,
      version: SCHEMA_VERSION,
      storage: createJSONStorage(() => safeStorage),
      partialize: (s) => ({ db: s.db, isDemo: s.isDemo, onboarded: s.onboarded }),
      migrate: (persisted) => {
        const p = persisted as { db?: unknown; isDemo?: boolean; onboarded?: boolean };
        return { db: migrate(p.db), isDemo: !!p.isDemo, onboarded: p.onboarded ?? true };
      },
      merge: (persisted, current) => {
        const p = persisted as { db?: unknown; isDemo?: boolean; onboarded?: boolean } | undefined;
        if (!p?.db) return current;
        try {
          // Data saved before the welcome screen existed belongs to someone already working.
          return { ...current, db: migrate(p.db), isDemo: !!p.isDemo, onboarded: p.onboarded ?? true };
        } catch (err) {
          console.error("Saved data is invalid, using the demo data.", err);
          return current;
        }
      },
    },
  ),
);

// First run: persist the generated demo immediately so record ids stay stable across reloads.
if (safeStorage.getItem(STORAGE_KEY) === null) useDbStore.setState({ isDemo: true });

// Keep several open tabs in sync.
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key === STORAGE_KEY) void useDbStore.persist.rehydrate();
  });
}

export const useDb = () => useDbStore((s) => s.db);
export const useRun = () => useDbStore((s) => s.run);

export interface Lookups {
  items: Map<ID, Item>;
  partners: Map<ID, Partner>;
  stock: Map<ID, StockSummary>;
  item: (id: ID | undefined) => Item | undefined;
  partnerName: (id: ID | undefined) => string;
}

/** Memoised indexes over the current database. */
export function useLookups(): Lookups {
  const db = useDb();
  return useMemo(() => {
    const items = new Map(db.items.map((i) => [i.id, i]));
    const partners = new Map(db.partners.map((p) => [p.id, p]));
    return {
      items,
      partners,
      stock: stockSummaries(db),
      item: (id) => (id ? items.get(id) : undefined),
      partnerName: (id) => (id ? (partners.get(id)?.name ?? "—") : "—"),
    };
  }, [db]);
}
