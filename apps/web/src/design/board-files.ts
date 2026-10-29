import { BOARD_IMAGE_TYPES, LIMITS, type BoardFile } from '@sidebyside/shared';
import { ApiRequestError, api } from '@/lib/api';

type ImageData = Pick<BoardFile, 'dataURL' | 'mimeType'>;

const MAX_SIDE = 1600;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('This image could not be read'));
    img.src = src;
  });
}

/**
 * Makes an image fit the board's size limit: kept as is when it already fits in an accepted
 * format, otherwise redrawn (at most 1600 px a side) and re-encoded as JPEG, shrinking until it
 * fits. SVG is always redrawn, since the board only stores raster images.
 */
export async function fitImage(file: { dataURL: string; mimeType: string }): Promise<ImageData> {
  const accepted = (BOARD_IMAGE_TYPES as readonly string[]).includes(file.mimeType);
  if (accepted && file.dataURL.length <= LIMITS.boardImageChars) {
    return { dataURL: file.dataURL, mimeType: file.mimeType as BoardFile['mimeType'] };
  }
  const img = await loadImage(file.dataURL);
  let scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight, 1));
  for (let attempt = 0; attempt < 8; attempt++) {
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const ctx = canvas.getContext('2d')!;
    // JPEG has no transparency; a white backdrop matches the light board.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const dataURL = canvas.toDataURL('image/jpeg', attempt < 2 ? 0.85 : 0.7);
    if (dataURL.length <= LIMITS.boardImageChars) return { dataURL, mimeType: 'image/jpeg' };
    scale *= 0.75;
  }
  throw new Error('This image is too large for the board');
}

export async function uploadBoardFile(
  roomId: string,
  roomKey: string,
  file: { id: string; dataURL: string; mimeType: string; created: number },
): Promise<void> {
  const fitted = await fitImage(file);
  await api.send(`/rooms/${roomId}/board-files`, {
    method: 'POST',
    roomKey,
    body: { id: file.id, created: file.created, ...fitted } satisfies BoardFile,
  });
}

/**
 * Fetches an image by id. Someone else's image can show up on the board a moment before its
 * upload finishes, so a missing image is retried a few times.
 */
export async function fetchBoardFile(
  roomId: string,
  round: number,
  id: string,
  roomKey?: string,
): Promise<BoardFile | null> {
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      return await api.json<BoardFile>(`/rooms/${roomId}/board-files/${id}?round=${round}`, {
        roomKey,
      });
    } catch (err) {
      if (!(err instanceof ApiRequestError && err.status === 404)) throw err;
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
  return null;
}
