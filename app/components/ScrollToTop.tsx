"use client";

import { useEffect, useState } from "react";

export default function ScrollToTop() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const onScroll = () => setShow(window.scrollY > 200);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  if (!show) return null;

  return (
    <button
      type="button"
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      className="global-scroll-top fixed bottom-5 right-4 z-50 inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/25 bg-black/60 text-lg text-white shadow-lg backdrop-blur transition hover:scale-105 hover:bg-black/75"
      aria-label="Scroll to top"
    >
      ↑
    </button>
  );
}
