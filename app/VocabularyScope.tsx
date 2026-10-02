"use client";
import { useState } from "react";
import { BookOpen, ChevronRight, Folder } from "lucide-react";

export type ScopeItem = { type: "folder" | "unit"; id: string };
export default function VocabularyScope({ folders, units, folderId, selection, onNavigate, onSelect }: {
  folders: { id: string; name: string; parent_id?: string | null }[];
  units: { id: string; title: string; folder_id?: string | null }[];
  folderId: string | null; selection: ScopeItem[];
  onNavigate: (id: string | null) => void; onSelect: (items: ScopeItem[], parent?: string | null) => void;
}) {
  const [menu, setMenu] = useState<string | null | undefined>(undefined);
  const path: { id: string | null; name: string }[] = [];
  const visited = new Set<string>();
  let id = folderId;
  while (id && !visited.has(id)) {
    visited.add(id);
    const folder = folders.find((f) => f.id === id);
    if (!folder) break;
    path.unshift({ id: folder.id, name: folder.name }); id = folder.parent_id ?? null;
  }
  path.unshift({ id: null, name: "すべて" });
  const candidates = (parent: string | null) => [
    ...folders.filter((f) => (f.parent_id ?? null) === parent).map((f) => ({ type: "folder" as const, id: f.id, name: f.name })),
    ...units.filter((u) => (u.folder_id ?? null) === parent).map((u) => ({ type: "unit" as const, id: u.id, name: u.title })),
  ].sort((a,b) => a.type === b.type ? a.name.localeCompare(b.name, "ja", { numeric: true }) : a.type === "folder" ? -1 : 1);
  return <div className="relative mb-2 border-y border-gray-200 bg-white text-sm">
    <div className="flex flex-wrap items-center gap-0.5 px-2 py-1">
      {path.map((part, i) => <div key={part.id ?? "root"} className="flex items-center">
        {i > 0 && <ChevronRight size={14} className="text-gray-400" />}
        <button aria-label={`${part.name}内の候補を表示`} aria-expanded={menu === part.id} className="rounded px-2 py-1 hover:bg-gray-100" onClick={() => {
          if (menu === part.id) { setMenu(undefined); return; }
          if (part.id !== folderId) onNavigate(part.id);
          setMenu(part.id);
        }}>{part.name}</button>
      </div>)}
      {selection.length > 0 && <><span className="ml-2 text-xs text-blue-700">{selection.filter((s) => s.type === "folder").length}フォルダ・{selection.filter((s) => s.type === "unit").length}ユニット選択</span><button className="px-2 text-xs text-gray-500" onClick={() => onSelect([])}>解除</button></>}
    </div>
    {menu !== undefined && <div className="max-h-64 overflow-y-auto border-t border-gray-100 p-1" aria-label="絞り込み候補">
      {candidates(menu).length === 0 && <p className="p-2 text-xs text-gray-500">この階層には項目がありません。</p>}
      {candidates(menu).map((item) => <div key={`${item.type}:${item.id}`} className="flex items-center gap-2 rounded px-2 py-1 hover:bg-gray-50">
        <input type="checkbox" aria-label={`${item.name}を絞り込み対象にする`} checked={menu === folderId && selection.some((s) => s.type === item.type && s.id === item.id)} onChange={(e) => {
          const base = menu === folderId ? selection : [];
          const next = e.target.checked ? [...base, { type: item.type, id: item.id }] : base.filter((s) => s.type !== item.type || s.id !== item.id);
          onSelect(next, menu);
        }} />
        {item.type === "folder" ? <Folder size={15} className="text-amber-600" /> : <BookOpen size={15} className="text-blue-600" />}
        {item.type === "folder" ? <button className="min-w-0 flex-1 truncate text-left" onClick={() => { onNavigate(item.id); setMenu(item.id); }}>{item.name}</button> : <span className="min-w-0 flex-1 truncate">{item.name}</span>}
        {item.type === "folder" && <ChevronRight size={14} />}
      </div>)}
    </div>}
  </div>;
}
