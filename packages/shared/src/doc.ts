import * as Y from 'yjs';
import { LANGUAGES, LANGUAGE_INFO, type Lang } from './languages';

/** Field names inside the room's shared Y.Doc. */
export const DOC_FIELDS = {
  meta: 'meta',
  code: 'code',
  stdin: 'stdin',
  notes: 'notes',
  hints: 'hints',
  board: 'board',
  // Private (interviewer-only) document
  rubric: 'rubric',
  timer: 'timer',
} as const;

/** The question currently shown to the candidate (no hidden data). */
export interface SharedProblem {
  questionId: string;
  title: string;
  difficulty: string;
  descriptionMd: string;
  hintCount: number;
}

export interface RevealedHint {
  index: number;
  text: string;
}

export function readProblem(doc: Y.Doc): SharedProblem | null {
  const value = getMeta(doc).get('problem');
  return value && typeof value === 'object' ? (value as SharedProblem) : null;
}

export function getHints(doc: Y.Doc): Y.Array<RevealedHint> {
  return doc.getArray<RevealedHint>(DOC_FIELDS.hints);
}

/** Excalidraw elements by id, each stored as a plain JSON object. */
export function getBoard(doc: Y.Doc): Y.Map<Record<string, unknown>> {
  return doc.getMap<Record<string, unknown>>(DOC_FIELDS.board);
}

export interface RubricEntry {
  score: number | null;
  comment: string;
}

export function getRubric(doc: Y.Doc): Y.Map<RubricEntry> {
  return doc.getMap<RubricEntry>(DOC_FIELDS.rubric);
}

/** Interviewer timer: running since startedAt (ms), plus time accumulated before that. */
export interface TimerState {
  running: boolean;
  startedAt: number | null;
  accumulatedMs: number;
}

export function getTimer(doc: Y.Doc): Y.Map<unknown> {
  return doc.getMap(DOC_FIELDS.timer);
}

export function readTimer(doc: Y.Doc): TimerState {
  const t = getTimer(doc);
  return {
    running: t.get('running') === true,
    startedAt: typeof t.get('startedAt') === 'number' ? (t.get('startedAt') as number) : null,
    accumulatedMs:
      typeof t.get('accumulatedMs') === 'number' ? (t.get('accumulatedMs') as number) : 0,
  };
}

export function getMeta(doc: Y.Doc): Y.Map<unknown> {
  return doc.getMap(DOC_FIELDS.meta);
}

export function getCodeMap(doc: Y.Doc): Y.Map<Y.Text> {
  return doc.getMap<Y.Text>(DOC_FIELDS.code);
}

export function getStdin(doc: Y.Doc): Y.Text {
  return doc.getText(DOC_FIELDS.stdin);
}

export function getNotes(doc: Y.Doc): Y.XmlFragment {
  return doc.getXmlFragment(DOC_FIELDS.notes);
}

export function readActiveLanguage(doc: Y.Doc, fallback: Lang = 'python'): Lang {
  const value = getMeta(doc).get('activeLanguage');
  return typeof value === 'string' && (LANGUAGES as readonly string[]).includes(value)
    ? (value as Lang)
    : fallback;
}

/**
 * Creates every per-language buffer up front, on the server, so two clients never race to
 * create the same Y.Text (concurrent map sets would drop one side's edits).
 * Returns true when it changed the document.
 */
export function initializeSharedDoc(doc: Y.Doc, defaultLanguage: Lang): boolean {
  const meta = getMeta(doc);
  const code = getCodeMap(doc);
  let changed = false;
  doc.transact(() => {
    if (!meta.has('activeLanguage')) {
      meta.set('activeLanguage', defaultLanguage);
      meta.set('editorLocked', false);
      changed = true;
    }
    for (const lang of LANGUAGES) {
      if (!code.has(lang)) {
        code.set(lang, new Y.Text(LANGUAGE_INFO[lang].starter));
        changed = true;
      }
    }
  });
  return changed;
}

/**
 * Shows a question in the room: sets the problem panel, clears revealed hints and loads the
 * question's starter code into every buffer the candidate hasn't started on (empty, or still
 * the default or a previously loaded starter).
 */
export function showQuestionInDoc(
  doc: Y.Doc,
  problem: SharedProblem,
  starterCode: Partial<Record<Lang, string>>,
): void {
  const meta = getMeta(doc);
  const code = getCodeMap(doc);
  const loaded = (meta.get('loadedStarters') ?? {}) as Partial<Record<Lang, string>>;
  doc.transact(() => {
    meta.set('activeQuestionId', problem.questionId);
    meta.set('problem', problem);
    const hints = getHints(doc);
    if (hints.length) hints.delete(0, hints.length);
    const nextLoaded: Partial<Record<Lang, string>> = {};
    for (const lang of LANGUAGES) {
      const starter = starterCode[lang];
      const text = code.get(lang);
      if (!starter || !text) continue;
      const current = text.toString();
      const untouched =
        current.trim() === '' ||
        current === LANGUAGE_INFO[lang].starter ||
        current === loaded[lang];
      if (untouched) {
        text.delete(0, text.length);
        text.insert(0, starter);
        nextLoaded[lang] = starter;
      }
    }
    meta.set('loadedStarters', { ...loaded, ...nextLoaded });
  });
}
