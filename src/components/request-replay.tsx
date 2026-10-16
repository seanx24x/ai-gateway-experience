'use client';

import { useEffect, useRef, useState } from 'react';
import { Pause, Play, RotateCcw } from 'lucide-react';
import { PROVIDER_NAMES, type RequestRecord } from '@/lib/gateway';
import { getReplayDuration, getReplayEvents, getReplayFrame } from '@/lib/replay';

/** A local playback controller. Seeking never executes another request. */
export function RequestReplay({ record, onSeek, position, seekVersion, showEvents = true }: { record: RequestRecord; onSeek: (timeMs: number | null) => void; position?: number | null; seekVersion?: number; showEvents?: boolean }) {
  const duration = getReplayDuration(record);
  const [time, setTime] = useState(duration);
  const [playing, setPlaying] = useState(false);
  const callback = useRef(onSeek); callback.current = onSeek;
  const cursor = useRef(duration); cursor.current = time;
  useEffect(() => { setTime(duration); setPlaying(false); callback.current(null); }, [record.id, duration]);
  useEffect(() => { if (position !== undefined) { setTime(position === null ? duration : position); } }, [position, duration]);
  useEffect(() => { setPlaying(false); }, [seekVersion]);
  useEffect(() => {
    if (!playing) return;
    const speed = Math.max(1, duration / 6000);
    const timer = setInterval(() => {
      const next = Math.min(duration, cursor.current + 50 * speed);
      cursor.current = next; setTime(next); callback.current(next);
      if (next >= duration) setPlaying(false);
    }, 50);
    return () => clearInterval(timer);
  }, [playing, duration]);
  const frame = getReplayFrame(record, time);
  const events = getReplayEvents(record).filter(event => event.kind === 'attempt-end' && event.attemptIndex !== undefined).map(event => ({ attempt:record.attempts[event.attemptIndex!], index:event.attemptIndex!, time:event.atMs }));
  function seek(value: number) { setPlaying(false); setTime(value); onSeek(value); }
  const active = events.filter(event => event.index < frame.attemptCount).at(-1);
  return <section className="request-replay" aria-label="Request replay">
    <div className="replay-heading"><div><strong>Replay this request</strong><span>Recorded demo events · {duration > 6000 ? 'accelerated playback' : 'real-time playback'}</span></div><span className="mono replay-time">{Math.round(time)} / {duration} ms</span></div>
    <div className="replay-controls"><button className="icon-button" aria-label={playing ? 'Pause replay' : 'Play replay'} onClick={() => { if (time >= duration) { setTime(0); onSeek(0); } setPlaying(!playing); }}>{playing ? <Pause size={15} /> : <Play size={15} />}</button><input type="range" min={0} max={duration} step={1} value={Math.min(time, duration)} aria-label="Replay position" aria-valuetext={`${Math.round(time)} milliseconds, ${frame.attemptCount} observed attempts`} onChange={event => seek(Number(event.target.value))} /><button className="icon-button" aria-label="Return to completed request" onClick={() => { setPlaying(false); setTime(duration); onSeek(null); }}><RotateCcw size={15} /></button></div>
    {showEvents && <div className="replay-events"><button aria-pressed={time === 0} onClick={() => seek(0)}><i className="replay-event-dot" />Requested</button>{events.map(({ attempt, index, time: at }) => <button key={`${attempt.model}-${attempt.provider}-${index}`} className={attempt.status} aria-label={`Replay event ${index + 1}: ${PROVIDER_NAMES[attempt.provider]} ${attempt.status}`} aria-pressed={active?.index === index && time < duration} onClick={() => seek(at)}><i className="replay-event-dot" />{PROVIDER_NAMES[attempt.provider]}<span>{attempt.status === 'success' ? 'First token' : attempt.status === 'excluded' ? 'Excluded' : 'Failed'}</span></button>)}<button aria-pressed={time >= duration} onClick={() => seek(duration)}><i className="replay-event-dot" />{record.status === 'cancelled' ? 'Cancelled' : 'Finished'}</button></div>}
    <p className="replay-caption">{time >= duration ? (record.status === 'cancelled' ? 'Observed events stop at cancellation. Final usage remains unknown.' : 'Provider timings follow the receipt; text reveal is illustrative. Seeking sends no new request.') : active ? active.attempt.reason : 'The application submitted this request. No provider outcome observed yet.'}</p>
  </section>;
}
