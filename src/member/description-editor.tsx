'use client';

import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { FiBold, FiItalic, FiUnderline, FiList, FiRotateCcw, FiRotateCw } from 'react-icons/fi';
import styles from './member.module.css';
import { PageLoader } from '../components/page-state';

export function DescriptionEditor({ onChange, content = '', readOnly = false }: { onChange?: (text: string, html: string) => void; content?: string; readOnly?: boolean }) {
  const editor = useEditor({
    extensions: [StarterKit.configure({ link: false })],
    content, editable: !readOnly, immediatelyRender: false,
    editorProps: { attributes: { role: 'textbox', 'aria-label': 'Description', 'aria-multiline': 'true', 'data-placeholder': 'Describe your ad, availability and how to get in touch…' } },
    onUpdate: ({ editor }) => onChange?.(editor.getText(), editor.getHTML()),
  });
  if (!editor) return <PageLoader label="Preparing description" />;
  if (readOnly) return <div className={styles.richDescription}><EditorContent editor={editor} /></div>;
  return <div className={styles.editor}>
    <div className={styles.editorToolbar} role="toolbar" aria-label="Description formatting">
      <button type="button" title="Bold" aria-label="Bold" onClick={() => editor?.chain().focus().toggleBold().run()}><FiBold /></button>
      <button type="button" title="Italic" aria-label="Italic" onClick={() => editor?.chain().focus().toggleItalic().run()}><FiItalic /></button>
      <button type="button" title="Underline" aria-label="Underline" onClick={() => editor?.chain().focus().toggleUnderline().run()}><FiUnderline /></button>
      <button type="button" aria-label="Bulleted list" onClick={() => editor?.chain().focus().toggleBulletList().run()}><FiList /> List</button>
      <button type="button" aria-label="Numbered list" onClick={() => editor?.chain().focus().toggleOrderedList().run()}>1. List</button>
      <button type="button" aria-label="Undo" onClick={() => editor?.chain().focus().undo().run()}><FiRotateCcw /></button>
      <button type="button" aria-label="Redo" onClick={() => editor?.chain().focus().redo().run()}><FiRotateCw /></button>
    </div>
    <EditorContent editor={editor} />
    <div className={styles.editorCount}>{editor?.getText().length ?? 0} / 2950 characters</div>
  </div>;
}
