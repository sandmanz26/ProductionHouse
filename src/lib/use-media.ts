import { useSyncExternalStore } from "react";

/** Subscribes to a CSS media query. */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (cb) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", cb);
      return () => mql.removeEventListener("change", cb);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/** Phones: tables collapse into stacked cards below this width. */
export const useIsCompact = () => useMediaQuery("(max-width: 639px)");
