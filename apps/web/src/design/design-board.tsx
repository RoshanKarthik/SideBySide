import {
  CaptureUpdateAction,
  Excalidraw,
  MainMenu,
  convertToExcalidrawElements,
  getCommonBounds,
  reconcileElements,
  restoreElements,
} from '@excalidraw/excalidraw';
import type { RemoteExcalidrawElement } from '@excalidraw/excalidraw/data/reconcile';
import type { ExcalidrawElementSkeleton } from '@excalidraw/excalidraw/data/transform';
import type { OrderedExcalidrawElement } from '@excalidraw/excalidraw/element/types';
import type {
  BinaryFileData,
  BinaryFiles,
  Collaborator,
  ExcalidrawImperativeAPI,
  ExcalidrawInitialDataState,
  SocketId,
} from '@excalidraw/excalidraw/types';
import type { BoardPointer, PresenceState } from '@sidebyside/shared';
import { getBoard } from '@sidebyside/shared/doc';
import { LayoutTemplate, Lock } from 'lucide-react';
import { DropdownMenu } from 'radix-ui';
import { useCallback, useEffect, useRef, useState } from 'react';
import type * as Y from 'yjs';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/toaster';
import { useCurrentTheme } from '@/lib/theme';
import { isLowBandwidth } from '@/lib/use-me';
import type { RoomConnection } from '@/room/use-room';
import { fetchBoardFile, uploadBoardFile } from './board-files';
import { LOCAL_ORIGIN, readElements, writeElements } from './board-sync';
import { asBoard, asExcalidraw } from './excalidraw-setup';
import { BOARD_TEMPLATES, type BoardTemplate } from './templates';

/** How often local drawing is written to the shared doc, and pointers to awareness. */
const FLUSH_MS = 50;
const POINTER_MS = 60;
const POINTER_MS_LOW_BANDWIDTH = 400;

interface Props {
  conn: RoomConnection;
  roomId: string;
  /** Room slug: the key for a guest's token. */
  slug: string;
  round: number;
  interviewer: boolean;
  /** Whether the Design tab is the one showing. */
  active: boolean;
  readOnly: boolean;
}

/** The Design tab: an Excalidraw whiteboard kept in the room's shared doc. */
export default function DesignBoard({
  conn,
  roomId,
  slug,
  round,
  interviewer,
  active,
  readOnly,
}: Props) {
  const { doc, provider } = conn;
  const board = getBoard(doc);
  const theme = useCurrentTheme();
  const [api, setApi] = useState<ExcalidrawImperativeAPI | null>(null);
  const [initialData] = useState<ExcalidrawInitialDataState>(() => ({
    elements: restoreElements(asExcalidraw(readElements(board)), null),
    scrollToContent: true,
  }));

  // Images: whoever places one uploads it to the room once; everyone else fetches the images
  // their board is missing. Ids seen here are never uploaded or fetched twice.
  const knownFiles = useRef(new Set<string>());
  const loadMissingFiles = useCallback(
    (elements: readonly OrderedExcalidrawElement[]) => {
      if (!api) return;
      const have = api.getFiles();
      for (const el of elements) {
        if (el.type !== 'image' || el.isDeleted || !el.fileId) continue;
        if (have[el.fileId] || knownFiles.current.has(el.fileId)) continue;
        knownFiles.current.add(el.fileId);
        void fetchBoardFile(roomId, round, el.fileId, slug)
          .then((file) => file && api.addFiles([file as unknown as BinaryFileData]))
          .catch(() => knownFiles.current.delete(el.fileId!));
      }
    },
    [api, roomId, round, slug],
  );
  const uploadNewFiles = (elements: readonly OrderedExcalidrawElement[], files: BinaryFiles) => {
    for (const el of elements) {
      if (el.type !== 'image' || el.isDeleted || !el.fileId) continue;
      const file = files[el.fileId];
      if (!file || knownFiles.current.has(el.fileId)) continue;
      knownFiles.current.add(el.fileId);
      uploadBoardFile(roomId, slug, file).catch((err: Error) =>
        toast.error(`The image couldn't be added for everyone: ${err.message}`),
      );
    }
  };

  // Shared doc → canvas.
  useEffect(() => {
    if (!api) return;
    // Images already on the board when it opened.
    loadMissingFiles(api.getSceneElements());
    const apply = (ids?: Iterable<string>) => {
      const remote = readElements(board, ids);
      if (!remote.length) return;
      const restored = restoreElements(asExcalidraw(remote), null) as RemoteExcalidrawElement[];
      const elements = reconcileElements(
        api.getSceneElementsIncludingDeleted(),
        restored,
        api.getAppState(),
      );
      api.updateScene({ elements, captureUpdate: CaptureUpdateAction.NEVER });
      loadMissingFiles(restored);
    };
    const onChange = (event: Y.YMapEvent<Record<string, unknown>>, tx: Y.Transaction) => {
      if (tx.origin !== LOCAL_ORIGIN) apply(event.keysChanged);
    };
    board.observe(onChange);
    // Anything that arrived between the first render and the API being ready.
    apply();
    return () => board.unobserve(onChange);
  }, [api, board, loadMissingFiles]);

  // Canvas → shared doc, batched while someone drags or draws.
  const pending = useRef<readonly OrderedExcalidrawElement[] | null>(null);
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const readOnlyRef = useRef(readOnly);
  useEffect(() => {
    readOnlyRef.current = readOnly;
  }, [readOnly]);
  const flush = useCallback(() => {
    if (flushTimer.current) clearTimeout(flushTimer.current);
    flushTimer.current = null;
    const elements = pending.current;
    pending.current = null;
    if (elements && !readOnlyRef.current) writeElements(board, asBoard(elements));
  }, [board]);
  useEffect(() => flush, [flush]);
  const pointerDown = useRef(false);
  const onSceneChange = (
    elements: readonly OrderedExcalidrawElement[],
    _appState: unknown,
    files: BinaryFiles,
  ) => {
    if (readOnlyRef.current) return;
    uploadNewFiles(elements, files);
    pending.current = elements;
    // Low-bandwidth mode sends a drag once, when the pointer is released.
    if (isLowBandwidth() && pointerDown.current) return;
    flushTimer.current ??= setTimeout(flush, FLUSH_MS);
  };

  // Our pointer → awareness (throttled, but button changes always go out), cleared when
  // leaving the tab.
  const lastPointer = useRef({ at: 0, button: 'up' });
  const onPointerUpdate = ({
    pointer,
    button,
  }: {
    pointer: Omit<BoardPointer, 'button'>;
    button: 'up' | 'down';
  }) => {
    const wasDown = pointerDown.current;
    pointerDown.current = button === 'down';
    if (wasDown && button === 'up' && pending.current) flush();
    const now = performance.now();
    const last = lastPointer.current;
    const every = isLowBandwidth() ? POINTER_MS_LOW_BANDWIDTH : POINTER_MS;
    if (button === last.button && now - last.at < every) return;
    lastPointer.current = { at: now, button };
    const value: BoardPointer = {
      x: Math.round(pointer.x),
      y: Math.round(pointer.y),
      tool: pointer.tool,
      button,
    };
    provider.awareness.setLocalStateField('pointer', value);
  };
  useEffect(() => {
    if (!active) provider.awareness.setLocalStateField('pointer', null);
  }, [active, provider]);
  useEffect(() => () => provider.awareness.setLocalStateField('pointer', null), [provider]);

  // Other people's pointers on the board.
  useEffect(() => {
    if (!api) return;
    let last = '';
    const update = () => {
      const collaborators = new Map<SocketId, Collaborator>();
      provider.awareness.getStates().forEach((raw, clientId) => {
        const state = raw as Partial<PresenceState>;
        if (clientId === doc.clientID || !state.user || state.tab !== 'design') return;
        const socketId = String(clientId) as SocketId;
        collaborators.set(socketId, {
          id: state.user.participantId,
          socketId,
          username: state.user.name,
          color: { background: state.user.color, stroke: state.user.color },
          pointer: state.pointer
            ? { x: state.pointer.x, y: state.pointer.y, tool: state.pointer.tool }
            : undefined,
          button: state.pointer?.button,
        });
      });
      const signature = JSON.stringify([...collaborators]);
      if (signature === last) return;
      last = signature;
      api.updateScene({ collaborators });
    };
    provider.awareness.on('change', update);
    update();
    return () => provider.awareness.off('change', update);
  }, [api, provider, doc]);

  return (
    <div className="flex h-full flex-col">
      {(interviewer || readOnly) && (
        <div className="flex items-center gap-2 border-b px-3 py-1.5 text-sm">
          {interviewer && (
            <TemplateMenu disabled={!api} onPick={(t) => api && insertTemplate(api, t)} />
          )}
          {readOnly && (
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <Lock className="size-3.5" /> The interviewer has locked the room; the board is
              read-only.
            </span>
          )}
        </div>
      )}
      <div className="relative min-h-0 flex-1">
        <Excalidraw
          excalidrawAPI={setApi}
          initialData={initialData}
          onChange={onSceneChange}
          onPointerUpdate={onPointerUpdate}
          isCollaborating
          viewModeEnabled={readOnly}
          theme={theme}
          name="Design"
          UIOptions={{
            canvasActions: {
              loadScene: false,
              saveToActiveFile: false,
              toggleTheme: false,
              export: false,
            },
            // Images are stored once in the room and fetched by everyone (see board-files.ts).
            tools: { image: true },
          }}
        >
          <MainMenu>
            <MainMenu.DefaultItems.SaveAsImage />
            <MainMenu.DefaultItems.ClearCanvas />
            <MainMenu.DefaultItems.Help />
            <MainMenu.DefaultItems.ChangeCanvasBackground />
          </MainMenu>
        </Excalidraw>
      </div>
    </div>
  );
}

function TemplateMenu({
  disabled,
  onPick,
}: {
  disabled: boolean;
  onPick: (template: BoardTemplate) => void;
}) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <Button size="sm" variant="outline" disabled={disabled}>
          <LayoutTemplate /> Insert template
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="start"
          sideOffset={4}
          className="z-50 min-w-56 rounded-md border bg-card p-1 text-card-foreground shadow-md"
        >
          {BOARD_TEMPLATES.map((t) => (
            <DropdownMenu.Item
              key={t.id}
              onSelect={() => onPick(t)}
              className="cursor-pointer rounded px-2 py-1.5 text-sm outline-none data-[highlighted]:bg-muted"
            >
              {t.label}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

/** Adds a template below whatever is already on the board and scrolls to it. */
function insertTemplate(api: ExcalidrawImperativeAPI, template: BoardTemplate) {
  const existing = api.getSceneElements();
  let dx = 0;
  let dy = 0;
  if (existing.length) {
    const [minX, , , maxY] = getCommonBounds(existing);
    dx = minX;
    dy = maxY + 120;
  }
  const skeleton = template
    .build()
    .map(
      (el) => ({ ...el, x: (el.x ?? 0) + dx, y: (el.y ?? 0) + dy }) as ExcalidrawElementSkeleton,
    );
  const created = convertToExcalidrawElements(skeleton, { regenerateIds: true });
  api.updateScene({
    elements: [...api.getSceneElementsIncludingDeleted(), ...created],
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  });
  api.scrollToContent(created, { fitToContent: true, animate: true });
}
