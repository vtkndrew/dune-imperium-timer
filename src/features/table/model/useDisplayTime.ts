import { useEffect, useState } from 'react';

// Only the mounted game screen subscribes to visual ticks. The engine uses timestamps.
export function useDisplayTime() {
  const [now, setNow] = useState(Date.now);

  useEffect(() => {
    const refresh = () => {
      if (!document.hidden) {
        setNow(Date.now());
      }
    };

    const timer = window.setInterval(refresh, 200);

    document.addEventListener('visibilitychange', refresh);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, []);

  return now;
}
