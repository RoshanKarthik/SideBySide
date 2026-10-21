import { DOC_FIELDS } from '@sidebyside/shared/doc';
import Collaboration from '@tiptap/extension-collaboration';
import CollaborationCaret from '@tiptap/extension-collaboration-caret';
import { TaskItem, TaskList } from '@tiptap/extension-list';
import { Placeholder } from '@tiptap/extensions';
import { EditorContent, useEditor, useEditorState, type Editor } from '@tiptap/react';
import { useEffect, useRef } from 'react';
import StarterKit from '@tiptap/starter-kit';
import {
  Bold,
  Code,
  Heading1,
  Heading2,
  Italic,
  List,
  ListChecks,
  ListOrdered,
  SquareCode,
} from 'lucide-react';
import type { PresenceState } from '@sidebyside/shared';
import type YProvider from 'y-partyserver/provider';
import type * as Y from 'yjs';
import { cn } from '@/lib/utils';

interface Props {
  doc: Y.Doc;
  provider: YProvider;
  /** Full presence user; the caret extension writes it to the awareness 'user' field. */
  user: PresenceState['user'];
  editable: boolean;
  /** Called with the plain text of each paste (for the room's activity signals). */
  onPaste?: (text: string) => void;
}

/** The Discuss tab: rich-text notes shared by everyone in the room. */
export function NotesEditor({ doc, provider, user, editable, onPaste }: Props) {
  const onPasteRef = useRef(onPaste);
  useEffect(() => {
    onPasteRef.current = onPaste;
  }, [onPaste]);
  const editor = useEditor(
    {
      editable,
      extensions: [
        // Collaboration brings its own undo history.
        StarterKit.configure({ undoRedo: false }),
        TaskList,
        TaskItem.configure({ nested: true }),
        Placeholder.configure({
          placeholder: 'Take notes together: problem statement, ideas, edge cases…',
        }),
        Collaboration.configure({ document: doc, field: DOC_FIELDS.notes }),
        CollaborationCaret.configure({ provider, user }),
      ],
      editorProps: {
        attributes: { 'aria-label': 'Shared notes' },
        handlePaste: (_view, event) => {
          onPasteRef.current?.(event.clipboardData?.getData('text/plain') ?? '');
          return false; // Let the editor paste as usual.
        },
      },
    },
    [doc, provider],
  );

  useEffect(() => {
    editor?.setEditable(editable);
  }, [editor, editable]);

  return (
    <div className="flex h-full flex-col">
      {editable && editor && <Toolbar editor={editor} />}
      <div className="notes-editor min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto h-full max-w-3xl">
          <EditorContent editor={editor} className="h-full" />
        </div>
      </div>
    </div>
  );
}

function Toolbar({ editor }: { editor: Editor }) {
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      h1: e.isActive('heading', { level: 1 }),
      h2: e.isActive('heading', { level: 2 }),
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      code: e.isActive('code'),
      bullet: e.isActive('bulletList'),
      ordered: e.isActive('orderedList'),
      task: e.isActive('taskList'),
      codeBlock: e.isActive('codeBlock'),
    }),
  });
  const chain = () => editor.chain().focus();
  const items = [
    {
      label: 'Heading 1',
      icon: Heading1,
      active: state.h1,
      run: () => chain().toggleHeading({ level: 1 }).run(),
    },
    {
      label: 'Heading 2',
      icon: Heading2,
      active: state.h2,
      run: () => chain().toggleHeading({ level: 2 }).run(),
    },
    { label: 'Bold', icon: Bold, active: state.bold, run: () => chain().toggleBold().run() },
    {
      label: 'Italic',
      icon: Italic,
      active: state.italic,
      run: () => chain().toggleItalic().run(),
    },
    { label: 'Inline code', icon: Code, active: state.code, run: () => chain().toggleCode().run() },
    {
      label: 'Bullet list',
      icon: List,
      active: state.bullet,
      run: () => chain().toggleBulletList().run(),
    },
    {
      label: 'Numbered list',
      icon: ListOrdered,
      active: state.ordered,
      run: () => chain().toggleOrderedList().run(),
    },
    {
      label: 'Checklist',
      icon: ListChecks,
      active: state.task,
      run: () => chain().toggleTaskList().run(),
    },
    {
      label: 'Code block',
      icon: SquareCode,
      active: state.codeBlock,
      run: () => chain().toggleCodeBlock().run(),
    },
  ];
  return (
    <div
      role="toolbar"
      aria-label="Formatting"
      className="flex flex-wrap gap-0.5 border-b px-3 py-1.5"
    >
      {items.map(({ label, icon: Icon, active, run }) => (
        <button
          key={label}
          type="button"
          title={label}
          aria-label={label}
          aria-pressed={active}
          onClick={run}
          className={cn(
            'rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground',
            active && 'bg-accent text-accent-foreground',
          )}
        >
          <Icon className="size-4" />
        </button>
      ))}
    </div>
  );
}
