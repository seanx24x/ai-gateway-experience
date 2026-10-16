'use client';

import { useId, useLayoutEffect, useRef } from 'react';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUpRight, Check, ChevronDown, Clock3, Map, Moon, RotateCcw, Sun, X } from 'lucide-react';
import { REVIEW_CHAPTERS, reviewerHref, type ReviewerChapter, type ReviewerChapterId, type ReviewerProgress } from '@/lib/reviewer';
import './reviewer-experience.css';

function ChapterNumber({ index, done = false }: { index: number; done?: boolean }) {
  return <span className={`rw-chapter-number${done ? ' is-done' : ''}`}>{done ? <Check size={14} aria-label="Demonstrated" /> : String(index + 1).padStart(2, '0')}</span>;
}

function ReviewMark() {
  return <svg width="23" height="21" viewBox="0 0 23 21" fill="currentColor" aria-hidden="true"><path d="M11.5 1 23 21H0L11.5 1Z" /></svg>;
}

function ThemeButton({ theme, onThemeToggle }: { theme: string; onThemeToggle: () => void }) {
  return <button type="button" className="rw-icon-button" onClick={onThemeToggle} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}>{theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}</button>;
}

export function ReviewEntry({ progress, onStart, onRestart, onResume, onExit, theme, onThemeToggle }: {
  progress: ReviewerProgress;
  onStart: (chapter: ReviewerChapterId, prepared?: boolean) => void;
  onRestart: () => void;
  onResume: () => void;
  onExit: () => void;
  theme: string;
  onThemeToggle: () => void;
}) {
  const started = progress.visited.length > 0;
  const current = REVIEW_CHAPTERS.find(chapter => chapter.id === progress.chapter) ?? REVIEW_CHAPTERS[0];
  return <div className="rw-entry">
    <header className="rw-entry-header"><div className="rw-width rw-entry-header-inner"><button type="button" className="rw-brand" onClick={onExit} aria-label="Explore AI Gateway freely"><ReviewMark /><span>AI Gateway</span></button><span className="rw-header-divider" aria-hidden="true" /><span className="rw-header-label">Behind the design</span><div className="rw-entry-header-actions"><button type="button" className="rw-text-button" onClick={onExit}>Explore freely<ArrowUpRight size={14} aria-hidden="true" /></button><ThemeButton theme={theme} onThemeToggle={onThemeToggle} /></div></div></header>
    <div className="rw-width">
      <section className="rw-introduction" aria-labelledby="rw-intro-title" data-testid={progress.finished ? 'reviewer-ending' : 'reviewer-introduction'} data-reviewer-surface>
        <div className="rw-authorship"><span className="rw-author-mark" aria-hidden="true">S</span><span>An independent concept by Sean Lynch</span></div>
        {progress.finished ? <><p className="rw-completion-label"><Check size={15} aria-hidden="true" />{progress.demonstrated.length} of 5 behaviors demonstrated</p><h1 id="rw-intro-title" tabIndex={-1}>One request.<br />A connected system.</h1><p className="rw-intro-description">A useful outcome becomes evidence. That evidence informs a routing decision, and the intent travels into integration and operation. Every chapter is here to revisit and question.</p></> : <><h1 id="rw-intro-title" tabIndex={-1}>From first request<br className="rw-desktop-break" /> to a system you understand.</h1><p className="rw-intro-description">A working exploration of AI Gateway. Try the experience, then look closer at the decisions behind it.</p></>}
        <div className="rw-intro-actions">{started && !progress.finished ? <button type="button" className="button primary" onClick={onResume} title={`Resume ${current.title.toLowerCase()}`}>Resume walkthrough<ArrowRight size={16} aria-hidden="true" /></button> : <button type="button" className="button primary" onClick={() => progress.finished ? onRestart() : onStart('understand')}>{progress.finished ? 'Walk through again' : 'Start the walkthrough'}<ArrowRight size={16} aria-hidden="true" /></button>}<a className="rw-text-button rw-map-link" href="#chapters">See the whole experience<ArrowDown size={14} aria-hidden="true" /></a><span className="rw-duration"><Clock3 size={14} aria-hidden="true" />5–7 minutes, at your pace</span></div>
        <div className="rw-intro-footnote"><span>Interactive product. Simulated requests.</span><span>No account, credentials or installation needed.</span></div>
      </section>

      {progress.finished && <section className="rw-ending-validation" aria-label="What I would validate next"><div><h2>What I would validate next</h2><p>The prototype exposes the decisions. Research would need to establish whether they help people in their own work.</p></div><ul><li>Can a new user explain Gateway after the first request?</li><li>Can an experienced developer predict and explain a changed route?</li><li>Can someone distinguish a prepared handoff from a verified connection?</li></ul></section>}

      <section className="rw-story-outline" aria-label="The design story">
        <div className="rw-outline-heading"><h2>{progress.finished ? 'What this work makes inspectable' : 'Five moments. One continuous experience.'}</h2><p>Start with an outcome. Follow the evidence.</p></div>
        <ol className="rw-story-stages">{REVIEW_CHAPTERS.map((chapter, index) => <li key={chapter.id} data-visited={progress.visited.includes(chapter.id)} data-demonstrated={progress.demonstrated.includes(chapter.id)}><button type="button" onClick={() => onStart(chapter.id)} aria-label={`Explore ${chapter.title}`}><span className="rw-stage-track"><ChapterNumber index={index} done={progress.demonstrated.includes(chapter.id)} /><span className="rw-stage-line" aria-hidden="true" /></span><strong>{chapter.title}</strong><span>{chapter.headline}</span></button></li>)}</ol>
      </section>

      <section id="chapters" className="rw-chapter-map" aria-labelledby="rw-map-title" data-testid="reviewer-chapter-map" data-reviewer-surface>
        <div className="rw-map-heading"><div><p className="rw-section-caption">The complete experience</p><h2 id="rw-map-title" tabIndex={-1}>A map of the product<br />and the thinking behind it.</h2></div><p>Follow the story in order, or enter anywhere. Later chapters offer a clearly labelled prepared example.</p></div>
        <div className="rw-map-rows">{REVIEW_CHAPTERS.map((chapter, index) => <article className="rw-map-chapter" key={chapter.id}>
          <div className="rw-map-chapter-heading"><ChapterNumber index={index} done={progress.demonstrated.includes(chapter.id)} /><h3>{chapter.title}</h3><span className="rw-chapter-state">{progress.demonstrated.includes(chapter.id) ? 'Demonstrated' : progress.skipped.includes(chapter.id) ? 'Skipped' : progress.visited.includes(chapter.id) ? 'Visited' : ''}</span></div>
          <div className="rw-map-chapter-main"><h4>{chapter.headline}</h4><p>{chapter.userGoal}</p><button type="button" className="rw-text-button" onClick={() => onStart(chapter.id)}>Explore {chapter.title.toLowerCase()}<ArrowRight size={14} aria-hidden="true" /></button></div>
          <details className="rw-map-destinations"><summary>Connected screens<span>{chapter.destinations.length}</span><ChevronDown size={14} aria-hidden="true" /></summary><ul>{chapter.destinations.map(destination => <li key={destination.href ?? destination.view}><a href={reviewerHref(destination.href ?? (destination.view === 'overview' ? '/' : `/${destination.view}`), chapter.id)}><span>{destination.label}</span><ArrowUpRight size={13} aria-hidden="true" /><small>{destination.goal}</small></a></li>)}</ul></details>
        </article>)}</div>
      </section>

      <section className="rw-project-context" aria-label="Project context"><div><h2>A proposal you can inspect.</h2><p>I designed and built this concept to explore how AI Gateway could feel easier to understand, configure and operate. The walkthrough connects my interaction decisions to behavior you can try.</p></div><div><p>Gateway capabilities are grounded in public documentation. Routing experiments, requests and operational data in this concept are simulated. Adoption and usability benefits remain hypotheses to validate.</p><a className="rw-text-button" href="https://vercel.com/ai-gateway" target="_blank" rel="noreferrer">Vercel AI Gateway<ArrowUpRight size={14} aria-hidden="true" /></a></div></section>
      {started && !progress.finished && <div className="rw-restart"><button type="button" className="rw-text-button" onClick={onRestart}><RotateCcw size={14} aria-hidden="true" />Restart walkthrough</button><span>Your ordinary product session is preserved.</span></div>}
    </div>
  </div>;
}

export function ReviewerHeader({ chapter, progress, onMap, onExit, onThemeToggle, theme, onThinking }: {
  chapter: ReviewerChapter;
  progress: ReviewerProgress;
  onMap: () => void;
  onExit: () => void;
  onThemeToggle: () => void;
  theme: string;
  onThinking: () => void;
}) {
  const index = REVIEW_CHAPTERS.findIndex(item => item.id === chapter.id);
  return <header className="rw-review-header" data-reviewer-surface><div className="rw-width rw-review-header-inner"><button type="button" className="rw-brand rw-review-brand" onClick={onMap} aria-label="Behind the design, open chapter map"><ReviewMark /><span>Behind the design</span></button><span className="rw-header-divider" aria-hidden="true" /><button type="button" className="rw-current-chapter" onClick={onMap} aria-label="Chapter map" title={`Chapter ${index + 1} of ${REVIEW_CHAPTERS.length}: ${chapter.title}`}><span className="rw-header-count">{String(index + 1).padStart(2, '0')}<span>/ 05</span></span><strong>{chapter.title}</strong><ChevronDown size={14} aria-hidden="true" /></button><div className="rw-header-progress" aria-label={`${progress.demonstrated.length} of 5 chapters demonstrated`}>{REVIEW_CHAPTERS.map(item => <span key={item.id} data-current={item.id === chapter.id} data-done={progress.demonstrated.includes(item.id)} />)}</div><nav className="rw-review-actions" aria-label="Reviewer controls"><button type="button" className="rw-thinking-button" onClick={onThinking} aria-label="Design thinking"><span className="rw-thinking-full">Design thinking</span><span className="rw-thinking-short">Thinking</span></button><button type="button" className="rw-icon-button rw-map-button" onClick={onMap} aria-label="View all chapters"><Map size={17} /></button><ThemeButton theme={theme} onThemeToggle={onThemeToggle} /><button type="button" className="rw-icon-button" onClick={onExit} aria-label="Exit walkthrough"><X size={17} /></button></nav></div></header>;
}

export function ReviewerMission({ chapter, supporting, onReturn, onPrepare, prepared, canPrepare = false, view, detail = false }: {
  chapter: ReviewerChapter;
  supporting: boolean;
  onReturn: () => void;
  onPrepare: () => void;
  prepared: boolean;
  canPrepare?: boolean;
  view?: string;
  detail?: boolean;
}) {
  const destination = supporting ? (chapter.destinations.find(item => item.view === view && (detail ? Boolean(item.href) : !item.href)) ?? REVIEW_CHAPTERS.flatMap(item => item.destinations).find(item => item.view === view && (detail ? Boolean(item.href) : !item.href))) : undefined;
  const index = REVIEW_CHAPTERS.findIndex(item => item.id === chapter.id);
  return <section className={`rw-mission${supporting ? ' rw-mission--supporting' : ''}`} aria-label="Walkthrough mission" data-testid="reviewer-mission" data-reviewer-surface><div className="rw-width rw-mission-inner"><ChapterNumber index={index} /><div className="rw-mission-copy"><p>{destination?.goal ?? chapter.mission}</p>{destination && <small>{destination.decision}</small>}{prepared && <span className="rw-prepared-label">Prepared example. Explore it freely.</span>}</div><div className="rw-mission-actions">{canPrepare && <button type="button" className="rw-text-button" onClick={onPrepare}>Prepare this example<ArrowRight size={14} aria-hidden="true" /></button>}{supporting && <button type="button" className="rw-text-button" onClick={onReturn}><ArrowLeft size={14} aria-hidden="true" />Return to walkthrough</button>}</div></div></section>;
}

export function ReviewerReflection({ chapter, demonstrated, expanded, onToggle, onContinue, onSkip, onRetry, finished }: {
  chapter: ReviewerChapter;
  demonstrated: boolean;
  expanded: boolean;
  onToggle: () => void;
  onContinue: () => void;
  onSkip: () => void;
  onRetry?: () => void;
  finished: boolean;
}) {
  const panelId = useId();
  const toggleButton = useRef<HTMLButtonElement>(null);
  const restoreToggleFocus = useRef(false);
  useLayoutEffect(() => {
    if (!restoreToggleFocus.current) return;
    restoreToggleFocus.current = false;
    toggleButton.current?.focus({ preventScroll: true });
  }, [expanded]);
  function toggleReasoning() { restoreToggleFocus.current = true; onToggle(); }
  const index = REVIEW_CHAPTERS.findIndex(item => item.id === chapter.id);
  if (!demonstrated && !expanded) return <section id="reviewer-reflection" tabIndex={-1} className="rw-reflection rw-reflection--invitation" aria-label={`${chapter.title} design reasoning`} data-demonstrated="false" data-testid="reviewer-reflection" data-reviewer-surface><div className="rw-width rw-reflection-invitation"><div><p>Try the interaction. Then explore the decision.</p><span>Inspect the thinking whenever you’re ready.</span></div><div><button ref={toggleButton} type="button" className="rw-text-button" aria-expanded="false" aria-controls={panelId} onClick={toggleReasoning}>Explore the decision<ChevronDown size={15} aria-hidden="true" /></button><button type="button" className="rw-text-button rw-skip" onClick={onSkip}>Skip this chapter</button></div></div></section>;
  return <section id="reviewer-reflection" tabIndex={-1} className={`rw-reflection${demonstrated ? ' is-demonstrated' : ''}`} aria-label={`${chapter.title} design reasoning`} data-demonstrated={demonstrated} data-testid="reviewer-reflection" data-reviewer-surface>
    <div className="rw-width">
      <div className="rw-reflection-intro"><div className="rw-reflection-title"><span className="rw-reflection-status">{demonstrated ? <><Check size={14} aria-hidden="true" />Behavior demonstrated</> : 'Behind this interaction'}</span><h2>{chapter.reflection}</h2></div><div className="rw-reflection-decision"><p>{chapter.decision}</p><button ref={toggleButton} type="button" className="rw-text-button rw-expand" aria-expanded={expanded} aria-controls={panelId} onClick={toggleReasoning}>{expanded ? 'Close the reasoning' : 'Explore the decision'}<ChevronDown size={15} aria-hidden="true" /></button></div></div>
      {expanded && <div id={panelId} className="rw-reasoning">
        <div className="rw-reasoning-row"><h3>User and product goals</h3><div><h4>What the user needs</h4><p>{chapter.userGoal}</p></div><div><h4>The product opportunity</h4><p>{chapter.opportunity}</p><span className="rw-evidence-qualifier">Public product direction; proposed benefits to validate.</span></div></div>
        <div className="rw-reasoning-row"><h3>Design thinking</h3><div><h4>The problem I addressed</h4><p>{chapter.problem}</p></div><div><h4>The tradeoff</h4><p>{chapter.tradeoff}</p></div></div>
        <div className="rw-reasoning-row"><h3>Execution and evidence</h3><div><h4>Where I focused the craft</h4><p>{chapter.craft}</p></div><div><h4>What you can inspect</h4><p>{chapter.evidence}</p></div></div>
        <div className="rw-reasoning-row rw-validation"><h3>What comes next</h3><div><h4>A question for validation</h4><p>{chapter.validation}</p></div><div><h4>Product references</h4><ul>{chapter.sources.map(source => <li key={source.href}><a href={source.href} target="_blank" rel="noreferrer">{source.label}<ArrowUpRight size={13} aria-hidden="true" /></a></li>)}</ul></div></div>
      </div>}
      <div className="rw-reflection-footer"><span>{String(index + 1).padStart(2, '0')}<span className="rw-footer-chapter"> / 05</span><span className="rw-footer-status">{demonstrated ? 'Demonstrated' : 'Explore at your pace'}</span></span><div>{onRetry && <button type="button" className="rw-text-button" onClick={onRetry}>Try again</button>}{!demonstrated && <button type="button" className="rw-text-button" onClick={onSkip}>Skip this chapter</button>}{demonstrated && <button type="button" className="button primary" onClick={onContinue}>{finished || index === REVIEW_CHAPTERS.length - 1 ? 'Reflect on the journey' : `Continue to ${REVIEW_CHAPTERS[index + 1].title.toLowerCase()}`}<ArrowRight size={15} aria-hidden="true" /></button>}</div></div>
    </div>
  </section>;
}
