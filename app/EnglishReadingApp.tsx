'use client';

import React, { useState, useEffect } from 'react';
import {
  BookOpen,
  Plus,
  List,
  X,
  Eye,
  EyeOff,
  Folder,
  FolderPlus,
  Save,
} from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';


// 型（ざっくりでOK）
type FolderType = {
  id: string;
  name: string;
  created_at?: string;
};

type UnitLine = {
  id: number;
  english: string;
  japanese: string;
  phonetic: string;
  showJapanese: boolean;
  showPhonetic: boolean;
};

type UnitType = {
  id: string;
  title: string;
  folderId: string | null;
  lines: UnitLine[];
  createdAt?: string;
};

type VocabularyItem = {
  id: string;
  word: string;
  meaning: string;
  unitId: string | null;
  unitTitle: string;
  createdAt?: string;
};

const EnglishReadingApp: React.FC = () => {
  const [folders, setFolders] = useState<FolderType[]>([]);
  const [units, setUnits] = useState<UnitType[]>([]);
  const [vocabulary, setVocabulary] = useState<VocabularyItem[]>([]);

  const [currentView, setCurrentView] = useState<'list' | 'add' | 'edit' | 'reader' | 'vocabulary'>('list');
  const [currentUnit, setCurrentUnit] = useState<UnitType | null>(null);
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [newFolderName, setNewFolderName] = useState('');
  const [showFolderInput, setShowFolderInput] = useState(false);
  const [vocabularyFilter, setVocabularyFilter] = useState<'all' | string>('all');

  const [selectedText, setSelectedText] = useState('');
  const [selectedMeaning, setSelectedMeaning] = useState('');
  const [isSelectingMeaning, setIsSelectingMeaning] = useState(false);

  const [flashcardMode, setFlashcardMode] = useState(false);
  const [currentCardIndex, setCurrentCardIndex] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [flashcardShowWord, setFlashcardShowWord] = useState(true);

  const [editingUnit, setEditingUnit] = useState<UnitType | null>(null);

  const [newUnitTitle, setNewUnitTitle] = useState('');
  const [newUnitEnglish, setNewUnitEnglish] = useState('');
  const [newUnitJapanese, setNewUnitJapanese] = useState('');
  const [newUnitPhonetic, setNewUnitPhonetic] = useState('');
  const [newUnitFolder, setNewUnitFolder] = useState('');

  const [editUnitTitle, setEditUnitTitle] = useState('');
  const [editUnitEnglish, setEditUnitEnglish] = useState('');
  const [editUnitJapanese, setEditUnitJapanese] = useState('');
  const [editUnitPhonetic, setEditUnitPhonetic] = useState('');
  const [editUnitFolder, setEditUnitFolder] = useState('');

  // --- 初期ロード ---

  useEffect(() => {
    void loadData();
  }, []);

  const loadData = async () => {
    const { data: foldersData, error: foldersError } = await supabase
      .from('folders')
      .select('*')
      .order('created_at', { ascending: true });

    const { data: unitsData, error: unitsError } = await supabase
      .from('units')
      .select('*')
      .order('created_at', { ascending: true });

    const { data: vocabData, error: vocabError } = await supabase
      .from('vocabulary')
      .select('*')
      .order('created_at', { ascending: true });

    if (foldersError || unitsError || vocabError) {
      console.error('Failed to load data:', {
        foldersError,
        unitsError,
        vocabError,
      });
      return;
    }

    setFolders((foldersData || []).map((f) => ({
      id: f.id,
      name: f.name,
      created_at: f.created_at,
    })));

    setUnits((unitsData || []).map((u) => ({
      id: u.id,
      title: u.title,
      folderId: u.folder_id ?? null,
      lines: (u.lines || []) as UnitLine[],
      createdAt: u.created_at,
    })));

    setVocabulary((vocabData || []).map((v) => ({
      id: v.id,
      word: v.word,
      meaning: v.meaning || '',
      unitId: v.unit_id ?? null,
      unitTitle: v.unit_title || '',
      createdAt: v.created_at,
    })));
  };

  // --- 共通ユーティリティ ---

  const parseMultilineInput = (
    englishText: string,
    japaneseText: string,
    phoneticText: string
  ): { english: string; japanese: string; phonetic: string }[] => {
    const englishLines = englishText
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line);

    const japaneseLines = japaneseText
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line);

    const phoneticLines = phoneticText
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line);

    return englishLines.map((english, index) => ({
      english,
      japanese: japaneseLines[index] || '',
      phonetic: phoneticLines[index] || '',
    }));
  };

  const getFilteredUnits = () => {
    if (selectedFolder) {
      return units.filter((u) => u.folderId === selectedFolder);
    }
    return units;
  };

  const getFilteredVocabulary = () => {
    if (vocabularyFilter === 'all') return vocabulary;
    return vocabulary.filter((v) => v.unitId === vocabularyFilter);
  };

  const getExplanation = (text: string) => {
    const commonWords: Record<string, string> = {
      the: '定冠詞。特定のものを指す。',
      a: '不定冠詞。不特定のものを指す。',
      is: 'be動詞の三人称単数現在形。',
      and: '接続詞。「そして」の意味。',
      to: '前置詞または不定詞のto。',
    };
    const lower = text.toLowerCase();
    return commonWords[lower] || `選択: ${text}`;
  };

  // --- フォルダ操作 ---

  const addFolder = async () => {
    if (!newFolderName.trim()) return;

    const newFolder: FolderType = {
      id: Date.now().toString(),
      name: newFolderName.trim(),
    };

    const { error } = await supabase.from('folders').insert({
      id: newFolder.id,
      name: newFolder.name,
    });

    if (error) {
      console.error(error);
      alert('フォルダー作成に失敗しました');
      return;
    }

    setFolders((prev) => [...prev, newFolder]);
    setNewFolderName('');
    setShowFolderInput(false);
  };

  const deleteFolder = async (folderId: string) => {
    const { error } = await supabase.from('folders').delete().eq('id', folderId);
    if (error) {
      console.error(error);
      alert('フォルダー削除に失敗しました');
      return;
    }

    // DB側で units.folder_id は null になる想定
    setFolders((prev) => prev.filter((f) => f.id !== folderId));
    setUnits((prev) =>
      prev.map((u) =>
        u.folderId === folderId ? { ...u, folderId: null } : u
      )
    );
    if (selectedFolder === folderId) setSelectedFolder(null);
  };

  // --- ユニット追加 / 編集 / 削除 ---

  const addUnit = async () => {
    const parsedLines = parseMultilineInput(
      newUnitEnglish,
      newUnitJapanese,
      newUnitPhonetic
    );

    if (parsedLines.length === 0) {
      alert('英文を最低1行は入力してください');
      return;
    }

    const newUnit: UnitType = {
      id: Date.now().toString(),
      title: newUnitTitle.trim() || '無題',
      folderId: newUnitFolder || null,
      lines: parsedLines.map((line, index) => ({
        id: index,
        english: line.english,
        japanese: line.japanese,
        phonetic: line.phonetic,
        showJapanese: false,
        showPhonetic: false,
      })),
    };

    const { error } = await supabase.from('units').insert({
      id: newUnit.id,
      title: newUnit.title,
      folder_id: newUnit.folderId,
      lines: newUnit.lines,
    });

    if (error) {
      console.error(error);
      alert('ユニット作成に失敗しました');
      return;
    }

    setUnits((prev) => [...prev, newUnit]);
    setNewUnitTitle('');
    setNewUnitEnglish('');
    setNewUnitJapanese('');
    setNewUnitPhonetic('');
    setNewUnitFolder('');
    setCurrentView('list');
  };

  const startEditUnit = (unit: UnitType) => {
    setEditingUnit(unit);
    setEditUnitTitle(unit.title);
    setEditUnitFolder(unit.folderId || '');
    setEditUnitEnglish(unit.lines.map((l) => l.english).join('\n'));
    setEditUnitJapanese(unit.lines.map((l) => l.japanese).join('\n'));
    setEditUnitPhonetic(unit.lines.map((l) => l.phonetic).join('\n'));
    setCurrentView('edit');
  };

  const saveEditUnit = async () => {
    if (!editingUnit) return;

    const parsedLines = parseMultilineInput(
      editUnitEnglish,
      editUnitJapanese,
      editUnitPhonetic
    );
    if (parsedLines.length === 0) {
      alert('英文を最低1行は入力してください');
      return;
    }

    const updatedUnit: UnitType = {
      ...editingUnit,
      title: editUnitTitle.trim() || '無題',
      folderId: editUnitFolder || null,
      lines: parsedLines.map((line, index) => ({
        id: index,
        english: line.english,
        japanese: line.japanese,
        phonetic: line.phonetic,
        showJapanese: false,
        showPhonetic: false,
      })),
    };

    const { error } = await supabase
      .from('units')
      .update({
        title: updatedUnit.title,
        folder_id: updatedUnit.folderId,
        lines: updatedUnit.lines,
      })
      .eq('id', updatedUnit.id);

    if (error) {
      console.error(error);
      alert('ユニット更新に失敗しました');
      return;
    }

    setUnits((prev) =>
      prev.map((u) => (u.id === updatedUnit.id ? updatedUnit : u))
    );
    setEditingUnit(null);
    setCurrentView('list');
  };

  const deleteUnit = async (unitId: string) => {
    if (!window.confirm('このユニットを削除しますか？')) return;

    const { error: vocabError } = await supabase
      .from('vocabulary')
      .delete()
      .eq('unit_id', unitId);
    const { error: unitError } = await supabase
      .from('units')
      .delete()
      .eq('id', unitId);

    if (vocabError || unitError) {
      console.error({ vocabError, unitError });
      alert('ユニット削除に失敗しました');
      return;
    }

    setUnits((prev) => prev.filter((u) => u.id !== unitId));
    setVocabulary((prev) => prev.filter((v) => v.unitId !== unitId));
  };

  const toggleAllTranslations = async () => {
    if (!currentUnit) return;
    const allShown = currentUnit.lines.every((l) => l.showJapanese);
    const updatedUnit: UnitType = {
      ...currentUnit,
      lines: currentUnit.lines.map((l) => ({
        ...l,
        showJapanese: !allShown,
      })),
    };

    setCurrentUnit(updatedUnit);
    setUnits((prev) =>
      prev.map((u) => (u.id === updatedUnit.id ? updatedUnit : u))
    );

    await supabase
      .from('units')
      .update({ lines: updatedUnit.lines })
      .eq('id', updatedUnit.id);
  };

  const toggleAllPhonetics = async () => {
    if (!currentUnit) return;
    const allShown = currentUnit.lines.every((l) => l.showPhonetic);
    const updatedUnit: UnitType = {
      ...currentUnit,
      lines: currentUnit.lines.map((l) => ({
        ...l,
        showPhonetic: !allShown,
      })),
    };

    setCurrentUnit(updatedUnit);
    setUnits((prev) =>
      prev.map((u) => (u.id === updatedUnit.id ? updatedUnit : u))
    );

    await supabase
      .from('units')
      .update({ lines: updatedUnit.lines })
      .eq('id', updatedUnit.id);
  };

  // --- 単語帳：選択 → 登録 ---

  const handleTextSelection = () => {
    const selection = window.getSelection();
    const text = selection ? selection.toString().trim() : '';
    if (!text) return;

    if (isSelectingMeaning) {
      setSelectedMeaning(text);
    } else {
      setSelectedText(text);
    }
  };

  const addToVocabulary = async () => {
    if (!selectedText || !currentUnit) return;

    if (!isSelectingMeaning) {
      setIsSelectingMeaning(true);
      alert('次に意味となる日本語テキストを選択してください');
      return;
    }

    if (!selectedMeaning) {
      alert('意味が選択されていません');
      return;
    }

    const exists = vocabulary.find(
      (v) =>
        v.word.toLowerCase() === selectedText.toLowerCase() &&
        v.unitId === currentUnit.id
    );
    if (exists) {
      alert('この単語は既に単語帳に登録されています');
      setIsSelectingMeaning(false);
      setSelectedText('');
      setSelectedMeaning('');
      return;
    }

    const newItem: VocabularyItem = {
      id: Date.now().toString(),
      word: selectedText,
      meaning: selectedMeaning,
      unitId: currentUnit.id,
      unitTitle: currentUnit.title,
    };

    const { error } = await supabase.from('vocabulary').insert({
      id: newItem.id,
      word: newItem.word,
      meaning: newItem.meaning,
      unit_id: newItem.unitId,
      unit_title: newItem.unitTitle,
    });

    if (error) {
      console.error(error);
      alert('単語の追加に失敗しました');
      return;
    }

    setVocabulary((prev) => [...prev, newItem]);
    setSelectedText('');
    setSelectedMeaning('');
    setIsSelectingMeaning(false);
    alert('単語帳に追加しました！');
  };

  const updateVocabulary = (vocabId: string, field: keyof VocabularyItem, value: string) => {
    setVocabulary((prev) =>
      prev.map((v) =>
        v.id === vocabId ? { ...v, [field]: value } : v
      )
    );
  };

  const saveVocabularyChanges = async () => {
    const payload = vocabulary.map((v) => ({
      id: v.id,
      word: v.word,
      meaning: v.meaning,
      unit_id: v.unitId,
      unit_title: v.unitTitle,
    }));

    const { error } = await supabase.from('vocabulary').upsert(payload);
    if (error) {
      console.error(error);
      alert('単語帳の保存に失敗しました');
      return;
    }
    alert('変更を保存しました');
  };

  const deleteVocabulary = async (vocabId: string) => {
    const { error } = await supabase
      .from('vocabulary')
      .delete()
      .eq('id', vocabId);

    if (error) {
      console.error(error);
      alert('削除に失敗しました');
      return;
    }

    setVocabulary((prev) => prev.filter((v) => v.id !== vocabId));
  };

  // --- CSVエクスポート（ローカル動作のみ） ---

  const exportVocabularyToCSV = () => {
    const filtered = getFilteredVocabulary();
    if (filtered.length === 0) {
      alert('エクスポートする単語がありません');
      return;
    }

    const headers = ['単語', '意味', 'ユニット'];
    const rows = filtered.map((i) => [
      i.word,
      i.meaning,
      i.unitTitle,
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(',')),
    ].join('\n');

    const bom = '\uFEFF';
    const blob = new Blob([bom + csvContent], {
      type: 'text/csv;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;

    const date = new Date().toISOString().slice(0, 10);
    const filterName =
      vocabularyFilter === 'all'
        ? 'all'
        : units.find((u) => u.id === vocabularyFilter)?.title || 'unit';

    link.download = `vocabulary_${filterName}_${date}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // --- JSX ---

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-6">
      <div className="max-w-7xl mx-auto">
        {/* ヘッダー */}
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold text-gray-800 flex items-center gap-3">
            <BookOpen className="text-blue-600" size={36} />
            英語長文学習アプリ
          </h1>
          <nav className="flex gap-2">
            <button
              onClick={() => {
                setCurrentView('list');
                setCurrentUnit(null);
              }}
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

        {/* ===== ユニット一覧 ===== */}
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

            {/* フォルダー */}
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
                      {units.filter((u) => u.folderId === folder.id).length})
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

            {/* ユニット一覧本体 */}
            {getFilteredUnits().length === 0 ? (
              <div className="text-center py-12 text-gray-500 bg-white rounded-lg shadow-md">
                <BookOpen
                  size={48}
                  className="mx-auto mb-4 opacity-50"
                />
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
                          {unit.lines.length}行 |{' '}
                          {
                            vocabulary.filter(
                              (v) => v.unitId === unit.id
                            ).length
                          }
                          語の単語
                        </p>
                        {unit.folderId && (
                          <span className="inline-block mt-2 text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                            {
                              folders.find(
                                (f) => f.id === unit.folderId
                              )?.name
                            }
                          </span>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => startEditUnit(unit)}
                          className="bg-amber-500 text-white px-4 py-2 rounded-lg hover:bg-amber-600 font-medium"
                        >
                          編集
                        </button>
                        <button
                          onClick={() => {
                            setCurrentUnit(unit);
                            setCurrentView('reader');
                          }}
                          className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 font-medium"
                        >
                          学習
                        </button>
                        <button
                          onClick={() => deleteUnit(unit.id)}
                          className="bg-red-600 text-white px-3 py-2 rounded-lg hover:bg-red-700"
                        >
                          <X size={20} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ===== 新規ユニット追加 ===== */}
        {currentView === 'add' && (
          <div className="max-w-4xl mx-auto">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-gray-800">
                新規ユニット追加
              </h2>
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
                  {folders.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
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
                    onChange={(e) =>
                      setNewUnitPhonetic(e.target.value)
                    }
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

        {/* ===== ユニット編集 ===== */}
        {currentView === 'edit' && editingUnit && (
          <div className="max-w-4xl mx-auto">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-gray-800">
                ユニット編集
              </h2>
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
                  {folders.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
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
                    onChange={(e) =>
                      setEditUnitPhonetic(e.target.value)
                    }
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
            </div>
          </div>
        )}

        {/* ===== リーダー（学習画面） ===== */}
        {currentView === 'reader' && currentUnit && (
          <div className="max-w-4xl mx-auto pb-32">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-gray-800">
                {currentUnit.title}
              </h2>
              <button
                onClick={() => {
                  setCurrentView('list');
                  setCurrentUnit(null);
                  setSelectedText('');
                  setSelectedMeaning('');
                  setIsSelectingMeaning(false);
                }}
                className="text-gray-600 hover:text-gray-800"
              >
                <X size={24} />
              </button>
            </div>

            <div className="bg-white p-6 rounded-lg shadow-md space-y-6">
              {currentUnit.lines.map((line) => (
                <div
                  key={line.id}
                  className="border-b border-gray-200 pb-4 last:border-0"
                >
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

                  {line.showPhonetic && line.phonetic && (
                    <div className="mt-2 p-3 bg-green-50 rounded text-gray-600 text-sm">
                      {line.phonetic}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* 下部操作パネル */}
            <div className="fixed bottom-0 left-0 right-0 bg-white border-t-2 border-gray-300 shadow-lg p-4">
              <div className="max-w-4xl mx-auto">
                {selectedText ? (
                  <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 rounded mb-3">
                    <h3 className="font-semibold text-gray-800 mb-2">
                      {isSelectingMeaning
                        ? '意味を選択'
                        : '見出し語を選択'}
                    </h3>

                    {!isSelectingMeaning && (
                      <>
                        <p className="text-sm text-gray-700 mb-2">
                          <span className="font-medium">見出し語: </span>
                          <span className="bg-yellow-200 px-1">
                            {selectedText}
                          </span>
                        </p>
                        <p className="text-sm text-gray-700 mb-3">
                          {getExplanation(selectedText)}
                        </p>
                      </>
                    )}

                    {isSelectingMeaning && selectedMeaning && (
                      <p className="text-sm text-gray-700 mb-2">
                        <span className="font-medium">意味: </span>
                        <span className="bg-blue-200 px-1">
                          {selectedMeaning}
                        </span>
                      </p>
                    )}

                    {isSelectingMeaning && !selectedMeaning && (
                      <p className="text-sm text-gray-600 mb-3">
                        意味となる日本語テキストを選択してください
                      </p>
                    )}

                    <div className="flex gap-2">
                      <button
                        onClick={addToVocabulary}
                        disabled={isSelectingMeaning && !selectedMeaning}
                        className="bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700 disabled:bg-gray-400"
                      >
                        {isSelectingMeaning
                          ? '単語帳に追加'
                          : '次へ（意味を選択）'}
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
                    英文や和訳をドラッグで選択 → 単語帳に登録できます
                  </div>
                )}

                <div className="flex gap-3 justify-center">
                  <button
                    onClick={toggleAllTranslations}
                    className="flex items-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700"
                  >
                    {currentUnit.lines.every((l) => l.showJapanese) ? (
                      <>
                        <EyeOff size={20} />
                        和訳を隠す
                      </>
                    ) : (
                      <>
                        <Eye size={20} />
                        和訳を表示
                      </>
                    )}
                  </button>
                  <button
                    onClick={toggleAllPhonetics}
                    className="flex items-center gap-2 bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700"
                  >
                    {currentUnit.lines.every((l) => l.showPhonetic) ? (
                      <>
                        <EyeOff size={20} />
                        発音を隠す
                      </>
                    ) : (
                      <>
                        <Eye size={20} />
                        発音を表示
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ===== 単語帳 / フラッシュカード ===== */}
        {currentView === 'vocabulary' &&
          (flashcardMode ? (
            // --- フラッシュカード ---
            <div className="max-w-2xl mx-auto">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-gray-800">
                  フラッシュカード
                </h2>
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

              {getFilteredVocabulary().length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-gray-500 mb-4">
                    単語がありません
                  </p>
                  <button
                    onClick={() => setFlashcardMode(false)}
                    className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700"
                  >
                    単語帳に戻る
                  </button>
                </div>
              ) : (
                <>
                  <div className="mb-4 flex justify-between items-center">
                    <div className="text-sm text-gray-600">
                      {currentCardIndex + 1} /{' '}
                      {getFilteredVocabulary().length}
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          setFlashcardShowWord(true);
                          setShowAnswer(false);
                        }}
                        className={`px-3 py-1 rounded text-sm ${
                          flashcardShowWord
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-200 text-gray-700'
                        }`}
                      >
                        単語→意味
                      </button>
                      <button
                        onClick={() => {
                          setFlashcardShowWord(false);
                          setShowAnswer(false);
                        }}
                        className={`px-3 py-1 rounded text-sm ${
                          !flashcardShowWord
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-200 text-gray-700'
                        }`}
                      >
                        意味→単語
                      </button>
                    </div>
                  </div>

                  <div
                    className="bg-white rounded-lg shadow-xl p-12 mb-6 min-h-80 flex flex-col items-center justify-center cursor-pointer hover:shadow-2xl"
                    onClick={() => setShowAnswer(!showAnswer)}
                  >
                    {!showAnswer ? (
                      <div className="text-center">
                        <p className="text-3xl font-bold text-gray-800 mb-4">
                          {flashcardShowWord
                            ? getFilteredVocabulary()[
                                currentCardIndex
                              ].word
                            : getFilteredVocabulary()[
                                currentCardIndex
                              ].meaning}
                        </p>
                        <p className="text-gray-500 text-sm">
                          クリックして答えを表示
                        </p>
                      </div>
                    ) : (
                      <div className="text-center">
                        <p className="text-2xl font-bold text-gray-800 mb-6">
                          {flashcardShowWord
                            ? getFilteredVocabulary()[
                                currentCardIndex
                              ].word
                            : getFilteredVocabulary()[
                                currentCardIndex
                              ].meaning}
                        </p>
                        <div className="w-16 h-1 bg-gray-300 mx-auto mb-6" />
                        <p className="text-xl text-gray-700">
                          {flashcardShowWord
                            ? getFilteredVocabulary()[
                                currentCardIndex
                              ].meaning
                            : getFilteredVocabulary()[
                                currentCardIndex
                              ].word}
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="flex gap-4 justify-center">
                    <button
                      onClick={() => {
                        setCurrentCardIndex((i) =>
                          Math.max(0, i - 1)
                        );
                        setShowAnswer(false);
                      }}
                      disabled={currentCardIndex === 0}
                      className="bg-gray-600 text-white px-6 py-3 rounded-lg hover:bg-gray-700 disabled:bg-gray-300"
                    >
                      前へ
                    </button>
                    <button
                      onClick={() =>
                        setShowAnswer(!showAnswer)
                      }
                      className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700"
                    >
                      {showAnswer
                        ? '問題を表示'
                        : '答えを表示'}
                    </button>
                    <button
                      onClick={() => {
                        if (
                          currentCardIndex <
                          getFilteredVocabulary()
                            .length -
                            1
                        ) {
                          setCurrentCardIndex(
                            currentCardIndex + 1
                          );
                          setShowAnswer(false);
                        }
                      }}
                      disabled={
                        currentCardIndex ===
                        getFilteredVocabulary()
                          .length -
                          1
                      }
                      className="bg-gray-600 text-white px-6 py-3 rounded-lg hover:bg-gray-700 disabled:bg-gray-300"
                    >
                      次へ
                    </button>
                  </div>
                </>
              )}
            </div>
          ) : (
            // --- 単語帳一覧 ---
            <div className="max-w-6xl mx-auto">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-gray-800">
                  単語帳
                </h2>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      if (getFilteredVocabulary().length > 0) {
                        setFlashcardMode(true);
                        setCurrentCardIndex(0);
                        setShowAnswer(false);
                      }
                    }}
                    disabled={getFilteredVocabulary().length === 0}
                    className="flex items-center gap-2 bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 disabled:bg-gray-300"
                  >
                    <BookOpen size={20} />
                    フラッシュカード
                  </button>
                  <button
                    onClick={saveVocabularyChanges}
                    className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700"
                  >
                    <Save size={20} />
                    保存
                  </button>
                  <button
                    onClick={exportVocabularyToCSV}
                    className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
                  >
                    CSV出力
                  </button>
                  <button
                    onClick={() => setCurrentView('list')}
                    className="text-gray-600 hover:text-gray-800"
                  >
                    <X size={24} />
                  </button>
                </div>
              </div>

              <div className="mb-4">
                <select
                  value={vocabularyFilter}
                  onChange={(e) =>
                    setVocabularyFilter(e.target.value)
                  }
                  className="px-4 py-2 border border-gray-300 rounded-lg"
                >
                  <option value="all">
                    全ユニット ({vocabulary.length}語)
                  </option>
                  {units.map((u) => (
                    <option
                      key={u.id}
                      value={u.id}
                    >
                      {u.title} (
                      {
                        vocabulary.filter(
                          (v) => v.unitId === u.id
                        ).length
                      }
                      語)
                    </option>
                  ))}
                </select>
              </div>

              <div className="bg-white rounded-lg shadow-md overflow-hidden">
                {getFilteredVocabulary().length === 0 ? (
                  <div className="text-center py-12 text-gray-500">
                    <p>単語がありません</p>
                  </div>
                ) : (
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                          単語
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                          意味
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                          ユニット
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                          操作
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {getFilteredVocabulary().map((item) => (
                        <tr
                          key={item.id}
                          className="hover:bg-gray-50"
                        >
                          <td className="px-4 py-3 font-medium text-gray-900">
                            {item.word}
                          </td>
                          <td className="px-4 py-3">
                            <input
                              type="text"
                              value={item.meaning}
                              onChange={(e) =>
                                updateVocabulary(
                                  item.id,
                                  'meaning',
                                  e.target.value
                                )
                              }
                              placeholder="意味を入力"
                              className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                            />
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600">
                            {item.unitTitle}
                          </td>
                          <td className="px-4 py-3">
                            <button
                              onClick={() =>
                                deleteVocabulary(item.id)
                              }
                              className="text-red-600 hover:text-red-800"
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
          ))}
      </div>
    </div>
  );
};

export default EnglishReadingApp;
