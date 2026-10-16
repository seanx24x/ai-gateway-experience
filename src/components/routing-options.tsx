'use client';

import { useEffect, useRef, useState } from 'react';
import { type RoutingConfig } from '@/lib/gateway';

export function RoutingOptions({ config }: { config: RoutingConfig }) {
  const lines = [
    `model: ${JSON.stringify(config.model)},`,
    config.order.length ? `order: ${JSON.stringify(config.order)},` : '// order omitted: automatic preference',
    config.only.length ? `only: ${JSON.stringify(config.only)},` : '// only omitted: all providers eligible',
    config.fallbacks.length ? `models: ${JSON.stringify(config.fallbacks)},` : '// models omitted: no model fallback',
    config.sort !== 'default' ? `sort: ${JSON.stringify(config.sort)},` : '// sort omitted: provider default',
    config.tags.length ? `tags: ${JSON.stringify(config.tags)},` : '// tags omitted',
  ];
  const previous = useRef(lines);
  const [changed, setChanged] = useState<number[]>([]);
  const signature = JSON.stringify(lines);
  useEffect(() => {
    const next = JSON.parse(signature) as string[];
    setChanged(next.flatMap((line, index) => previous.current[index] !== line ? [index] : []));
    previous.current = next;
    const timeout = setTimeout(() => setChanged([]), 900);
    return () => clearTimeout(timeout);
  }, [signature]);
  return <div className="routing-options"><div className="section-heading"><h3>Options in sync</h3><span>AI SDK · Gateway</span></div><pre tabIndex={0} aria-label="Generated routing options"><code>{lines.map((line, index) => <span key={index} className={`routing-option-line ${changed.includes(index) ? 'is-changed' : ''}`} data-option={['model','order','only','models','sort','tags'][index]}><span aria-hidden="true">{index + 1}</span>{line}</span>)}</code></pre><p>Concrete model and Gateway options. Comments show omitted defaults.</p></div>;
}
