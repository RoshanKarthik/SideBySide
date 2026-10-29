import { CaptureUpdateAction, Excalidraw, restoreElements } from '@excalidraw/excalidraw';
import type { BinaryFileData, ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types';
import { getBoard } from '@sidebyside/shared/doc';
import { useEffect, useRef, useState } from 'react';
import type * as Y from 'yjs';
import { useCurrentTheme } from '@/lib/theme';
import { fetchBoardFile } from './board-files';
import { readElements } from './board-sync';
import { asExcalidraw } from './excalidraw-setup';

/** The whiteboard as it was at the replay's current time. */
export default function ReplayBoard({
  doc,
  time,
  roomId,
  round,
}: {
  doc: Y.Doc;
  time: number;
  roomId: string;
  round: number;
}) {
  const theme = useCurrentTheme();
  const [api, setApi] = useState<ExcalidrawImperativeAPI | null>(null);
  const fitted = useRef(false);
  const requested = useRef(new Set<string>());

  // `doc` is replaced when seeking backwards; `time` moves on every frame while playing.
  const shown = useRef('');
  useEffect(() => {
    if (!api) return;
    const raw = readElements(getBoard(doc));
    const key = raw.map((el) => `${el.id}:${el.version}`).join();
    if (key === shown.current) return;
    shown.current = key;
    const elements = restoreElements(asExcalidraw(raw), null);
    api.updateScene({ elements, captureUpdate: CaptureUpdateAction.NEVER });
    // Images are stored apart from the board; fetch each one the first time it appears.
    for (const el of elements) {
      if (el.type !== 'image' || !el.fileId || requested.current.has(el.fileId)) continue;
      requested.current.add(el.fileId);
      void fetchBoardFile(roomId, round, el.fileId)
        .then((file) => file && api.addFiles([file as unknown as BinaryFileData]))
        .catch(() => {});
    }
    if (!fitted.current && elements.some((el) => !el.isDeleted)) {
      fitted.current = true;
      // The API is ready before the canvas has its size; fit once it has been laid out.
      let tries = 0;
      const fit = () => {
        if (api.getAppState().width > 0 || ++tries > 60) {
          api.scrollToContent(undefined, { fitToContent: true });
        } else {
          requestAnimationFrame(fit);
        }
      };
      requestAnimationFrame(fit);
    }
  }, [api, doc, time, roomId, round]);

  const empty = [...getBoard(doc).values()].every((el) => el.isDeleted === true);

  return (
    <div className="relative h-full">
      <Excalidraw
        excalidrawAPI={setApi}
        viewModeEnabled
        theme={theme}
        UIOptions={{
          canvasActions: { loadScene: false, saveToActiveFile: false, toggleTheme: false },
        }}
      />
      {empty && (
        <p className="pointer-events-none absolute inset-x-0 top-1/3 z-10 text-center text-sm text-muted-foreground">
          Nothing on the board at this point.
        </p>
      )}
    </div>
  );
}
