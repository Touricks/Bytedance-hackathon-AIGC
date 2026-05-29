import { useEffect, useState } from "react";

export function useVisibilityActive(): boolean {
  const [active, setActive] = useState(
    typeof document === "undefined" || document.visibilityState !== "hidden",
  );
  useEffect(() => {
    const onChange = () => setActive(document.visibilityState !== "hidden");
    document.addEventListener("visibilitychange", onChange);
    return () => document.removeEventListener("visibilitychange", onChange);
  }, []);
  return active;
}
