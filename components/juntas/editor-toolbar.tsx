'use client';

import type { useEditor } from '@tiptap/react';
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  Code as CodeIcon,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
  Minus,
  Table2,
  ImagePlus,
  Link as LinkIcon,
  Undo2,
  Redo2,
  RemoveFormatting,
} from 'lucide-react';

type EditorRef = ReturnType<typeof useEditor> | null;

// Header global (`components/app-shell/header.tsx`) es `sticky top-0 z-20` con
// `min-h-[76px]`. La toolbar se pega justo abajo; si el header cambia de alto,
// ajustar aquí.
const STICKY_TOP_PX = 76;

export function EditorToolbar({
  editor,
  onInsertImage,
}: {
  editor: EditorRef;
  onInsertImage?: () => void;
}) {
  if (!editor) return null;

  const btn = (
    active: boolean,
    onClick: () => void,
    title: string,
    icon: React.ReactNode,
    extra?: { disabled?: boolean }
  ) => (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={active}
      disabled={extra?.disabled}
      onClick={onClick}
      className={[
        'inline-flex h-7 w-7 items-center justify-center rounded-lg text-sm transition',
        extra?.disabled ? 'opacity-40 cursor-not-allowed' : '',
        active
          ? 'bg-[var(--accent)]/20 text-[var(--accent)]'
          : 'text-[var(--text)]/60 hover:bg-[var(--panel)] hover:text-[var(--text)]',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {icon}
    </button>
  );

  const sep = <div className="mx-1 h-5 w-px bg-[var(--border)]" />;

  const promptLink = () => {
    const prev = (editor.getAttributes('link').href as string | undefined) ?? '';
    const url = window.prompt('URL del enlace (vacío para quitar)', prev || 'https://');
    if (url === null) return;
    if (url.trim() === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url.trim() }).run();
  };

  const canUndo = editor.can().chain().focus().undo().run();
  const canRedo = editor.can().chain().focus().redo().run();

  return (
    <div
      style={{ top: `${STICKY_TOP_PX}px` }}
      className="sticky z-10 flex flex-wrap items-center gap-0.5 rounded-t-xl border border-[var(--border)] bg-[var(--card)]/95 p-1.5 backdrop-blur supports-[backdrop-filter]:bg-[var(--card)]/80"
    >
      {btn(
        false,
        () => editor.chain().focus().undo().run(),
        'Deshacer (⌘Z)',
        <Undo2 className="h-3.5 w-3.5" />,
        { disabled: !canUndo }
      )}
      {btn(
        false,
        () => editor.chain().focus().redo().run(),
        'Rehacer (⌘⇧Z)',
        <Redo2 className="h-3.5 w-3.5" />,
        { disabled: !canRedo }
      )}
      {sep}
      {btn(
        editor.isActive('bold'),
        () => editor.chain().focus().toggleBold().run(),
        'Negrita (⌘B)',
        <Bold className="h-3.5 w-3.5" />
      )}
      {btn(
        editor.isActive('italic'),
        () => editor.chain().focus().toggleItalic().run(),
        'Cursiva (⌘I)',
        <Italic className="h-3.5 w-3.5" />
      )}
      {btn(
        editor.isActive('underline'),
        () => editor.chain().focus().toggleUnderline().run(),
        'Subrayado (⌘U)',
        <UnderlineIcon className="h-3.5 w-3.5" />
      )}
      {btn(
        editor.isActive('strike'),
        () => editor.chain().focus().toggleStrike().run(),
        'Tachado',
        <Strikethrough className="h-3.5 w-3.5" />
      )}
      {btn(
        editor.isActive('code'),
        () => editor.chain().focus().toggleCode().run(),
        'Código en línea',
        <CodeIcon className="h-3.5 w-3.5" />
      )}
      {sep}
      {btn(
        editor.isActive('heading', { level: 2 }),
        () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
        'Título',
        <Heading2 className="h-3.5 w-3.5" />
      )}
      {btn(
        editor.isActive('heading', { level: 3 }),
        () => editor.chain().focus().toggleHeading({ level: 3 }).run(),
        'Subtítulo',
        <Heading3 className="h-3.5 w-3.5" />
      )}
      {sep}
      {btn(
        editor.isActive('bulletList'),
        () => editor.chain().focus().toggleBulletList().run(),
        'Lista con viñetas',
        <List className="h-3.5 w-3.5" />
      )}
      {btn(
        editor.isActive('orderedList'),
        () => editor.chain().focus().toggleOrderedList().run(),
        'Lista numerada',
        <ListOrdered className="h-3.5 w-3.5" />
      )}
      {btn(
        editor.isActive('blockquote'),
        () => editor.chain().focus().toggleBlockquote().run(),
        'Cita',
        <Quote className="h-3.5 w-3.5" />
      )}
      {sep}
      {btn(
        editor.isActive('link'),
        promptLink,
        'Insertar / editar enlace',
        <LinkIcon className="h-3.5 w-3.5" />
      )}
      {btn(
        false,
        () => editor.chain().focus().setHorizontalRule().run(),
        'Línea divisora',
        <Minus className="h-3.5 w-3.5" />
      )}
      {btn(
        false,
        () => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
        'Insertar tabla',
        <Table2 className="h-3.5 w-3.5" />
      )}
      {onInsertImage
        ? btn(false, onInsertImage, 'Insertar imagen', <ImagePlus className="h-3.5 w-3.5" />)
        : null}
      {sep}
      {btn(
        false,
        () => editor.chain().focus().unsetAllMarks().clearNodes().run(),
        'Quitar formato',
        <RemoveFormatting className="h-3.5 w-3.5" />
      )}
    </div>
  );
}

// CSS del contenido editable — compartido entre las 3 páginas de juntas para
// que los formatos se vean consistentes y con contraste (antes H2/H3 eran
// casi iguales al body y parecía que no hacían nada).
export const MINUTA_EDITOR_STYLES = `
  .ProseMirror { color: var(--text); }
  .ProseMirror p { margin: 0.4em 0; }
  .ProseMirror h2 {
    font-size: 1.4rem;
    font-weight: 700;
    margin: 1em 0 0.4em;
    line-height: 1.3;
    border-bottom: 1px solid var(--border);
    padding-bottom: 0.2em;
  }
  .ProseMirror h3 {
    font-size: 1.15rem;
    font-weight: 600;
    margin: 0.8em 0 0.35em;
    line-height: 1.3;
  }
  .ProseMirror ul, .ProseMirror ol { padding-left: 1.4em; margin: 0.4em 0; }
  .ProseMirror ul { list-style: disc; }
  .ProseMirror ol { list-style: decimal; }
  .ProseMirror li { margin: 0.2em 0; }
  .ProseMirror li > p { margin: 0; }
  .ProseMirror blockquote {
    border-left: 3px solid var(--accent);
    padding: 0.2em 0 0.2em 0.9em;
    margin: 0.6em 0;
    color: var(--text);
    opacity: 0.85;
    font-style: italic;
  }
  .ProseMirror code {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 0.25rem;
    padding: 0.05em 0.35em;
    font-size: 0.9em;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  }
  .ProseMirror pre {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 0.5rem;
    padding: 0.7em 0.9em;
    margin: 0.6em 0;
    overflow-x: auto;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 0.9em;
  }
  .ProseMirror pre code { background: transparent; border: 0; padding: 0; }
  .ProseMirror hr {
    border: 0;
    border-top: 1px solid var(--border);
    margin: 1em 0;
  }
  .ProseMirror a {
    color: var(--accent);
    text-decoration: underline;
    text-underline-offset: 2px;
  }
  .ProseMirror s { text-decoration: line-through; }
  .ProseMirror table { border-collapse: collapse; width: 100%; margin: 0.6em 0; }
  .ProseMirror td, .ProseMirror th { border: 1px solid var(--border); padding: 0.4em 0.6em; }
  .ProseMirror th { background: var(--card); font-weight: 600; }
  .ProseMirror img {
    max-width: 100%;
    border-radius: 0.75rem;
    margin: 0.5em 0;
  }
  .ProseMirror p.is-editor-empty:first-child::before {
    color: var(--text);
    opacity: 0.35;
    content: attr(data-placeholder);
    float: left;
    height: 0;
    pointer-events: none;
  }
`;
