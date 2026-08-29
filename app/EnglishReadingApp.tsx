"use client";

import React, { useState, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import {
  BookOpen,
  Plus,
  List,
  X,
  Eye,
  EyeOff,
  Folder,
  FolderPlus,
  MoreVertical,
  Save,
} from "lucide-react";
import { supabase } from "@/lib/supabaseClient";

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

type AiMessage = {
  role: "user" | "model";
  text: string;
};

// === メインコンポーネント ==============================
export default function EnglishReadingApp() {
  const [folders, setFolders] = useState<FolderType[]>([]);
  const [units, setUnits] = useState<UnitType[]>([]);
  const [vocabulary, setVocabulary] = useState<VocabularyType[]>([]);
  const [currentView, setCurrentView] = useState<
    "list" | "add" | "edit" | "reader" | "vocabulary"
  >("list");
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [selectedUnit, setSelectedUnit] = useState<UnitType | null>(null);
  const [newFolderName, setNewFolderName] = useState("");
  const [showFolderInput, setShowFolderInput] = useState(false);
  const [folderMenuId, setFolderMenuId] = useState<string | null>(null);

  // === ユニット追加用 ===
  const [newUnitTitle, setNewUnitTitle] = useState("");
  const [newUnitEnglish, setNewUnitEnglish] = useState("");
  const [newUnitJapanese, setNewUnitJapanese] = useState("");
  const [newUnitPhonetic, setNewUnitPhonetic] = useState("");
  const [newUnitFolder, setNewUnitFolder] = useState("");

  // === フラッシュカード関連 ===
  const [flashcardMode, setFlashcardMode] = useState(false);
  const [currentCardIndex, setCurrentCardIndex] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [flashcardShowWord, setFlashcardShowWord] = useState(true);
  // 単語追加用
  const [selectedText, setSelectedText] = useState("");
  const [isSelectionPanelOpen, setIsSelectionPanelOpen] = useState(false);
  const [newVocabularyWord, setNewVocabularyWord] = useState("");
  const [selectedMeaning, setSelectedMeaning] = useState("");
  const [selectedLineId, setSelectedLineId] = useState<number | null>(null);
  const [isSelectingMeaning, setIsSelectingMeaning] = useState(false);
  const [showVocabularyForm, setShowVocabularyForm] = useState(false);
  const [hasStartedAi, setHasStartedAi] = useState(false);
  const [aiSubject, setAiSubject] = useState("");
  const [aiLineId, setAiLineId] = useState<number | null>(null);
  const [aiMessages, setAiMessages] = useState<AiMessage[]>([]);
  const [aiQuestion, setAiQuestion] = useState("");
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiError, setAiError] = useState("");
  const [showToast, setShowToast] = useState(false);
  const [showAllJapanese, setShowAllJapanese] = useState(false);
  const [showAllPhonetic, setShowAllPhonetic] = useState(false);
  const [vocabFolder, setVocabFolder] = useState("");
  const [vocabUnit, setVocabUnit] = useState("");
  const [vocabularyMenuId, setVocabularyMenuId] = useState<string | null>(null);
  const [editingVocabulary, setEditingVocabulary] =
    useState<VocabularyType | null>(null);
  const [editVocabularyWord, setEditVocabularyWord] = useState("");
  const [editVocabularyMeaning, setEditVocabularyMeaning] = useState("");

  // 編集用 state
  const [editingUnit, setEditingUnit] = useState<UnitType | null>(null);
  const [editUnitTitle, setEditUnitTitle] = useState("");
  const [editUnitEnglish, setEditUnitEnglish] = useState("");
  const [editUnitJapanese, setEditUnitJapanese] = useState("");
  const [editUnitPhonetic, setEditUnitPhonetic] = useState("");
  const [editUnitFolder, setEditUnitFolder] = useState("");
  const [generatingUnitField, setGeneratingUnitField] = useState<
    "translation" | "phonetic" | null
  >(null);

  const hasUnitUnsavedChanges = Boolean(
    editingUnit &&
      (editUnitTitle !== editingUnit.title ||
        editUnitFolder !== (editingUnit.folder_id || "") ||
        editUnitEnglish !==
          editingUnit.lines.map((line) => line.english).join("\n") ||
        editUnitJapanese !==
          editingUnit.lines.map((line) => line.japanese).join("\n") ||
        editUnitPhonetic !==
          editingUnit.lines.map((line) => line.phonetic).join("\n")),
  );
  const hasVocabularyUnsavedChanges = Boolean(
    editingVocabulary &&
      (editVocabularyWord !== editingVocabulary.word ||
        editVocabularyMeaning !== editingVocabulary.meaning),
  );

  // === 初期ロード ===
  const loadAll = async () => {
    const [fRes, uRes, vRes] = await Promise.all([
      supabase
        .from("folders")
        .select("*")
        .order("created_at", { ascending: true }),
      supabase
        .from("units")
        .select("*")
        .order("created_at", { ascending: false }),
      supabase
        .from("vocabulary")
        .select("*")
        .order("created_at", { ascending: false }),
    ]);

    if (fRes.error) console.error("folders load error", fRes.error);
    if (uRes.error) console.error("units load error", uRes.error);
    if (vRes.error) console.error("vocabulary load error", vRes.error);

    if (fRes.data) setFolders(fRes.data);
    if (uRes.data) setUnits(uRes.data);
    if (vRes.data) setVocabulary(vRes.data);
  };

  useEffect(() => {
    void Promise.resolve().then(loadAll);
  }, []);

  useEffect(() => {
    const handlePopState = (event: PopStateEvent) => {
      const readingUnitId = event.state?.readingUnitId as string | undefined;
      const readingUnit = units.find((unit) => unit.id === readingUnitId);

      if (readingUnit) {
        setSelectedUnit(readingUnit);
        setShowAllJapanese(false);
        setShowAllPhonetic(false);
        setCurrentView("reader");
        return;
      }

      setSelectedUnit(null);
      setCurrentView("list");
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [units]);

  useEffect(() => {
    if (!folderMenuId) return;
    const closeFolderMenu = () => setFolderMenuId(null);
    window.addEventListener("click", closeFolderMenu);
    return () => window.removeEventListener("click", closeFolderMenu);
  }, [folderMenuId]);

  useEffect(() => {
    if (!vocabularyMenuId) return;
    const closeVocabularyMenu = () => setVocabularyMenuId(null);
    window.addEventListener("click", closeVocabularyMenu);
    return () => window.removeEventListener("click", closeVocabularyMenu);
  }, [vocabularyMenuId]);

  useEffect(() => {
    if (!hasUnitUnsavedChanges && !hasVocabularyUnsavedChanges) return;

    const confirmBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = true;
    };
    window.addEventListener("beforeunload", confirmBeforeUnload);
    return () => window.removeEventListener("beforeunload", confirmBeforeUnload);
  }, [hasUnitUnsavedChanges, hasVocabularyUnsavedChanges]);

  // === フォルダー操作 ===
  const addFolder = async () => {
    if (!newFolderName.trim()) return;

    const { error } = await supabase
      .from("folders")
      .insert([{ name: newFolderName.trim() }])
      .select(); // ← ここで select 権限が無いと失敗する

    if (error) {
      console.error("addFolder error:", error);
      alert(`フォルダー追加に失敗: ${error.message}`);
      return;
    }

    // data が返らない/空の可能性にも備える
    await loadAll();
    setNewFolderName("");
    setShowFolderInput(false);
  };

  const deleteFolder = async (id: string) => {
    await supabase.from("folders").delete().eq("id", id);
    setFolders(folders.filter((f) => f.id !== id));
    setUnits(
      units.map((u) => (u.folder_id === id ? { ...u, folder_id: null } : u)),
    );
    if (selectedFolder === id) setSelectedFolder(null);
    setFolderMenuId(null);
  };

  const renameFolder = async (folder: FolderType) => {
    const name = window.prompt("新しいフォルダー名", folder.name)?.trim();
    if (!name || name === folder.name) return;

    const { error } = await supabase
      .from("folders")
      .update({ name })
      .eq("id", folder.id);
    if (error) {
      alert(`フォルダー名の変更に失敗: ${error.message}`);
      return;
    }

    setFolders(
      folders.map((item) =>
        item.id === folder.id ? { ...item, name } : item,
      ),
    );
    setFolderMenuId(null);
  };

  // === ユニット操作 ===
  const parseMultilineInput = (
    englishText: string,
    japaneseText: string,
    phoneticText: string,
  ) => {
    const e = englishText
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    const j = japaneseText.split("\n").map((l) => l.trim());
    const p = phoneticText.split("\n").map((l) => l.trim());
    return e.map((eng, i) => ({
      id: i,
      english: eng,
      japanese: j[i] || "",
      phonetic: p[i] || "",
    }));
  };

  const generateUnitField = async (
    mode: "translation" | "phonetic",
    source: string,
    currentValue: string,
    setValue: (value: string) => void,
  ) => {
    if (!source.trim()) {
      alert("先に原文を入力してください");
      return;
    }
    if (
      currentValue.trim() &&
      !confirm("現在の内容をAIの生成結果で上書きしますか？")
    ) {
      return;
    }

    setGeneratingUnitField(mode);
    try {
      const response = await fetch("/api/generate-unit-text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source, mode }),
      });
      const data = (await response.json()) as { text?: string; error?: string };
      if (!response.ok || !data.text) {
        throw new Error(data.error || "AIから生成結果を取得できませんでした");
      }
      setValue(data.text);
    } catch (error) {
      alert(error instanceof Error ? error.message : "AIによる生成に失敗しました");
    } finally {
      setGeneratingUnitField(null);
    }
  };

  const addUnit = async () => {
    const parsed = parseMultilineInput(
      newUnitEnglish,
      newUnitJapanese,
      newUnitPhonetic,
    );
    if (parsed.length === 0) {
      alert("英文を1行以上入力してください");
      return;
    }

    const payload = {
      title: (newUnitTitle || "無題").trim(),
      folder_id: newUnitFolder || null,
      lines: parsed,
    };

    const { error } = await supabase
      .from("units")
      .insert([payload])
      .select();

    if (error) {
      console.error("addUnit error:", error);
      alert(`ユニット追加に失敗: ${error.message}`);
      return;
    }

    await loadAll();
    setNewUnitTitle("");
    setNewUnitEnglish("");
    setNewUnitJapanese("");
    setNewUnitPhonetic("");
    setNewUnitFolder("");
    setCurrentView("list");
  };
  const handleTextSelection = (lineId: number) => {
    const selection = window.getSelection();
    const text = selection?.toString().trim();
    if (text) {
      if (isSelectingMeaning) {
        setSelectedMeaning(text);
      } else {
        setSelectedText(text);
        setIsSelectionPanelOpen(true);
        setSelectedLineId(lineId);
        if (showVocabularyForm) setNewVocabularyWord(text);
      }
    }
  };

  const requestAiExplanation = async (
    messages: AiMessage[],
    subject = aiSubject,
    lineId = aiLineId,
  ) => {
    if (!selectedUnit || lineId === null || !subject.trim()) return;
    const lineIndex = selectedUnit.lines.findIndex(
      (line) => line.id === lineId,
    );
    const formatLine = (line: UnitType["lines"][number] | undefined) =>
      line
        ? [line.english, line.japanese ? `和訳: ${line.japanese}` : ""]
            .filter(Boolean)
            .join("\n")
        : "";

    setIsAiLoading(true);
    setAiError("");
    try {
      const response = await fetch("/api/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          selection: subject.trim(),
          context: {
            previous: formatLine(selectedUnit.lines[lineIndex - 1]),
            current: formatLine(selectedUnit.lines[lineIndex]),
            next: formatLine(selectedUnit.lines[lineIndex + 1]),
          },
          messages,
        }),
      });
      const result = (await response.json()) as { text?: string; error?: string };
      if (!response.ok || !result.text) {
        throw new Error(result.error || "AI解説を取得できませんでした");
      }
      setAiMessages([...messages, { role: "model", text: result.text }]);
    } catch (error) {
      setAiError(
        error instanceof Error ? error.message : "AI解説を取得できませんでした",
      );
    } finally {
      setIsAiLoading(false);
    }
  };

  const askAiFollowUp = async () => {
    const question = aiQuestion.trim();
    if (!question || isAiLoading) return;
    const messages = [...aiMessages, { role: "user" as const, text: question }];
    setAiQuestion("");
    setAiMessages(messages);
    await requestAiExplanation(messages);
  };

  const handleAiResponseSelection = () => {
    const text = window.getSelection()?.toString().trim();
    if (!text) return;
    if (showVocabularyForm && isSelectingMeaning) {
      setSelectedMeaning(text);
      return;
    }
    if (showVocabularyForm) {
      setNewVocabularyWord(text);
      return;
    }
    setSelectedText(text);
    setIsSelectionPanelOpen(true);
  };

  const getFilteredUnits = () =>
    selectedFolder
      ? units.filter((u) => u.folder_id === selectedFolder)
      : units;
  const startEditUnit = (unit: UnitType) => {
    setEditingUnit(unit);
    setEditUnitTitle(unit.title);
    setEditUnitFolder(unit.folder_id || "");
    setEditUnitEnglish(unit.lines.map((l) => l.english).join("\n"));
    setEditUnitJapanese(unit.lines.map((l) => l.japanese).join("\n"));
    setEditUnitPhonetic(unit.lines.map((l) => l.phonetic).join("\n"));
    setCurrentView("edit");
  };

  const cancelUnitEdit = () => {
    if (
      hasUnitUnsavedChanges &&
      !window.confirm("変更を保存せずに終了しますか？")
    ) {
      return false;
    }
    setCurrentView("list");
    setEditingUnit(null);
    return true;
  };

  const cancelVocabularyEdit = () => {
    if (
      hasVocabularyUnsavedChanges &&
      !window.confirm("変更を保存せずに終了しますか？")
    ) {
      return false;
    }
    setEditingVocabulary(null);
    setEditVocabularyWord("");
    setEditVocabularyMeaning("");
    return true;
  };

  const startVocabularyEdit = (item: VocabularyType) => {
    if (editingVocabulary?.id !== item.id && !cancelVocabularyEdit()) return;
    setEditingVocabulary(item);
    setEditVocabularyWord(item.word);
    setEditVocabularyMeaning(item.meaning);
    setVocabularyMenuId(null);
  };

  const saveVocabularyEdit = async () => {
    if (!editingVocabulary) return;
    const word = editVocabularyWord.trim();
    const meaning = editVocabularyMeaning.trim();
    if (!word || !meaning) {
      alert("見出し語と意味を入力してください");
      return;
    }

    const { error } = await supabase
      .from("vocabulary")
      .update({ word, meaning })
      .eq("id", editingVocabulary.id);
    if (error) {
      alert(`単語の更新に失敗: ${error.message}`);
      return;
    }

    setVocabulary(
      vocabulary.map((item) =>
        item.id === editingVocabulary.id ? { ...item, word, meaning } : item,
      ),
    );
    setEditingVocabulary(null);
    setEditVocabularyWord("");
    setEditVocabularyMeaning("");
  };

  const deleteVocabulary = async (item: VocabularyType) => {
    if (editingVocabulary?.id !== item.id && !cancelVocabularyEdit()) return;
    if (!window.confirm(`「${item.word}」を削除しますか？`)) return;

    const { error } = await supabase
      .from("vocabulary")
      .delete()
      .eq("id", item.id);
    if (error) {
      alert(`単語の削除に失敗: ${error.message}`);
      return;
    }

    setVocabulary(vocabulary.filter((entry) => entry.id !== item.id));
    if (editingVocabulary?.id === item.id) {
      setEditingVocabulary(null);
      setEditVocabularyWord("");
      setEditVocabularyMeaning("");
    }
    setVocabularyMenuId(null);
  };
  const vocabUnits = vocabFolder
    ? units.filter((u) => u.folder_id === vocabFolder)
    : units;

  const filteredVocabulary = vocabUnit
    ? vocabulary.filter((v) => v.unit_id === vocabUnit)
    : vocabFolder
      ? vocabulary.filter((v) =>
          units.some((u) => u.id === v.unit_id && u.folder_id === vocabFolder),
        )
      : vocabulary;

  const exportVocabularyCsv = () => {
    const escapeCsvValue = (value: string) =>
      `"${value.replace(/"/g, '""')}"`;
    const sanitizeFileName = (value: string) =>
      value.replace(/[\\/:*?"<>|]/g, "_").replace(/[. ]+$/g, "");

    const targetUnits = vocabUnit
      ? units.filter((unit) => unit.id === vocabUnit)
      : vocabFolder
        ? units.filter((unit) => unit.folder_id === vocabFolder)
        : units;

    targetUnits.forEach((unit) => {
      const unitVocabulary = filteredVocabulary.filter(
        (item) => item.unit_id === unit.id,
      );
      if (unitVocabulary.length === 0) return;

      const csvRows = [
        ["単語", "意味"],
        ...unitVocabulary.map((item) => [item.word, item.meaning]),
      ];
      const csv = csvRows
        .map((row) => row.map(escapeCsvValue).join(","))
        .join("\r\n");
      const folderName =
        folders.find((folder) => folder.id === unit.folder_id)?.name ??
        "フォルダなし";
      const fileName = `${sanitizeFileName(folderName)}_${sanitizeFileName(unit.title)}.csv`;
      const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");

      link.href = url;
      link.download = fileName;
      link.click();
      URL.revokeObjectURL(url);
    });
  };

  const saveEditUnit = async () => {
    if (!editingUnit) return;
    const parsed = parseMultilineInput(
      editUnitEnglish,
      editUnitJapanese,
      editUnitPhonetic,
    );
    const updatedUnit = {
      ...editingUnit,
      title: editUnitTitle.trim() || "無題",
      folder_id: editUnitFolder || null,
      lines: parsed,
    };
    await supabase.from("units").update(updatedUnit).eq("id", editingUnit.id);
    setUnits(units.map((u) => (u.id === editingUnit.id ? updatedUnit : u)));
    setCurrentView("list");
    setEditingUnit(null);
  };

  // === ここからUI部分 ===
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold text-gray-800 flex items-center gap-3">
            <BookOpen size={36} className="text-blue-600" />
            長文学習
          </h1>

          <nav className="flex gap-2">
            <button
              onClick={() => {
                if (currentView === "reader") {
                  window.history.back();
                  return;
                }
                if (currentView === "edit" && !cancelUnitEdit()) return;
                if (currentView === "vocabulary" && !cancelVocabularyEdit()) {
                  return;
                }
                setCurrentView("list");
              }}
              className={`px-4 py-2 rounded-lg ${
                currentView === "list"
                  ? "bg-blue-600 text-white"
                  : "bg-white text-gray-700 hover:bg-gray-50"
              }`}
            >
              ユニット一覧
            </button>
            <button
              onClick={() => {
                if (currentView === "edit" && !cancelUnitEdit()) return;
                setCurrentView("vocabulary");
              }}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg ${
                currentView === "vocabulary"
                  ? "bg-blue-600 text-white"
                  : "bg-white text-gray-700 hover:bg-gray-50"
              }`}
            >
              <List size={20} />
              単語帳
            </button>
          </nav>
        </div>

        {/* === ユニット一覧 === */}
        {currentView === "list" && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-bold text-gray-800">
                学習ユニット一覧
              </h2>
              <button
                onClick={() => setCurrentView("add")}
                className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
              >
                <Plus size={20} />
                新規ユニット追加
              </button>
            </div>
            <div className="grid gap-4 md:grid-cols-[240px_minmax(0,1fr)] items-start">
              <aside className="bg-white p-3 rounded-lg shadow-md md:sticky md:top-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-gray-700 flex items-center gap-2">
                    <Folder size={20} />
                    フォルダー
                  </h3>
                  <button
                    onClick={() => setShowFolderInput(!showFolderInput)}
                    className="text-blue-600 hover:text-blue-800"
                    aria-label="新規フォルダー"
                  >
                    <FolderPlus size={18} />
                  </button>
                </div>

                {showFolderInput && (
                  <div className="flex gap-2 mb-3">
                    <input
                      type="text"
                      value={newFolderName}
                      onChange={(e) => setNewFolderName(e.target.value)}
                      placeholder="フォルダー名"
                      className="min-w-0 flex-1 px-2 py-1.5 border border-gray-300 rounded text-sm"
                    />
                    <button
                      onClick={addFolder}
                      className="bg-blue-600 text-white px-2 py-1.5 rounded hover:bg-blue-700 text-sm"
                    >
                      追加
                    </button>
                  </div>
                )}

                <div className="space-y-1">
                  <button
                    onClick={() => setSelectedFolder(null)}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded text-sm ${
                      selectedFolder === null
                        ? "bg-blue-100 text-blue-800 font-medium"
                        : "text-gray-700 hover:bg-gray-100"
                    }`}
                  >
                    <span>すべて</span>
                    <span className="text-xs opacity-70">{units.length}</span>
                  </button>
                  {folders.map((folder) => (
                    <div
                      key={folder.id}
                      className="relative flex items-center"
                      onContextMenu={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        setFolderMenuId(folder.id);
                      }}
                    >
                      <button
                        onClick={() => setSelectedFolder(folder.id)}
                        className={`min-w-0 flex-1 flex items-center justify-between gap-2 px-3 py-2 rounded text-sm ${
                          selectedFolder === folder.id
                            ? "bg-blue-100 text-blue-800 font-medium"
                            : "text-gray-700 hover:bg-gray-100"
                        }`}
                      >
                        <span className="truncate">{folder.name}</span>
                        <span className="text-xs opacity-70">
                          {units.filter((u) => u.folder_id === folder.id).length}
                        </span>
                      </button>
                      <button
                        onClick={(event) => {
                          event.stopPropagation();
                          setFolderMenuId(
                            folderMenuId === folder.id ? null : folder.id,
                          );
                        }}
                        className="p-1 text-gray-500 hover:text-gray-800"
                        aria-label={`${folder.name}のメニュー`}
                      >
                        <MoreVertical size={16} />
                      </button>

                      {folderMenuId === folder.id && (
                        <div
                          className="absolute right-0 top-full z-20 w-32 rounded-md border border-gray-200 bg-white py-1 shadow-lg"
                          onClick={(event) => event.stopPropagation()}
                        >
                          <button
                            onClick={() => renameFolder(folder)}
                            className="block w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-100"
                          >
                            名前を変更
                          </button>
                          <button
                            onClick={() => {
                              if (
                                window.confirm(
                                  `「${folder.name}」を削除しますか？`,
                                )
                              ) {
                                void deleteFolder(folder.id);
                              }
                            }}
                            className="block w-full px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50"
                          >
                            削除
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </aside>

              <main>
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
                            {folders.find((f) => f.id === unit.folder_id)?.name}
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
                          onClick={() => {
                            window.history.pushState(
                              { readingUnitId: unit.id },
                              "",
                              `?unit=${encodeURIComponent(unit.id)}`,
                            );
                            setSelectedUnit(unit);
                            setShowAllJapanese(false);
                            setShowAllPhonetic(false);
                            setCurrentView("reader");
                          }}
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
              </main>
            </div>
          </div>
        )}

        {/* === ユニット追加 === */}
        {currentView === "add" && (
          <div className="max-w-4xl mx-auto">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-gray-800">
                新規ユニット追加
              </h2>
              <button
                onClick={() => setCurrentView("list")}
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
                  <div className="mt-2 flex justify-end">
                    <button
                      type="button"
                      onClick={() =>
                        generateUnitField(
                          "translation",
                          newUnitEnglish,
                          newUnitJapanese,
                          setNewUnitJapanese,
                        )
                      }
                      disabled={generatingUnitField !== null}
                      className="rounded-lg border border-blue-600 px-3 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {generatingUnitField === "translation"
                        ? "生成中..."
                        : "AIで生成"}
                    </button>
                  </div>
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
                  <div className="mt-2 flex justify-end">
                    <button
                      type="button"
                      onClick={() =>
                        generateUnitField(
                          "phonetic",
                          newUnitEnglish,
                          newUnitPhonetic,
                          setNewUnitPhonetic,
                        )
                      }
                      disabled={generatingUnitField !== null}
                      className="rounded-lg border border-blue-600 px-3 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {generatingUnitField === "phonetic"
                        ? "生成中..."
                        : "AIで生成"}
                    </button>
                  </div>
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
        {currentView === "edit" && editingUnit && (
          <div className="max-w-4xl mx-auto">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-gray-800">ユニット編集</h2>
              <button
                onClick={cancelUnitEdit}
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
                  <div className="mt-2 flex justify-end">
                    <button
                      type="button"
                      onClick={() =>
                        generateUnitField(
                          "translation",
                          editUnitEnglish,
                          editUnitJapanese,
                          setEditUnitJapanese,
                        )
                      }
                      disabled={generatingUnitField !== null}
                      className="rounded-lg border border-blue-600 px-3 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {generatingUnitField === "translation"
                        ? "生成中..."
                        : "AIで生成"}
                    </button>
                  </div>
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
                  <div className="mt-2 flex justify-end">
                    <button
                      type="button"
                      onClick={() =>
                        generateUnitField(
                          "phonetic",
                          editUnitEnglish,
                          editUnitPhonetic,
                          setEditUnitPhonetic,
                        )
                      }
                      disabled={generatingUnitField !== null}
                      className="rounded-lg border border-blue-600 px-3 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {generatingUnitField === "phonetic"
                        ? "生成中..."
                        : "AIで生成"}
                    </button>
                  </div>
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
                  onClick={cancelUnitEdit}
                  className="px-6 py-3 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  キャンセル
                </button>
              </div>
              <div className="flex justify-end mt-6">
                <button
                  onClick={async () => {
                    if (!editingUnit) return;
                    const ok = window.confirm(
                      `「${editingUnit.title}」を本当に削除しますか？`,
                    );
                    if (!ok) return;

                    await supabase
                      .from("units")
                      .delete()
                      .eq("id", editingUnit.id);
                    setUnits(units.filter((u) => u.id !== editingUnit.id));
                    setEditingUnit(null);
                    setCurrentView("list");
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
        {currentView === "reader" && (
          <div className="max-w-4xl mx-auto pb-20">
            <div className="bg-white p-4 rounded-lg shadow-md space-y-3">
              {selectedUnit?.lines.map((line) => {
                const englishWords = line.english.trim().split(/\s+/);
                const phoneticWords = line.phonetic.includes("|")
                  ? line.phonetic.split(/\s*\|\s*/)
                  : line.phonetic.trim().split(/\s+/);
                const canAlignPhonetic =
                  line.showPhonetic &&
                  line.phonetic &&
                  englishWords.length === phoneticWords.length;

                return (
                  <div
                    key={line.id}
                    className="border-b border-gray-200 pb-3 last:border-0"
                    onClick={() => {
                      if (window.getSelection()?.toString().trim()) return;
                      if (!selectedUnit) return;

                      const shouldShowBoth = !(
                        line.showJapanese && line.showPhonetic
                      );
                      setSelectedUnit({
                        ...selectedUnit,
                        lines: selectedUnit.lines.map((item) =>
                          item.id === line.id
                            ? {
                                ...item,
                                showJapanese: shouldShowBoth,
                                showPhonetic: shouldShowBoth,
                              }
                            : item,
                        ),
                      });
                    }}
                  >
                    <div
                      className="select-text cursor-text"
                      onMouseUp={() => handleTextSelection(line.id)}
                    >
                      {line.showPhonetic && line.phonetic && !canAlignPhonetic && (
                        <div className="mb-1 text-sm leading-snug text-gray-500">
                          {line.phonetic}
                        </div>
                      )}
                      {canAlignPhonetic ? (
                        <div className="flex flex-wrap items-end gap-x-2 gap-y-0.5 pt-1 text-lg leading-tight">
                          {englishWords.map((word, index) => (
                            <ruby
                              key={`${line.id}-${index}`}
                              className="leading-tight"
                            >
                              {word}
                              <rt className="text-sm font-normal leading-none text-gray-500">
                                {phoneticWords[index]}
                              </rt>
                            </ruby>
                          ))}
                        </div>
                      ) : (
                        <div className="text-lg leading-snug">{line.english}</div>
                      )}
                    </div>

                    {line.showJapanese && line.japanese && (
                      <div
                        className="mt-1 p-2 bg-blue-50 rounded text-gray-700 text-sm"
                        onMouseUp={() => handleTextSelection(line.id)}
                      >
                        {line.japanese}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div
              className={
                isSelectionPanelOpen
                  ? "fixed bottom-0 left-0 right-0 bg-white border-t-2 border-gray-300 shadow-lg p-4 pr-24"
                  : "contents"
              }
            >
              <div className="max-w-4xl mx-auto">
                {isSelectionPanelOpen && (
                  <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 rounded mb-3">
                    <h3 className="font-semibold text-gray-800 mb-2">
                      {selectedText
                        ? `「${selectedText}」を選択中`
                        : "単語・表現を選択してください"}
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {selectedText && !showVocabularyForm && (
                        <button
                          onClick={() => {
                            setNewVocabularyWord(selectedText);
                            setShowVocabularyForm(true);
                          }}
                          className="bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700"
                        >
                          単語帳に追加
                        </button>
                      )}
                      {selectedText && !hasStartedAi && (
                        <button
                          onClick={() => {
                            const subject = selectedText.trim();
                            const lineId = selectedLineId;
                            setHasStartedAi(true);
                            setAiSubject(subject);
                            setAiLineId(lineId);
                            setAiMessages([]);
                            void requestAiExplanation([], subject, lineId);
                          }}
                          disabled={
                            isAiLoading ||
                            selectedLineId === null ||
                            !selectedText.trim()
                          }
                          className="bg-purple-600 text-white px-4 py-2 rounded text-sm hover:bg-purple-700 disabled:bg-gray-400"
                        >
                          AI解説
                        </button>
                      )}
                      {hasStartedAi && aiError && aiMessages.length === 0 && (
                        <button
                          onClick={() => void requestAiExplanation([])}
                          disabled={isAiLoading}
                          className="bg-purple-600 text-white px-4 py-2 rounded text-sm hover:bg-purple-700 disabled:bg-gray-400"
                        >
                          再試行
                        </button>
                      )}
                      <button
                        onClick={() => {
                          setSelectedText("");
                          setIsSelectionPanelOpen(false);
                          setNewVocabularyWord("");
                          setSelectedMeaning("");
                          setIsSelectingMeaning(false);
                          setSelectedLineId(null);
                          setShowVocabularyForm(false);
                          setHasStartedAi(false);
                          setAiSubject("");
                          setAiLineId(null);
                          setAiMessages([]);
                          setAiQuestion("");
                          setAiError("");
                        }}
                        className="text-sm text-gray-600 hover:text-gray-800 px-3 py-2 border border-gray-300 rounded"
                        aria-label="選択を閉じる"
                      >
                        <X size={16} />
                      </button>
                    </div>

                    {showVocabularyForm && (
                      <div className="mt-3 rounded border border-yellow-200 bg-white/70 p-3">
                        <label className="block text-sm text-gray-700 mb-2">
                          <span className="block font-medium mb-1">見出し語</span>
                          <input
                            type="text"
                            value={newVocabularyWord}
                            onChange={(event) =>
                              setNewVocabularyWord(event.target.value)
                            }
                            className="w-full rounded border border-yellow-300 bg-white px-3 py-2"
                          />
                        </label>
                        {isSelectingMeaning && (
                          <label className="block text-sm text-gray-700 mb-2">
                            <span className="block font-medium mb-1">意味</span>
                            <input
                              type="text"
                              value={selectedMeaning}
                              onChange={(event) =>
                                setSelectedMeaning(event.target.value)
                              }
                              className="w-full rounded border border-blue-300 bg-white px-3 py-2"
                              placeholder="和訳を選択するか入力してください"
                            />
                          </label>
                        )}
                        {!isSelectingMeaning && (
                          <p className="text-sm text-gray-600 mb-3">
                            意味となる日本語を次に選択してください
                          </p>
                        )}
                        <button
                          onClick={async () => {
                            if (!isSelectingMeaning) {
                              setIsSelectingMeaning(true);
                              return;
                            }
                            const word = newVocabularyWord.trim();
                            const meaning = selectedMeaning.trim();
                            if (!word || !meaning) {
                              alert("見出し語と意味を入力してください");
                              return;
                            }

                            const currentUnit = selectedUnit;
                            if (!currentUnit) return;
                            const newVocab = {
                              word,
                              meaning,
                              unit_id: currentUnit.id,
                              unit_title: currentUnit.title,
                            };

                            const { data, error } = await supabase
                              .from("vocabulary")
                              .insert([newVocab])
                              .select();
                            if (error) {
                              alert(`単語の追加に失敗: ${error.message}`);
                              return;
                            }
                            if (data) {
                              setVocabulary([...vocabulary, data[0]]);
                              setShowToast(true);
                              setTimeout(() => setShowToast(false), 2000);
                            }

                            setNewVocabularyWord("");
                            setSelectedMeaning("");
                            setIsSelectingMeaning(false);
                            setShowVocabularyForm(false);
                            setSelectedText("");
                            setSelectedLineId(null);
                          }}
                          disabled={
                            isSelectingMeaning &&
                            (!newVocabularyWord.trim() ||
                              !selectedMeaning.trim())
                          }
                          className="bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700 disabled:bg-gray-400"
                        >
                          {isSelectingMeaning
                            ? "単語帳に登録"
                            : "次へ（意味を選択）"}
                        </button>
                      </div>
                    )}

                    {aiError && (
                      <div className="mt-3 rounded bg-red-50 p-3 text-sm text-red-700">
                        {aiError}
                      </div>
                    )}

                    {hasStartedAi &&
                      isAiLoading &&
                      aiMessages.length === 0 && (
                        <p className="mt-3 text-sm text-purple-700">解説中...</p>
                      )}

                    {aiMessages.length > 0 && (
                      <div className="mt-4 space-y-3 border-t border-yellow-200 pt-4">
                        <h4 className="font-semibold text-gray-800">AI解説</h4>
                        <div className="max-h-[32vh] space-y-3 overflow-y-auto pr-1 md:max-h-[40vh]">
                          {aiMessages.map((message, index) => (
                          <div
                            key={`${message.role}-${index}`}
                            className={`rounded p-3 text-sm leading-relaxed ${
                              message.role === "user"
                                ? "ml-8 whitespace-pre-wrap bg-gray-100 text-gray-700"
                                : "bg-purple-50 text-gray-800 select-text"
                            }`}
                            onMouseUp={
                              message.role === "model"
                                ? handleAiResponseSelection
                                : undefined
                            }
                          >
                            {message.role === "model" ? (
                              <ReactMarkdown
                                components={{
                                  h1: ({ children }) => (
                                    <h1 className="mb-2 mt-4 text-xl font-bold first:mt-0">
                                      {children}
                                    </h1>
                                  ),
                                  h2: ({ children }) => (
                                    <h2 className="mb-2 mt-4 text-lg font-bold first:mt-0">
                                      {children}
                                    </h2>
                                  ),
                                  h3: ({ children }) => (
                                    <h3 className="mb-1.5 mt-3 font-bold first:mt-0">
                                      {children}
                                    </h3>
                                  ),
                                  p: ({ children }) => (
                                    <p className="mb-2 last:mb-0">{children}</p>
                                  ),
                                  ul: ({ children }) => (
                                    <ul className="mb-2 list-disc space-y-1 pl-5">
                                      {children}
                                    </ul>
                                  ),
                                  ol: ({ children }) => (
                                    <ol className="mb-2 list-decimal space-y-1 pl-5">
                                      {children}
                                    </ol>
                                  ),
                                  strong: ({ children }) => (
                                    <strong className="font-bold text-gray-900">
                                      {children}
                                    </strong>
                                  ),
                                  blockquote: ({ children }) => (
                                    <blockquote className="my-2 border-l-4 border-purple-300 pl-3 text-gray-600">
                                      {children}
                                    </blockquote>
                                  ),
                                }}
                              >
                                {message.text}
                              </ReactMarkdown>
                            ) : (
                              message.text
                            )}
                          </div>
                          ))}

                          {isAiLoading && (
                            <p className="text-sm text-purple-700">回答中...</p>
                          )}
                        </div>

                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={aiQuestion}
                            onChange={(event) =>
                              setAiQuestion(event.target.value)
                            }
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                event.preventDefault();
                                void askAiFollowUp();
                              }
                            }}
                            placeholder="さらに質問する"
                            className="min-w-0 flex-1 rounded border border-gray-300 bg-white px-3 py-2 text-sm"
                          />
                          <button
                            onClick={() => void askAiFollowUp()}
                            disabled={!aiQuestion.trim() || isAiLoading}
                            className="rounded bg-purple-600 px-4 py-2 text-sm text-white hover:bg-purple-700 disabled:bg-gray-400"
                          >
                            質問
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
              {/* === 訳・発音の表示切り替えボタン === */}
              <div className="fixed right-3 bottom-3 z-50 flex flex-col gap-2">
                <button
                  onClick={() => {
                    if (!selectedUnit) return;
                    const nextShowAllJapanese = !showAllJapanese;

                    const updatedUnit = {
                      ...selectedUnit,
                      lines: selectedUnit.lines.map((l) => ({
                        ...l,
                        showJapanese: nextShowAllJapanese,
                      })),
                    };

                    setSelectedUnit(updatedUnit);
                    setShowAllJapanese(nextShowAllJapanese);
                  }}
                  className={`flex items-center gap-1 bg-blue-600 text-white px-3 py-2 rounded-lg shadow-md hover:bg-blue-700 text-sm ${
                    showAllJapanese ? "opacity-100" : "opacity-50"
                  }`}
                >
                  <Eye size={16} />
                  訳
                </button>

                <button
                  onClick={() => {
                    if (!selectedUnit) return;
                    const nextShowAllPhonetic = !showAllPhonetic;

                    const updatedUnit = {
                      ...selectedUnit,
                      lines: selectedUnit.lines.map((l) => ({
                        ...l,
                        showPhonetic: nextShowAllPhonetic,
                      })),
                    };

                    setSelectedUnit(updatedUnit);
                    setShowAllPhonetic(nextShowAllPhonetic);
                  }}
                  className={`flex items-center gap-1 bg-green-600 text-white px-3 py-2 rounded-lg shadow-md hover:bg-green-700 text-sm ${
                    showAllPhonetic ? "opacity-100" : "opacity-50"
                  }`}
                >
                  <EyeOff size={16} />
                  発音
                </button>
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
        {currentView === "vocabulary" &&
          (flashcardMode ? (
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
                          ?filteredVocabulary[currentCardIndex].word
                          : filteredVocabulary[currentCardIndex].meaning}
                      </p>
                    ) : (
                      <div>
                        <p className="text-2xl font-bold mb-2">
                          {flashcardShowWord
                            ? filteredVocabulary[currentCardIndex].word
                            : filteredVocabulary[currentCardIndex].meaning}
                        </p>
                        <p className="text-lg text-gray-600">
                          {flashcardShowWord
                            ? filteredVocabulary[currentCardIndex].meaning
                            : filteredVocabulary[currentCardIndex].word}
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
                        flashcardShowWord
                          ? "bg-blue-600 text-white"
                          : "bg-gray-200"
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
                        !flashcardShowWord
                          ? "bg-blue-600 text-white"
                          : "bg-gray-200"
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
                      {showAnswer ? "問題を表示" : "答えを表示"}
                    </button>
                    <button
                      onClick={() => {
                        if (currentCardIndex < filteredVocabulary.length - 1) {
                          setCurrentCardIndex(currentCardIndex + 1);
                          setShowAnswer(false);
                        }
                      }}
                      disabled={currentCardIndex === filteredVocabulary.length - 1}
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
                <div className="flex gap-2">
                  <button
                    onClick={exportVocabularyCsv}
                    disabled={filteredVocabulary.length === 0}
                    className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded disabled:bg-gray-300"
                  >
                    <Save size={18} />
                    CSV出力
                  </button>
                  <button
                    onClick={() => {
                      if (!cancelVocabularyEdit()) return;
                      if (filteredVocabulary.length > 0) {
                        setFlashcardMode(true);
                        setCurrentCardIndex(0);
                        setShowAnswer(false);
                      }
                    }}
                    disabled={filteredVocabulary.length === 0}
                    className="bg-purple-600 text-white px-4 py-2 rounded disabled:bg-gray-300"
                  >
                    フラッシュカード
                  </button>
                </div>
              </div>
              <div className="flex gap-3 mb-4">
                <select
                  value={vocabFolder}
                  onChange={(e) => {
                    if (!cancelVocabularyEdit()) return;
                     setVocabFolder(e.target.value);
                    setVocabUnit("");
                  }}
                   className="px-3 py-2 border border-gray-300 rounded-lg"
                >
                  <option value="">すべてのフォルダー</option>
                  {folders.map((folder) => (
                    <option key={folder.id} value={folder.id}>
                      {folder.name}
                    </option>
                  ))}
                 </select>

                 <select
                  value={vocabUnit}
                  onChange={(e) => {
                    if (!cancelVocabularyEdit()) return;
                    setVocabUnit(e.target.value);
                  }}
                  className="px-3 py-2 border border-gray-300 rounded-lg"
                 >
                  <option value="">すべてのユニット</option>
                  {vocabUnits.map((unit) => (
                    <option key={unit.id} value={unit.id}>
                       {unit.title}
                    </option>
                  ))}
                </select>
              </div>
              <div className="bg-white rounded shadow">
                {filteredVocabulary.length === 0 ? (
                  <div className="text-center py-10 text-gray-500">
                    <p>単語がありません</p>
                  </div>
                ) : (
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b">
                      <tr>
                        <th className="px-4 py-2 text-left text-sm font-medium text-gray-600">
                          単語
                        </th>
                        <th className="px-4 py-2 text-left text-sm font-medium text-gray-600">
                          意味
                        </th>
                        <th className="px-4 py-2 text-left text-sm font-medium text-gray-600">
                          ユニット
                        </th>
                        <th className="px-4 py-2"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredVocabulary.map((v) => (
                        <tr
                          key={v.id}
                          className="border-b"
                          onContextMenu={(event) => {
                            if (editingVocabulary?.id === v.id) return;
                            event.preventDefault();
                            event.stopPropagation();
                            setVocabularyMenuId(v.id);
                          }}
                        >
                          <td className="px-4 py-2">
                            {editingVocabulary?.id === v.id ? (
                              <input
                                type="text"
                                value={editVocabularyWord}
                                onChange={(event) =>
                                  setEditVocabularyWord(event.target.value)
                                }
                                className="w-full rounded border border-gray-300 px-2 py-1"
                              />
                            ) : (
                              v.word
                            )}
                          </td>
                          <td className="px-4 py-2">
                            {editingVocabulary?.id === v.id ? (
                              <input
                                type="text"
                                value={editVocabularyMeaning}
                                onChange={(event) =>
                                  setEditVocabularyMeaning(event.target.value)
                                }
                                className="w-full rounded border border-gray-300 px-2 py-1"
                              />
                            ) : (
                              v.meaning
                            )}
                          </td>
                          <td className="px-4 py-2">{v.unit_title}</td>
                          <td className="relative px-4 py-2 text-right">
                            {editingVocabulary?.id === v.id ? (
                              <div className="flex justify-end gap-2">
                                <button
                                  onClick={saveVocabularyEdit}
                                  className="rounded bg-blue-600 px-3 py-1 text-sm text-white hover:bg-blue-700"
                                >
                                  保存
                                </button>
                                <button
                                  onClick={cancelVocabularyEdit}
                                  className="rounded border border-gray-300 px-3 py-1 text-sm hover:bg-gray-50"
                                >
                                  キャンセル
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setVocabularyMenuId(
                                    vocabularyMenuId === v.id ? null : v.id,
                                  );
                                }}
                                className="p-1 text-gray-500 hover:text-gray-800"
                                aria-label={`${v.word}のメニュー`}
                              >
                                <MoreVertical size={18} />
                              </button>
                            )}

                            {vocabularyMenuId === v.id && (
                              <div
                                className="absolute right-3 top-full z-20 w-28 rounded-md border border-gray-200 bg-white py-1 text-left shadow-lg"
                                onClick={(event) => event.stopPropagation()}
                              >
                                <button
                                  onClick={() => startVocabularyEdit(v)}
                                  className="block w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-100"
                                >
                                  編集
                                </button>
                                <button
                                  onClick={() => void deleteVocabulary(v)}
                                  className="block w-full px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50"
                                >
                                  削除
                                </button>
                              </div>
                            )}
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
}
