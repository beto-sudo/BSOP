'use client';

import { useEffect, useMemo, useState } from 'react';

type TripSectionNavItem = {
  id: string;
  label: string;
};

export function TripSectionNav({ items }: { items: TripSectionNavItem[] }) {
  const [activeId, setActiveId] = useState(items[0]?.id ?? '');

  const validItems = useMemo(() => items.filter((item) => item.id && item.label), [items]);

  useEffect(() => {
    const sections = validItems
      .map((item) => document.getElementById(item.id))
      .filter((section): section is HTMLElement => Boolean(section));

    if (!sections.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visibleEntries = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);

        if (visibleEntries[0]?.target.id) {
          setActiveId(visibleEntries[0].target.id);
        }
      },
      {
        rootMargin: '-120px 0px -55% 0px',
        threshold: [0.2, 0.4, 0.6],
      }
    );

    sections.forEach((section) => observer.observe(section));

    return () => observer.disconnect();
  }, [validItems]);

  if (!validItems.length) return null;

  return (
    <div className="trip-section-nav sticky top-3 z-30 -mx-1 overflow-x-auto pb-1 [scrollbar-width:none] sm:top-4">
      <div className="inline-flex min-w-full gap-2 rounded-2xl border border-white/10 bg-white/4 p-2 backdrop-blur-xl">
        {validItems.map((item) => {
          const isActive = item.id === activeId;
          return (
            <a
              key={item.id}
              href={`#${item.id}`}
              className={`whitespace-nowrap rounded-full px-3 py-2 text-sm font-medium transition sm:px-4 ${
                isActive
                  ? 'bg-amber-300 text-black shadow-[0_0_0_1px_rgba(252,211,77,0.35)]'
                  : 'text-white/55 hover:bg-white/6 hover:text-white'
              }`}
            >
              {item.label}
            </a>
          );
        })}
      </div>
    </div>
  );
}
