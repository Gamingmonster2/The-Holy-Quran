import React from 'react';
import { useEffect, useState } from 'react';
import * as Slider from '@radix-ui/react-slider';
import { Type } from 'lucide-react';
import { translations } from '../lib/i18n.mjs';

export default function FontControls({ lang = 'ar' }) {
  const ui = translations(lang);
  const [size, setSize] = useState(21);
  const [font, setFont] = useState('naskh');

  useEffect(() => {
    document.documentElement.style.setProperty('--reader-size', `${size}px`);
    document.documentElement.dataset.readerFont = font;
  }, [size, font]);

  return (
    <div className="qb-font-controls" aria-label={ui.fontSettings}>
      <span className="qb-font-title"><Type size={16} /> {ui.fontSize}</span>
      <Slider.Root className="qb-slider" min={16} max={30} step={1} value={[size]} onValueChange={(v) => setSize(v[0])}>
        <Slider.Track className="qb-slider-track"><Slider.Range className="qb-slider-range" /></Slider.Track>
        <Slider.Thumb className="qb-slider-thumb" aria-label={ui.fontAria} />
      </Slider.Root>
      <div className="qb-font-buttons" role="group" aria-label={ui.fontType}>
        <button type="button" className={font === 'naskh' ? 'active' : ''} onClick={() => setFont('naskh')}>{ui.naskh}</button>
        <button type="button" className={font === 'amiri' ? 'active' : ''} onClick={() => setFont('amiri')}>{ui.amiri}</button>
      </div>
    </div>
  );
}
