"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

export default function ChartCarousel({ slides }: { slides: ReactNode[] }) {
  return <ChartCarouselInner key={slides.length} slides={slides} />;
}

function ChartCarouselInner({ slides }: { slides: ReactNode[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    const el = containerRef.current;
    if (el) el.scrollTo({ left: 0 });
  }, []);

  const scrollToIndex = useCallback((index: number) => {
    const el = containerRef.current;
    if (!el) return;
    el.scrollTo({ left: index * el.clientWidth, behavior: "smooth" });
    setActiveIndex(index);
  }, []);

  const handleScroll = () => {
    const el = containerRef.current;
    if (!el) return;
    const index = Math.round(el.scrollLeft / el.clientWidth);
    if (index !== activeIndex) setActiveIndex(index);
  };

  if (slides.length === 0) return null;

  return (
    <div>
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {slides.map((slide, i) => (
          <div key={i} className="w-full shrink-0 snap-center">
            {slide}
          </div>
        ))}
      </div>

      {slides.length > 1 && (
        <div className="mt-3 flex items-center justify-center gap-4">
          <button
            onClick={() => scrollToIndex(activeIndex - 1)}
            disabled={activeIndex === 0}
            aria-label="Previous chart"
            className="flex h-6 w-6 items-center justify-center rounded-full bg-space-indigo-100 text-sm text-space-indigo-600 transition-colors hover:bg-space-indigo-200 disabled:cursor-not-allowed disabled:opacity-40"
          >
            &lsaquo;
          </button>
          <div className="flex items-center gap-2">
            {slides.map((_, i) => (
              <button
                key={i}
                onClick={() => scrollToIndex(i)}
                aria-label={`Go to chart ${i + 1}`}
                className={`h-1.5 rounded-full transition-all ${
                  i === activeIndex
                    ? "w-4 bg-space-indigo-500"
                    : "w-1.5 bg-space-indigo-200 hover:bg-space-indigo-300"
                }`}
              />
            ))}
          </div>
          <button
            onClick={() => scrollToIndex(activeIndex + 1)}
            disabled={activeIndex === slides.length - 1}
            aria-label="Next chart"
            className="flex h-6 w-6 items-center justify-center rounded-full bg-space-indigo-100 text-sm text-space-indigo-600 transition-colors hover:bg-space-indigo-200 disabled:cursor-not-allowed disabled:opacity-40"
          >
            &rsaquo;
          </button>
        </div>
      )}
    </div>
  );
}
