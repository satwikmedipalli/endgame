import type { CardKind } from '@shared/types';

type Name =
  | CardKind
  | 'arrow'
  | 'back'
  | 'check'
  | 'up'
  | 'send'
  | 'speaker'
  | 'sun'
  | 'moon'
  | 'auto'
  | 'bulb'
  | 'chart'
  | 'sliders'
  | 'close'
  | 'grid';

// Same stroke icons as the design canvas (24×24 viewBox).
export function Icon({ name, size = 18, color = 'currentColor', stroke = 1.8 }: { name: Name; size?: number; color?: string; stroke?: number }) {
  const p = { stroke: color, strokeWidth: stroke, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden focusable="false">
      {name === 'news' && (
        <>
          <path {...p} d="M4 5h12v14H6a2 2 0 0 1-2-2z" />
          <path {...p} d="M16 9h4v8a2 2 0 0 1-2 2" />
          <path {...p} d="M7 9h6M7 13h6M7 16h4" />
        </>
      )}
      {name === 'code' && <path {...p} d="M8 8l-4 4 4 4M16 8l4 4-4 4M13.5 6l-3 12" />}
      {name === 'history' && (
        <>
          <path {...p} d="M6 3h12M6 21h12" />
          <path {...p} d="M7 3c0 4 5 6 5 9 0-3 5-5 5-9M7 21c0-4 5-6 5-9 0 3 5 5 5 9" />
        </>
      )}
      {name === 'chess' && (
        <>
          <circle {...p} cx={12} cy={6.5} r={2.5} />
          <path {...p} d="M10 10h4l1.2 6.5H8.8z" />
          <path {...p} d="M6.5 20h11M8 16.5h8" />
        </>
      )}
      {name === 'stocks' && (
        <>
          <path {...p} d="M7 4v16M17 6v12" />
          <rect {...p} x={5} y={8} width={4} height={7} rx={1} />
          <rect {...p} x={15} y={9} width={4} height={5} rx={1} />
        </>
      )}
      {name === 'italian' && <path {...p} d="M5 5h14v10H10l-4 4v-4H5z" />}
      {name === 'watch' && (
        <>
          <rect {...p} x={3} y={6} width={18} height={12} rx={2} />
          <path {...p} d="M3 10h18M8 6l-1 4M13 6l-1 4M18 6l-1 4" />
        </>
      )}
      {name === 'arrow' && <path {...p} d="M5 12h14M13 6l6 6-6 6" />}
      {name === 'back' && <path {...p} d="M15 6l-6 6 6 6" />}
      {name === 'check' && <path {...p} d="M5 12.5l4.5 4.5L19 7" />}
      {name === 'up' && <path {...p} d="M6 15l6-6 6 6" />}
      {name === 'send' && <path {...p} d="M12 19V5M6 11l6-6 6 6" />}
      {name === 'speaker' && (
        <>
          <path {...p} d="M4 9v6h4l5 4V5L8 9z" />
          <path {...p} d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" />
        </>
      )}
      {name === 'sun' && (
        <>
          <circle {...p} cx={12} cy={12} r={4} />
          <path {...p} d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </>
      )}
      {name === 'moon' && <path {...p} d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z" />}
      {name === 'auto' && (
        <>
          <circle {...p} cx={12} cy={12} r={8} />
          <path {...p} fill={color} d="M12 4a8 8 0 0 1 0 16z" />
        </>
      )}
      {name === 'bulb' && (
        <>
          <path {...p} d="M9 18h6M10 21h4" />
          <path {...p} d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z" />
        </>
      )}
      {name === 'puzzle' && (
        <>
          <rect {...p} x={4} y={4} width={16} height={16} rx={1} />
          <path {...p} d="M9.3 4v16M14.7 4v16M4 9.3h16M4 14.7h16" />
        </>
      )}
      {name === 'close' && <path {...p} d="M6 6l12 12M18 6L6 18" />}
      {name === 'grid' && <path {...p} d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z" />}
      {name === 'chart' && <path {...p} d="M5 20V10M12 20V4M19 20v-7" />}
      {name === 'sliders' && (
        <>
          <path {...p} d="M4 7h9M17 7h3M4 17h3M11 17h9" />
          <circle {...p} cx={15} cy={7} r={2} />
          <circle {...p} cx={9} cy={17} r={2} />
        </>
      )}
    </svg>
  );
}
