import type { ReactNode } from 'react';
import { audio } from '../audio/engine';
import { useApp, type Screen } from '../state/store';

export function click() {
  audio.unlock();
  audio.sfx('pickup');
}

export function Btn({ children, onClick, primary, disabled, small, title }: {
  children: ReactNode; onClick?: () => void; primary?: boolean; disabled?: boolean; small?: boolean; title?: string;
}) {
  return (
    <button
      className={`btn${primary ? ' btn-primary' : ''}${small ? ' btn-small' : ''}`}
      disabled={disabled}
      title={title}
      onClick={() => {
        click();
        onClick?.();
      }}
    >
      {children}
    </button>
  );
}

export function ScreenFrame({ title, kicker, children, back = 'menu', actions }: {
  title: string; kicker?: string; children: ReactNode; back?: Screen | null; actions?: ReactNode;
}) {
  const go = useApp((s) => s.go);
  return (
    <div className="screen">
      <div className="screen-head">
        <div>
          {kicker && <div className="kicker">{kicker}</div>}
          <h1 className="screen-title">{title}</h1>
        </div>
        <div className="screen-actions">
          {actions}
          {back && <Btn onClick={() => go(back)}>← Back</Btn>}
        </div>
      </div>
      <div className="screen-body">{children}</div>
    </div>
  );
}

export function Meter({ value, label, tone = 'neutral' }: { value: number; label?: string; tone?: 'neutral' | 'crimson' | 'spectral' }) {
  return (
    <div className={`meter meter-${tone}`} aria-label={label}>
      <div className="meter-fill" style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }} />
    </div>
  );
}

export function TapeLines() {
  return <div className="tape-lines" aria-hidden />;
}

export function Slider({ label, value, min = 0, max = 1, step = 0.05, onChange, format }: {
  label: string; value: number; min?: number; max?: number; step?: number; onChange: (v: number) => void; format?: (v: number) => string;
}) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
      <span className="field-value">{format ? format(value) : `${Math.round(value * 100)}%`}</span>
    </label>
  );
}

export function Toggle({ label, value, onChange, hint }: { label: string; value: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <label className="field field-toggle">
      <span className="field-label">
        {label}
        {hint && <small>{hint}</small>}
      </span>
      <button className={`switch${value ? ' on' : ''}`} role="switch" aria-checked={value} onClick={() => { click(); onChange(!value); }}>
        <span />
      </button>
    </label>
  );
}

export function Segmented<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: { v: T; l: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="field">
      <span className="field-label">{label}</span>
      <div className="segmented">
        {options.map((o) => (
          <button key={o.v} className={o.v === value ? 'active' : ''} onClick={() => { click(); onChange(o.v); }}>
            {o.l}
          </button>
        ))}
      </div>
    </div>
  );
}
