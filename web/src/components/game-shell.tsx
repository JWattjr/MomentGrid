"use client";

import {
  ArrowLeft,
  Check,
  ChevronRight,
  CircleDot,
  Clock3,
  Eye,
  EyeOff,
  Flame,
  Grid3X3,
  LockKeyhole,
  RotateCcw,
  Share2,
  ShieldCheck,
  Sparkles,
  Ticket,
  Trophy,
  Zap,
} from "lucide-react";
import { type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  completedLineIndexes,
  EVENT_LABELS,
  MatchEvent,
  MatchEventType,
  MatchSnapshot,
  matchScore,
  PREDICTION_POOLS,
  PREDICTIONS,
  PredictionId,
  scoreGrid,
} from "@moment-grid/scoring";
import { useMatchSource } from "@/lib/use-match-source";
import { ConfidentialSubmitButton } from "./confidential-submit-button";
import { MegapotClaimButton } from "./megapot-claim-button";
import { MomentHeader, MomentNav } from "./moment-chrome";

type Screen = "build" | "lock" | "watch" | "reveal" | "reward";
type Grid = Array<PredictionId | null>;
type FeedbackCue = "tap" | "confirm" | "lock" | "event" | "reveal" | "reward";

const SCREEN_ORDER: Screen[] = ["build", "lock", "watch", "reveal", "reward"];
const TIER_NAMES = ["Common", "Medium", "Rare"];
const TIER_CODES = ["C", "M", "R"];
const WINDOW_LABELS = ["0–30", "30–60", "60–90+"];

const LINE_PATHS = [
  { cells: [0, 1, 2], d: "M 16.667 16.667 L 83.333 16.667" },
  { cells: [3, 4, 5], d: "M 16.667 50 L 83.333 50" },
  { cells: [6, 7, 8], d: "M 16.667 83.333 L 83.333 83.333" },
  { cells: [0, 3, 6], d: "M 16.667 16.667 L 16.667 83.333" },
  { cells: [1, 4, 7], d: "M 50 16.667 L 50 83.333" },
  { cells: [2, 5, 8], d: "M 83.333 16.667 L 83.333 83.333" },
  { cells: [0, 4, 8], d: "M 16.667 16.667 L 83.333 83.333" },
  { cells: [2, 4, 6], d: "M 83.333 16.667 L 16.667 83.333" },
] as const;

const QUICK_GRID: PredictionId[] = [
  "HOME_TWO_SHOTS_30",
  "CARD_30_60",
  "TWO_SUBS_AFTER_60",
  "HOME_SCORES_FIRST",
  "VAR_30_60",
  "BOTH_SCORE_FULL_TIME",
  "PENALTY_BEFORE_30",
  "PENALTY_30_60",
  "GOAL_AFTER_80",
];

export function GameShell() {
  const [screen, setScreen] = useState<Screen>("build");
  const [grid, setGrid] = useState<Grid>(() => Array(9).fill(null));
  const [pickerCell, setPickerCell] = useState<number | null>(null);
  const { snapshot, error: replayError, start: startMatch, reset: resetMatch } = useMatchSource();
  const [revealed, setRevealed] = useState(false);
  const [fragments, setFragments] = useState(0);
  const [feedbackEnabled, setFeedbackEnabled] = useState(true);
  const [showTutorial, setShowTutorial] = useState(false);
  const rewardCommitted = useRef(false);
  const audioContext = useRef<AudioContext | null>(null);

  const completeGrid = grid.every((prediction): prediction is PredictionId => prediction !== null);
  const result = useMemo(
    () => (completeGrid ? scoreGrid(grid as PredictionId[], snapshot.events) : { markedMask: 0, completedLines: 0 }),
    [completeGrid, grid, snapshot.events],
  );

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const saved = window.localStorage.getItem("moment-grid-fragments");
      if (saved) setFragments(Number(saved));
      setFeedbackEnabled(window.localStorage.getItem("moment-grid-feedback") !== "off");
      setShowTutorial(!window.localStorage.getItem("moment-grid-tutorial-seen"));
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => () => { void audioContext.current?.close(); }, []);

  const playFeedback = useCallback((cue: FeedbackCue) => {
    if (!feedbackEnabled) return;

    const vibration: Record<FeedbackCue, number | number[]> = {
      tap: 12,
      confirm: [20, 25, 25],
      lock: [35, 30, 55],
      event: [20, 25, 20],
      reveal: [25, 20, 25, 20, 50],
      reward: [30, 20, 30, 20, 80],
    };
    window.navigator.vibrate?.(vibration[cue]);

    if (!("AudioContext" in window)) return;
    const context = audioContext.current ?? new AudioContext();
    audioContext.current = context;
    if (context.state === "suspended") void context.resume();
    const frequencies: Record<FeedbackCue, number[]> = {
      tap: [330],
      confirm: [392, 523],
      lock: [220, 165],
      event: [523, 659],
      reveal: [330, 440, 659],
      reward: [392, 523, 659, 784],
    };
    frequencies[cue].forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const start = context.currentTime + index * .075;
      oscillator.type = cue === "lock" ? "square" : "sine";
      oscillator.frequency.setValueAtTime(frequency, start);
      gain.gain.setValueAtTime(.0001, start);
      gain.gain.exponentialRampToValueAtTime(.055, start + .012);
      gain.gain.exponentialRampToValueAtTime(.0001, start + .095);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(start);
      oscillator.stop(start + .11);
    });
  }, [feedbackEnabled]);

  const toggleFeedback = () => {
    const next = !feedbackEnabled;
    setFeedbackEnabled(next);
    window.localStorage.setItem("moment-grid-feedback", next ? "on" : "off");
    if (next) window.navigator.vibrate?.(18);
  };

  const closeTutorial = () => {
    window.localStorage.setItem("moment-grid-tutorial-seen", "1");
    setShowTutorial(false);
    playFeedback("confirm");
  };

  const handleEventFeedback = useCallback(() => playFeedback("event"), [playFeedback]);

  const selectPrediction = (prediction: PredictionId) => {
    if (pickerCell === null) return;
    playFeedback("tap");
    setGrid((current) => current.map((value, index) => (index === pickerCell ? prediction : value)));
    setPickerCell(null);
  };

  const startRound = async () => {
    playFeedback("lock");
    await startMatch();
    setScreen("watch");
  };

  const commitReward = useCallback(() => {
    if (rewardCommitted.current) return;
    playFeedback("reward");
    rewardCommitted.current = true;
    setFragments((current) => {
      const next = current + result.completedLines;
      window.localStorage.setItem("moment-grid-fragments", String(next));
      return next;
    });
    setScreen("reward");
  }, [playFeedback, result.completedLines]);

  const playAgain = async () => {
    playFeedback("tap");
    await resetMatch();
    rewardCommitted.current = false;
    setGrid(Array(9).fill(null));
    setRevealed(false);
    setScreen("build");
  };

  return (
    <main className="app-stage theme-club">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />
      <section className="phone-shell">
        <MomentHeader feedbackEnabled={feedbackEnabled} onOpenTutorial={() => { playFeedback("tap"); setShowTutorial(true); }} onToggleFeedback={toggleFeedback} />
        <MomentNav />
        <Progress screen={screen} />

        <div className="screen-body" key={screen}>
          {screen === "build" && (
            <BuildScreen
              grid={grid}
              complete={completeGrid}
              onPick={(cell) => { playFeedback("tap"); setPickerCell(cell); }}
              onQuickFill={() => { playFeedback("confirm"); setGrid([...QUICK_GRID]); }}
              onContinue={() => { playFeedback("confirm"); setScreen("lock"); }}
            />
          )}
          {screen === "lock" && (
            <LockScreen grid={grid as PredictionId[]} error={replayError} onBack={() => { playFeedback("tap"); setScreen("build"); }} onLock={startRound} />
          )}
          {screen === "watch" && <WatchScreen snapshot={snapshot} error={replayError} onEvent={handleEventFeedback} onContinue={() => { playFeedback("confirm"); setScreen("reveal"); }} />}
          {screen === "reveal" && (
            <RevealScreen
              grid={grid as PredictionId[]}
              markedMask={result.markedMask}
              completedLines={result.completedLines}
              revealed={revealed}
              onReveal={() => { playFeedback("reveal"); setRevealed(true); }}
              onContinue={commitReward}
            />
          )}
          {screen === "reward" && <RewardScreen completedLines={result.completedLines} fragments={fragments} onAgain={playAgain} />}
        </div>

        <div className="home-indicator" />
      </section>

      {pickerCell !== null && (
        <PredictionPicker
          cell={pickerCell}
          selected={grid[pickerCell]}
          onSelect={selectPrediction}
          onClose={() => setPickerCell(null)}
        />
      )}
      {showTutorial && <FirstPlayTutorial onAdvance={() => playFeedback("tap")} onClose={closeTutorial} />}
    </main>
  );
}

function FirstPlayTutorial({ onAdvance, onClose }: { onAdvance: () => void; onClose: () => void }) {
  const [step, setStep] = useState(0);
  const steps = [
    { icon: Grid3X3, tag: "01 · Build", title: "Fill all nine calls.", copy: "Columns are match windows. Rows are rarity tiers. Every cell needs one prediction." },
    { icon: LockKeyhole, tag: "02 · Lock", title: "Keep the grid secret.", copy: "Seal your calls before kickoff so nobody can copy the crowd or strong players." },
    { icon: Trophy, tag: "03 · Win", title: "Complete the most lines.", copy: "Rows, columns, and diagonals count equally. Each line also earns one fragment." },
  ] as const;
  const current = steps[step];
  const Icon = current.icon;
  const last = step === steps.length - 1;

  const next = () => {
    if (last) return onClose();
    onAdvance();
    setStep((value) => value + 1);
  };

  return (
    <div className="tutorial-backdrop" role="presentation">
      <section className="tutorial-card" role="dialog" aria-modal="true" aria-label="How to play Moment Grid">
        <div className="tutorial-top"><span>First match briefing</span><button type="button" onClick={onClose}>Skip</button></div>
        <div className="tutorial-visual"><span className="tutorial-orbit" /><div><Icon size={38} /></div></div>
        <span className="step-label">{current.tag}</span>
        <h2>{current.title}</h2>
        <p>{current.copy}</p>
        <div className="tutorial-dots" aria-label={`Tutorial step ${step + 1} of ${steps.length}`}>{steps.map((_, index) => <i className={index <= step ? "is-active" : ""} key={index} />)}</div>
        <button className="primary-button" type="button" onClick={next}>{last ? "Start calling" : "Next"}<ChevronRight size={18} /></button>
      </section>
    </div>
  );
}

function Progress({ screen }: { screen: Screen }) {
  const active = SCREEN_ORDER.indexOf(screen);
  return (
    <div className="progress-rail" aria-label={`Step ${active + 1} of 5: ${screen}`}>
      {SCREEN_ORDER.map((item, index) => <div key={item} className={`progress-segment ${index <= active ? "is-active" : ""}`} />)}
    </div>
  );
}

function MatchCard() {
  return (
    <div className="match-card">
      <div><span className="eyebrow">Recorded cup replay · Emirates</span><strong>ARS <span>vs</span> CHE</strong></div>
      <div className="match-meta"><span>Judge demo</span><div className="match-window"><Clock3 size={13} /> 2 min / 90′</div></div>
    </div>
  );
}

function RewardLoop({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`reward-loop ${compact ? "is-compact" : ""}`} aria-label="Moment Grid reward loop">
      <span><b>Play</b><small>secret grid</small></span>
      <i>→</i>
      <span><b>Line</b><small>row · column · diagonal</small></span>
      <i>→</i>
      <span><b>+1</b><small>fragment</small></span>
      <i>→</i>
      <span className="reward-loop-ticket"><b>4 = Ticket</b><small>Megapot draw</small></span>
    </div>
  );
}

function BuildScreen({ grid, complete, onPick, onQuickFill, onContinue }: { grid: Grid; complete: boolean; onPick: (cell: number) => void; onQuickFill: () => void; onContinue: () => void }) {
  return (
    <div className="screen-stack">
      <div className="title-row">
        <div><span className="step-label">01 · Build</span><h1>Call the match.</h1></div>
        <button className="text-button" onClick={onQuickFill}><Zap size={13} /> Quick fill</button>
      </div>
      <p className="lede">Build nine football predictions. Rows control rarity; columns decide when each call resolves.</p>
      <MatchCard />
      <RewardLoop compact />
      <GridBoard grid={grid} onPick={onPick} />
      <div className="privacy-note"><ShieldCheck size={16} /><span>Consensus stays hidden until every grid is locked.</span></div>
      <button className="primary-button" disabled={!complete} onClick={onContinue}>
        {complete ? "Review my grid" : `${grid.filter(Boolean).length} / 9 predictions picked`}<ChevronRight size={18} />
      </button>
    </div>
  );
}

function GridBoard({ grid, onPick, markedMask = 0, revealed = false, locked = false, showConsensus = false, lineCellOrder }: { grid: Grid; onPick?: (cell: number) => void; markedMask?: number; revealed?: boolean; locked?: boolean; showConsensus?: boolean; lineCellOrder?: number[] }) {
  return (
    <div className={`grid-board prediction-board ${locked ? "is-locked" : ""}`}>
      <div className="grid-corner" />
      {WINDOW_LABELS.map((window) => <div className="column-label" key={window}>{window}′</div>)}
      {TIER_NAMES.map((tier, row) => (
        <div className="contents" key={tier}>
          <div className={`tier-label tier-${row}`}><span>{TIER_CODES[row]}</span><small>{tier}</small></div>
          {[0, 1, 2].map((column) => {
            const cell = row * 3 + column;
            const predictionId = grid[cell];
            const definition = predictionId ? PREDICTIONS[predictionId] : null;
            const hit = (markedMask & (1 << cell)) !== 0;
            const ignitionOrder = lineCellOrder?.[cell] ?? -1;
            return (
              <button
                type="button"
                key={cell}
                className={`grid-cell prediction-cell tier-${row} ${definition ? "has-pick" : ""} ${revealed && hit ? "is-hit" : ""} ${revealed && !hit ? "is-miss" : ""} ${ignitionOrder >= 0 ? "is-line-cell" : ""}`}
                style={({
                  "--cell-index": cell,
                  ...(ignitionOrder >= 0 ? { "--line-order": ignitionOrder } : {}),
                }) as CSSProperties}
                onClick={() => onPick?.(cell)}
                disabled={!onPick}
                aria-label={`${tier}, ${WINDOW_LABELS[column]}: ${definition?.label ?? "empty"}`}
              >
                {locked && !revealed ? (
                  <><EyeOff size={17} /><small>Sealed</small></>
                ) : definition ? (
                  <>
                    <span className="prediction-copy"><strong>{definition.label}</strong><small>{definition.deadline}</small></span>
                    {showConsensus && <ConsensusMeter support={definition.support} tier={row} />}
                    {revealed && <span className="result-dot">{hit ? <Check size={10} /> : "×"}</span>}
                  </>
                ) : (
                  <><span className="plus">+</span><small>Choose</small></>
                )}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function ConsensusMeter({ support, tier }: { support: number; tier: number }) {
  const filledDots = Math.max(1, Math.min(5, Math.ceil(support / 20)));
  return (
    <span className={`consensus-meter meter-tier-${tier}`} aria-label={`${support}% crowd support`}>
      <span className="consensus-dots" aria-hidden="true">
        {Array.from({ length: 5 }, (_, index) => <i className={index < filledDots ? "is-filled" : ""} key={index} />)}
      </span>
      <b>{support}%</b>
    </span>
  );
}

function LockScreen({ grid, error, onBack, onLock }: { grid: PredictionId[]; error: string; onBack: () => void; onLock: () => void }) {
  return (
    <div className="screen-stack">
      <button className="back-button" onClick={onBack}><ArrowLeft size={16} /> Edit grid</button>
      <div><span className="step-label">02 · Lock</span><h1>Seal your calls.</h1></div>
      <p className="lede">Predictions cannot change after kickoff. Crowd support appears only when every board is sealed.</p>
      <PrivacyJourney stage="sealed" />
      <div className="privacy-proof" aria-label="Confidential computation proof">
        <div><ShieldCheck size={18} /><span><b>Inco Lightning</b><small>1 encrypted handle stores all 9 picks</small></span></div>
        <div><span><b>Compute</b><small>Lines scored while the grid stays secret</small></span><em>FHE</em></div>
        <div><span><b>Reveal</b><small>Only hit mask + line count become public</small></span><em>AFTER FT</em></div>
        <p>Base Sepolia deploy target · plaintext store retained for scoring parity tests</p>
      </div>
      <GridBoard grid={grid} locked />
      <div className="lock-card"><div className="lock-icon"><LockKeyhole size={20} /></div><div><strong>Private until reveal</strong><p>No one can copy popular grids before the match begins.</p></div></div>
      <ConfidentialSubmitButton grid={grid} />
      {error && <p className="error-message">{error}</p>}
      <button className="primary-button pulse-button" onClick={onLock}>Lock & start replay <LockKeyhole size={17} /></button>
    </div>
  );
}

function WatchScreen({ snapshot, error, onEvent, onContinue }: { snapshot: MatchSnapshot; error: string; onEvent: (event: MatchEvent) => void; onContinue: () => void }) {
  const [reaction, setReaction] = useState<MatchEvent | null>(null);
  const previousEventCount = useRef(snapshot.events.length);
  const minute = Math.min(90, Math.floor(snapshot.virtualMinute));
  const seconds = minute === 90 ? 0 : Math.floor((snapshot.virtualMinute % 1) * 60);
  const activeWindow = Math.min(2, Math.floor(snapshot.virtualMinute / 30));
  const score = matchScore(snapshot.events);
  const eventCount = snapshot.events.length;
  const latestEvent = eventCount > 0 ? snapshot.events[eventCount - 1] : null;
  const latestEventMinute = latestEvent?.minute;
  const latestEventType = latestEvent?.eventType;

  useEffect(() => {
    if (eventCount <= previousEventCount.current || latestEventMinute === undefined || latestEventType === undefined) return;
    previousEventCount.current = eventCount;
    const newest: MatchEvent = { minute: latestEventMinute, eventType: latestEventType };
    onEvent(newest);
    const majorMoment = ["HOME_GOAL", "AWAY_GOAL", "SUBSTITUTE_GOAL", "YELLOW_CARD", "RED_CARD", "PENALTY_AWARDED", "VAR_REVIEW", "GOAL_OVERTURNED"].includes(newest.eventType);
    if (!majorMoment) return;
    const showTimer = window.setTimeout(() => setReaction(newest), 0);
    const hideTimer = window.setTimeout(() => setReaction(null), 1450);
    return () => { window.clearTimeout(showTimer); window.clearTimeout(hideTimer); };
  }, [eventCount, latestEventMinute, latestEventType, onEvent]);

  const reactionTone = reaction && ["HOME_GOAL", "AWAY_GOAL", "SUBSTITUTE_GOAL"].includes(reaction.eventType) ? "goal" : reaction && ["YELLOW_CARD", "RED_CARD", "PENALTY_AWARDED", "VAR_REVIEW"].includes(reaction.eventType) ? "alert" : "pulse";
  return (
    <div className="screen-stack watch-screen">
      {reaction && <div className={`match-reaction reaction-${reactionTone}`} role="status" aria-live="assertive"><span>{Math.floor(reaction.minute)}′</span><div className="reaction-glyph"><EventGlyph eventType={reaction.eventType} /></div><strong>{EVENT_LABELS[reaction.eventType]}</strong><small>Match moment</small></div>}
      <div className="watch-head"><div><span className="step-label live-label"><span /> Live replay</span><h1>{minute}:{String(seconds).padStart(2, "0")}</h1></div><div className="score-bug" aria-label={`Arsenal ${score.home}, Chelsea ${score.away}`}><span>ARS</span><strong>{score.home}—{score.away}</strong><span>CHE</span></div></div>
      <div className="timeline">
        {WINDOW_LABELS.map((window, index) => (
          <div className={`timeline-window ${index < activeWindow || snapshot.phase === "complete" ? "is-done" : ""} ${index === activeWindow && snapshot.phase !== "complete" ? "is-live" : ""}`} key={window}>
            <span>{window}′</span><div><i style={{ width: index === activeWindow ? `${Math.min(100, ((snapshot.virtualMinute - index * 30) / 30) * 100)}%` : undefined }} /></div>
          </div>
        ))}
      </div>
      <div className="sealed-panel"><div className="sealed-orbit"><LockKeyhole size={26} /><span /></div><strong>Your predictions are sealed</strong><p>Conditions resolve across all 90 minutes. Consensus remains private until reveal.</p></div>
      <div className="feed-section"><div className="section-heading"><span>Match pulse</span><small>{snapshot.events.length} events</small></div><div className="event-feed">{snapshot.events.length === 0 && <div className="empty-event">Waiting for kickoff…</div>}{[...snapshot.events].reverse().slice(0, 4).map((event, index) => <EventRow event={event} newest={index === 0} key={`${event.minute}-${event.eventType}`} />)}</div></div>
      {error && <p className="error-message">{error}</p>}
      {snapshot.phase === "complete" ? <button className="primary-button" onClick={onContinue}>Full time · reveal <Eye size={18} /></button> : <div className="countdown"><Clock3 size={14} /> {Math.ceil(snapshot.remainingSeconds)}s until reveal</div>}
    </div>
  );
}

function EventRow({ event, newest }: { event: MatchEvent; newest: boolean }) {
  return (
    <div className={`event-row ${newest ? "is-new" : ""}`}><span className="event-minute">{Math.floor(event.minute)}′</span><span className="event-glyph"><EventGlyph eventType={event.eventType} /></span><strong>{EVENT_LABELS[event.eventType]}</strong>{newest && <small>just now</small>}</div>
  );
}

function EventGlyph({ eventType }: { eventType: MatchEventType }) {
  const glyphs: Record<MatchEventType, string> = {
    HOME_SHOT: "◎", AWAY_SHOT: "◎", HOME_GOAL: "✦", AWAY_GOAL: "✦", CORNER: "⌞", YELLOW_CARD: "▯", RED_CARD: "▮", VAR_REVIEW: "V", GOAL_OVERTURNED: "×", PENALTY_AWARDED: "◉", SUBSTITUTION: "⇄", SUBSTITUTE_GOAL: "★", EXTRA_TIME: "+",
  };
  return <span className="moment-glyph">{glyphs[eventType]}</span>;
}

function RevealScreen({ grid, markedMask, completedLines, revealed, onReveal, onContinue }: { grid: PredictionId[]; markedMask: number; completedLines: number; revealed: boolean; onReveal: () => void; onContinue: () => void }) {
  const lineIndexes = revealed ? completedLineIndexes(markedMask) : [];
  const lineCellOrder = Array<number>(9).fill(-1);
  lineIndexes.forEach((lineIndex, order) => {
    LINE_PATHS[lineIndex].cells.forEach((cell) => {
      if (lineCellOrder[cell] === -1) lineCellOrder[cell] = order;
    });
  });

  return (
    <div className="screen-stack reveal-screen">
      <div><span className="step-label">04 · Reveal</span><h1>{revealed ? "The crowd called it." : "Ready for the truth?"}</h1></div>
      <p className="lede">Five-dot meters show how strongly the locked crowd backed each prediction.</p>
      <PrivacyJourney stage={revealed ? "revealed" : "sealed"} />
      <div className={`reveal-wrap ${revealed ? "is-revealed" : ""}`}>
        <GridBoard grid={grid} locked={!revealed} revealed={revealed} markedMask={markedMask} showConsensus={revealed} lineCellOrder={lineCellOrder} />
        {revealed && <LineIgnitionOverlay lineIndexes={lineIndexes} />}
        {!revealed && <div className="reveal-scrim"><EyeOff size={28} /><span>Encrypted grid</span></div>}
      </div>
      {revealed && <div className="consensus-key"><span><i className="is-filled" />○○○○ Contrarian</span><span><i className="is-filled" /><i className="is-filled" /><i className="is-filled" /><i className="is-filled" /><i className="is-filled" /> Crowd favorite</span></div>}
      {revealed && <div className="line-result"><div><Flame size={22} /><span><strong>{completedLines}</strong> {completedLines === 1 ? "line" : "lines"} complete</span></div><small>Equal scoring</small></div>}
      <button className="primary-button" onClick={revealed ? onContinue : onReveal}>{revealed ? "Claim my fragments" : "Reveal predictions"}{revealed ? <Sparkles size={18} /> : <Eye size={18} />}</button>
    </div>
  );
}

function LineIgnitionOverlay({ lineIndexes }: { lineIndexes: number[] }) {
  if (lineIndexes.length === 0) return null;

  return (
    <div className="line-ignition-layer" aria-hidden="true">
      <svg className="line-ignition-svg" viewBox="0 0 100 100" preserveAspectRatio="none">
        {lineIndexes.map((lineIndex, order) => {
          const line = LINE_PATHS[lineIndex];
          const delay = order * 0.78;
          return (
            <g key={lineIndex} style={{ "--line-order": order } as CSSProperties}>
              <path className="line-route" d={line.d} pathLength="1" />
              <path className="line-complete" d={line.d} pathLength="1" />
              <circle className="line-spark" cx="0" cy="0" r="2.1" style={{ "--line-order": order } as CSSProperties}>
                <animateMotion path={line.d} begin={`${delay + 0.08}s`} dur="0.62s" fill="freeze" />
              </circle>
            </g>
          );
        })}
      </svg>
      <div className="line-fragment-cues">
        {lineIndexes.map((lineIndex, order) => (
          <span key={lineIndex} style={{ "--line-order": order } as CSSProperties}>Line complete <b>+1 fragment</b></span>
        ))}
      </div>
    </div>
  );
}

function PrivacyJourney({ stage }: { stage: "draft" | "sealed" | "revealed" }) {
  const active = { draft: 0, sealed: 1, revealed: 2 }[stage];
  const stages = [
    { label: "Private", icon: EyeOff },
    { label: "Sealed", icon: LockKeyhole },
    { label: "Revealed", icon: Eye },
  ];
  return (
    <div className="privacy-journey" aria-label={`Grid privacy status: ${stage}`}>
      {stages.map(({ label, icon: Icon }, index) => <div className={`${index < active ? "is-done" : ""} ${index === active ? "is-current" : ""}`} key={label}><span><Icon size={12} /></span><small>{label}</small></div>)}
    </div>
  );
}

function RewardScreen({ completedLines, fragments, onAgain }: { completedLines: number; fragments: number; onAgain: () => void }) {
  const ticketReady = fragments >= 4;
  const [shareStatus, setShareStatus] = useState("Share result");

  const shareResult = async () => {
    const text = `I completed ${completedLines} ${completedLines === 1 ? "line" : "lines"} in Moment Grid and now have ${fragments}/4 Megapot fragments.`;
    try {
      if (navigator.share) {
        await navigator.share({ title: "My Moment Grid result", text, url: window.location.origin });
        setShareStatus("Shared!");
      } else {
        await navigator.clipboard.writeText(`${text} ${window.location.origin}`);
        setShareStatus("Copied!");
      }
    } catch {
      setShareStatus("Share result");
    }
  };

  return (
    <div className="screen-stack reward-screen">
      <div className="reward-burst"><span /><div><Trophy size={36} /></div></div>
      <div className="reward-copy"><span className="step-label">05 · Reward</span><h1>{completedLines > 0 ? "Lines secured." : "Next call wins."}</h1><p>{completedLines > 0 ? `You completed ${completedLines} ${completedLines === 1 ? "line" : "lines"} across the match.` : "No complete line this time, but your fragment balance stays safe."}</p></div>
      <RewardLoop />
      <div className="fragment-card"><div className="fragment-top"><div><span>Fragment vault</span><strong>{fragments}<small> / 4</small></strong></div><Ticket size={25} /></div><div className="fragment-track">{[0, 1, 2, 3].map((slot) => <i className={slot < Math.min(4, fragments) ? "filled" : ""} key={slot}>{slot < fragments ? <Sparkles size={13} /> : null}</i>)}</div><p>{ticketReady ? "Megapot ticket ready to purchase." : `${4 - fragments} more ${4 - fragments === 1 ? "fragment" : "fragments"} unlocks a Megapot ticket.`}</p><MegapotClaimButton ready={ticketReady} /></div>
      <div className="payout-card"><span>Round result</span><div><strong>{completedLines > 0 ? "Top score" : "No lines"}</strong><small>{completedLines > 0 ? "Pot shared with tied leaders" : "Zero-line tie rules apply"}</small></div></div>
      <button className="share-result-button" type="button" onClick={shareResult}><Share2 size={16} />{shareStatus}</button>
      <button className="primary-button" onClick={onAgain}>Build another grid <RotateCcw size={17} /></button>
      <p className="replay-footnote">Full-match replay · no wallet required</p>
    </div>
  );
}

function PredictionPicker({ cell, selected, onSelect, onClose }: { cell: number; selected: PredictionId | null; onSelect: (prediction: PredictionId) => void; onClose: () => void }) {
  const tier = Math.floor(cell / 3);
  const column = cell % 3;
  const pool = PREDICTION_POOLS[tier][column];
  return (
    <div className="picker-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="picker-sheet" role="dialog" aria-modal="true" aria-label="Choose a prediction">
        <div className="picker-handle" />
        <div className="picker-heading"><div><span className="step-label">{TIER_NAMES[tier]} · {WINDOW_LABELS[column]}′</span><h2>Choose your call</h2></div><button onClick={onClose}>×</button></div>
        <p className="picker-privacy">Crowd backing unlocks after all grids are sealed.</p>
        <div className="picker-options">
          {pool.map((predictionId) => {
            const definition = PREDICTIONS[predictionId];
            return <button className={selected === predictionId ? "selected" : ""} key={predictionId} onClick={() => onSelect(predictionId)}><span className={`prediction-swatch tier-${tier}`}><CircleDot size={16} /></span><div><strong>{definition.label}</strong><small>{definition.deadline}</small></div>{selected === predictionId && <Check size={17} />}</button>;
          })}
        </div>
      </div>
    </div>
  );
}
