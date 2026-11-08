"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { ChevronDown, ChevronRight, X } from "lucide-react";
import AiExplanationText from "./AiExplanationText";

export type DictionaryEntry = {
  word: string; headword: string; phonetic: string;
  definitions: { partOfSpeech: string; definition: string }[];
  example: string;
};
export type DictionarySearch = {
  id: string; subject: string; lineId: number; order: number;
  leftContext?: string; rightContext?: string;
  entry: DictionaryEntry | null; error: string; isLoading: boolean;
};
type AiChat = {
  id: string; subject: string; lineId: number; order: number;
  messages: { role: "user" | "model"; text: string }[];
  error: string; isLoading: boolean;
};

function AiBody({ chat, onRetry, onAsk }: {
  chat: AiChat; onRetry: (chat: AiChat) => void;
  onAsk: (id: string, question: string) => Promise<void>;
}) {
  const [question, setQuestion] = useState("");
  const [showQuestion, setShowQuestion] = useState(false);
  const submit = () => {
    if (!question.trim() || chat.isLoading) return;
    void onAsk(chat.id, question.trim());
    setQuestion("");
  };
  return <>
    {chat.messages.map((message, index) => <div key={`${message.role}-${index}`}
      className={message.role === "user" ? "ml-4 whitespace-pre-wrap border-l-2 border-gray-200 px-2 py-1 text-sm text-gray-600" : "select-text px-2 py-1 text-sm leading-relaxed text-gray-800"}
      data-selection-ai-line={message.role === "model" ? chat.lineId : undefined}>
      {message.role === "model" ? <AiExplanationText text={message.text} /> : message.text}
    </div>)}
    {chat.isLoading && <p role="status" className="px-2 py-1 text-xs text-gray-500">解説中…</p>}
    {chat.error && <div className="flex items-center gap-2 px-2 py-1 text-sm text-red-700"><span className="flex-1">{chat.error}</span><button type="button" disabled={chat.isLoading} onClick={() => onRetry(chat)} className="shrink-0 rounded border px-2 py-1 text-xs">再試行</button></div>}
    {chat.messages.length > 0 && <div className="px-2 pb-1">
      {showQuestion ? <form className="flex gap-1" onSubmit={event => { event.preventDefault(); submit(); }}>
        <input aria-label={`${chat.subject}への追加質問`} autoFocus value={question} onChange={event => setQuestion(event.target.value)} placeholder="さらに質問する" className="min-w-0 flex-1 rounded border border-gray-300 px-2 py-1 text-sm" />
        <button type="submit" disabled={!question.trim() || chat.isLoading} className="rounded border border-purple-200 px-2 py-1 text-xs text-purple-700 disabled:opacity-40">質問</button>
      </form> : <button type="button" onClick={() => setShowQuestion(true)} className="rounded px-1 py-1 text-xs text-purple-700 hover:bg-purple-50">さらに質問</button>}
    </div>}
  </>;
}

function DictionaryBody({ search, onRetry }: { search: DictionarySearch; onRetry: (search: DictionarySearch) => void }) {
  const entry = search.entry;
  return <div data-selection-dictionary-line={search.lineId} className="select-text px-2 py-1 text-sm text-gray-800">
    {search.isLoading && <p role="status" className="text-xs text-gray-500">辞書を検索中…</p>}
    {search.error && <div className="flex items-center gap-2 text-red-700"><span className="flex-1">{search.error}</span><button type="button" onClick={() => onRetry(search)} className="shrink-0 rounded border px-2 py-1 text-xs">再試行</button></div>}
    {entry && <>
      <div className="flex flex-wrap items-baseline gap-x-2"><strong className="text-emerald-800">{entry.headword}</strong>{entry.word !== entry.headword && <span className="text-xs text-gray-500">{entry.word}</span>}{entry.phonetic && <span className="text-gray-500">/{entry.phonetic.replace(/^\/+|\/+$/g, "")}/</span>}</div>
      <ol className="list-decimal pl-5">{entry.definitions.map((definition, index) => <li key={`${definition.partOfSpeech}-${index}`} className="py-0.5"><span className="mr-1 text-xs italic text-emerald-700">{definition.partOfSpeech}</span>{definition.definition}</li>)}</ol>
      {entry.example && <p className="border-t border-gray-100 py-1 text-gray-600"><span className="mr-1 text-xs text-emerald-700">Example</span>{entry.example}</p>}
      <p className="text-right text-[10px] text-gray-400">Definitions: Datamuse · IPA: Free Dictionary API</p>
    </>}
  </div>;
}

export default function ReaderSearchResults({ dictionaries, chats, expandedId, onExpand, onCloseDictionary, onCloseChat, onRetryDictionary, onRetryChat, onAsk }: {
  dictionaries: DictionarySearch[]; chats: AiChat[]; expandedId: string | null;
  onExpand: (id: string | null) => void; onCloseDictionary: (id: string) => void; onCloseChat: (id: string) => void;
  onRetryDictionary: (search: DictionarySearch) => void; onRetryChat: (chat: AiChat) => void;
  onAsk: (id: string, question: string) => Promise<void>;
}) {
  const root = useRef<HTMLDivElement>(null);
  const results = [
    ...dictionaries.map(search => ({ kind: "dictionary" as const, item: search })),
    ...chats.map(chat => ({ kind: "ai" as const, item: chat })),
  ].sort((first, second) => first.item.order - second.item.order);
  useLayoutEffect(() => {
    const header = root.current?.querySelector<HTMLElement>(`[data-search-header="${expandedId}"]`);
    const viewport = document.getElementById("reader-selection-panel");
    if (!header || !viewport) return;
    const bounds = header.getBoundingClientRect(), visible = viewport.getBoundingClientRect();
    if (bounds.bottom > visible.bottom) viewport.scrollTop += bounds.bottom - visible.bottom;
    else if (bounds.top < visible.top) viewport.scrollTop += bounds.top - visible.top;
    // Only a new search scrolls its header into view; selecting text does not.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [results.length]);
  return <div ref={root} className="divide-y divide-gray-200">{results.map(result => {
    const { item, kind } = result, expanded = item.id === expandedId;
    return <section key={item.id} data-search-result={item.id} className="overflow-hidden bg-white">
      <div className="flex items-center" data-search-header={item.id}>
        <button type="button" aria-expanded={expanded} aria-controls={`result-${item.id}`} onClick={() => onExpand(expanded ? null : item.id)}
          className={`flex min-w-0 flex-1 items-center gap-1.5 px-2 py-1.5 text-left text-sm ${expanded ? "bg-gray-50" : "hover:bg-gray-50"}`}>
          {expanded ? <ChevronDown size={13} className="shrink-0 text-gray-500" /> : <ChevronRight size={13} className="shrink-0 text-gray-500" />}
          <span className={`shrink-0 text-[10px] ${kind === "dictionary" ? "text-emerald-700" : "text-purple-700"}`}>{kind === "dictionary" ? "英英" : "AI"}</span>
          <span className="min-w-0 flex-1 truncate font-medium text-gray-800">{item.subject}</span>
          {item.isLoading && <span className="shrink-0 text-[10px] text-gray-500">検索中…</span>}
          {item.error && <span className="shrink-0 text-[10px] text-red-600">再試行</span>}
        </button>
        <button type="button" aria-label={kind === "dictionary" ? "英英辞書を閉じる" : `${item.subject}のAI解説を閉じる`} title={`${item.subject}の結果を閉じる`}
          onClick={() => kind === "dictionary" ? onCloseDictionary(item.id) : onCloseChat(item.id)} className="shrink-0 rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"><X size={14} /></button>
      </div>
      <div id={`result-${item.id}`} hidden={!expanded} className={expanded ? "border-t border-gray-100" : "hidden"}>
        {kind === "dictionary" ? <DictionaryBody search={item} onRetry={onRetryDictionary} /> : <AiBody chat={item} onRetry={onRetryChat} onAsk={onAsk} />}
      </div>
    </section>;
  })}</div>;
}
