import React, { useRef, useEffect } from 'react';
import { useAppStore } from '../stores/useAppStore';

export const LogPanel: React.FC = () => {
  const { logs } = useAppStore();
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs.length]);

  return (
    <div className="log-panel">
      {logs.map((log, i) => (
        <div key={i} className={`log-entry ${log.type}`}>
          <span className="log-time">[{log.time}]</span>
          <span className="log-message">{log.message}</span>
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
};
