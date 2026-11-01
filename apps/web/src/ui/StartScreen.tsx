// The start screen: continue the campaign saved in this browser, or start a new one.
import { useEffect, useState } from 'react';
import { formatClock, type GameState, type Lang } from '@otc/shared';
import type { Strings } from '../i18n/strings';
import { fmtDate, money } from '../game/GameUI';
import { pctText } from '../game/OpinionUI';
import { Logo } from './Hud';

/** What the browser keeps for a campaign; a new game clears it. */
export const SAVE_KEYS = ['otc.game.v1', 'otc.clock.v1', 'otc.plan.v1', 'otc.press.seen'];
const NEW_GAME_FLAG = 'otc.newGame';

/**
 * Call before anything reads the saved game: if the last page asked for a new game, forget the old
 * one now (the old page may still have saved on its way out). True when a new game is starting.
 */
export function startingNewGame(): boolean {
  try {
    if (!sessionStorage.getItem(NEW_GAME_FLAG)) return false;
    sessionStorage.removeItem(NEW_GAME_FLAG);
    for (const k of SAVE_KEYS) localStorage.removeItem(k);
    return true;
  } catch {
    return false;
  }
}

/** Forget this campaign and reload into a new one. */
function newGame() {
  try {
    sessionStorage.setItem(NEW_GAME_FLAG, '1');
    for (const k of SAVE_KEYS) localStorage.removeItem(k);
  } catch {
    /* storage blocked: the reload starts afresh anyway */
  }
  location.reload();
}

interface Props {
  t: Strings;
  lang: Lang;
  onLang: (l: Lang) => void;
  /** the campaign in progress, if there is one to continue */
  campaign: GameState | null;
  /** the game clock's time of day */
  time: number;
  onContinue: () => void;
}

export function StartScreen({ t, lang, onLang, campaign, time, onContinue }: Props) {
  const [confirm, setConfirm] = useState(false);
  const [starting, setStarting] = useState(false);
  const st = t.st;
  const approval = campaign?.opinion?.history.at(-1)?.approval;
  // Escape backs out of the question, or back into the game
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || starting) return;
      if (confirm) setConfirm(false);
      else if (campaign) onContinue();
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [confirm, starting, campaign, onContinue]);
  return (
    <div className="start-wrap" role="dialog" aria-modal="true" aria-label={t.appName}>
      <section className="start">
        <div className="start-brand"><Logo size={52} /><div className="start-kicker">{st.kicker}</div></div>
        <h1>{t.appName}</h1>
        <p className="pitch">{st.pitch}</p>
        {starting ? <p className="starting" aria-live="polite">{st.starting}</p> : confirm && campaign ? (
          <div className="confirm">
            <h2>{st.confirmTitle}</h2>
            <p>{st.confirmBody(fmtDate(campaign.date, lang))}</p>
            <div className="start-actions">
              <button className="btn danger big" onClick={() => { setStarting(true); newGame(); }}>{st.confirmYes}</button>
              <button className="btn big" onClick={() => setConfirm(false)} autoFocus>{st.cancel}</button>
            </div>
          </div>
        ) : (
          <div className="start-actions">
            {campaign && (
              <button className="btn primary big" onClick={onContinue} autoFocus>
                <span>{st.continue}</span>
                <small>{st.saved(fmtDate(campaign.date, lang), formatClock(time))}</small>
                <small>{st.stats(approval !== undefined ? pctText(approval, lang) : '–', money(campaign.reserve, lang))}</small>
              </button>
            )}
            <button className={`btn big${campaign ? '' : ' primary'}`} onClick={() => (campaign ? setConfirm(true) : onContinue())} autoFocus={!campaign}>
              <span>{st.newGame}</span>
            </button>
          </div>
        )}
        <ul className="tips">{st.tips.map((x) => <li key={x}>{x}</li>)}</ul>
        <div className="start-foot">
          <div className="seg" role="radiogroup" aria-label="Language">
            {(['en', 'fr'] as Lang[]).map((l) => (
              <button key={l} role="radio" aria-checked={lang === l} className={lang === l ? 'on' : ''} onClick={() => onLang(l)}>{l.toUpperCase()}</button>
            ))}
          </div>
          <small>{st.footer}</small>
        </div>
      </section>
    </div>
  );
}
