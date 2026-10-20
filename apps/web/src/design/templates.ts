import type { ExcalidrawElementSkeleton } from '@excalidraw/excalidraw/data/transform';

export interface BoardTemplate {
  id: string;
  label: string;
  /** Elements laid out from (0, 0); the board moves them clear of existing drawings. */
  build: () => ExcalidrawElementSkeleton[];
}

const box = (
  id: string,
  text: string,
  x: number,
  y: number,
  extra: Partial<{ width: number; height: number; backgroundColor: string }> = {},
): ExcalidrawElementSkeleton => ({
  type: 'rectangle',
  id,
  x,
  y,
  width: extra.width ?? 160,
  height: extra.height ?? 70,
  backgroundColor: extra.backgroundColor ?? 'transparent',
  fillStyle: 'solid',
  roundness: { type: 3 },
  label: { text },
});

const arrow = (from: string, to: string, x: number, y: number, w: number, h: number) =>
  ({
    type: 'arrow',
    x,
    y,
    width: w,
    height: h,
    start: { id: from },
    end: { id: to },
  }) satisfies ExcalidrawElementSkeleton;

function architecture(): ExcalidrawElementSkeleton[] {
  return [
    box('client', 'Client', 0, 120, { backgroundColor: '#a5d8ff' }),
    box('lb', 'Load balancer', 260, 120, { backgroundColor: '#ffec99' }),
    box('svc-a', 'Service A', 520, 20, { backgroundColor: '#b2f2bb' }),
    box('svc-b', 'Service B', 520, 220, { backgroundColor: '#b2f2bb' }),
    {
      type: 'ellipse',
      id: 'db',
      x: 780,
      y: 110,
      width: 160,
      height: 90,
      backgroundColor: '#eebefa',
      fillStyle: 'solid',
      label: { text: 'Database' },
    },
    arrow('client', 'lb', 160, 155, 100, 0),
    arrow('lb', 'svc-a', 420, 140, 100, -80),
    arrow('lb', 'svc-b', 420, 170, 100, 80),
    arrow('svc-a', 'db', 680, 60, 100, 80),
    arrow('svc-b', 'db', 680, 250, 100, -80),
  ];
}

function grid(): ExcalidrawElementSkeleton[] {
  const cols = 4;
  const rows = 3;
  const size = 160;
  const cells: ExcalidrawElementSkeleton[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      cells.push({
        type: 'rectangle',
        x: c * size,
        y: r * size,
        width: size,
        height: size,
        strokeColor: '#adb5bd',
        strokeStyle: 'dashed',
        strokeWidth: 1,
      });
    }
  }
  return cells;
}

function sequenceLanes(): ExcalidrawElementSkeleton[] {
  const actors = ['Client', 'API', 'Service', 'Database'];
  const gap = 220;
  const laneHeight = 460;
  const out: ExcalidrawElementSkeleton[] = [];
  actors.forEach((name, i) => {
    const x = i * gap;
    out.push(box(`actor-${i}`, name, x, 0, { width: 140, height: 56 }));
    out.push({
      type: 'line',
      x: x + 70,
      y: 56,
      points: [
        [0, 0],
        [0, laneHeight],
      ],
      strokeStyle: 'dashed',
      strokeColor: '#868e96',
    } as ExcalidrawElementSkeleton);
  });
  // One example message and its reply, to show the convention.
  out.push({
    type: 'arrow',
    x: 70,
    y: 120,
    width: gap,
    height: 0,
    label: { text: 'request' },
  });
  out.push({
    type: 'arrow',
    x: 70 + gap,
    y: 180,
    width: -gap,
    height: 0,
    strokeStyle: 'dashed',
    label: { text: 'response' },
  });
  return out;
}

export const BOARD_TEMPLATES: BoardTemplate[] = [
  { id: 'architecture', label: 'Client → Load balancer → Services → DB', build: architecture },
  { id: 'grid', label: 'Blank grid', build: grid },
  { id: 'sequence', label: 'Sequence diagram lanes', build: sequenceLanes },
];
