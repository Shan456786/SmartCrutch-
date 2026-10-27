import { useEffect, useRef, useState, type PointerEvent } from 'react';

function useWidth<T extends HTMLElement>(): [React.RefObject<T>, number] {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(600);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w && w > 0) setWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}

export interface RefLine {
  value: number;
  label: string;
  tone: 'warn' | 'danger';
}

interface Point {
  x: number;
  y: number;
}

/**
 * Single-series time chart (one measure, one y-axis) with optional reference lines
 * and a crosshair tooltip on hover.
 */
export function LiveLineChart({
  points,
  xWindow,
  yMin,
  yMax,
  refLines = [],
  height = 220,
  formatY,
  yLabel,
  ariaLabel,
  symmetric,
}: {
  /** x in seconds relative to "now" (â‰¤ 0), y in display units */
  points: Point[];
  xWindow: number;
  yMin: number;
  yMax: number;
  refLines?: RefLine[];
  height?: number;
  formatY: (v: number) => string;
  yLabel: string;
  ariaLabel: string;
  symmetric?: boolean;
}) {
  const [wrapRef, width] = useWidth<HTMLDivElement>();
  const [hoverX, setHoverX] = useState<number | null>(null);

  const pad = { l: 44, r: 12, t: 12, b: 26 };
  const w = Math.max(160, width);
  const iw = w - pad.l - pad.r;
  const ih = height - pad.t - pad.b;
  const sx = (x: number) => pad.l + ((x + xWindow) / xWindow) * iw;
  const sy = (y: number) => pad.t + (1 - (y - yMin) / (yMax - yMin)) * ih;

  const visible = points.filter((p) => p.x >= -xWindow);
  const path = visible
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${sx(p.x).toFixed(1)},${sy(Math.min(yMax, Math.max(yMin, p.y))).toFixed(1)}`)
    .join('');
  const baselineY = symmetric ? sy(0) : sy(yMin);
  const area =
    visible.length > 1
      ? `${path}L${sx(visible[visible.length - 1].x).toFixed(1)},${baselineY}L${sx(visible[0].x).toFixed(1)},${baselineY}Z`
      : '';

  const yTicks = niceTicks(yMin, yMax, 4);
  const xStep = xWindow <= 15 ? 5 : xWindow <= 30 ? 10 : xWindow <= 60 ? 15 : 30;
  const xTicks: number[] = [];
  for (let x = 0; x >= -xWindow; x -= xStep) xTicks.push(x);

  let hover: Point | null = null;
  if (hoverX !== null && visible.length > 0) {
    const target = -xWindow + ((hoverX - pad.l) / iw) * xWindow;
    hover = visible.reduce((best, p) => (Math.abs(p.x - target) < Math.abs(best.x - target) ? p : best), visible[0]);
  }

  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    setHoverX(x >= pad.l && x <= w - pad.r ? x : null);
  };

  const last = visible[visible.length - 1];

  return (
    <div className="chart-wrap" ref={wrapRef}>
      <svg
        width={w}
        height={height}
        role="img"
        aria-label={ariaLabel}
        onPointerMove={onMove}
        onPointerLeave={() => setHoverX(null)}
        className="chart-svg"
      >
        <defs>
          <linearGradient id={`fill-${yLabel}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--series)" stopOpacity="0.22" />
            <stop offset="100%" stopColor="var(--series)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {yTicks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={w - pad.r} y1={sy(t)} y2={sy(t)} className={t === 0 && symmetric ? 'gridline zero' : 'gridline'} />
            <text x={pad.l - 8} y={sy(t)} className="axis-label" textAnchor="end" dominantBaseline="middle">
              {formatY(t)}
            </text>
          </g>
        ))}
        {xTicks.map((x) => (
          <text key={x} x={sx(x)} y={height - 8} className="axis-label" textAnchor={x === 0 ? 'end' : 'middle'}>
            {x === 0 ? 'now' : `${x}s`}
          </text>
        ))}
        {refLines.flatMap((r) => {
          const vals = symmetric ? [r.value, -r.value] : [r.value];
          return vals
            .filter((v) => v >= yMin && v <= yMax)
            .map((v) => (
              <g key={`${r.label}-${v}`}>
                <line x1={pad.l} x2={w - pad.r} y1={sy(v)} y2={sy(v)} className={`ref-line ref-${r.tone}`} />
                <text x={w - pad.r - 4} y={sy(v) - 5} className={`ref-label ref-${r.tone}`} textAnchor="end">
                  {r.label}
                </text>
              </g>
            ));
        })}
        {area && <path d={area} fill={`url(#fill-${yLabel})`} />}
        {path && <path d={path} className="series-line" />}
        {last && <circle cx={sx(last.x)} cy={sy(Math.min(yMax, Math.max(yMin, last.y)))} r={4.5} className="series-dot" />}
        {hover && (
          <g pointerEvents="none">
            <line x1={sx(hover.x)} x2={sx(hover.x)} y1={pad.t} y2={pad.t + ih} className="crosshair" />
            <circle cx={sx(hover.x)} cy={sy(Math.min(yMax, Math.max(yMin, hover.y)))} r={5} className="series-dot hover" />
          </g>
        )}
        <rect x={pad.l} y={pad.t} width={iw} height={ih} fill="transparent" />
      </svg>
      {hover && (
        <div
          className="chart-tooltip"
          style={{ left: Math.min(w - 130, Math.max(0, sx(hover.x) + 10)), top: Math.max(0, sy(hover.y) - 52) }}
        >
          <span className="tt-label">{hover.x > -0.05 ? 'now' : `${hover.x.toFixed(1)} s`}</span>
          <strong>{formatY(hover.y)}</strong>
        </div>
      )}
    </div>
  );
}

export function Sparkline({ values, max, threshold, ariaLabel }: { values: number[]; max: number; threshold?: number; ariaLabel: string }) {
  const w = 120;
  const h = 32;
  if (values.length < 2) return <svg width={w} height={h} aria-label={ariaLabel} role="img" />;
  const sx = (i: number) => (i / (values.length - 1)) * w;
  const sy = (v: number) => h - 2 - (Math.min(v, max) / max) * (h - 4);
  const d = values.map((v, i) => `${i === 0 ? 'M' : 'L'}${sx(i).toFixed(1)},${sy(v).toFixed(1)}`).join('');
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={ariaLabel} className="sparkline">
      {threshold !== undefined && threshold <= max && <line x1={0} x2={w} y1={sy(threshold)} y2={sy(threshold)} className="ref-line ref-danger" />}
      <path d={d} className="series-line thin" />
    </svg>
  );
}

/** Vertical bars, one per item, with per-bar hover tooltip and an optional reference line. */
export function BarChart({
  items,
  refValue,
  refLabel,
  formatY,
  height = 200,
  ariaLabel,
}: {
  items: { key: string; label: string; value: number; detail: string; over?: boolean }[];
  refValue?: number;
  refLabel?: string;
  formatY: (v: number) => string;
  height?: number;
  ariaLabel: string;
}) {
  const [wrapRef, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const pad = { l: 44, r: 12, t: 14, b: 26 };
  const w = Math.max(200, width);
  const iw = w - pad.l - pad.r;
  const ih = height - pad.t - pad.b;
  const maxV = Math.max(refValue ?? 0, ...items.map((i) => i.value), 1) * 1.1;
  const ticks = niceTicks(0, maxV, 4);
  const top = ticks[ticks.length - 1] || maxV;
  const sy = (v: number) => pad.t + (1 - v / top) * ih;
  const slot = iw / Math.max(1, items.length);
  const bw = Math.min(36, Math.max(6, slot - 6));

  return (
    <div className="chart-wrap" ref={wrapRef}>
      <svg width={w} height={height} role="img" aria-label={ariaLabel} className="chart-svg" onPointerLeave={() => setHover(null)}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={w - pad.r} y1={sy(t)} y2={sy(t)} className="gridline" />
            <text x={pad.l - 8} y={sy(t)} className="axis-label" textAnchor="end" dominantBaseline="middle">
              {formatY(t)}
            </text>
          </g>
        ))}
        {items.map((it, i) => {
          const cx = pad.l + slot * i + slot / 2;
          const y = sy(it.value);
          const hgt = Math.max(2, pad.t + ih - y);
          const r = Math.min(4, bw / 2, hgt);
          // Rounded top only; flat on the baseline.
          const d = `M${cx - bw / 2},${pad.t + ih}V${y + r}Q${cx - bw / 2},${y} ${cx - bw / 2 + r},${y}H${cx + bw / 2 - r}Q${cx + bw / 2},${y} ${cx + bw / 2},${y + r}V${pad.t + ih}Z`;
          return (
            <g key={it.key} onPointerEnter={() => setHover(i)}>
              <rect x={pad.l + slot * i} y={pad.t} width={slot} height={ih} fill="transparent" />
              <path d={d} className={`bar ${it.over ? 'bar-over' : ''} ${hover === i ? 'bar-hover' : ''}`} />
              {(items.length <= 8 || i % Math.ceil(items.length / 8) === 0) && (
                <text x={cx} y={height - 8} className="axis-label" textAnchor="middle">
                  {it.label}
                </text>
              )}
            </g>
          );
        })}
        {refValue !== undefined && (
          <g pointerEvents="none">
            <line x1={pad.l} x2={w - pad.r} y1={sy(refValue)} y2={sy(refValue)} className="ref-line ref-danger" />
            {refLabel && (
              <text x={w - pad.r - 4} y={sy(refValue) - 5} className="ref-label ref-danger" textAnchor="end">
                {refLabel}
              </text>
            )}
          </g>
        )}
      </svg>
      {hover !== null && items[hover] && (
        <div
          className="chart-tooltip"
          style={{ left: Math.min(w - 170, Math.max(0, pad.l + slot * hover + slot / 2 + 8)), top: Math.max(0, sy(items[hover].value) - 56) }}
        >
          <span className="tt-label">{items[hover].detail}</span>
          <strong>{formatY(items[hover].value)}</strong>
        </div>
      )}
    </div>
  );
}

function niceTicks(min: number, max: number, count: number): number[] {
  const span = max - min;
  if (span <= 0) return [min];
  const raw = span / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
  const out: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) out.push(Math.round(v * 1000) / 1000);
  return out;
}
