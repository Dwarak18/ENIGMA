/**
 * src/components/LiveClock.jsx
 * Ticking local-time clock displayed in the top bar.
 */
import { useState, useEffect } from 'react';

const pad = (n) => String(n).padStart(2, '0');

export default function LiveClock() {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const timeStr = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  const dateStr = now.toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
      <span style={{ fontSize: '16px', fontWeight: 'bold', color: '#10b981', letterSpacing: '.05em' }}>
        {timeStr}
      </span>
      <span style={{ fontSize: '9px', color: '#71717a', letterSpacing: '.05em', textTransform: 'uppercase' }}>
        {dateStr}
      </span>
    </div>
  );
}
