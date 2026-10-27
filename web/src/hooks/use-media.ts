import { useEffect, useState } from "react";

export function useMedia(query: string) {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setMatches(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [query]);
  return matches;
}

/** Matches the md breakpoint, where the floating panel replaces the bottom sheet. */
export const useDesktop = () => useMedia("(min-width: 768px)");
