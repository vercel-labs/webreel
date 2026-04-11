"use client";

import { useEffect, useRef, useCallback } from "react";
import { useAtom, useAtomValue } from "jotai/react";
import { configJsonAtom, parsedConfigAtom } from "@/store/config";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap, lineNumbers } from "@codemirror/view";
import { json } from "@codemirror/lang-json";
import { oneDark } from "@codemirror/theme-one-dark";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import {
  bracketMatching,
  foldGutter,
  indentOnInput,
  syntaxHighlighting,
  defaultHighlightStyle,
} from "@codemirror/language";
import {
  closeBrackets,
  closeBracketsKeymap,
  autocompletion,
} from "@codemirror/autocomplete";

const editorTheme = EditorView.theme({
  "&": {
    height: "100%",
    fontSize: "12px",
  },
  ".cm-scroller": {
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, monospace",
    overflow: "auto",
  },
  ".cm-gutters": {
    backgroundColor: "transparent",
    borderRight: "1px solid oklch(1 0 0 / 10%)",
  },
  ".cm-activeLineGutter": {
    backgroundColor: "transparent",
  },
});

export function JsonEditor() {
  const [configJson, setConfigJson] = useAtom(configJsonAtom);
  const { error } = useAtomValue(parsedConfigAtom);
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const isInternalUpdate = useRef(false);

  const onUpdate = useCallback(
    (value: string) => {
      isInternalUpdate.current = true;
      setConfigJson(value);
    },
    [setConfigJson],
  );

  useEffect(() => {
    if (!editorRef.current) return;

    const state = EditorState.create({
      doc: configJson,
      extensions: [
        lineNumbers(),
        history(),
        foldGutter(),
        indentOnInput(),
        bracketMatching(),
        closeBrackets(),
        autocompletion(),
        json(),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        oneDark,
        editorTheme,
        keymap.of([...defaultKeymap, ...historyKeymap, ...closeBracketsKeymap]),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            onUpdate(update.state.doc.toString());
          }
        }),
        EditorView.lineWrapping,
      ],
    });

    const view = new EditorView({
      state,
      parent: editorRef.current,
    });

    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (isInternalUpdate.current) {
      isInternalUpdate.current = false;
      return;
    }
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current !== configJson) {
      view.dispatch({
        changes: { from: 0, to: current.length, insert: configJson },
      });
    }
  }, [configJson]);

  return (
    <div className="flex h-full flex-col">
      {error && (
        <div className="shrink-0 border-b px-3 py-1">
          <span className="text-xs text-destructive">Parse error</span>
        </div>
      )}
      <div ref={editorRef} className="min-h-0 flex-1 overflow-hidden" />
    </div>
  );
}
