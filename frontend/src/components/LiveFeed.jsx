/**
 * src/components/LiveFeed.jsx
 * Real-time scrolling feed of entropy cards.
 */
import { useRef, useEffect } from 'react';
import EntropyCard from './EntropyCard.jsx';

export default function LiveFeed({ records }) {
  const topRef = useRef(null);

  /* Scroll to top on new record */
  useEffect(() => {
    if (topRef.current) {
      topRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [records.length]);

  if (records.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-48 text-white/30 text-sm">
        <div className="text-3xl mb-3">⟳</div>
        Waiting for entropy events…
      </div>
    );
  }

  return (
    <div className="space-y-3 overflow-y-auto max-h-[600px] pr-1">
      <div ref={topRef} />
      {records.map((record, idx) => (
        <EntropyCard
          key={record.id || idx}
          record={record}
          isLatest={idx === 0}
        />
      ))}
    </div>
  );
}
