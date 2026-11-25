import React from 'react';
import { useEffect, useRef, useState } from 'react';
import { Pause, Play, SkipBack, SkipForward, Volume2 } from 'lucide-react';
import { audioUrl, surahs } from '../data/quran.js';

export default function AudioPlayer({ surah = 1, reciter = 'alafasy', compact = false, linkSurahs = false }) {
  const ref = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [volume, setVolume] = useState(0.8);
  const [current, setCurrent] = useState(surah);
  const src = audioUrl(current, reciter);

  useEffect(() => {
    setCurrent(surah);
  }, [surah]);

  useEffect(() => {
    if (ref.current) ref.current.volume = volume;
  }, [volume]);

  async function toggle() {
    const el = ref.current;
    if (!el) return;
    if (el.paused) {
      try { await el.play(); setPlaying(true); } catch { setPlaying(false); }
    } else {
      el.pause();
      setPlaying(false);
    }
  }

  function step(delta) {
    setCurrent((c) => Math.min(114, Math.max(1, c + delta)));
    setPlaying(false);
  }

  const name = surahs[current - 1]?.name || '';
  const prev = Math.max(1, current - 1);
  const next = Math.min(114, current + 1);

  return (
    <div className={`qb-player ${compact ? 'qb-player-compact' : ''}`}>
      <audio
        ref={ref}
        src={src}
        preload="none"
        onEnded={() => setPlaying(false)}
        onPause={() => setPlaying(false)}
        onPlay={() => setPlaying(true)}
      />
      {linkSurahs ? (
        <a className="qb-player-btn" href={`/quran/${prev}/`} aria-label="السورة السابقة"><SkipBack size={17} /></a>
      ) : (
        <button type="button" className="qb-player-btn" onClick={() => step(-1)} aria-label="السورة السابقة">
          <SkipBack size={17} />
        </button>
      )}
      <button type="button" className="qb-player-main" onClick={toggle} aria-label={playing ? 'إيقاف مؤقت' : 'تشغيل'}>
        {playing ? <Pause size={19} /> : <Play size={19} />}
      </button>
      {linkSurahs ? (
        <a className="qb-player-btn" href={`/quran/${next}/`} aria-label="السورة التالية"><SkipForward size={17} /></a>
      ) : (
        <button type="button" className="qb-player-btn" onClick={() => step(1)} aria-label="السورة التالية">
          <SkipForward size={17} />
        </button>
      )}
      <div className="qb-player-meta">
        <strong>{name}</strong>
        <span>تلاوة هادئة · {current}/114</span>
      </div>
      <label className="qb-player-volume" aria-label="مستوى الصوت">
        <Volume2 size={16} />
        <input type="range" min="0" max="1" step="0.05" value={volume} onChange={(e) => setVolume(Number(e.target.value))} />
      </label>
    </div>
  );
}
