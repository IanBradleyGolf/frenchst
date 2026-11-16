import { Circle, Line, Rect, Text } from 'react-konva';
import { primsFor } from '../symbols';
import type { SymbolKind } from '../types';

export function SymbolShape({ kind, color, size, half }: { kind: SymbolKind; color: string; size: number; half?: number }) {
  return (
    <>
      {primsFor(kind, half).map((p, i) => {
        switch (p.t) {
          case 'circle':
            return p.fill ? (
              <Circle key={i} x={p.cx * size} y={p.cy * size} radius={p.r * size} fill={color} />
            ) : (
              <Circle key={i} x={p.cx * size} y={p.cy * size} radius={p.r * size} stroke={color} strokeWidth={(p.w ?? 0.18) * size} fill="rgba(255,255,255,0.85)" />
            );
          case 'rect':
            return p.fill ? (
              <Rect key={i} x={p.x * size} y={p.y * size} width={p.w * size} height={p.h * size} fill={color} />
            ) : (
              <Rect key={i} x={p.x * size} y={p.y * size} width={p.w * size} height={p.h * size} stroke={color} strokeWidth={(p.sw ?? 0.18) * size} fill="rgba(255,255,255,0.85)" />
            );
          case 'poly':
            return (
              <Line
                key={i}
                points={p.pts.map((v) => v * size)}
                closed={p.closed || p.fill}
                fill={p.fill ? color : p.closed ? 'rgba(255,255,255,0.85)' : undefined}
                stroke={p.fill ? undefined : color}
                strokeWidth={(p.w ?? 0.18) * size}
                dash={p.dash?.map((d) => d * size)}
                lineJoin="round"
                lineCap={p.dash ? 'butt' : 'round'}
              />
            );
          case 'text': {
            const fs = p.size * size;
            const w = fs * p.s.length * 0.7;
            return (
              <Text key={i} x={p.x * size - w / 2} y={p.y * size - fs / 2} width={w} height={fs} text={p.s} fontSize={fs} fontFamily="IBM Plex Mono" fontStyle="600" fill={color} align="center" verticalAlign="middle" />
            );
          }
        }
      })}
    </>
  );
}
