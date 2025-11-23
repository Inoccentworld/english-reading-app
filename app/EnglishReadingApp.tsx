'use client';

import React, { useState, useEffect } from 'react';
import {
  BookOpen, Plus, List, X, Eye, EyeOff, Folder,
  FolderPlus, Save
} from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';

// === 型定義 ==============================
type FolderType = {
  id: string;
  name: string;
  created_at?: string;
};

type UnitType = {
  id: string;
  title: string;
  folder_id: string | null;
  lines: {
    id: number;
    english: string;
    japanese: string;
    phonetic: string;
    showJapanese?: boolean;
    showPhonetic?: boolean;
  }[];
  created_at?: string;
};

type VocabularyType = {
  id: string;
  word: string;
  meaning: string;
  unit_id: string;
  unit_title?: string;
  created_at?: string;
};

// === メインコンポーネント ==============================
export default function EnglishReadingApp() {
  const [folders, setFolders] = useState<FolderType[]>([]);
  const [units, setUnits] = useState<UnitType[]>([]);
  const [vocabulary, setVocabulary] = useState<VocabularyType[]>([]);
  const [currentView, setCurrentView] =
    useState<'list' | 'add' | 'edit' | 'reader' | 'vocabulary'>('list');
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [newFolderName, setNewFolderName] = useState('');
  const [showFolderInput, setShowFolderInput] = useState(false);

  // === ユニット追加用 ===
  const [newUnitTitle, setNewUnitTitle] = useState('');
  const [newUnitEnglish, setNewUnitEnglish] = useState('');
  const [newUnitJapanese, setNewUnitJapanese] = useState('');
  const [newUnitPhonetic, setNewUnitPhonetic] = useState('');
  const [newUnitFolder, setNewUnitFolder] = useState('');

  // === フラッシュカード関連 ===
  const [flashcardMode, setFlashcardMode] = useState(false);
  const [currentCardIndex, setCurrentCardIndex] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [flashcardShowWord, setFlashcardShowWord] = useState(true);
  // 単語追加用
const [selectedText, setSelectedText] = useState('');
const [selectedMeaning, setSelectedMeaning] = useState('');
const [isSelectingMeaning, setIsSelectingMeaning] = useState(false);
const [showToast, setShowToast] = useState(false);

    // 編集用 state
  const [editingUnit, setEditingUnit] = useState<UnitType | null>(null);
  const [editUnitTitle, setEditUnitTitle] = useState('');
  const [editUnitEnglish, setEditUnitEnglish] = useState('');
  const [editUnitJapanese, setEditUnitJapanese] = useState('');
  const [editUnitPhonetic, setEditUnitPhonetic] = useState('');
  const [editUnitFolder, setEditUnitFolder] = useState('');


  // === 初期ロード ===
  useEffect(() => {
    loadAll();
  }, []);

  const loadAll = async () => {
    const { data: folderData } = await supabase.from('folders').select('*');
    const { data: unitData } = await supabase.from('units').select('*');
    const { data: vocabData } = await supabase.from('vocabulary').select('*');
    if (folderData) setFolders(folderData);
    if (unitData) setUnits(unitData);
    if (vocabData) setVocabulary(vocabData);
  };

  // === フォルダー操作 ===
  const addFolder = async () => {
    if (!newFolderName.trim()) return;
    const { data, error } = await supabase.from('folders').insert([
      { name: newFolderName }
    ]).select();
    if (!error && data) {
      setFolders([...folders, ...data]);
      setNewFolderName('');
      setShowFolderInput(false);
    }
  };

  const deleteFolder = async (id: string) => {
    await supabase.from('folders').delete().eq('id', id);
    setFolders(folders.filter(f => f.id !== id));
    setUnits(units.map(u => (u.folder_id === id ? { ...u, folder_id: null } : u)));
  };

  // === ユニット操作 ===
  const parseMultilineInput = (
    englishText: string,
    japaneseText: string,
    phoneticText: string
  ) => {
    const e = englishText.split('\n').map(l => l.trim()).filter(Boolean);
    const j = japaneseText.split('\n').map(l => l.trim());
    const p = phoneticText.split('\n').map(l => l.trim());
    return e.map((eng, i) => ({
      id: i,
      english: eng,
      japanese: j[i] || '',
      phonetic: p[i] || ''
    }));
  };

  const addUnit = async () => {
    const parsed = parseMultilineInput(newUnitEnglish, newUnitJapanese, newUnitPhonetic);
    if (parsed.length === 0) {
      alert('英文を1行以上入力してください');
      return;
    }
    const newUnit = {
      title: newUnitTitle || '無題',
      folder_id: newUnitFolder || null,
      lines: parsed
    };
    const { data, error } = await supabase.from('units').insert([newUnit]).select();
    if (!error && data) {
      setUnits([...units, data[0]]);
      setNewUnitTitle('');
      setNewUnitEnglish('');
      setNewUnitJapanese('');
      setNewUnitPhonetic('');
      setNewUnitFolder('');
      setCurrentView('list');
    }
  };
  const handleTextSelection = () => {
  const selection = window.getSelection();
  const text = selection?.toString().trim();
  if (text) {
    if (isSelectingMeaning) {
      setSelectedMeaning(text);
    } else {
      setSelectedText(text);
    }
  }
};


  const getFilteredUnits = () =>
    selectedFolder ? units.filter(u => u.folder_id === selectedFolder) : units;
  const startEditUnit = (unit: UnitType) => {
    setEditingUnit(unit);
    setEditUnitTitle(unit.title);
    setEditUnitFolder(unit.folder_id || '');
    setEditUnitEnglish(unit.lines.map((l) => l.english).join('\n'));
    setEditUnitJapanese(unit.lines.map((l) => l.japanese).join('\n'));
    setEditUnitPhonetic(unit.lines.map((l) => l.phonetic).join('\n'));
    setCurrentView('edit');
  };

  const saveEditUnit = async () => {
    if (!editingUnit) return;
    const parsed = parseMultilineInput(editUnitEnglish, editUnitJapanese, editUnitPhonetic);
    const updatedUnit = {
      ...editingUnit,
      title: editUnitTitle.trim() || '無題',
      folder_id: editUnitFolder || null,
      lines: parsed,
    };
    await supabase.from('units').update(updatedUnit).eq('id', editingUnit.id);
    setUnits(units.map((u) => (u.id === editingUnit.id ? updatedUnit : u)));
    setCurrentView('list');
    setEditingUnit(null);
  };

  // === ここからUI部分 ===
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold text-gray-800 flex items-center gap-3">
            <BookOpen size={36} className="text-blue-600" />
            英語長文学習アプリ
          </h1>

          <nav className="flex gap-2">
            <button
              onClick={() => setCurrentView('list')}
              className={`px-4 py-2 rounded-lg ${
                currentView === 'list'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-700 hover:bg-gray-50'
              }`}
            >
              ユニット一覧
            </button>
            <button
              onClick={() => setCurrentView('vocabulary')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg ${
                currentView === 'vocabulary'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-700 hover:bg-gray-50'
              }`}
            >
              <List size={20} />
              単語帳
            </button>
          </nav>
        </div>
        

        {/* === ユニット一覧 === */}
        {currentView === 'list' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-bold text-gray-800">学習ユニット一覧</h2>
              <button
                onClick={() => setCurrentView('add')}
                className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
              >
                <Plus size={20} />
                新規ユニット追加
              </button>
            </div>
            <div className="bg-white p-4 rounded-lg shadow-md">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-gray-700 flex items-center gap-2">
                  <Folder size={20} />
                  フォルダー
                </h3>
                <button
                  onClick={() => setShowFolderInput(!showFolderInput)}
                  className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800"
                >
                  <FolderPlus size={16} />
                  新規フォルダー
                </button>
              </div>

              {showFolderInput && (
                <div className="flex gap-2 mb-4">
                  <input
                    type="text"
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                    placeholder="フォルダー名"
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                  <button
                    onClick={addFolder}
                    className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 text-sm"
                  >
                    追加
                  </button>
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setSelectedFolder(null)}
                  className={`px-3 py-1 rounded-lg text-sm ${
                    selectedFolder === null
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                >
                  すべて ({units.length})
                </button>
                {folders.map((folder) => (
                  <div key={folder.id} className="flex items-center gap-1">
                    <button
                      onClick={() => setSelectedFolder(folder.id)}
                      className={`px-3 py-1 rounded-lg text-sm ${
                        selectedFolder === folder.id
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                      }`}
                    >
                      {folder.name} (
                      {units.filter((u) => u.folder_id === folder.id).length})
                    </button>
                    <button
                      onClick={() => deleteFolder(folder.id)}
                      className="text-red-600 hover:text-red-800"
                    >
                      <X size={16} />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {getFilteredUnits().length === 0 ? (
              <div className="text-center py-12 text-gray-500 bg-white rounded-lg shadow-md">
                <BookOpen size={48} className="mx-auto mb-4 opacity-50" />
                <p>ユニットがありません。新規追加してください。</p>
              </div>
            ) : (
              <div className="grid gap-4">
                {getFilteredUnits().map((unit) => (
                  <div
                    key={unit.id}
                    className="bg-white p-6 rounded-lg shadow-md border border-gray-200"
                  >
                    <div className="flex justify-between items-start gap-4">
                      <div className="flex-1">
                        <h3 className="text-xl font-semibold text-gray-800 mb-2">
                          {unit.title}
                        </h3>
                        <p className="text-sm text-gray-600">
                          {unit.lines.length} 行
                        </p>
                        {unit.folder_id && (
                          <span className="inline-block mt-2 text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                            {
                              folders.find((f) => f.id === unit.folder_id)
                                ?.name
                            }
                          </span>
                        )}
                      </div>
                        <div className="flex gap-2">
                        <button
                            onClick={() => startEditUnit(unit)}
                            className="bg-yellow-500 text-white px-4 py-2 rounded-lg hover:bg-yellow-600 font-medium"
                        >
                            編集
                        </button>

                        <button
                            onClick={() => setCurrentView('reader')}
                            className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 font-medium"
                        >
                            学習
                        </button>
                    </div>

                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* === ユニット追加 === */}
        {currentView === 'add' && (
          <div className="max-w-4xl mx-auto">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-gray-800">新規ユニット追加</h2>
              <button
                onClick={() => setCurrentView('list')}
                className="text-gray-600 hover:text-gray-800"
              >
                <X size={24} />
              </button>
            </div>

            <div className="bg-white p-6 rounded-lg shadow-md space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  タイトル
                </label>
                <input
                  type="text"
                  value={newUnitTitle}
                  onChange={(e) => setNewUnitTitle(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  placeholder="Unit 1"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  フォルダー
                </label>
                <select
                  value={newUnitFolder}
                  onChange={(e) => setNewUnitFolder(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                >
                  <option value="">なし</option>
                  {folders.map((folder) => (
                    <option key={folder.id} value={folder.id}>
                      {folder.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    英文
                  </label>
                  <textarea
                    value={newUnitEnglish}
                    onChange={(e) => setNewUnitEnglish(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm h-40"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    和訳
                  </label>
                  <textarea
                    value={newUnitJapanese}
                    onChange={(e) => setNewUnitJapanese(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm h-40"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    発音記号
                  </label>
                  <textarea
                    value={newUnitPhonetic}
                    onChange={(e) => setNewUnitPhonetic(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm h-40"
                  />
                </div>
              </div>

              <button
                onClick={addUnit}
                className="w-full bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 font-medium"
              >
                追加
              </button>
            </div>
          </div>
        )}
                {/* === ユニット編集 === */}
        {currentView === 'edit' && editingUnit && (
          <div className="max-w-4xl mx-auto">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-gray-800">ユニット編集</h2>
              <button
                onClick={() => {
                  setCurrentView('list');
                  setEditingUnit(null);
                }}
                className="text-gray-600 hover:text-gray-800"
              >
                <X size={24} />
              </button>
            </div>

            <div className="bg-white p-6 rounded-lg shadow-md space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  タイトル
                </label>
                <input
                  type="text"
                  value={editUnitTitle}
                  onChange={(e) => setEditUnitTitle(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  フォルダー
                </label>
                <select
                  value={editUnitFolder}
                  onChange={(e) => setEditUnitFolder(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                >
                  <option value="">なし</option>
                  {folders.map((folder) => (
                    <option key={folder.id} value={folder.id}>
                      {folder.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    英文
                  </label>
                  <textarea
                    value={editUnitEnglish}
                    onChange={(e) => setEditUnitEnglish(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm h-40"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    和訳
                  </label>
                  <textarea
                    value={editUnitJapanese}
                    onChange={(e) => setEditUnitJapanese(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm h-40"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    発音記号
                  </label>
                  <textarea
                    value={editUnitPhonetic}
                    onChange={(e) => setEditUnitPhonetic(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm h-40"
                  />
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={saveEditUnit}
                  className="flex-1 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700"
                >
                  保存
                </button>
                <button
                  onClick={() => {
                    setCurrentView('list');
                    setEditingUnit(null);
                  }}
                  className="px-6 py-3 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  キャンセル
                </button>
              </div>
                            <div className="flex justify-end mt-6">
                <button
                  onClick={async () => {
                    if (!editingUnit) return;
                    const ok = window.confirm(`「${editingUnit.title}」を本当に削除しますか？`);
                    if (!ok) return;

                    await supabase.from('units').delete().eq('id', editingUnit.id);
                    setUnits(units.filter((u) => u.id !== editingUnit.id));
                    setEditingUnit(null);
                    setCurrentView('list');
                  }}
                  className="bg-red-600 text-white px-6 py-3 rounded-lg hover:bg-red-700"
                >
                  削除
                </button>
              </div>

            </div>
          </div>
        )}

        {/* === リーダー画面 === */}
        {currentView === 'reader' && (
          <div className="max-w-4xl mx-auto pb-32">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-gray-800">リーディングモード</h2>
              <button
                onClick={() => setCurrentView('list')}
                className="text-gray-600 hover:text-gray-800"
              >
                <X size={24} />
              </button>
            </div>

            <div className="bg-white p-6 rounded-lg shadow-md space-y-6">
              {units[0]?.lines.map((line) => (
                <div key={line.id} className="border-b border-gray-200 pb-4 last:border-0">
                  <div
  className="text-lg leading-relaxed select-text cursor-text mb-2"
  onMouseUp={handleTextSelection}
>
  {line.english}
</div>

{line.showJapanese && line.japanese && (
  <div
    className="mt-2 p-3 bg-blue-50 rounded text-gray-700 text-sm select-text cursor-text"
    onMouseUp={handleTextSelection}
  >
    {line.japanese}
  </div>
)}


                  {line.showJapanese && line.japanese && (
                    <div className="mt-2 p-3 bg-blue-50 rounded text-gray-700 text-sm">
                      {line.japanese}
                    </div>
                  )}
                  {line.showPhonetic && line.phonetic && (
                    <div className="mt-2 p-3 bg-green-50 rounded text-gray-600 text-sm">
                      {line.phonetic}
                    </div>
                  )}
                                    <div className="mt-3 text-right">
                    <button
                      onClick={async () => {
                        const currentUnit = units[0];
                        if (!currentUnit) return;

                        const newWord = {
                          word: line.english,
                          meaning: line.japanese,
                          unit_id: currentUnit.id,
                          unit_title: currentUnit.title,
                        };

                        const { data, error } = await supabase
                          .from('vocabulary')
                          .insert([newWord])
                          .select();

                        if (!error && data) {
                          setVocabulary([...vocabulary, data[0]]);
                          alert(`「${line.english}」を単語帳に追加しました`);
                        } else {
                          alert('追加に失敗しました');
                        }
                      }}
                      className="text-sm bg-purple-600 text-white px-3 py-1 rounded hover:bg-purple-700"
                    >
                      単語帳に追加
                    </button>
                  </div>

                </div>
              ))}
            </div>

           <div className="fixed bottom-0 left-0 right-0 bg-white border-t-2 border-gray-300 shadow-lg p-4">
                <div className="max-w-4xl mx-auto">
                    {selectedText ? (
                    <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 rounded mb-3">
                        <h3 className="font-semibold text-gray-800 mb-2">
                        {isSelectingMeaning ? '意味を選択中' : '見出し語を選択中'}
                        </h3>
                        {!isSelectingMeaning && (
                        <p className="text-sm text-gray-700 mb-2">
                            <span className="font-medium">見出し語: </span>
                            <span className="bg-yellow-200 px-1">{selectedText}</span>
                        </p>
                        )}
                        {isSelectingMeaning && selectedMeaning && (
                        <p className="text-sm text-gray-700 mb-2">
                            <span className="font-medium">意味: </span>
                            <span className="bg-blue-200 px-1">{selectedMeaning}</span>
                        </p>
                        )}
                        {!isSelectingMeaning && (
                        <p className="text-sm text-gray-600 mb-3">
                            意味となる日本語を次に選択してください
                        </p>
                        )}
                        <div className="flex gap-2">
                        <button
                            onClick={async () => {
                            if (!isSelectingMeaning) {
                                setIsSelectingMeaning(true);
                                return;
                            }
                            if (!selectedMeaning) {
                                alert('意味を選択してください');
                                return;
                            }

                            const currentUnit = units[0];
                            const newVocab = {
                                word: selectedText,
                                meaning: selectedMeaning,
                                unit_id: currentUnit.id,
                                unit_title: currentUnit.title,
                            };

                            const { data, error } = await supabase.from('vocabulary').insert([newVocab]).select();
                            if (!error && data) {
                                setVocabulary([...vocabulary, data[0]]);
                                setShowToast(true);
                                setTimeout(() => setShowToast(false), 2000);
                            }

                            // reset
                            setSelectedText('');
                            setSelectedMeaning('');
                            setIsSelectingMeaning(false);
                            }}
                            disabled={isSelectingMeaning && !selectedMeaning}
                            className="bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700 disabled:bg-gray-400"
                        >
                            {isSelectingMeaning ? '単語帳に追加' : '次へ（意味を選択）'}
                        </button>
                        <button
                            onClick={() => {
                            setSelectedText('');
                            setSelectedMeaning('');
                            setIsSelectingMeaning(false);
                            }}
                            className="text-sm text-gray-600 hover:text-gray-800 px-4 py-2 border border-gray-300 rounded"
                        >
                            キャンセル
                        </button>
                        </div>
                    </div>
                    ) : (
                    <div className="text-center text-sm text-gray-500 mb-3">
                        英文をマウスで範囲選択すると、単語帳に追加できます
                    </div>
                    )}
                </div>
                {showToast && (
                    <div className="fixed bottom-16 left-1/2 transform -translate-x-1/2 bg-green-500 text-white px-6 py-2 rounded-lg shadow-lg transition-opacity">
                    追加しました！
                    </div>
                )}
             </div>

          </div>
        )}

        {/* === 単語帳＆フラッシュカード === */}
        {currentView === 'vocabulary' && (
          flashcardMode ? (
            <div className="max-w-2xl mx-auto text-center">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold">フラッシュカード</h2>
                <button
                  onClick={() => {
                    setFlashcardMode(false);
                    setCurrentCardIndex(0);
                    setShowAnswer(false);
                  }}
                  className="text-gray-600 hover:text-gray-800"
                >
                  <X size={24} />
                </button>
              </div>

              {vocabulary.length === 0 ? (
                <p className="text-gray-500">単語がありません</p>
              ) : (
                <>
                  <div
                    className="bg-white shadow p-10 rounded-lg mb-4 cursor-pointer"
                    onClick={() => setShowAnswer(!showAnswer)}
                  >
                    {!showAnswer ? (
                      <p className="text-3xl font-bold text-gray-800">
                        {flashcardShowWord
                          ? vocabulary[currentCardIndex].word
                          : vocabulary[currentCardIndex].meaning}
                      </p>
                    ) : (
                      <div>
                        <p className="text-2xl font-bold mb-2">
                          {flashcardShowWord
                            ? vocabulary[currentCardIndex].word
                            : vocabulary[currentCardIndex].meaning}
                        </p>
                        <p className="text-lg text-gray-600">
                          {flashcardShowWord
                            ? vocabulary[currentCardIndex].meaning
                            : vocabulary[currentCardIndex].word}
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="flex justify-center gap-3 mb-4">
                    <button
                      onClick={() => {
                        setFlashcardShowWord(true);
                        setShowAnswer(false);
                      }}
                      className={`px-3 py-1 rounded ${
                        flashcardShowWord ? 'bg-blue-600 text-white' : 'bg-gray-200'
                      }`}
                    >
                      単語→意味
                    </button>
                    <button
                      onClick={() => {
                        setFlashcardShowWord(false);
                        setShowAnswer(false);
                      }}
                      className={`px-3 py-1 rounded ${
                        !flashcardShowWord ? 'bg-blue-600 text-white' : 'bg-gray-200'
                      }`}
                    >
                      意味→単語
                    </button>
                  </div>

                  <div className="flex justify-center gap-4">
                    <button
                      onClick={() => {
                        setCurrentCardIndex(Math.max(0, currentCardIndex - 1));
                        setShowAnswer(false);
                      }}
                      disabled={currentCardIndex === 0}
                      className="bg-gray-600 text-white px-4 py-2 rounded disabled:bg-gray-300"
                    >
                      前へ
                    </button>
                    <button
                      onClick={() => setShowAnswer(!showAnswer)}
                      className="bg-blue-600 text-white px-4 py-2 rounded"
                    >
                      {showAnswer ? '問題を表示' : '答えを表示'}
                    </button>
                    <button
                      onClick={() => {
                        if (currentCardIndex < vocabulary.length - 1) {
                          setCurrentCardIndex(currentCardIndex + 1);
                          setShowAnswer(false);
                        }
                      }}
                      disabled={currentCardIndex === vocabulary.length - 1}
                      className="bg-gray-600 text-white px-4 py-2 rounded disabled:bg-gray-300"
                    >
                      次へ
                    </button>
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="max-w-5xl mx-auto">
              <div className="flex justify-between mb-4">
                <h2 className="text-xl font-semibold">単語帳</h2>
                <button
                  onClick={() => {
                    if (vocabulary.length > 0) {
                      setFlashcardMode(true);
                      setCurrentCardIndex(0);
                      setShowAnswer(false);
                    }
                  }}
                  disabled={vocabulary.length === 0}
                  className="bg-purple-600 text-white px-4 py-2 rounded disabled:bg-gray-300"
                >
                  フラッシュカード
                </button>
              </div>

              <div className="bg-white rounded shadow overflow-hidden">
                {vocabulary.length === 0 ? (
                  <div className="text-center py-10 text-gray-500">
                    <p>単語がありません</p>
                  </div>
                ) : (
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b">
                      <tr>
                        <th className="px-4 py-2 text-left text-sm font-medium text-gray-600">単語</th>
                        <th className="px-4 py-2 text-left text-sm font-medium text-gray-600">意味</th>
                        <th className="px-4 py-2 text-left text-sm font-medium text-gray-600">ユニット</th>
                        <th className="px-4 py-2"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {vocabulary.map((v) => (
                        <tr key={v.id} className="border-b">
                          <td className="px-4 py-2">{v.word}</td>
                          <td className="px-4 py-2">{v.meaning}</td>
                          <td className="px-4 py-2">{v.unit_title}</td>
                          <td className="px-4 py-2 text-right">
                            <button
                              onClick={async () => {
                                await supabase.from('vocabulary').delete().eq('id', v.id);
                                setVocabulary(vocabulary.filter((x) => x.id !== v.id));
                              }}
                              className="text-red-500 hover:text-red-700"
                            >
                              <X size={16} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )
        )}
      </div>
    </div>
  );
}
