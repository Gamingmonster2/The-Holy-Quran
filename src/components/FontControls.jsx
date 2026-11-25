import React from 'react';
import { useEffect, useState } from 'react';
import * as Slider from '@radix-ui/react-slider';
import { Type } from 'lucide-react';

export default function FontControls() {
  const [size, setSize] = useState(21);
  const [font, setFont] = useState('naskh');

  useEffect(() => {
    document.documentElement.style.setProperty('--reader-size', `${size}px`);
    document.documentElement.dataset.readerFont = font;
  }, [size, font]);

  return (
    <div className="qb-font-controls" aria-label="إعدادات القراءة">
      <span className="qb-font-title"><Type size={16} /> حجم الخط</span>
      <Slider.Root className="qb-slider" min={16} max={30} step={1} value={[size]} onValueChange={(v) => setSize(v[0])}>
        <Slider.Track className="qb-slider-track"><Slider.Range className="qb-slider-range" /></Slider.Track>
        <Slider.Thumb className="qb-slider-thumb" aria-label="حجم خط القراءة" />
      </Slider.Root>
      <div className="qb-font-buttons" role="group" aria-label="نوع الخط">
        <button type="button" className={font === 'naskh' ? 'active' : ''} onClick={() => setFont('naskh')}>نسخ</button>
        <button type="button" className={font === 'amiri' ? 'active' : ''} onClick={() => setFont('amiri')}>أميري</button>
      </div>
    </div>
  );
}
