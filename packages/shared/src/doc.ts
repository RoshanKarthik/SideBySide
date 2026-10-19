import * as Y from 'yjs';
import { LANGUAGES, LANGUAGE_INFO, type Lang } from './languages';

/** Field names inside the room's shared Y.Doc. */
export const DOC_FIELDS = {
  meta: 'meta',
  code: 'code',
  stdin: 'stdin',
  notes: 'notes',
} as const;

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
