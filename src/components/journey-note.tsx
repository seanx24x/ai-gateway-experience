import './journey-note.css';
const notes = {
  application: { title: 'Start with the application', issue: 'The request controls and routing diagram competed with the reason to use Gateway.', decision: 'Keep a support reply in the foreground and reveal routing evidence as the request happens.', evidence: 'Run the prepared workload, then test a provider failure. The customer task stays the same.' },
  recovery: { title: 'Keep the failure in view', issue: 'A final success badge can conceal the recovery that made it possible.', decision: 'Retain the failed attempt beside the provider that completed the reply.', evidence: 'Select an attempt to inspect its recorded cause and elapsed interval. Recovery occurs before output.' },
  comparison: { title: 'Make the change inspectable', issue: 'Two complete records require the reader to find the difference.', decision: 'Switch Original and Draft on one elapsed-time scale, with the policy change alongside.', evidence: 'Both receipts use the same workload and provider conditions. Switching views creates no requests.' },
} as const;
export function JourneyNote({ topic }: { topic: keyof typeof notes }) {
  const note = notes[topic];
  return <details className="journey-note"><summary>Design note · {note.title}</summary><dl><div><dt>Observed issue</dt><dd>{note.issue}</dd></div><div><dt>Decision</dt><dd>{note.decision}</dd></div><div><dt>Inspect it</dt><dd>{note.evidence}</dd></div></dl></details>;
}
