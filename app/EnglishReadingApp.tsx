"use client";

import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import ReactMarkdown from "react-markdown";
import TimingEditor from "./TimingEditor";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CornerDownLeft,
  CornerUpRight,
  Pause,
  Play,
  Repeat1,
  Plus,
  List,
  X,
  Eye,
  EyeOff,
  Folder,
  FolderPlus,
  MoreVertical,
  Save,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import {
  convertMfaAlignment,
  inspectAlignmentTiming,
  type TimedLine,
  type UnitAlignment,
} from "@/lib/mfaAlignment";
import {
  isPronounceableSegment,
  segmentPronunciationLine,
} from "@/lib/pronunciationSegments";

// === 型定義 ==============================
type FolderType = {
  id: string;
  name: string;
  parent_id: string | null;
  created_at?: string;
};

type DraggedLibraryItem = {
  type: "folder" | "unit";
  id: string;
};

type LibraryItemRef = {
  type: "folder" | "unit";
  id: string;
};

type LibraryContextMenu = LibraryItemRef & {
  x: number;
  y: number;
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
  audio_path?: string | null;
  audio_name?: string | null;
  alignment_path?: string | null;
  alignment_name?: string | null;
  alignment_data?: UnitAlignment | null;
  alignment_edits?: UnitAlignment | null;
  updated_at?: string | null;
};

type LocalUnitMedia = {
  audioName: string;
  audioUrl: string;
  alignmentName: string;
  alignment: UnitAlignment | null;
};

const UNIT_MEDIA_BUCKET = "unit-media";

const MediaFields = ({ audioName, audioUrl, alignmentName, alignment, error,
  uploadAudio, onUploadAudio, onAudio, onAlignment, onRemoveAudio, onRemoveAlignment,
  duration, onDuration,
}: {
  audioName: string; audioUrl: string; alignmentName: string;
  alignment: UnitAlignment | null; error: string;
  uploadAudio: boolean; onUploadAudio?: (value: boolean) => void;
  onAudio: (file: File | null) => void;
  onAlignment: (file: File | null) => void;
  onRemoveAudio: () => void; onRemoveAlignment: () => void;
  duration?: number; onDuration: (value: number | undefined) => void;
}) => {
  const warnings = alignment ? inspectAlignmentTiming(alignment, duration) : [];
  return <div className="space-y-1.5 rounded-lg border border-gray-200 p-2.5">
    <h3 className="text-xs font-semibold text-gray-700">音声同期</h3>
    {audioUrl && <audio key={audioUrl} src={audioUrl} preload="metadata"
      onLoadedMetadata={(event) => onDuration(event.currentTarget.duration)}
      onError={() => onDuration(undefined)} />}
    {(["audio", "json"] as const).map((kind) => {
      const name = kind === "audio" ? audioName : alignmentName;
      return <div key={kind} className="flex min-w-0 items-center gap-2 text-xs">
        <span className="w-14 shrink-0 text-gray-500">{kind === "audio" ? "音声" : "JSON"}</span>
        <label className="shrink-0 cursor-pointer rounded border border-gray-200 px-2 py-1 text-gray-600 hover:bg-gray-50">
          選択
          <input type="file" className="sr-only"
            accept={kind === "audio" ? "audio/*,.mp3,.wav,.m4a,.flac,.ogg" : "application/json,.json"}
            onChange={(event) => {
              const file = event.target.files?.[0] ?? null;
              if (kind === "audio") { onDuration(undefined); onAudio(file); }
              else onAlignment(file);
              event.target.value = "";
            }} />
        </label>
        <span className="min-w-0 flex-1 truncate text-gray-600" title={name}>{name || "未選択"}</span>
        {name && <button type="button" className="shrink-0 text-red-500 hover:text-red-700"
          onClick={kind === "audio" ? onRemoveAudio : onRemoveAlignment}>削除</button>}
      </div>;
    })}
    {onUploadAudio && audioName && <label className="flex items-center gap-2 text-xs text-gray-600">
      <input type="checkbox" checked={uploadAudio} onChange={(event) => onUploadAudio(event.target.checked)} />音声をクラウドに保存
    </label>}
    {alignment && <p className="text-xs text-gray-500">
      {alignment.review.matchedWords}/{alignment.review.totalScriptWords}語を対応付け
      {(alignment.review.unmatchedScriptWords.length > 0 || alignment.review.unusedMfaWords.length > 0) &&
        `（未対応: 原文${alignment.review.unmatchedScriptWords.length}語／JSON${alignment.review.unusedMfaWords.length}語）`}
    </p>}
    {warnings.length > 0 && <div className="space-y-1 text-xs text-amber-700">
      {warnings.map((warning) => <p key={warning}>{warning}</p>)}
      <p>文字の対応数は、音声との同期精度を保証するものではありません。</p>
    </div>}
    {error && <p className="text-xs text-red-600">{error}</p>}
  </div>;
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

type AiChatSession = {
  id: string;
  subject: string;
  lineId: number;
  messages: AiMessage[];
  isLoading: boolean;
  error: string;
};

type DictionaryEntry = {
  word: string;
  headword: string;
  phonetic: string;
  definitions: {
    partOfSpeech: string;
    definition: string;
  }[];
  example: string;
};

type PhoneticReviewIssue = {
  lineIndex: number;
  expectedCount: number;
  tokens: string[];
};

type PhoneticEditorProps = {
  source: string;
  value: string;
  issues: PhoneticReviewIssue[];
  onSourceChange?: (value: string) => void;
  onChange: (value: string) => void;
  onIssuesChange: (issues: PhoneticReviewIssue[]) => void;
};

const PhoneticEditor = ({
  source,
  value,
  issues,
  onSourceChange,
  onChange,
  onIssuesChange,
}: PhoneticEditorProps) => {
  const [isEditingSource, setIsEditingSource] = useState(!source.trim());
  const [editingPhonetic, setEditingPhonetic] = useState<{
    lineIndex: number;
    tokenIndex: number;
    mode: "segments" | "legacy";
  } | null>(null);
  const [phoneticDraft, setPhoneticDraft] = useState("");
  const sourceLines = source.split("\n");
  const phoneticLines = value.split("\n");

  const commitPhoneticDraft = () => {
    if (!editingPhonetic) return;
    const nextLines = [...phoneticLines];
    while (nextLines.length < sourceLines.length) nextLines.push("");
    const currentLine = nextLines[editingPhonetic.lineIndex] ?? "";
    const tokens =
      editingPhonetic.mode === "segments"
        ? currentLine.split(/\s*\|\s*/)
        : currentLine.trim().split(/\s+/);
    tokens[editingPhonetic.tokenIndex] = phoneticDraft.trim();
    nextLines[editingPhonetic.lineIndex] =
      editingPhonetic.mode === "segments"
        ? tokens.join(" | ")
        : tokens.join(" ");
    onChange(nextLines.join("\n"));
    setEditingPhonetic(null);
  };

  const updateIssue = (issue: PhoneticReviewIssue, tokens: string[]) => {
    onIssuesChange(
      issues.map((item) =>
        item.lineIndex === issue.lineIndex ? { ...item, tokens } : item,
      ),
    );
    const segments = segmentPronunciationLine(sourceLines[issue.lineIndex] ?? "");
    let tokenIndex = 0;
    const phoneticLine = segments
      .filter((segment) => !segment.isWhitespace)
      .map((segment) =>
        isPronounceableSegment(segment)
          ? (tokens[tokenIndex++] ?? "").trim()
          : "",
      )
      .join(" | ");
    const nextLines = [...phoneticLines];
    while (nextLines.length < sourceLines.length) nextLines.push("");
    nextLines[issue.lineIndex] = phoneticLine;
    onChange(nextLines.join("\n"));
  };

  return (
    <div className="space-y-2 rounded-lg border border-gray-200 bg-gray-50 p-3">
      {onSourceChange && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 pb-2">
          <span className="text-xs text-gray-500">
            {isEditingSource
              ? "原文を編集しています"
              : "原文を編集するには「全文を編集」を押してください"}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setIsEditingSource((current) => !current)}
              className="rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 hover:bg-gray-100"
            >
              {isEditingSource ? "プレビュー" : "全文を編集"}
            </button>
            <button
              type="button"
              onClick={() => {
                if (!source.trim()) return;
                if (!window.confirm("原文をすべて削除しますか？")) return;
                onSourceChange("");
                onChange("");
                onIssuesChange([]);
                setIsEditingSource(true);
              }}
              disabled={!source.trim()}
              className="rounded border border-red-200 bg-white px-2 py-1 text-xs text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              全文を削除
            </button>
          </div>
        </div>
      )}
      {isEditingSource && onSourceChange ? (
        <textarea
          value={source}
          onChange={(event) => onSourceChange(event.target.value)}
          placeholder="英文を行ごとに入力、または全文を貼り付けてください"
          className="h-64 w-full resize-y rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm leading-relaxed focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
        />
      ) : (
        <div className="max-h-72 overflow-y-auto pr-1">
          {source.trim() ? (
            sourceLines.map((line, lineIndex) => {
        if (!line.trim()) return null;
        const segments = segmentPronunciationLine(line);
        const displaySegments = segments.filter(
          (segment) => !segment.isWhitespace,
        );
        const issue = issues.find((item) => item.lineIndex === lineIndex);
        const phoneticLine = phoneticLines[lineIndex] ?? "";
        const phoneticTokens = phoneticLine.includes("|")
          ? phoneticLine.split(/\s*\|\s*/)
          : [];
        const legacyEnglishWords = line.trim().split(/\s+/);
        const legacyPhoneticWords = phoneticLine.trim().split(/\s+/);
        const canAlignLegacy =
          !phoneticLine.includes("|") &&
          Boolean(phoneticLine.trim()) &&
          legacyEnglishWords.length === legacyPhoneticWords.length;

        if (issue) {
          let pronounceableIndex = 0;
          return (
            <div
              key={`phonetic-review-${lineIndex}`}
              className="rounded-lg border border-amber-300 bg-amber-50 p-3"
            >
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs text-amber-800">
                <span className="font-medium">
                  要確認：原文 {issue.expectedCount}枠／IPA {issue.tokens.length}個
                </span>
                <button
                  type="button"
                  onClick={() =>
                    onIssuesChange(
                      issues.filter((item) => item.lineIndex !== lineIndex),
                    )
                  }
                  className="rounded border border-amber-400 bg-white px-2 py-1 hover:bg-amber-100"
                >
                  確認済み
                </button>
              </div>
              <div className="flex flex-wrap items-end gap-x-2 gap-y-3">
                {displaySegments.map((segment, segmentIndex) => {
                  if (!isPronounceableSegment(segment)) {
                    return (
                      <span key={`punctuation-${segmentIndex}`}>
                        {segment.text}
                      </span>
                    );
                  }
                  const tokenIndex = pronounceableIndex++;
                  return (
                    <label
                      key={`phonetic-input-${segmentIndex}`}
                      className="flex max-w-36 flex-col items-center gap-1"
                    >
                      <input
                        type="text"
                        value={issue.tokens[tokenIndex] ?? ""}
                        onChange={(event) => {
                          const nextTokens = [...issue.tokens];
                          while (nextTokens.length < issue.expectedCount) {
                            nextTokens.push("");
                          }
                          nextTokens[tokenIndex] = event.target.value;
                          updateIssue(issue, nextTokens);
                        }}
                        aria-label={`${segment.text}の発音記号`}
                        className="w-full min-w-20 rounded border border-amber-300 bg-white px-1.5 py-1 text-center text-xs text-gray-600"
                      />
                      <span className="whitespace-nowrap text-base text-gray-900">
                        {segment.text}
                      </span>
                    </label>
                  );
                })}
              </div>
              {issue.tokens.length > issue.expectedCount && (
                <div className="mt-3 border-t border-amber-200 pt-2">
                  <div className="mb-1 text-xs font-medium text-amber-800">
                    未割り当てIPA（必要な欄へコピーしてください）
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {issue.tokens
                      .slice(issue.expectedCount)
                      .map((token, extraIndex) => (
                        <input
                          key={`extra-${extraIndex}`}
                          type="text"
                          value={token}
                          readOnly
                          onFocus={(event) => event.currentTarget.select()}
                          className="min-w-24 rounded border border-amber-300 bg-white px-2 py-1 text-xs text-gray-600"
                        />
                      ))}
                  </div>
                </div>
              )}
            </div>
          );
        }

        if (canAlignLegacy) {
          return (
            <div
              key={`phonetic-preview-${lineIndex}`}
              className="flex flex-wrap items-end gap-x-2 gap-y-1 border-b border-gray-200 py-2 text-base leading-tight last:border-0"
            >
              {legacyEnglishWords.map((word, wordIndex) => (
                <ruby
                  key={`legacy-${wordIndex}`}
                  className="whitespace-nowrap [ruby-overhang:none]"
                >
                  {word}
                  {editingPhonetic?.lineIndex === lineIndex &&
                  editingPhonetic.tokenIndex === wordIndex &&
                  editingPhonetic.mode === "legacy" ? (
                    <rt>
                      <input
                        autoFocus
                        value={phoneticDraft}
                        onChange={(event) => setPhoneticDraft(event.target.value)}
                        onBlur={commitPhoneticDraft}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") event.currentTarget.blur();
                          if (event.key === "Escape") setEditingPhonetic(null);
                        }}
                        className="w-20 rounded border border-blue-300 bg-white px-1 text-center text-xs"
                        aria-label={`${word}の発音記号を編集`}
                      />
                    </rt>
                  ) : (
                    <rt
                      title="クリックして発音記号を編集"
                      onClick={() => {
                        setPhoneticDraft(legacyPhoneticWords[wordIndex] ?? "");
                        setEditingPhonetic({
                          lineIndex,
                          tokenIndex: wordIndex,
                          mode: "legacy",
                        });
                      }}
                      className="cursor-text text-xs font-normal text-gray-500 hover:text-blue-600"
                    >
                      {legacyPhoneticWords[wordIndex]}
                    </rt>
                  )}
                </ruby>
              ))}
            </div>
          );
        }

        let phoneticIndex = 0;
        return (
          <div
            key={`phonetic-preview-${lineIndex}`}
            className="break-words border-b border-gray-200 py-2 text-base leading-tight last:border-0"
          >
            {segments.map((segment, segmentIndex) => {
              if (segment.isWhitespace) {
                return <span key={segmentIndex}>{segment.text}</span>;
              }
              const currentPhoneticIndex = phoneticIndex++;
              const phonetic = phoneticTokens[currentPhoneticIndex] ?? "";
              return phonetic ? (
                <ruby key={segmentIndex} className="whitespace-nowrap [ruby-overhang:none]">
                  {segment.text}
                  {editingPhonetic?.lineIndex === lineIndex &&
                  editingPhonetic.tokenIndex === currentPhoneticIndex &&
                  editingPhonetic.mode === "segments" ? (
                    <rt>
                      <input
                        autoFocus
                        value={phoneticDraft}
                        onChange={(event) => setPhoneticDraft(event.target.value)}
                        onBlur={commitPhoneticDraft}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") event.currentTarget.blur();
                          if (event.key === "Escape") setEditingPhonetic(null);
                        }}
                        className="w-20 rounded border border-blue-300 bg-white px-1 text-center text-xs"
                        aria-label={`${segment.text}の発音記号を編集`}
                      />
                    </rt>
                  ) : (
                    <rt
                      title="クリックして発音記号を編集"
                      onClick={() => {
                        setPhoneticDraft(phonetic);
                        setEditingPhonetic({
                          lineIndex,
                          tokenIndex: currentPhoneticIndex,
                          mode: "segments",
                        });
                      }}
                      className="cursor-text text-xs font-normal text-gray-500 hover:text-blue-600"
                    >
                      {phonetic}
                    </rt>
                  )}
                </ruby>
              ) : (
                <span key={segmentIndex}>{segment.text}</span>
              );
            })}
          </div>
        );
            })
          ) : (
            <button
              type="button"
              onClick={() => setIsEditingSource(true)}
              className="w-full rounded-lg border border-dashed border-gray-300 bg-white px-4 py-8 text-sm text-gray-500 hover:border-blue-400 hover:text-blue-600"
            >
              原文を入力
            </button>
          )}
        </div>
      )}
    </div>
  );
};

const getAiRequestErrorMessage = (error: unknown, fallback: string) => {
  if (error instanceof SyntaxError) {
    return "サーバーから正しい形式の応答を取得できませんでした。再試行してください。";
  }
  if (error instanceof TypeError) {
    return "サーバーに接続できませんでした。通信状況を確認して再試行してください。";
  }
  return error instanceof Error ? error.message : fallback;
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
  const [isFolderSidebarCollapsed, setIsFolderSidebarCollapsed] = useState(false);
  const [focusedTreeFolderId, setFocusedTreeFolderId] = useState<string | null>(null);
  const folderTreeRef = useRef<HTMLElement>(null);
  const libraryContentsRef = useRef<HTMLElement>(null);
  const recentUnits = [...units]
    .sort((first, second) =>
      (Date.parse(second.updated_at ?? second.created_at ?? "") || 0) -
      (Date.parse(first.updated_at ?? first.created_at ?? "") || 0),
    )
    .slice(0, 6);
  const [selectedUnit, setSelectedUnit] = useState<UnitType | null>(null);
  const [newFolderName, setNewFolderName] = useState("");
  const [showFolderInput, setShowFolderInput] = useState(false);
  const [folderMenuId, setFolderMenuId] = useState<string | null>(null);
  const [expandedFolderIds, setExpandedFolderIds] = useState<Set<string>>(
    new Set(),
  );
  const [draggedLibraryItem, setDraggedLibraryItem] =
    useState<DraggedLibraryItem | null>(null);
  const [libraryDropTarget, setLibraryDropTarget] = useState<string | null>(
    null,
  );
  const [selectedLibraryItem, setSelectedLibraryItem] =
    useState<LibraryItemRef | null>(null);
  const [libraryContextMenu, setLibraryContextMenu] =
    useState<LibraryContextMenu | null>(null);
  const [renamingLibraryItem, setRenamingLibraryItem] =
    useState<LibraryItemRef | null>(null);
  const [renamingLibraryValue, setRenamingLibraryValue] = useState("");
  const [librarySortKey, setLibrarySortKey] = useState<"name" | "created">(
    "created",
  );
  const [librarySortDirection, setLibrarySortDirection] = useState<
    "asc" | "desc"
  >("desc");
  const libraryRenameTimerRef = useRef<number | null>(null);

  // === ユニット追加用 ===
  const [newUnitTitle, setNewUnitTitle] = useState("");
  const [newUnitEnglish, setNewUnitEnglish] = useState("");
  const [newUnitJapanese, setNewUnitJapanese] = useState("");
  const [newUnitPhonetic, setNewUnitPhonetic] = useState("");
  const [newUnitPhoneticReview, setNewUnitPhoneticReview] = useState<
    PhoneticReviewIssue[]
  >([]);
  const [newUnitFolder, setNewUnitFolder] = useState("");
  const [newAudioName, setNewAudioName] = useState("");
  const [newAudioUrl, setNewAudioUrl] = useState("");
  const [newAudioFile, setNewAudioFile] = useState<File | null>(null);
  const [newUploadAudio, setNewUploadAudio] = useState(false);
  const [newAlignmentName, setNewAlignmentName] = useState("");
  const [newAlignment, setNewAlignment] = useState<UnitAlignment | null>(null);
  const [newAlignmentFile, setNewAlignmentFile] = useState<File | null>(null);
  const [newMediaError, setNewMediaError] = useState("");
  const [newMediaDuration, setNewMediaDuration] = useState<number | undefined>();

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
  const [aiChats, setAiChats] = useState<AiChatSession[]>([]);
  const [expandedAiChatId, setExpandedAiChatId] = useState<string | null>(null);
  const [aiQuestion, setAiQuestion] = useState("");
  const [showAiQuestionInput, setShowAiQuestionInput] = useState(false);
  const [dictionaryEntry, setDictionaryEntry] =
    useState<DictionaryEntry | null>(null);
  const [dictionaryError, setDictionaryError] = useState("");
  const [isDictionaryLoading, setIsDictionaryLoading] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [showAllJapanese, setShowAllJapanese] = useState(false);
  const [showAllPhonetic, setShowAllPhonetic] = useState(false);
  const [showVocabularyQuickView, setShowVocabularyQuickView] = useState(false);
  const [quickVocabularySearch, setQuickVocabularySearch] = useState("");
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
  const [editUnitPhoneticReview, setEditUnitPhoneticReview] = useState<
    PhoneticReviewIssue[]
  >([]);
  const [editUnitFolder, setEditUnitFolder] = useState("");
  const [localUnitMedia, setLocalUnitMedia] = useState<
    Record<string, LocalUnitMedia>
  >({});
  const [editAudioName, setEditAudioName] = useState("");
  const [editAudioUrl, setEditAudioUrl] = useState("");
  const [editAudioFile, setEditAudioFile] = useState<File | null>(null);
  const [editUploadAudio, setEditUploadAudio] = useState(false);
  const [editAlignmentName, setEditAlignmentName] = useState("");
  const [editAlignment, setEditAlignment] = useState<UnitAlignment | null>(null);
  const [editAlignmentFile, setEditAlignmentFile] = useState<File | null>(null);
  const [editMediaError, setEditMediaError] = useState("");
  const [editMediaDuration, setEditMediaDuration] = useState<number | undefined>();
  const [removeEditAudio, setRemoveEditAudio] = useState(false);
  const [removeEditAlignment, setRemoveEditAlignment] = useState(false);
  const [editMediaDirty, setEditMediaDirty] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [timingEditing, setTimingEditing] = useState(false);
  const [playerExpanded, setPlayerExpanded] = useState(false);
  const [timingEditLineId, setTimingEditLineId] = useState<number | null>(null);
  const timingOriginalRef = useRef<UnitAlignment | null>(null);
  const timingOwnerRef = useRef<string | null>(null);
  const playbackFrameRef = useRef<number | null>(null);
  const armedTimedTargetRef = useRef<string | null>(null);
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);
  const [audioCurrentTime, setAudioCurrentTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [loopTimedLineId, setLoopTimedLineId] = useState<number | null>(null);
  const [activeTimedLineId, setActiveTimedLineId] = useState<number | null>(null);
  const [activeTimedWordIndex, setActiveTimedWordIndex] = useState<number | null>(null);
  const [followPlayback, setFollowPlayback] = useState(true);
  const automaticScrollUntilRef = useRef(0);
  const [generatingUnitField, setGeneratingUnitField] = useState<
    "translation" | "phonetic" | "both" | null
  >(null);
  const hasStartedAi = aiChats.length > 0;
  const hasReaderSidePanel = hasStartedAi || showVocabularyQuickView;
  const isAiLoading = aiChats.some((chat) => chat.isLoading);
  const activeAiChat =
    aiChats.find((chat) => chat.id === expandedAiChatId) ?? null;
  const aiMessages = activeAiChat?.messages ?? [];
  const aiError = activeAiChat?.error ?? "";
  const readingScrollAnchorRef = useRef<{
    element: HTMLElement;
    top: number;
  } | null>(null);
  const aiChatHeadersRef = useRef<HTMLDivElement>(null);
  const dictionaryCacheRef = useRef(new Map<string, DictionaryEntry>());

  const hasUnitUnsavedChanges = Boolean(
    editingUnit &&
      (editUnitTitle !== editingUnit.title ||
        editUnitFolder !== (editingUnit.folder_id || "") ||
        editUnitEnglish !==
          editingUnit.lines.map((line) => line.english).join("\n") ||
        editUnitJapanese !==
          editingUnit.lines.map((line) => line.japanese).join("\n") ||
        editUnitPhonetic !==
          editingUnit.lines.map((line) => line.phonetic).join("\n") ||
        editMediaDirty),
  );
  const hasVocabularyUnsavedChanges = Boolean(
    editingVocabulary &&
      (editVocabularyWord !== editingVocabulary.word ||
        editVocabularyMeaning !== editingVocabulary.meaning),
  );

  const captureReadingScrollAnchor = () => {
    const viewport = document.querySelector<HTMLElement>("[data-reader-scroll]")?.getBoundingClientRect();
    const visibleLine = Array.from(
      document.querySelectorAll<HTMLElement>("[data-reader-line-id]"),
    ).find((element) => {
      const rect = element.getBoundingClientRect();
      return rect.bottom > (viewport?.top ?? 0) && rect.top < (viewport?.bottom ?? window.innerHeight);
    });

    if (visibleLine) {
      readingScrollAnchorRef.current = {
        element: visibleLine,
        top: visibleLine.getBoundingClientRect().top,
      };
    }
  };

  useLayoutEffect(() => {
    const anchor = readingScrollAnchorRef.current;
    if (!anchor) return;
    readingScrollAnchorRef.current = null;
    if (!anchor.element.isConnected) return;

    const topDifference = anchor.element.getBoundingClientRect().top - anchor.top;
    if (Math.abs(topDifference) > 0.5) {
      const viewport = document.querySelector<HTMLElement>("[data-reader-scroll]");
      if (viewport) viewport.scrollBy(0, topDifference);
      else window.scrollBy(0, topDifference);
    }
  }, [hasReaderSidePanel]);

  useEffect(() => {
    const container = aiChatHeadersRef.current;
    if (!container) return;
    const frame = window.requestAnimationFrame(() => {
      container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [aiChats.length]);

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
    if (uRes.data) {
      const loadedUnits = uRes.data as UnitType[];
      setUnits(loadedUnits);
      setLocalUnitMedia((current) => {
        const loadedMedia: Record<string, LocalUnitMedia> = {};
        loadedUnits.forEach((unit) => {
          if (!unit.audio_path && !unit.alignment_data) return;
          const audioUrl = unit.audio_path
            ? supabase.storage
                .from(UNIT_MEDIA_BUCKET)
                .getPublicUrl(unit.audio_path).data.publicUrl
            : "";
          loadedMedia[unit.id] = {
            audioName: unit.audio_name ?? "",
            audioUrl,
            alignmentName: unit.alignment_name ?? "",
            alignment: unit.alignment_edits ?? unit.alignment_data ?? null,
          };
        });
        return { ...loadedMedia, ...current };
      });
    }
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
    if (!libraryContextMenu) return;
    const closeMenu = () => setLibraryContextMenu(null);
    window.addEventListener("click", closeMenu);
    window.addEventListener("blur", closeMenu);
    return () => {
      window.removeEventListener("click", closeMenu);
      window.removeEventListener("blur", closeMenu);
    };
  }, [libraryContextMenu]);

  useEffect(() => {
    if (currentView !== "reader") return;
    const stopFollowingOnManualScroll = () => {
      if (Date.now() < automaticScrollUntilRef.current) return;
      setFollowPlayback(false);
    };
    window.addEventListener("wheel", stopFollowingOnManualScroll, {
      passive: true,
    });
    window.addEventListener("touchstart", stopFollowingOnManualScroll, {
      passive: true,
    });
    return () => {
      window.removeEventListener("wheel", stopFollowingOnManualScroll);
      window.removeEventListener("touchstart", stopFollowingOnManualScroll);
    };
  }, [currentView]);

  useEffect(() => {
    if (
      currentView !== "reader" ||
      !followPlayback ||
      activeTimedLineId === null ||
      window.getSelection()?.toString().trim()
    ) {
      return;
    }
    const element = document.querySelector<HTMLElement>(
      `[data-reader-line-id="${activeTimedLineId}"]`,
    );
    if (!element) return;
    const bounds = element.getBoundingClientRect();
    const viewport = document.querySelector<HTMLElement>("[data-reader-scroll]")?.getBoundingClientRect();
    const upperLimit = viewport ? viewport.top + viewport.height * 0.25 : window.innerHeight * 0.25;
    const lowerLimit = viewport ? viewport.top + viewport.height * 0.7 : window.innerHeight * 0.7;
    if (bounds.top >= upperLimit && bounds.bottom <= lowerLimit) return;
    automaticScrollUntilRef.current = Date.now() + 700;
    element.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [activeTimedLineId, currentView, followPlayback]);

  useEffect(() => {
    if (!vocabularyMenuId) return;
    const closeVocabularyMenu = () => setVocabularyMenuId(null);
    window.addEventListener("click", closeVocabularyMenu);
    return () => window.removeEventListener("click", closeVocabularyMenu);
  }, [vocabularyMenuId]);

  useEffect(() => {
    if (currentView === "reader") return;
    setShowVocabularyQuickView(false);
    setQuickVocabularySearch("");
  }, [currentView]);

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
      .insert([
        {
          name: newFolderName.trim(),
          parent_id: selectedFolder,
        },
      ])
      .select(); // ← ここで select 権限が無いと失敗する

    if (error) {
      console.error("addFolder error:", error);
      alert(`フォルダー追加に失敗: ${error.message}`);
      return;
    }

    // data が返らない/空の可能性にも備える
    await loadAll();
    if (selectedFolder) {
      setExpandedFolderIds((current) =>
        new Set(current).add(selectedFolder),
      );
    }
    setNewFolderName("");
    setShowFolderInput(false);
  };

  const deleteFolder = async (id: string) => {
    const descendantIds = new Set<string>([id]);
    let addedFolder = true;
    while (addedFolder) {
      addedFolder = false;
      folders.forEach((folder) => {
        if (
          folder.parent_id &&
          descendantIds.has(folder.parent_id) &&
          !descendantIds.has(folder.id)
        ) {
          descendantIds.add(folder.id);
          addedFolder = true;
        }
      });
    }
    const folderIds = Array.from(descendantIds);
    const containedUnits = units.filter(
      (unit) => unit.folder_id && descendantIds.has(unit.folder_id),
    );
    const { error } = await supabase.from("folders").delete().eq("id", id);
    if (error) {
      alert(`フォルダー削除に失敗: ${error.message}`);
      await loadAll();
      return;
    }
    void removeUnitMediaFiles(containedUnits);
    setFolders(folders.filter((folder) => !descendantIds.has(folder.id)));
    const deletedUnitIds = new Set(containedUnits.map((unit) => unit.id));
    setUnits(units.filter((unit) => !deletedUnitIds.has(unit.id)));
    if (selectedFolder && descendantIds.has(selectedFolder)) {
      setSelectedFolder(null);
    }
    setExpandedFolderIds((current) => {
      const next = new Set(current);
      folderIds.forEach((folderId) => next.delete(folderId));
      return next;
    });
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

  const getEditableEnglishLines = () =>
    editUnitEnglish
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

  const handleNewAudioFile = (file: File | null) => {
    if (!file) return;
    if (file.size > 100 * 1024 * 1024) {
      setNewMediaError("音声ファイルは100MB以下にしてください。");
      return;
    }
    if (newAudioUrl) URL.revokeObjectURL(newAudioUrl);
    setNewAudioFile(file);
    setNewAudioName(file.name);
    setNewAudioUrl(URL.createObjectURL(file));
    setNewMediaError("");
  };

  const handleNewAlignmentFile = async (file: File | null) => {
    if (!file) return;
    try {
      const parsedJson = JSON.parse(await file.text()) as unknown;
      const converted = convertMfaAlignment(
        newUnitEnglish
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean),
        parsedJson,
      );
      setNewAlignmentName(file.name);
      setNewAlignment(converted);
      setNewAlignmentFile(file);
      setNewMediaError("");
    } catch (error) {
      setNewAlignmentName(file.name);
      setNewAlignment(null);
      setNewAlignmentFile(null);
      setNewMediaError(
        error instanceof Error
          ? error.message
          : "MFA JSONを読み取れませんでした。",
      );
    }
  };

  const handleNewUnitEnglishChange = (value: string) => {
    setNewUnitEnglish(value);
    setNewUnitPhoneticReview([]);
    if (newAlignmentName) {
      setNewAlignment(null);
      setNewAlignmentFile(null);
      setNewMediaError(
        "原文を変更したため、MFA JSONをもう一度選択してください。",
      );
    }
  };

  const handleEditAudioFile = (file: File | null) => {
    if (!file) return;
    if (file.size > 100 * 1024 * 1024) {
      setEditMediaError("音声ファイルは100MB以下にしてください。");
      return;
    }
    const previousSavedUrl = editingUnit
      ? localUnitMedia[editingUnit.id]?.audioUrl
      : "";
    if (editAudioUrl && editAudioUrl !== previousSavedUrl) {
      URL.revokeObjectURL(editAudioUrl);
    }
    setEditAudioName(file.name);
    setEditAudioUrl(URL.createObjectURL(file));
    setEditAudioFile(file);
    setRemoveEditAudio(false);
    setEditUploadAudio(false);
    setEditMediaError("");
    setEditMediaDirty(true);
  };

  const handleEditAlignmentFile = async (file: File | null) => {
    if (!file) return;
    try {
      const parsedJson = JSON.parse(await file.text()) as unknown;
      const converted = convertMfaAlignment(
        getEditableEnglishLines(),
        parsedJson,
      );
      setEditAlignmentName(file.name);
      setEditAlignment(converted);
      setEditAlignmentFile(file);
      setRemoveEditAlignment(false);
      setEditMediaError("");
      setEditMediaDirty(true);
    } catch (error) {
      setEditAlignmentName(file.name);
      setEditAlignment(null);
      setEditAlignmentFile(null);
      setEditMediaError(
        error instanceof Error
          ? error.message
          : "MFA JSONを読み取れませんでした。",
      );
      setEditMediaDirty(true);
    }
  };

  const handleEditUnitEnglishChange = (value: string) => {
    setEditUnitEnglish(value);
    setEditUnitPhoneticReview([]);
    if (editAlignmentName) {
      setEditAlignment(null);
      setEditAlignmentFile(null);
      setEditMediaError(
        "原文を変更したため、MFA JSONをもう一度選択してください。",
      );
      setEditMediaDirty(true);
    }
  };

  const uploadUnitMedia = async ({
    unitId,
    audioFile,
    uploadAudio,
    alignmentFile,
    alignment,
    existingAudioPath,
  }: {
    unitId: string;
    audioFile: File | null;
    uploadAudio: boolean;
    alignmentFile: File | null;
    alignment: UnitAlignment | null;
    existingAudioPath?: string | null;
  }) => {
    const unitChanges: Partial<UnitType> = {};

    if (alignmentFile && alignment) {
      const alignmentPath = `units/${unitId}/alignment.json`;
      const { error } = await supabase.storage
        .from(UNIT_MEDIA_BUCKET)
        .upload(alignmentPath, alignmentFile, {
          contentType: alignmentFile.type || "application/json",
          cacheControl: "3600",
          upsert: true,
        });
      if (error) throw error;
      unitChanges.alignment_path = alignmentPath;
      unitChanges.alignment_name = alignmentFile.name;
      unitChanges.alignment_data = alignment;
      unitChanges.alignment_edits = null;
    }

    if (audioFile && uploadAudio) {
      const rawExtension = audioFile.name.split(".").pop()?.toLowerCase() ?? "mp3";
      const extension = rawExtension.replace(/[^a-z0-9]/g, "") || "mp3";
      const audioPath = `units/${unitId}/audio-${Date.now()}.${extension}`;
      const { error } = await supabase.storage
        .from(UNIT_MEDIA_BUCKET)
        .upload(audioPath, audioFile, {
          contentType: audioFile.type || "application/octet-stream",
          cacheControl: "3600",
          upsert: true,
        });
      if (error) throw error;
      unitChanges.audio_path = audioPath;
      unitChanges.audio_name = audioFile.name;
    }

    if (Object.keys(unitChanges).length > 0) {
      const { error } = await supabase
        .from("units")
        .update(unitChanges)
        .eq("id", unitId);
      if (error) throw error;
    }

    if (
      unitChanges.audio_path &&
      existingAudioPath &&
      existingAudioPath !== unitChanges.audio_path
    ) {
      const { error } = await supabase.storage
        .from(UNIT_MEDIA_BUCKET)
        .remove([existingAudioPath]);
      if (error) console.error("old audio cleanup error", error);
    }

    return unitChanges;
  };

  const removeUnitMediaFiles = async (targetUnits: UnitType[]) => {
    const paths = targetUnits.flatMap((unit) =>
      [unit.audio_path, unit.alignment_path].filter(
        (path): path is string => Boolean(path),
      ),
    );
    if (!paths.length) return;
    const { error } = await supabase.storage
      .from(UNIT_MEDIA_BUCKET)
      .remove(paths);
    if (error) console.error("unit media cleanup error", error);
  };

  const updateActiveTiming = useCallback((timeSeconds: number) => {
    const alignment = selectedUnit
      ? localUnitMedia[selectedUnit.id]?.alignment
      : null;
    if (!alignment) {
      setActiveTimedLineId(null);
      setActiveTimedWordIndex(null);
      return;
    }
    const timeMs = timeSeconds * 1000;
    let activeLine: TimedLine | undefined;
    for (const line of alignment.lines) {
      if (line.startMs !== null && line.startMs <= timeMs) activeLine = line;
      if (line.startMs !== null && line.startMs > timeMs) break;
    }
    if (!activeLine) {
      setActiveTimedLineId(null);
      setActiveTimedWordIndex(null);
      return;
    }
    setActiveTimedLineId(activeLine.lineId);
    let activeWordIndex: number | null = null;
    for (const word of activeLine.words) {
      if (word.startMs <= timeMs) activeWordIndex = word.wordIndex;
      if (word.startMs > timeMs) break;
    }
    setActiveTimedWordIndex(activeWordIndex);
  }, [localUnitMedia, selectedUnit]);

  useEffect(() => {
    if (!isAudioPlaying) return;
    const tick = () => {
      const audio = audioRef.current;
      if (!audio) return;
      if (loopTimedLineId !== null && selectedUnit) {
        const loopLine = localUnitMedia[
          selectedUnit.id
        ]?.alignment?.lines.find((line) => line.lineId === loopTimedLineId);
        if (
          loopLine?.startMs !== null &&
          loopLine?.startMs !== undefined &&
          loopLine.endMs !== null &&
          audio.currentTime * 1000 >= loopLine.endMs
        ) {
          audio.currentTime = loopLine.startMs / 1000;
        }
      }
      setAudioCurrentTime(audio.currentTime);
      updateActiveTiming(audio.currentTime);
      playbackFrameRef.current = window.requestAnimationFrame(tick);
    };
    playbackFrameRef.current = window.requestAnimationFrame(tick);
    return () => {
      if (playbackFrameRef.current !== null) {
        window.cancelAnimationFrame(playbackFrameRef.current);
        playbackFrameRef.current = null;
      }
    };
  }, [
    isAudioPlaying,
    localUnitMedia,
    loopTimedLineId,
    selectedUnit,
    updateActiveTiming,
  ]);

  useEffect(() => {
    if (currentView === "reader") return;
    armedTimedTargetRef.current = null;
    audioRef.current?.pause();
    setIsAudioPlaying(false);
    setAudioCurrentTime(0);
    setActiveTimedLineId(null);
    setActiveTimedWordIndex(null);
    setLoopTimedLineId(null);
  }, [currentView]);

  useEffect(() => {
    armedTimedTargetRef.current = null;
    setTimingEditing(false);
    setTimingEditLineId(null);
  }, [selectedUnit?.id]);

  useEffect(() => {
    const owner = timingOwnerRef.current;
    const original = timingOriginalRef.current;
    if (owner && original && (currentView !== "reader" || selectedUnit?.id !== owner)) {
      setLocalUnitMedia((items) => items[owner] ? { ...items, [owner]: { ...items[owner], alignment: original } } : items);
      timingOwnerRef.current = null;
      setTimingEditing(false);
    }
  }, [currentView, selectedUnit?.id]);

  const changeReaderTiming = (alignment: UnitAlignment) => {
    if (!selectedUnit) return;
    setLocalUnitMedia((items) => ({ ...items, [selectedUnit.id]: { ...items[selectedUnit.id], alignment } }));
  };

  const saveReaderTiming = async () => {
    if (!selectedUnit) return;
    const alignment = localUnitMedia[selectedUnit.id]?.alignment;
    if (!alignment) return;
    const { error } = await supabase.from("units").update({ alignment_edits: alignment }).eq("id", selectedUnit.id);
    if (error) throw new Error(`時間修正の保存に失敗しました: ${error.message}`);
    setUnits((items) => items.map((unit) => unit.id === selectedUnit.id ? { ...unit, alignment_edits: alignment } : unit));
    setSelectedUnit((unit) => unit ? { ...unit, alignment_edits: alignment } : unit);
    timingOwnerRef.current = null;
    setTimingEditing(false);
  };

  const seekAudio = (timeSeconds: number, play?: boolean) => {
    const audio = audioRef.current;
    if (!audio) return;
    const shouldPlay = play ?? !audio.paused;
    const nextTime = Math.min(
      Math.max(timeSeconds, 0),
      Number.isFinite(audio.duration) ? audio.duration : timeSeconds,
    );
    audio.currentTime = nextTime;
    if (loopTimedLineId !== null && selectedUnit) {
      const timeMs = nextTime * 1000;
      let nextLoopLineId: number | null = null;
      for (const line of localUnitMedia[selectedUnit.id]?.alignment?.lines ?? []) {
        if (line.startMs !== null && line.startMs <= timeMs) {
          nextLoopLineId = line.lineId;
        }
        if (line.startMs !== null && line.startMs > timeMs) break;
      }
      if (nextLoopLineId !== null) setLoopTimedLineId(nextLoopLineId);
    }
    setAudioCurrentTime(nextTime);
    updateActiveTiming(nextTime);
    if (shouldPlay) void audio.play();
  };

  const seekToTimedLine = (lineId: number) => {
    if (!selectedUnit) return;
    if (timingEditing) { setTimingEditLineId(lineId); return; }
    const line = localUnitMedia[selectedUnit.id]?.alignment?.lines.find(
      (item) => item.lineId === lineId,
    );
    if (line?.startMs !== null && line?.startMs !== undefined) {
      handleTimedTargetClick(`line:${lineId}`, line.startMs / 1000);
    }
  };

  const handleTimedTargetClick = (targetKey: string, timeSeconds: number) => {
    if (timingEditing) {
      const lineId = Number(targetKey.split(":")[1]);
      if (Number.isFinite(lineId)) setTimingEditLineId(lineId);
      return;
    }
    const audio = audioRef.current;
    if (!audio) return;
    if (!audio.paused) {
      armedTimedTargetRef.current = null;
      seekAudio(timeSeconds);
      return;
    }
    const shouldStart = armedTimedTargetRef.current === targetKey;
    armedTimedTargetRef.current = shouldStart ? null : targetKey;
    seekAudio(timeSeconds, shouldStart);
  };

  const moveByTimedItem = (kind: "line" | "word", direction: -1 | 1) => {
    armedTimedTargetRef.current = null;
    if (!selectedUnit) return;
    const alignment = localUnitMedia[selectedUnit.id]?.alignment;
    if (!alignment) return;
    const timeMs = (audioRef.current?.currentTime ?? 0) * 1000;
    const starts =
      kind === "line"
        ? alignment.lines.flatMap((line) =>
            line.startMs === null ? [] : [line.startMs],
          )
        : alignment.lines.flatMap((line) =>
            line.words.map((word) => word.startMs),
          );
    if (!starts.length) return;
    const currentIndex = starts.findLastIndex((start) => start <= timeMs + 10);
    let targetIndex: number;
    if (direction < 0) {
      const currentStart = starts[Math.max(currentIndex, 0)];
      targetIndex =
        currentIndex > 0 && timeMs - currentStart < 500
          ? currentIndex - 1
          : Math.max(currentIndex, 0);
    } else {
      targetIndex = Math.min(currentIndex + 1, starts.length - 1);
    }
    seekAudio(starts[targetIndex] / 1000);
  };

  const toggleCurrentLineLoop = () => {
    if (!selectedUnit) return;
    if (loopTimedLineId !== null) {
      setLoopTimedLineId(null);
      return;
    }
    const alignment = localUnitMedia[selectedUnit.id]?.alignment;
    if (!alignment) return;
    const fallbackLine = alignment.lines.find((line) => line.startMs !== null);
    const lineId = activeTimedLineId ?? fallbackLine?.lineId;
    if (lineId !== undefined) setLoopTimedLineId(lineId);
  };

  useEffect(() => {
    const handlePlaybackShortcut = (event: KeyboardEvent) => {
      if (currentView !== "reader" || !selectedUnit) return;
      if (!localUnitMedia[selectedUnit.id]?.audioUrl) return;
      const target = event.target as HTMLElement | null;
      if (
        target?.isContentEditable ||
        target?.closest("input, textarea, select, button, [contenteditable='true']")
      ) {
        return;
      }

      if (event.code === "Space") {
        event.preventDefault();
        armedTimedTargetRef.current = null;
        const audio = audioRef.current;
        if (!audio) return;
        if (audio.paused) void audio.play();
        else audio.pause();
        return;
      }
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        moveByTimedItem("line", event.key === "ArrowLeft" ? -1 : 1);
        return;
      }
      if (event.key.toLowerCase() === "r") {
        event.preventDefault();
        toggleCurrentLineLoop();
      }
    };

    window.addEventListener("keydown", handlePlaybackShortcut);
    return () => window.removeEventListener("keydown", handlePlaybackShortcut);
  });

  const formatPlaybackTime = (seconds: number) => {
    if (!Number.isFinite(seconds)) return "0:00";
    const wholeSeconds = Math.max(0, Math.floor(seconds));
    return `${Math.floor(wholeSeconds / 60)}:${String(wholeSeconds % 60).padStart(2, "0")}`;
  };

  const generateUnitField = async (
    mode: "translation" | "phonetic",
    source: string,
    currentValue: string,
    setValue: (value: string) => void,
    setPhoneticReview?: (issues: PhoneticReviewIssue[]) => void,
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
      const data = (await response.json()) as {
        text?: string;
        error?: string;
        phoneticReview?: PhoneticReviewIssue[];
      };
      if (!response.ok || !data.text) {
        throw new Error(data.error || "AIから生成結果を取得できませんでした");
      }
      setValue(data.text);
      if (mode === "phonetic") {
        setPhoneticReview?.(data.phoneticReview ?? []);
      }
    } catch (error) {
      alert(getAiRequestErrorMessage(error, "AIによる生成に失敗しました"));
    } finally {
      setGeneratingUnitField(null);
    }
  };

  const generateBothUnitFields = async (
    source: string,
    currentJapanese: string,
    currentPhonetic: string,
    setJapanese: (value: string) => void,
    setPhonetic: (value: string) => void,
    setPhoneticReview: (issues: PhoneticReviewIssue[]) => void,
  ) => {
    if (!source.trim()) {
      alert("先に原文を入力してください");
      return;
    }
    if (
      (currentJapanese.trim() || currentPhonetic.trim()) &&
      !confirm("現在の和訳と発音記号をAIの生成結果で上書きしますか？")
    ) {
      return;
    }

    setGeneratingUnitField("both");
    try {
      const response = await fetch("/api/generate-unit-text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source, mode: "both" }),
      });
      const data = (await response.json()) as {
        translationText?: string;
        phoneticText?: string;
        phoneticReview?: PhoneticReviewIssue[];
        error?: string;
      };
      if (
        !response.ok ||
        typeof data.translationText !== "string" ||
        typeof data.phoneticText !== "string"
      ) {
        throw new Error(data.error || "AIから生成結果を取得できませんでした");
      }
      setJapanese(data.translationText);
      setPhonetic(data.phoneticText);
      setPhoneticReview(data.phoneticReview ?? []);
    } catch (error) {
      alert(getAiRequestErrorMessage(error, "AIによる生成に失敗しました"));
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

    const { data, error } = await supabase
      .from("units")
      .insert([payload])
      .select();

    if (error) {
      console.error("addUnit error:", error);
      alert(`ユニット追加に失敗: ${error.message}`);
      return;
    }

    const insertedUnit = data?.[0] as UnitType | undefined;
    let uploadedChanges: Partial<UnitType> = {};
    if (insertedUnit && (newAlignmentFile || (newAudioFile && newUploadAudio))) {
      try {
        uploadedChanges = await uploadUnitMedia({
          unitId: insertedUnit.id,
          audioFile: newAudioFile,
          uploadAudio: newUploadAudio,
          alignmentFile: newAlignmentFile,
          alignment: newAlignment,
          existingAudioPath: null,
        });
      } catch (uploadError) {
        console.error("unit media upload error", uploadError);
        alert(
          `ユニットは追加されましたが、ファイル保存に失敗しました: ${
            uploadError instanceof Error ? uploadError.message : "不明なエラー"
          }`,
        );
      }
    }
    if (insertedUnit && (newAudioUrl || newAlignment)) {
      const savedAudioPath = uploadedChanges.audio_path;
      const savedAudioUrl = savedAudioPath
        ? supabase.storage
            .from(UNIT_MEDIA_BUCKET)
            .getPublicUrl(savedAudioPath).data.publicUrl
        : newAudioUrl;
      setLocalUnitMedia((current) => ({
        ...current,
        [insertedUnit.id]: {
          audioName: newAudioName,
          audioUrl: savedAudioUrl,
          alignmentName: newAlignmentName,
          alignment: newAlignment,
        },
      }));
    }

    await loadAll();
    setNewUnitTitle("");
    setNewUnitEnglish("");
    setNewUnitJapanese("");
    setNewUnitPhonetic("");
    setNewUnitPhoneticReview([]);
    setNewUnitFolder("");
    setNewAudioName("");
    setNewAudioUrl("");
    setNewAudioFile(null);
    setNewUploadAudio(false);
    setNewAlignmentName("");
    setNewAlignment(null);
    setNewAlignmentFile(null);
    setNewMediaError("");
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
        setDictionaryEntry(null);
        setDictionaryError("");
        setIsSelectionPanelOpen(true);
        setSelectedLineId(lineId);
        if (showVocabularyForm) setNewVocabularyWord(text);
      }
    }
  };

  const requestAiExplanation = async (
    chatId: string,
    messages: AiMessage[],
    subject: string,
    lineId: number,
  ) => {
    if (!selectedUnit || !subject.trim()) return;
    const lineIndex = selectedUnit.lines.findIndex(
      (line) => line.id === lineId,
    );
    const formatLine = (line: UnitType["lines"][number] | undefined) =>
      line
        ? [line.english, line.japanese ? `和訳: ${line.japanese}` : ""]
            .filter(Boolean)
            .join("\n")
        : "";

    setAiChats((current) =>
      current.map((chat) =>
        chat.id === chatId ? { ...chat, isLoading: true, error: "" } : chat,
      ),
    );
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
      const responseText = result.text;
      setAiChats((current) =>
        current.map((chat) =>
          chat.id === chatId
            ? {
                ...chat,
                messages: [...messages, { role: "model", text: responseText }],
                isLoading: false,
              }
            : chat,
        ),
      );
    } catch (error) {
      const errorMessage = getAiRequestErrorMessage(
        error,
        "AI解説を取得できませんでした",
      );
      setAiChats((current) =>
        current.map((chat) =>
          chat.id === chatId
            ? { ...chat, isLoading: false, error: errorMessage }
            : chat,
        ),
      );
    }
  };

  const askAiFollowUp = async (chatId: string) => {
    const question = aiQuestion.trim();
    const chat = aiChats.find((item) => item.id === chatId);
    if (!question || !chat || chat.isLoading) return;
    const messages = [...chat.messages, { role: "user" as const, text: question }];
    setAiQuestion("");
    setShowAiQuestionInput(false);
    setAiChats((current) =>
      current.map((item) =>
        item.id === chatId ? { ...item, messages } : item,
      ),
    );
    await requestAiExplanation(chatId, messages, chat.subject, chat.lineId);
  };

  const startAiExplanation = () => {
    const subject = selectedText.trim();
    const lineId = selectedLineId;
    if (!subject || lineId === null) return;

    if (!hasStartedAi) captureReadingScrollAnchor();
    const chatId = crypto.randomUUID();
    setAiChats((current) => [
      ...current,
      {
        id: chatId,
        subject,
        lineId,
        messages: [],
        isLoading: true,
        error: "",
      },
    ]);
    setExpandedAiChatId(chatId);
    setShowAiQuestionInput(false);
    setAiQuestion("");
    void requestAiExplanation(chatId, [], subject, lineId);
  };

  const searchDictionary = async () => {
    const term = selectedText.trim();
    const lineId = selectedLineId;
    if (!term || lineId === null || !selectedUnit) return;

    const cacheKey = term.toLocaleLowerCase();
    const cachedEntry = dictionaryCacheRef.current.get(cacheKey);
    setDictionaryError("");
    if (cachedEntry) {
      setDictionaryEntry(cachedEntry);
      return;
    }

    const sourceLine =
      selectedUnit.lines.find((line) => line.id === lineId)?.english ?? "";
    const matchIndex = sourceLine.toLocaleLowerCase().indexOf(cacheKey);
    const before = matchIndex >= 0 ? sourceLine.slice(0, matchIndex) : "";
    const after =
      matchIndex >= 0 ? sourceLine.slice(matchIndex + term.length) : "";
    const leftContext = before.match(
      /[\p{L}\p{N}'-]+(?=[^\p{L}\p{N}'-]*$)/u,
    )?.[0];
    const rightContext = after.match(/[\p{L}\p{N}'-]+/u)?.[0];

    setDictionaryEntry(null);
    setIsDictionaryLoading(true);
    try {
      const response = await fetch("/api/dictionary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ term, leftContext, rightContext }),
      });
      const result = (await response.json()) as DictionaryEntry & {
        error?: string;
      };
      if (!response.ok || !result.definitions?.length) {
        throw new Error(result.error || "辞書を検索できませんでした。");
      }
      dictionaryCacheRef.current.set(cacheKey, result);
      setDictionaryEntry(result);
    } catch (error) {
      setDictionaryError(
        getAiRequestErrorMessage(error, "辞書を検索できませんでした。"),
      );
    } finally {
      setIsDictionaryLoading(false);
    }
  };

  const handleAiResponseSelection = (lineId?: number) => {
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
    setDictionaryEntry(null);
    setDictionaryError("");
    if (lineId !== undefined) setSelectedLineId(lineId);
    setIsSelectionPanelOpen(true);
  };

  const compareLibraryItems = (
    first: { name: string; created_at?: string },
    second: { name: string; created_at?: string },
  ) => {
    const direction = librarySortDirection === "asc" ? 1 : -1;
    if (librarySortKey === "name") {
      return first.name.localeCompare(second.name, "ja", {
        numeric: true,
        sensitivity: "base",
      }) * direction;
    }
    return (
      ((new Date(first.created_at ?? 0).getTime() || 0) -
        (new Date(second.created_at ?? 0).getTime() || 0)) *
      direction
    );
  };

  const getFilteredUnits = () =>
    units.filter((unit) => (unit.folder_id ?? null) === selectedFolder).sort((first, second) =>
      compareLibraryItems(
        { name: first.title, created_at: first.created_at },
        { name: second.title, created_at: second.created_at },
      ),
    );

  const getVisibleFolders = () =>
    getFolderChildren(selectedFolder).sort((first, second) =>
      compareLibraryItems(first, second),
    );

  const getFolderChildren = (parentId: string | null) =>
    folders.filter((folder) => (folder.parent_id ?? null) === parentId);

  const getDescendantFolderIds = (folderId: string) => {
    const descendants = new Set<string>();
    const pending = [folderId];
    while (pending.length > 0) {
      const parentId = pending.pop();
      folders.forEach((folder) => {
        if (
          folder.parent_id === parentId &&
          !descendants.has(folder.id)
        ) {
          descendants.add(folder.id);
          pending.push(folder.id);
        }
      });
    }
    return descendants;
  };

  const getFolderOptions = () => {
    const options: { folder: FolderType; depth: number }[] = [];
    const visited = new Set<string>();
    const walk = (parentId: string | null, depth: number) => {
      getFolderChildren(parentId).forEach((folder) => {
        if (visited.has(folder.id)) return;
        visited.add(folder.id);
        options.push({ folder, depth });
        walk(folder.id, depth + 1);
      });
    };
    walk(null, 0);
    folders.forEach((folder) => {
      if (!visited.has(folder.id)) options.push({ folder, depth: 0 });
    });
    return options;
  };

  const moveLibraryItem = async (targetFolderId: string | null) => {
    const dragged = draggedLibraryItem;
    setLibraryDropTarget(null);
    setDraggedLibraryItem(null);
    if (!dragged) return;

    if (dragged.type === "folder") {
      if (dragged.id === targetFolderId) return;
      const descendants = getDescendantFolderIds(dragged.id);
      if (targetFolderId && descendants.has(targetFolderId)) {
        alert("フォルダーを自身の子フォルダー内へ移動することはできません。");
        return;
      }
      const currentFolder = folders.find((folder) => folder.id === dragged.id);
      if ((currentFolder?.parent_id ?? null) === targetFolderId) return;
      const { error } = await supabase
        .from("folders")
        .update({ parent_id: targetFolderId })
        .eq("id", dragged.id);
      if (error) {
        alert(`フォルダーの移動に失敗: ${error.message}`);
        return;
      }
      setFolders((current) =>
        current.map((folder) =>
          folder.id === dragged.id
            ? { ...folder, parent_id: targetFolderId }
            : folder,
        ),
      );
    } else {
      const currentUnit = units.find((unit) => unit.id === dragged.id);
      if ((currentUnit?.folder_id ?? null) === targetFolderId) return;
      const { error } = await supabase
        .from("units")
        .update({ folder_id: targetFolderId })
        .eq("id", dragged.id);
      if (error) {
        alert(`ユニットの移動に失敗: ${error.message}`);
        return;
      }
      setUnits((current) =>
        current.map((unit) =>
          unit.id === dragged.id
            ? { ...unit, folder_id: targetFolderId }
            : unit,
        ),
      );
    }

    if (targetFolderId) {
      setExpandedFolderIds((current) =>
        new Set(current).add(targetFolderId),
      );
    }
  };

  const openUnit = (unit: UnitType) => {
    window.history.pushState(
      { readingUnitId: unit.id },
      "",
      `?unit=${encodeURIComponent(unit.id)}`,
    );
    setSelectedUnit(unit);
    setShowAllJapanese(false);
    setShowAllPhonetic(false);
    setFollowPlayback(true);
    setCurrentView("reader");
  };

  const beginLibraryRename = (item: LibraryItemRef, currentName: string) => {
    setRenamingLibraryItem(item);
    setRenamingLibraryValue(currentName);
    setLibraryContextMenu(null);
  };

  const saveLibraryRename = async () => {
    if (!renamingLibraryItem) return;
    const name = renamingLibraryValue.trim();
    if (!name) {
      setRenamingLibraryItem(null);
      return;
    }
    if (renamingLibraryItem.type === "folder") {
      const { error } = await supabase
        .from("folders")
        .update({ name })
        .eq("id", renamingLibraryItem.id);
      if (error) {
        alert(`フォルダー名の変更に失敗しました: ${error.message}`);
        return;
      }
      setFolders((current) =>
        current.map((folder) =>
          folder.id === renamingLibraryItem.id ? { ...folder, name } : folder,
        ),
      );
    } else {
      const { error } = await supabase
        .from("units")
        .update({ title: name })
        .eq("id", renamingLibraryItem.id);
      if (error) {
        alert(`ユニット名の変更に失敗しました: ${error.message}`);
        return;
      }
      setUnits((current) =>
        current.map((unit) =>
          unit.id === renamingLibraryItem.id
            ? { ...unit, title: name, updated_at: new Date().toISOString() }
            : unit,
        ),
      );
    }
    setRenamingLibraryItem(null);
  };

  const deleteUnit = async (unit: UnitType) => {
    if (!window.confirm(`「${unit.title}」を削除しますか？`)) return;
    const { error } = await supabase.from("units").delete().eq("id", unit.id);
    if (error) {
      alert(`ユニットの削除に失敗しました: ${error.message}`);
      return;
    }
    void removeUnitMediaFiles([unit]);
    setUnits((current) => current.filter((item) => item.id !== unit.id));
    setSelectedLibraryItem(null);
    setLibraryContextMenu(null);
  };

  const handleLibraryItemClick = (
    event: React.MouseEvent,
    item: LibraryItemRef,
    currentName: string,
  ) => {
    if (event.detail !== 1) return;
    const isAlreadySelected =
      selectedLibraryItem?.type === item.type &&
      selectedLibraryItem.id === item.id;
    setSelectedLibraryItem(item);
    if (!isAlreadySelected) return;
    if (libraryRenameTimerRef.current !== null) {
      window.clearTimeout(libraryRenameTimerRef.current);
    }
    libraryRenameTimerRef.current = window.setTimeout(() => {
      beginLibraryRename(item, currentName);
      libraryRenameTimerRef.current = null;
    }, 450);
  };

  const cancelPendingLibraryRename = () => {
    if (libraryRenameTimerRef.current !== null) {
      window.clearTimeout(libraryRenameTimerRef.current);
      libraryRenameTimerRef.current = null;
    }
  };

  const openLibraryFolder = (folderId: string | null) => {
    cancelPendingLibraryRename();
    setSelectedFolder(folderId);
    const firstFolder = getFolderChildren(folderId).sort(compareLibraryItems)[0];
    const firstUnit = units
      .filter((unit) => (unit.folder_id ?? null) === folderId)
      .sort((first, second) => compareLibraryItems(
        { name: first.title, created_at: first.created_at },
        { name: second.title, created_at: second.created_at },
      ))[0];
    setSelectedLibraryItem(firstFolder
      ? { type: "folder", id: firstFolder.id }
      : firstUnit ? { type: "unit", id: firstUnit.id } : null);
    libraryContentsRef.current?.focus();
  };

  const handleTreeKeyboard = (event: React.KeyboardEvent) => {
    if ((event.target as HTMLElement).closest("input, textarea, select")) return;
    const visible: FolderType[] = [];
    const visited = new Set<string>();
    const walk = (parentId: string | null) => {
      getFolderChildren(parentId).forEach((folder) => {
        if (visited.has(folder.id)) return;
        visited.add(folder.id);
        visible.push(folder);
        if (expandedFolderIds.has(folder.id)) walk(folder.id);
      });
    };
    walk(null);
    if (!visible.length) return;
    const index = visible.findIndex((folder) => folder.id === focusedTreeFolderId);
    const current = visible[Math.max(0, index)];
    let next = current;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      next = visible[Math.min(visible.length - 1, Math.max(0,
        index < 0 ? 0 : index + (event.key === "ArrowDown" ? 1 : -1)))];
    } else if (event.key === "ArrowRight") {
      const children = getFolderChildren(current.id);
      if (expandedFolderIds.has(current.id) && children.length) next = children[0];
      else setExpandedFolderIds((previous) => new Set(previous).add(current.id));
    } else if (event.key === "ArrowLeft") {
      if (expandedFolderIds.has(current.id)) {
        setExpandedFolderIds((previous) => {
          const changed = new Set(previous);
          changed.delete(current.id);
          return changed;
        });
      } else next = folders.find((folder) => folder.id === current.parent_id) ?? current;
    } else if (event.key === "Enter") {
      openLibraryFolder(current.id);
    } else if (event.key === "Tab" && !event.shiftKey) {
      libraryContentsRef.current?.focus();
    } else return;
    event.preventDefault();
    event.stopPropagation();
    setFocusedTreeFolderId(next.id);
  };

  useEffect(() => {
    const handleLibraryKeyboard = (event: KeyboardEvent) => {
      if (currentView !== "list") return;
      const target = event.target as HTMLElement | null;
      if (target && folderTreeRef.current?.contains(target)) return;
      if (
        target?.isContentEditable ||
        target?.closest("input, textarea, select, button, [contenteditable='true']")
      ) {
        return;
      }
      const visibleItems: LibraryItemRef[] = [
        ...getVisibleFolders().map((folder) => ({ type: "folder" as const, id: folder.id })),
        ...getFilteredUnits().map((unit) => ({ type: "unit" as const, id: unit.id })),
      ];
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const index = visibleItems.findIndex((item) =>
          item.id === selectedLibraryItem?.id && item.type === selectedLibraryItem.type);
        const next = visibleItems[Math.min(visibleItems.length - 1, Math.max(0,
          index < 0 ? 0 : index + (event.key === "ArrowDown" ? 1 : -1)))];
        if (next) setSelectedLibraryItem(next);
        return;
      }
      if (!selectedLibraryItem) return;
      const folder =
        selectedLibraryItem.type === "folder"
          ? folders.find((item) => item.id === selectedLibraryItem.id)
          : null;
      const unit =
        selectedLibraryItem.type === "unit"
          ? units.find((item) => item.id === selectedLibraryItem.id)
          : null;
      if (event.key === "Enter") {
        event.preventDefault();
        if (folder) openLibraryFolder(folder.id);
        if (unit) openUnit(unit);
      } else if (event.key === "F2") {
        event.preventDefault();
        if (folder) beginLibraryRename(selectedLibraryItem, folder.name);
        if (unit) beginLibraryRename(selectedLibraryItem, unit.title);
      } else if (event.key === "Delete") {
        event.preventDefault();
        if (folder && window.confirm(`「${folder.name}」を削除しますか？`)) {
          void deleteFolder(folder.id);
        }
        if (unit) void deleteUnit(unit);
      }
    };
    window.addEventListener("keydown", handleLibraryKeyboard);
    return () => window.removeEventListener("keydown", handleLibraryKeyboard);
  });

  const renderFolderTree = (
    parentId: string | null,
    depth = 0,
    ancestors = new Set<string>(),
  ): React.ReactNode =>
    getFolderChildren(parentId).map((folder) => {
      if (ancestors.has(folder.id)) return null;
      const children = getFolderChildren(folder.id);
      const isExpanded = expandedFolderIds.has(folder.id);
      const nextAncestors = new Set(ancestors).add(folder.id);
      const isDropTarget = libraryDropTarget === `folder:${folder.id}`;
      return (
        <div key={folder.id}>
          <div
            draggable
            onDragStart={(event) => {
              event.stopPropagation();
              event.dataTransfer.effectAllowed = "move";
              setDraggedLibraryItem({ type: "folder", id: folder.id });
            }}
            onDragEnd={() => {
              setDraggedLibraryItem(null);
              setLibraryDropTarget(null);
            }}
            onDragOver={(event) => {
              event.preventDefault();
              event.stopPropagation();
              event.dataTransfer.dropEffect = "move";
              setLibraryDropTarget(`folder:${folder.id}`);
            }}
            onDrop={(event) => {
              event.preventDefault();
              event.stopPropagation();
              void moveLibraryItem(folder.id);
            }}
            onContextMenu={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setFolderMenuId(folder.id);
            }}
            className={`relative flex items-center rounded text-sm ${focusedTreeFolderId === folder.id ? "ring-1 ring-blue-300 bg-blue-50" : ""} ${
              isDropTarget ? "ring-2 ring-blue-400 bg-blue-50" : ""
            }`}
            style={{ paddingLeft: `${depth * 14}px` }}
          >
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                setExpandedFolderIds((current) => {
                  const next = new Set(current);
                  if (next.has(folder.id)) next.delete(folder.id);
                  else next.add(folder.id);
                  return next;
                });
              }}
              disabled={children.length === 0}
              className="shrink-0 p-1 text-gray-500 disabled:opacity-20"
              aria-label={isExpanded ? "フォルダーを閉じる" : "フォルダーを開く"}
            >
              {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
            <button
              type="button"
              onClick={() => {
                setFocusedTreeFolderId(folder.id);
                setSelectedFolder(folder.id);
                folderTreeRef.current?.focus();
                if (children.length > 0) {
                  setExpandedFolderIds((current) =>
                    new Set(current).add(folder.id),
                  );
                }
              }}
              className={`min-w-0 flex-1 flex items-center justify-between gap-2 px-1 py-2 text-left ${
                selectedFolder === folder.id
                  ? "text-blue-800 font-medium"
                  : "text-gray-700 hover:text-gray-900"
              }`}
            >
              <span className="flex min-w-0 items-center gap-1.5">
                <Folder size={15} className="shrink-0" />
                <span className="truncate">{folder.name}</span>
              </span>
              <span className="text-xs opacity-70">
                {units.filter((unit) => unit.folder_id === folder.id).length}
              </span>
            </button>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                setFolderMenuId(
                  folderMenuId === folder.id ? null : folder.id,
                );
              }}
              className="shrink-0 p-1 text-gray-500 hover:text-gray-800"
              aria-label={`${folder.name}のメニュー`}
            >
              <MoreVertical size={15} />
            </button>

            {folderMenuId === folder.id && (
              <div
                className="absolute right-0 top-full z-30 w-40 rounded-md border border-gray-200 bg-white py-1 shadow-lg"
                onClick={(event) => event.stopPropagation()}
              >
                <button
                  type="button"
                  onClick={() => {
                    setSelectedFolder(folder.id);
                    setExpandedFolderIds((current) =>
                      new Set(current).add(folder.id),
                    );
                    setShowFolderInput(true);
                    setFolderMenuId(null);
                  }}
                  className="block w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-100"
                >
                  サブフォルダーを追加
                </button>
                <button
                  type="button"
                  onClick={() => renameFolder(folder)}
                  className="block w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-100"
                >
                  名前を変更
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const descendants = getDescendantFolderIds(folder.id);
                    const affectedUnits = units.filter(
                      (unit) =>
                        unit.folder_id === folder.id ||
                        (unit.folder_id && descendants.has(unit.folder_id)),
                    ).length;
                    const message =
                      descendants.size > 0 || affectedUnits > 0
                        ? `「${folder.name}」には子フォルダー${descendants.size}個、ユニット${affectedUnits}個が含まれています。すべて削除しますか？`
                        : `「${folder.name}」を削除しますか？`;
                    if (window.confirm(message)) void deleteFolder(folder.id);
                  }}
                  className="block w-full px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50"
                >
                  削除
                </button>
              </div>
            )}
          </div>
          {isExpanded && renderFolderTree(folder.id, depth + 1, nextAncestors)}
        </div>
      );
    });
  const startEditUnit = (unit: UnitType) => {
    const media = localUnitMedia[unit.id];
    setEditingUnit(unit);
    setEditUnitTitle(unit.title);
    setEditUnitFolder(unit.folder_id || "");
    setEditUnitEnglish(unit.lines.map((l) => l.english).join("\n"));
    setEditUnitJapanese(unit.lines.map((l) => l.japanese).join("\n"));
    setEditUnitPhonetic(unit.lines.map((l) => l.phonetic).join("\n"));
    setEditUnitPhoneticReview([]);
    setEditAudioName(media?.audioName ?? "");
    setEditAudioUrl(media?.audioUrl ?? "");
    setEditAudioFile(null);
    setRemoveEditAudio(false);
    setRemoveEditAlignment(false);
    setEditMediaDuration(undefined);
    setEditUploadAudio(false);
    setEditAlignmentName(media?.alignmentName ?? "");
    setEditAlignment(media?.alignment ?? null);
    setEditAlignmentFile(null);
    setEditMediaError("");
    setEditMediaDirty(false);
    setCurrentView("edit");
  };

  const cancelUnitEdit = () => {
    if (
      hasUnitUnsavedChanges &&
      !window.confirm("変更を保存せずに終了しますか？")
    ) {
      return false;
    }
    if (
      editingUnit &&
      editAudioUrl &&
      editAudioUrl !== localUnitMedia[editingUnit.id]?.audioUrl
    ) {
      URL.revokeObjectURL(editAudioUrl);
    }
    setCurrentView("list");
    setEditingUnit(null);
    setEditMediaDirty(false);
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
  const quickVocabularyQuery = quickVocabularySearch.trim().toLocaleLowerCase();
  const quickVocabulary = selectedUnit
    ? vocabulary.filter(
        (item) =>
          item.unit_id === selectedUnit.id &&
          (!quickVocabularyQuery ||
            item.word.toLocaleLowerCase().includes(quickVocabularyQuery) ||
            item.meaning.toLocaleLowerCase().includes(quickVocabularyQuery)),
      )
    : [];

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
      ...(removeEditAudio ? { audio_path: null, audio_name: null } : {}),
      ...(removeEditAlignment ? {
        alignment_path: null, alignment_name: null, alignment_data: null, alignment_edits: null,
      } : {}),
      title: editUnitTitle.trim() || "無題",
      folder_id: editUnitFolder || null,
      lines: parsed,
    };
    const { error: updateError } = await supabase
      .from("units")
      .update(updatedUnit)
      .eq("id", editingUnit.id);
    if (updateError) {
      alert(`ユニットの更新に失敗しました: ${updateError.message}`);
      return;
    }
    let uploadedChanges: Partial<UnitType> = {};
    try {
      uploadedChanges = await uploadUnitMedia({
        unitId: editingUnit.id,
        audioFile: editAudioFile,
        uploadAudio: editUploadAudio,
        alignmentFile: editAlignmentFile,
        alignment: editAlignment,
        existingAudioPath: editingUnit.audio_path,
      });
    } catch (uploadError) {
      console.error("unit media upload error", uploadError);
      alert(
        `テキストは保存されましたが、ファイル保存に失敗しました: ${
          uploadError instanceof Error ? uploadError.message : "不明なエラー"
        }`,
      );
      return;
    }
    const savedUnit = {
      ...updatedUnit,
      ...uploadedChanges,
      updated_at: new Date().toISOString(),
    } as UnitType;
    setUnits(units.map((u) => (u.id === editingUnit.id ? savedUnit : u)));
    {
      const savedAudioUrl = uploadedChanges.audio_path
        ? supabase.storage
            .from(UNIT_MEDIA_BUCKET)
            .getPublicUrl(uploadedChanges.audio_path).data.publicUrl
        : editAudioUrl;
      setLocalUnitMedia((current) => ({
        ...current,
        [editingUnit.id]: {
          audioName: editAudioName,
          audioUrl: savedAudioUrl,
          alignmentName: editAlignmentName,
          alignment: editAlignment,
        },
      }));
    }
    const deletedPaths = [
      removeEditAudio ? editingUnit.audio_path : null,
      removeEditAlignment ? editingUnit.alignment_path : null,
    ].filter((path): path is string => Boolean(path));
    if (deletedPaths.length) {
      const { error } = await supabase.storage.from(UNIT_MEDIA_BUCKET).remove(deletedPaths);
      if (error) {
        setEditMediaError(`ユニットの変更は保存されましたが、クラウドのファイル削除に失敗しました: ${error.message}`);
        return;
      }
    }
    setCurrentView("list");
    setEditingUnit(null);
    setEditMediaDirty(false);
  };

  // === ここからUI部分 ===
  return (
    <div className={`${currentView === "reader" ? "flex h-dvh flex-col overflow-hidden" : "min-h-screen"} bg-gradient-to-br from-blue-50 to-indigo-100 p-6`}>
      <div
        className={
          currentView === "reader" && hasReaderSidePanel
            ? "mx-auto flex min-h-0 w-full max-w-none flex-1 flex-col"
            : currentView === "reader" ? "mx-auto flex min-h-0 w-full max-w-7xl flex-1 flex-col" : "mx-auto max-w-7xl"
        }
      >
        <div className={`flex shrink-0 justify-between items-center ${currentView === "reader" ? "mb-3" : "mb-8"}`}>
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
                onClick={() => {
                  setNewUnitFolder(selectedFolder ?? "");
                  setCurrentView("add");
                }}
                className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
              >
                <Plus size={20} />
                新規ユニット追加
              </button>
            </div>
            <div className={`grid items-start gap-2 sm:gap-4 ${
              isFolderSidebarCollapsed
                ? "grid-cols-[36px_minmax(0,1fr)]"
                : "grid-cols-[140px_minmax(0,1fr)] sm:grid-cols-[220px_minmax(0,1fr)]"
            }`}>
              <aside
                ref={folderTreeRef}
                tabIndex={0}
                onKeyDown={handleTreeKeyboard}
                className="sticky top-4 min-w-0 rounded-lg bg-white p-2 shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-300"
                aria-label="フォルダー一覧"
              >
                <button
                  type="button"
                  title={isFolderSidebarCollapsed ? "フォルダー一覧を展開" : "フォルダー一覧を折りたたむ"}
                  aria-expanded={!isFolderSidebarCollapsed}
                  onClick={() => setIsFolderSidebarCollapsed((current) => !current)}
                  className="mb-2 rounded p-1 text-gray-500 hover:bg-gray-100"
                >
                  {isFolderSidebarCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
                </button>
                {!isFolderSidebarCollapsed && <>
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
                  <div
                    onDragOver={(event) => {
                      event.preventDefault();
                      event.dataTransfer.dropEffect = "move";
                      setLibraryDropTarget("root");
                    }}
                    onDragLeave={() =>
                      setLibraryDropTarget((current) =>
                        current === "root" ? null : current,
                      )
                    }
                    onDrop={(event) => {
                      event.preventDefault();
                      void moveLibraryItem(null);
                    }}
                    className={`min-h-8 rounded text-sm ${
                      libraryDropTarget === "root"
                        ? "bg-blue-50 text-blue-800 ring-2 ring-blue-400"
                        : "text-gray-700"
                    }`}
                  >
                    {renderFolderTree(null)}
                  </div>
                </div>
                </>}
              </aside>

              <main
                ref={libraryContentsRef}
                tabIndex={0}
                aria-label="フォルダーの内容"
                onKeyDown={(event) => {
                  if (event.key === "Tab" && event.shiftKey && !isFolderSidebarCollapsed) {
                    event.preventDefault();
                    folderTreeRef.current?.focus();
                  }
                }}
                className="min-w-0 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm"
                onClick={(event) => {
                  if (event.currentTarget === event.target) {
                    setSelectedLibraryItem(null);
                  }
                }}
              >
                {selectedFolder && (
                  <div className="flex items-center gap-2 border-b border-gray-200 px-3 py-2 text-sm">
                    <button
                      type="button"
                      title="親フォルダーへ戻る"
                      onClick={() => {
                        const folder = folders.find((item) => item.id === selectedFolder);
                        openLibraryFolder(folder?.parent_id ?? null);
                        setSelectedLibraryItem({ type: "folder", id: selectedFolder });
                      }}
                      className="rounded p-1 text-gray-500 hover:bg-gray-100"
                    >
                      <ArrowLeft size={16} />
                    </button>
                    <span className="truncate text-gray-700">
                      {folders.find((item) => item.id === selectedFolder)?.name}
                    </span>
                  </div>
                )}
                <div className="grid grid-cols-[minmax(0,1fr)_90px_110px] border-b border-gray-200 bg-gray-50 px-3 text-xs font-medium text-gray-500">
                  <button
                    type="button"
                    onClick={() => {
                      if (librarySortKey === "name") {
                        setLibrarySortDirection((current) =>
                          current === "asc" ? "desc" : "asc",
                        );
                      } else {
                        setLibrarySortKey("name");
                        setLibrarySortDirection("asc");
                      }
                    }}
                    className="py-2 text-left hover:text-gray-900"
                  >
                    名前 {librarySortKey === "name" ? (librarySortDirection === "asc" ? "↑" : "↓") : ""}
                  </button>
                  <span className="py-2 text-right">行数</span>
                  <button
                    type="button"
                    onClick={() => {
                      if (librarySortKey === "created") {
                        setLibrarySortDirection((current) =>
                          current === "asc" ? "desc" : "asc",
                        );
                      } else {
                        setLibrarySortKey("created");
                        setLibrarySortDirection("desc");
                      }
                    }}
                    className="py-2 text-right hover:text-gray-900"
                  >
                    作成日 {librarySortKey === "created" ? (librarySortDirection === "asc" ? "↑" : "↓") : ""}
                  </button>
                </div>

                {getVisibleFolders().length === 0 &&
                getFilteredUnits().length === 0 ? (
                  <div className="py-12 text-center text-sm text-gray-500">
                    <BookOpen size={36} className="mx-auto mb-3 opacity-30" />
                    <p>この場所には項目がありません。</p>
                  </div>
                ) : (
                  <div className="divide-y divide-gray-100">
                    {getVisibleFolders().map((folder) => {
                      const item: LibraryItemRef = { type: "folder", id: folder.id };
                      const selected =
                        selectedLibraryItem?.type === "folder" &&
                        selectedLibraryItem.id === folder.id;
                      const renaming =
                        renamingLibraryItem?.type === "folder" &&
                        renamingLibraryItem.id === folder.id;
                      return (
                        <div
                          key={`content-folder-${folder.id}`}
                          draggable={!renaming}
                          onDragStart={(event) => {
                            event.dataTransfer.effectAllowed = "move";
                            setDraggedLibraryItem({ type: "folder", id: folder.id });
                          }}
                          onDragOver={(event) => event.preventDefault()}
                          onDrop={(event) => {
                            event.preventDefault();
                            void moveLibraryItem(folder.id);
                          }}
                          onClick={(event) => handleLibraryItemClick(event, item, folder.name)}
                          onDoubleClick={() => {
                            cancelPendingLibraryRename();
                            openLibraryFolder(folder.id);
                            setExpandedFolderIds((current) => new Set(current).add(folder.id));
                          }}
                          onContextMenu={(event) => {
                            event.preventDefault();
                            setSelectedLibraryItem(item);
                            setLibraryContextMenu({ ...item, x: event.clientX, y: event.clientY });
                          }}
                          className={`grid h-10 cursor-default grid-cols-[minmax(0,1fr)_90px_110px] items-center px-3 text-sm ${
                            selected ? "bg-blue-100 text-blue-950" : "hover:bg-gray-50"
                          }`}
                        >
                          <div className="flex min-w-0 items-center gap-2">
                            <Folder size={17} className="shrink-0 text-amber-500" />
                            {renaming ? (
                              <input
                                autoFocus
                                value={renamingLibraryValue}
                                onChange={(event) => setRenamingLibraryValue(event.target.value)}
                                onBlur={() => void saveLibraryRename()}
                                onKeyDown={(event) => {
                                  if (event.key === "Enter") event.currentTarget.blur();
                                  if (event.key === "Escape") setRenamingLibraryItem(null);
                                }}
                                className="min-w-0 flex-1 border border-blue-500 bg-white px-1 outline-none"
                              />
                            ) : (
                              <span className="truncate">{folder.name}</span>
                            )}
                          </div>
                          <span />
                          <span className="text-right text-xs text-gray-500">
                            {folder.created_at
                              ? new Date(folder.created_at).toLocaleDateString("ja-JP")
                              : ""}
                          </span>
                        </div>
                      );
                    })}

                    {getFilteredUnits().map((unit) => {
                      const item: LibraryItemRef = { type: "unit", id: unit.id };
                      const selected =
                        selectedLibraryItem?.type === "unit" &&
                        selectedLibraryItem.id === unit.id;
                      const renaming =
                        renamingLibraryItem?.type === "unit" &&
                        renamingLibraryItem.id === unit.id;
                      return (
                        <div
                          key={unit.id}
                          draggable={!renaming}
                          onDragStart={(event) => {
                            event.dataTransfer.effectAllowed = "move";
                            setDraggedLibraryItem({ type: "unit", id: unit.id });
                          }}
                          onDragEnd={() => {
                            setDraggedLibraryItem(null);
                            setLibraryDropTarget(null);
                          }}
                          onClick={(event) => handleLibraryItemClick(event, item, unit.title)}
                          onDoubleClick={() => {
                            cancelPendingLibraryRename();
                            openUnit(unit);
                          }}
                          onContextMenu={(event) => {
                            event.preventDefault();
                            setSelectedLibraryItem(item);
                            setLibraryContextMenu({ ...item, x: event.clientX, y: event.clientY });
                          }}
                          className={`grid h-10 cursor-default grid-cols-[minmax(0,1fr)_90px_110px] items-center px-3 text-sm ${
                            selected ? "bg-blue-100 text-blue-950" : "hover:bg-gray-50"
                          }`}
                        >
                          <div className="flex min-w-0 items-center gap-2">
                            <BookOpen size={16} className="shrink-0 text-blue-500" />
                            {renaming ? (
                              <input
                                autoFocus
                                value={renamingLibraryValue}
                                onChange={(event) => setRenamingLibraryValue(event.target.value)}
                                onBlur={() => void saveLibraryRename()}
                                onKeyDown={(event) => {
                                  if (event.key === "Enter") event.currentTarget.blur();
                                  if (event.key === "Escape") setRenamingLibraryItem(null);
                                }}
                                className="min-w-0 flex-1 border border-blue-500 bg-white px-1 outline-none"
                              />
                            ) : (
                              <span className="truncate">{unit.title}</span>
                            )}
                          </div>
                          <span className="text-right text-xs text-gray-500">
                            {unit.lines.length}
                          </span>
                          <span className="text-right text-xs text-gray-500">
                            {unit.created_at
                              ? new Date(unit.created_at).toLocaleDateString("ja-JP")
                              : ""}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
                {selectedFolder === null && recentUnits.length > 0 && (
                  <section className="mt-6 border-t border-gray-200 pb-2">
                    <h3 className="px-3 py-2 text-xs font-medium text-gray-500">
                      最近編集した項目
                    </h3>
                    {recentUnits.map((unit) => {
                      const id = unit.id;
                      return (
                        <div
                          key={`recent-${id}`}
                          onClick={() => setSelectedLibraryItem({ type: "unit", id })}
                          onDoubleClick={() => openUnit(unit)}
                          onContextMenu={(event) => {
                            event.preventDefault();
                            setLibraryContextMenu({ type: "unit", id, x: event.clientX, y: event.clientY });
                          }}
                          className={`flex h-9 cursor-default items-center gap-2 px-3 text-sm ${
                            selectedLibraryItem?.type === "unit" && selectedLibraryItem.id === id
                              ? "bg-blue-100 text-blue-950"
                              : "hover:bg-gray-50"
                          }`}
                        >
                          <BookOpen size={16} className="shrink-0 text-gray-400" />
                          <span className="min-w-0 flex-1 truncate">{unit.title}</span>
                          <span className="max-w-[40%] truncate text-xs text-gray-400">
                            {folders.find((folder) => folder.id === unit.folder_id)?.name ?? ""}
                          </span>
                        </div>
                      );
                    })}
                  </section>
                )}
              </main>
            </div>

            {libraryContextMenu && (
              <div
                className="fixed z-[80] w-44 rounded-md border border-gray-200 bg-white py-1 text-sm shadow-xl"
                style={{ left: libraryContextMenu.x, top: libraryContextMenu.y }}
                onClick={(event) => event.stopPropagation()}
              >
                {libraryContextMenu.type === "unit" ? (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        const unit = units.find((item) => item.id === libraryContextMenu.id);
                        if (unit) openUnit(unit);
                        setLibraryContextMenu(null);
                      }}
                      className="block w-full px-3 py-1.5 text-left hover:bg-gray-100"
                    >
                      開く
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const unit = units.find((item) => item.id === libraryContextMenu.id);
                        if (unit) startEditUnit(unit);
                        setLibraryContextMenu(null);
                      }}
                      className="block w-full px-3 py-1.5 text-left hover:bg-gray-100"
                    >
                      編集
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const unit = units.find((item) => item.id === libraryContextMenu.id);
                        if (unit) beginLibraryRename({ type: "unit", id: unit.id }, unit.title);
                      }}
                      className="block w-full px-3 py-1.5 text-left hover:bg-gray-100"
                    >
                      名前を変更
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const unit = units.find((item) => item.id === libraryContextMenu.id);
                        if (unit) void deleteUnit(unit);
                      }}
                      className="block w-full px-3 py-1.5 text-left text-red-600 hover:bg-red-50"
                    >
                      削除
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        openLibraryFolder(libraryContextMenu.id);
                        setLibraryContextMenu(null);
                      }}
                      className="block w-full px-3 py-1.5 text-left hover:bg-gray-100"
                    >
                      開く
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const folder = folders.find((item) => item.id === libraryContextMenu.id);
                        if (folder) beginLibraryRename({ type: "folder", id: folder.id }, folder.name);
                      }}
                      className="block w-full px-3 py-1.5 text-left hover:bg-gray-100"
                    >
                      名前を変更
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const folder = folders.find((item) => item.id === libraryContextMenu.id);
                        if (folder && window.confirm(`「${folder.name}」を削除しますか？`)) {
                          void deleteFolder(folder.id);
                        }
                        setLibraryContextMenu(null);
                      }}
                      className="block w-full px-3 py-1.5 text-left text-red-600 hover:bg-red-50"
                    >
                      削除
                    </button>
                  </>
                )}
              </div>
            )}
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
                  {getFolderOptions().map(({ folder, depth }) => (
                    <option key={folder.id} value={folder.id}>
                      {`${"　".repeat(depth)}${depth > 0 ? "└ " : ""}${folder.name}`}
                    </option>
                  ))}
                </select>
              </div>

              <MediaFields
                audioName={newAudioName} audioUrl={newAudioUrl}
                alignmentName={newAlignmentName} alignment={newAlignment}
                error={newMediaError} uploadAudio={newUploadAudio}
                onUploadAudio={setNewUploadAudio}
                onAudio={handleNewAudioFile}
                onAlignment={(file) => void handleNewAlignmentFile(file)}
                duration={newMediaDuration} onDuration={setNewMediaDuration}
                onRemoveAudio={() => {
                  if (!window.confirm("選択した音声を削除しますか？")) return;
                  if (newAudioUrl.startsWith("blob:")) URL.revokeObjectURL(newAudioUrl);
                  setNewAudioName(""); setNewAudioUrl(""); setNewAudioFile(null);
                  setNewMediaDuration(undefined); setNewUploadAudio(false);
                }}
                onRemoveAlignment={() => {
                  if (!window.confirm("選択したJSONを削除しますか？")) return;
                  setNewAlignmentName(""); setNewAlignment(null); setNewAlignmentFile(null);
                  setNewMediaError("");
                }}
              />

              <div className="space-y-3">
                <div>
                  <div className="mb-1 flex items-center justify-between gap-3">
                    <label className="text-xs font-medium text-gray-600">
                      英文
                    </label>
                    <button
                      type="button"
                      onClick={() =>
                        generateBothUnitFields(
                          newUnitEnglish,
                          newUnitJapanese,
                          newUnitPhonetic,
                          setNewUnitJapanese,
                          setNewUnitPhonetic,
                          setNewUnitPhoneticReview,
                        )
                      }
                      disabled={generatingUnitField !== null}
                      className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {generatingUnitField === "both"
                        ? "生成中..."
                        : "和訳＋発音をAI生成"}
                    </button>
                  </div>
                  <textarea
                    value={newUnitEnglish}
                    onChange={(e) => handleNewUnitEnglishChange(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm h-40"
                  />
                </div>

                <div>
                  <div className="mb-1 flex items-center justify-between gap-3">
                    <label className="text-xs font-medium text-gray-600">
                      和訳
                    </label>
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
                  <textarea
                    value={newUnitJapanese}
                    onChange={(e) => setNewUnitJapanese(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm h-40"
                  />
                </div>

                <div>
                  <div className="mb-1 flex items-center justify-between gap-3">
                    <label className="text-xs font-medium text-gray-600">
                      発音記号
                    </label>
                    <button
                      type="button"
                      onClick={() =>
                        generateUnitField(
                          "phonetic",
                          newUnitEnglish,
                          newUnitPhonetic,
                          setNewUnitPhonetic,
                          setNewUnitPhoneticReview,
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
                  <PhoneticEditor
                    source={newUnitEnglish}
                    value={newUnitPhonetic}
                    issues={newUnitPhoneticReview}
                    onChange={setNewUnitPhonetic}
                    onIssuesChange={setNewUnitPhoneticReview}
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
        {currentView === "edit" && editingUnit && (
          <div className="max-w-4xl mx-auto pb-24">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-gray-800">ユニット編集</h2>
              <button
                onClick={cancelUnitEdit}
                className="text-gray-600 hover:text-gray-800"
              >
                <X size={24} />
              </button>
            </div>

            <div className="flex flex-col gap-4 rounded-lg bg-white p-6 shadow-md">
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
                  {getFolderOptions().map(({ folder, depth }) => (
                    <option key={folder.id} value={folder.id}>
                      {`${"　".repeat(depth)}${depth > 0 ? "└ " : ""}${folder.name}`}
                    </option>
                  ))}
                </select>
              </div>

              <div className="order-2 flex flex-col gap-3">

                <div className="order-2">
                  <div className="mb-1 flex items-center justify-between gap-3">
                    <label className="text-xs font-medium text-gray-600">
                      和訳
                    </label>
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
                  <textarea
                    value={editUnitJapanese}
                    onChange={(e) => setEditUnitJapanese(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm h-40"
                  />
                </div>

                <div className="order-1">
                  <div className="mb-1 flex items-center justify-between gap-3">
                    <label className="text-xs font-medium text-gray-600">
                      原文・発音記号
                    </label>
                    <div className="flex flex-wrap justify-end gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          generateUnitField(
                            "phonetic",
                            editUnitEnglish,
                            editUnitPhonetic,
                            setEditUnitPhonetic,
                            setEditUnitPhoneticReview,
                          )
                        }
                        disabled={generatingUnitField !== null}
                        className="rounded-lg border border-blue-600 px-3 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {generatingUnitField === "phonetic"
                          ? "生成中..."
                          : "発音をAI生成"}
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          generateBothUnitFields(
                            editUnitEnglish,
                            editUnitJapanese,
                            editUnitPhonetic,
                            setEditUnitJapanese,
                            setEditUnitPhonetic,
                            setEditUnitPhoneticReview,
                          )
                        }
                        disabled={generatingUnitField !== null}
                        className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {generatingUnitField === "both"
                          ? "生成中..."
                          : "和訳＋発音をAI生成"}
                      </button>
                    </div>
                  </div>
                  <PhoneticEditor
                    source={editUnitEnglish}
                    value={editUnitPhonetic}
                    issues={editUnitPhoneticReview}
                    onSourceChange={handleEditUnitEnglishChange}
                    onChange={setEditUnitPhonetic}
                    onIssuesChange={setEditUnitPhoneticReview}
                  />
                </div>
              </div>

              <div className="order-1">
                <MediaFields
                  audioName={editAudioName} audioUrl={editAudioUrl}
                  alignmentName={editAlignmentName} alignment={editAlignment}
                  error={editMediaError} uploadAudio={editUploadAudio}
                  onUploadAudio={editAudioFile ? (value) => {
                    setEditUploadAudio(value); setEditMediaDirty(true);
                  } : undefined}
                  onAudio={handleEditAudioFile}
                  onAlignment={(file) => void handleEditAlignmentFile(file)}
                  duration={editMediaDuration} onDuration={setEditMediaDuration}
                  onRemoveAudio={() => {
                    if (!window.confirm("音声を削除しますか？保存時にクラウド上の音声も削除されます。")) return;
                    setEditAudioName(""); setEditAudioUrl(""); setEditAudioFile(null);
                    setEditMediaDuration(undefined); setEditUploadAudio(false);
                    setRemoveEditAudio(true); setEditMediaDirty(true);
                  }}
                  onRemoveAlignment={() => {
                    if (!window.confirm("JSONと音声同期情報を削除しますか？保存時に反映されます。")) return;
                    setEditAlignmentName(""); setEditAlignment(null); setEditAlignmentFile(null);
                    setRemoveEditAlignment(true); setEditMediaDirty(true);
                    setEditMediaError("");
                  }}
                />
              </div>

              <div className="fixed bottom-3 left-1/2 z-50 flex w-[calc(100%-1.5rem)] max-w-xl -translate-x-1/2 items-center gap-2 rounded-2xl border border-gray-200 bg-white/95 p-2 shadow-xl backdrop-blur">
                <button
                  onClick={saveEditUnit}
                  className="flex-1 rounded-xl bg-blue-600 px-4 py-2.5 text-white hover:bg-blue-700"
                >
                  保存
                </button>
                <button
                  onClick={cancelUnitEdit}
                  className="rounded-xl border border-gray-300 px-4 py-2.5 text-gray-700 hover:bg-gray-50"
                >
                  キャンセル
                </button>
                <button
                  onClick={async () => {
                    if (!editingUnit) return;
                    const ok = window.confirm(
                      `「${editingUnit.title}」を本当に削除しますか？`,
                    );
                    if (!ok) return;

                    const { error } = await supabase
                      .from("units")
                      .delete()
                      .eq("id", editingUnit.id);
                    if (error) {
                      alert(`ユニットの削除に失敗しました: ${error.message}`);
                      return;
                    }
                    void removeUnitMediaFiles([editingUnit]);
                    setUnits(units.filter((u) => u.id !== editingUnit.id));
                    setEditingUnit(null);
                    setCurrentView("list");
                  }}
                  className="rounded-xl px-4 py-2.5 text-red-600 hover:bg-red-50"
                >
                  削除
                </button>
              </div>
            </div>
          </div>
        )}

        {/* === リーダー画面 === */}
        {currentView === "reader" && (
          <div
            className={`flex min-h-0 w-full max-w-4xl flex-1 flex-col ${
              hasReaderSidePanel
                ? "mx-auto lg:ml-auto lg:mr-[46vw] lg:w-[calc(100%-46vw)] lg:max-w-4xl lg:pr-4 xl:mr-[42vw] xl:w-[calc(100%-42vw)]"
                : "mx-auto"
            }`}
          >
            <div data-reader-scroll className="min-h-0 flex-1 space-y-1 overflow-y-auto rounded-t-lg bg-white py-4 pl-10 pr-4 shadow-md">
              {selectedUnit?.lines.map((line) => {
                const timedLine = localUnitMedia[
                  selectedUnit.id
                ]?.alignment?.lines.find((item) => item.lineId === line.id);
                const englishWords = line.english.trim().split(/\s+/);
                const phoneticWords = line.phonetic.includes("|")
                  ? line.phonetic.split(/\s*\|\s*/)
                  : line.phonetic.trim().split(/\s+/);
                const pronunciationSegments = segmentPronunciationLine(
                  line.english,
                );
                const nonWhitespaceSegments = pronunciationSegments.filter(
                  (segment) => !segment.isWhitespace,
                );
                const canAlignSegments =
                  line.showPhonetic &&
                  line.phonetic.includes("|") &&
                  phoneticWords.length === nonWhitespaceSegments.length;
                const canAlignPhonetic =
                  line.showPhonetic &&
                  line.phonetic &&
                  englishWords.length === phoneticWords.length;

                return (
                  <div
                    key={line.id}
                    data-reader-line-id={line.id}
                    className={`relative border-b border-gray-100 pb-2 transition-colors last:border-0 ${
                      (timingEditing ? timingEditLineId === line.id : activeTimedLineId === line.id)
                        ? "rounded bg-blue-50/70"
                        : ""
                    }`}
                    onClick={() => {
                      if (window.getSelection()?.toString().trim()) return;
                      seekToTimedLine(line.id);
                    }}
                  >
                    <div className="absolute -left-8 top-0 z-10 flex flex-col gap-0.5 rounded bg-white/80 p-0.5 shadow-sm backdrop-blur-sm">
                      <button
                        type="button"
                        aria-label={`${line.id + 1}行目の発音記号を${line.showPhonetic ? "隠す" : "表示"}`}
                        title="この行の発音記号を切り替え"
                        onClick={(event) => {
                          event.stopPropagation();
                          setSelectedUnit({
                            ...selectedUnit,
                            lines: selectedUnit.lines.map((item) =>
                              item.id === line.id
                                ? { ...item, showPhonetic: !item.showPhonetic }
                                : item,
                            ),
                          });
                        }}
                        className={`h-5 w-6 rounded text-[10px] font-medium transition ${
                          line.showPhonetic
                            ? "bg-violet-100 text-violet-700"
                            : "text-gray-400 opacity-60 hover:bg-gray-100 hover:opacity-100"
                        }`}
                      >
                        発
                      </button>
                      <button
                        type="button"
                        aria-label={`${line.id + 1}行目の和訳を${line.showJapanese ? "隠す" : "表示"}`}
                        title="この行の和訳を切り替え"
                        onClick={(event) => {
                          event.stopPropagation();
                          setSelectedUnit({
                            ...selectedUnit,
                            lines: selectedUnit.lines.map((item) =>
                              item.id === line.id
                                ? { ...item, showJapanese: !item.showJapanese }
                                : item,
                            ),
                          });
                        }}
                        className={`h-5 w-6 rounded text-[10px] font-medium transition ${
                          line.showJapanese
                            ? "bg-blue-100 text-blue-700"
                            : "text-gray-400 opacity-60 hover:bg-gray-100 hover:opacity-100"
                        }`}
                      >
                        日
                      </button>
                    </div>
                    <div
                      className={`min-w-0 max-w-full select-text ${
                        timedLine?.startMs !== null &&
                        localUnitMedia[selectedUnit.id]?.audioUrl
                          ? "cursor-pointer"
                          : "cursor-text"
                      }`}
                      onMouseUp={() => handleTextSelection(line.id)}
                    >
                      {line.showPhonetic &&
                        line.phonetic &&
                        !canAlignSegments &&
                        !canAlignPhonetic && (
                        <div className="mb-1 break-words text-sm leading-snug text-gray-500 [overflow-wrap:anywhere]">
                          {line.phonetic}
                        </div>
                      )}
                      {canAlignSegments ? (
                        <div className="max-w-full break-words pt-1 text-lg leading-tight [overflow-wrap:anywhere]">
                          {(() => {
                            let phoneticIndex = 0;
                            let characterOffset = 0;
                            return pronunciationSegments.map(
                              (segment, index) => {
                                const startChar = characterOffset;
                                characterOffset += segment.text.length;
                                if (segment.isWhitespace) {
                                  return (
                                    <span key={`${line.id}-space-${index}`}>
                                      {segment.text}
                                    </span>
                                  );
                                }

                                const phonetic =
                                  phoneticWords[phoneticIndex++] ?? "";
                                const timedWord = timedLine?.words.find(
                                  (word) =>
                                    word.startChar < characterOffset &&
                                    word.endChar > startChar,
                                );
                                const isActiveWord =
                                  activeTimedLineId === line.id &&
                                  activeTimedWordIndex === timedWord?.wordIndex;
                                return phonetic ? (
                                  <ruby
                                    key={`${line.id}-segment-${index}`}
                                    onClick={(event) => {
                                      if (window.getSelection()?.toString().trim()) return;
                                      if (!timedWord) return;
                                      event.stopPropagation();
                                      handleTimedTargetClick(
                                        `word:${line.id}:${timedWord.wordIndex}`,
                                        timedWord.startMs / 1000,
                                      );
                                    }}
                                    className={`whitespace-nowrap rounded-sm leading-tight [ruby-overhang:none] ${
                                      isActiveWord
                                        ? "bg-blue-200 text-blue-950"
                                        : ""
                                    }`}
                                  >
                                    {segment.text}
                                    <rt className="text-sm font-normal leading-none text-gray-500">
                                      {phonetic}
                                    </rt>
                                  </ruby>
                                ) : (
                                  <span
                                    key={`${line.id}-segment-${index}`}
                                    onClick={(event) => {
                                      if (window.getSelection()?.toString().trim()) return;
                                      if (!timedWord) return;
                                      event.stopPropagation();
                                      handleTimedTargetClick(`word:${line.id}:${timedWord.wordIndex}`, timedWord.startMs / 1000);
                                    }}
                                    className={`whitespace-nowrap rounded-sm ${
                                      isActiveWord
                                        ? "bg-blue-200 text-blue-950"
                                        : ""
                                    }`}
                                  >
                                    {segment.text}
                                  </span>
                                );
                              },
                            );
                          })()}
                        </div>
                      ) : canAlignPhonetic ? (
                        <div className="flex flex-wrap items-end gap-x-2 gap-y-0.5 pt-1 text-lg leading-tight">
                          {englishWords.map((word, index) => {
                            const timedWord = timedLine?.words[index];
                            return (
                            <ruby
                              key={`${line.id}-${index}`}
                              onClick={(event) => {
                                if (window.getSelection()?.toString().trim()) return;
                                if (!timedWord) return;
                                event.stopPropagation();
                                handleTimedTargetClick(
                                  `word:${line.id}:${timedWord.wordIndex}`,
                                  timedWord.startMs / 1000,
                                );
                              }}
                              className={`max-w-full whitespace-nowrap rounded-sm leading-tight [ruby-overhang:none] ${
                                activeTimedLineId === line.id &&
                                activeTimedWordIndex === timedWord?.wordIndex
                                  ? "bg-blue-200 text-blue-950"
                                  : ""
                              }`}
                            >
                              {word}
                              <rt className="text-sm font-normal leading-none text-gray-500">
                                {phoneticWords[index]}
                              </rt>
                            </ruby>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="break-words text-lg leading-snug [overflow-wrap:anywhere]">
                          {(() => {
                            let characterOffset = 0;
                            return pronunciationSegments.map((segment, index) => {
                              const startChar = characterOffset;
                              characterOffset += segment.text.length;
                              const timedWord = timedLine?.words.find(
                                (word) =>
                                  word.startChar < characterOffset &&
                                  word.endChar > startChar,
                              );
                              const isActiveWord =
                                activeTimedLineId === line.id &&
                                activeTimedWordIndex === timedWord?.wordIndex;
                              return (
                                <span
                                  key={`${line.id}-plain-${index}`}
                                  onClick={(event) => {
                                    if (window.getSelection()?.toString().trim()) return;
                                    if (!timedWord) return;
                                    event.stopPropagation();
                                    handleTimedTargetClick(
                                      `word:${line.id}:${timedWord.wordIndex}`,
                                      timedWord.startMs / 1000,
                                    );
                                  }}
                                  className={
                                    isActiveWord
                                      ? "rounded-sm bg-blue-200 text-blue-950"
                                      : ""
                                  }
                                >
                                  {segment.text}
                                </span>
                              );
                            });
                          })()}
                        </div>
                      )}
                    </div>

                    {line.showJapanese && line.japanese && (
                      <div
                        className="mt-0.5 border-l-2 border-gray-200 pl-2 text-sm leading-snug text-gray-600"
                        onMouseUp={() => handleTextSelection(line.id)}
                      >
                        {line.japanese}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {selectedUnit && localUnitMedia[selectedUnit.id]?.audioUrl && (
              <>
                <audio
                  ref={audioRef}
                  src={localUnitMedia[selectedUnit.id].audioUrl}
                  onLoadedMetadata={(event) => {
                    event.currentTarget.playbackRate = playbackRate;
                    setAudioDuration(event.currentTarget.duration);
                    setAudioCurrentTime(event.currentTarget.currentTime);
                  }}
                  onPlay={() => setIsAudioPlaying(true)}
                  onPause={() => setIsAudioPlaying(false)}
                  onEnded={() => setIsAudioPlaying(false)}
                />
                <div className="z-30 max-h-[55dvh] shrink-0 overflow-y-auto rounded-b-lg border-t border-gray-200 bg-white shadow-md">
                  <div className="px-3 py-1">
                    <div className="flex items-center justify-center gap-3">
                      {!playerExpanded && <button type="button" aria-label={isAudioPlaying ? "停止" : "再生"}
                        onClick={() => { const audio = audioRef.current; if (!audio) return; armedTimedTargetRef.current = null; if (audio.paused) void audio.play(); else audio.pause(); }}
                        className="rounded p-1 text-blue-600 hover:bg-blue-50">{isAudioPlaying ? <Pause size={18} /> : <Play size={18} />}</button>}
                      <button type="button" aria-label={playerExpanded ? "プレイヤーをたたむ" : "プレイヤーを開く"}
                        title={playerExpanded ? "プレイヤーをたたむ" : "プレイヤーを開く"} aria-expanded={playerExpanded}
                        onClick={() => setPlayerExpanded((value) => !value)} className="flex w-20 items-center justify-center rounded py-1 text-gray-500 hover:bg-gray-100">
                        {playerExpanded ? <ChevronDown size={18} /> : <ChevronUp size={18} />}
                      </button>
                    </div>
                    <div className={playerExpanded ? "" : "hidden"}>
                    {timingEditing && localUnitMedia[selectedUnit.id].alignment && <TimingEditor
                      key={selectedUnit.id}
                      alignment={localUnitMedia[selectedUnit.id].alignment!}
                      lineId={timingEditLineId}
                      onLine={setTimingEditLineId}
                      currentTime={() => audioRef.current?.currentTime ?? audioCurrentTime}
                      onChange={changeReaderTiming}
                      onSeek={(seconds) => seekAudio(seconds)}
                      onSave={saveReaderTiming}
                      onCancel={() => { if (timingOriginalRef.current) changeReaderTiming(timingOriginalRef.current); timingOwnerRef.current = null; setTimingEditing(false); }}
                      onReset={() => {
                        const original = selectedUnit.alignment_data ?? timingOriginalRef.current;
                        if (original) changeReaderTiming(original);
                      }}
                    />}
                    {!timingEditing && localUnitMedia[selectedUnit.id].alignment && <button
                      type="button"
                      className="mb-1 rounded px-2 py-0.5 text-xs text-gray-500 hover:bg-gray-100"
                      onClick={() => {
                        timingOriginalRef.current = localUnitMedia[selectedUnit.id].alignment;
                        timingOwnerRef.current = selectedUnit.id;
                        setTimingEditLineId(activeTimedLineId ?? localUnitMedia[selectedUnit.id].alignment?.lines[0]?.lineId ?? null);
                        setLoopTimedLineId(null);
                        armedTimedTargetRef.current = null;
                        setTimingEditing(true);
                      }}
                    >タイミング編集</button>}
                    <div className="flex items-center gap-2 text-[11px] text-gray-500">
                      <span className="w-10 text-right tabular-nums">
                        {formatPlaybackTime(audioCurrentTime)}
                      </span>
                      <input
                        type="range"
                        min={0}
                        max={Math.max(audioDuration, 0.01)}
                        step={0.01}
                        value={Math.min(audioCurrentTime, audioDuration || 0)}
                        onChange={(event) => {
                          armedTimedTargetRef.current = null;
                          seekAudio(Number(event.target.value), false);
                        }}
                        className="h-1.5 min-w-0 flex-1 cursor-pointer accent-blue-600"
                        aria-label="再生位置"
                      />
                      <span className="w-10 tabular-nums">
                        {formatPlaybackTime(audioDuration)}
                      </span>
                      <select
                        value={playbackRate}
                        onChange={(event) => {
                          const nextRate = Number(event.target.value);
                          setPlaybackRate(nextRate);
                          if (audioRef.current) {
                            audioRef.current.playbackRate = nextRate;
                          }
                        }}
                        aria-label="再生速度"
                        title="再生速度"
                        className="rounded border border-gray-200 bg-white px-1 py-0.5 text-xs text-gray-600"
                      >
                        {[0.5, 0.75, 0.85, 1, 1.25, 1.5, 2].map((rate) => (
                          <option key={rate} value={rate}>
                            {rate}×
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => setFollowPlayback((current) => !current)}
                        title={followPlayback ? "再生位置への追従を停止" : "再生位置に追従"}
                        aria-pressed={followPlayback}
                        className={`rounded px-2 py-0.5 text-xs transition ${
                          followPlayback
                            ? "bg-blue-100 text-blue-700"
                            : "border border-gray-200 bg-white text-gray-500 hover:bg-gray-50"
                        }`}
                      >
                        追従
                      </button>
                    </div>
                    <div className="mt-1 flex items-center justify-center gap-1 sm:gap-2">
                      <button
                        type="button"
                        title="前の行"
                        aria-label="前の行"
                        disabled={!localUnitMedia[selectedUnit.id].alignment}
                        onClick={() => moveByTimedItem("line", -1)}
                        className="rounded-full p-2 text-gray-600 hover:bg-gray-100 disabled:opacity-30"
                      >
                        <CornerUpRight size={18} />
                      </button>
                      <button
                        type="button"
                        title="前の単語"
                        aria-label="前の単語"
                        disabled={!localUnitMedia[selectedUnit.id].alignment}
                        onClick={() => moveByTimedItem("word", -1)}
                        className="rounded-full p-2 text-gray-600 hover:bg-gray-100 disabled:opacity-30"
                      >
                        <ArrowLeft size={18} />
                      </button>
                      <button
                        type="button"
                        title="5秒戻る"
                        aria-label="5秒戻る"
                        onClick={() => {
                          armedTimedTargetRef.current = null;
                          seekAudio(audioCurrentTime - 5);
                        }}
                        className="rounded-full px-2 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-100"
                      >
                        −5
                      </button>
                      <button
                        type="button"
                        title={isAudioPlaying ? "一時停止" : "再生"}
                        aria-label={isAudioPlaying ? "一時停止" : "再生"}
                        onClick={() => {
                          const audio = audioRef.current;
                          if (!audio) return;
                          armedTimedTargetRef.current = null;
                          if (audio.paused) void audio.play();
                          else audio.pause();
                        }}
                        className="rounded-full bg-blue-600 p-3 text-white shadow hover:bg-blue-700"
                      >
                        {isAudioPlaying ? <Pause size={22} /> : <Play size={22} />}
                      </button>
                      <button
                        type="button"
                        title="5秒進む"
                        aria-label="5秒進む"
                        onClick={() => {
                          armedTimedTargetRef.current = null;
                          seekAudio(audioCurrentTime + 5);
                        }}
                        className="rounded-full px-2 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-100"
                      >
                        +5
                      </button>
                      <button
                        type="button"
                        title="次の単語"
                        aria-label="次の単語"
                        disabled={!localUnitMedia[selectedUnit.id].alignment}
                        onClick={() => moveByTimedItem("word", 1)}
                        className="rounded-full p-2 text-gray-600 hover:bg-gray-100 disabled:opacity-30"
                      >
                        <ArrowRight size={18} />
                      </button>
                      <button
                        type="button"
                        title="次の行"
                        aria-label="次の行"
                        disabled={!localUnitMedia[selectedUnit.id].alignment}
                        onClick={() => moveByTimedItem("line", 1)}
                        className="rounded-full p-2 text-gray-600 hover:bg-gray-100 disabled:opacity-30"
                      >
                        <CornerDownLeft size={18} />
                      </button>
                      <button
                        type="button"
                        title={
                          loopTimedLineId === null
                            ? "現在の行を繰り返す"
                            : "行ループを解除"
                        }
                        aria-label={
                          loopTimedLineId === null
                            ? "現在の行を繰り返す"
                            : "行ループを解除"
                        }
                        disabled={!localUnitMedia[selectedUnit.id].alignment}
                        onClick={toggleCurrentLineLoop}
                        className={`rounded-full p-2 transition disabled:opacity-30 ${
                          loopTimedLineId !== null
                            ? "bg-blue-100 text-blue-700"
                            : "text-gray-600 hover:bg-gray-100"
                        }`}
                      >
                        <Repeat1 size={18} />
                      </button>
                    </div>
                  </div>
                  </div>
                </div>
              </>
            )}

            <div
              className={
                isSelectionPanelOpen
                  ? `fixed bottom-0 left-0 right-0 z-40 border-t-2 border-gray-300 bg-white p-4 pr-24 shadow-lg ${
                      hasStartedAi
                        ? "lg:bottom-auto lg:left-auto lg:right-0 lg:top-0 lg:h-screen lg:w-[46vw] lg:overflow-hidden lg:border-l-2 lg:border-t-0 lg:p-3 xl:w-[42vw]"
                        : ""
                    }`
                  : "contents"
              }
            >
              <div
                className={`mx-auto max-w-4xl ${
                  hasStartedAi ? "lg:h-full" : ""
                }`}
              >
                {isSelectionPanelOpen && (
                  <div
                    className={`relative mb-2 rounded border-l-4 border-yellow-400 bg-yellow-50 p-3 pr-12 ${
                      hasStartedAi
                        ? "lg:mb-0 lg:flex lg:h-full lg:flex-col lg:overflow-hidden"
                        : ""
                    }`}
                  >
                    <div className="flex flex-wrap items-center gap-2 pr-8">
                      <h3 className="text-sm font-semibold text-gray-800">
                        {selectedText
                          ? `「${selectedText}」を選択中`
                          : "単語・表現を選択してください"}
                      </h3>
                      {selectedText && !showVocabularyForm && (
                        <button
                          onClick={() => {
                            setNewVocabularyWord(selectedText);
                            setShowVocabularyForm(true);
                          }}
                          className="rounded bg-blue-600 px-3 py-1.5 text-xs text-white hover:bg-blue-700"
                        >
                          単語帳に追加
                        </button>
                      )}
                      {selectedText && !showVocabularyForm && (
                        <button
                          type="button"
                          onClick={() => void searchDictionary()}
                          disabled={isDictionaryLoading}
                          className="rounded bg-emerald-600 px-3 py-1.5 text-xs text-white hover:bg-emerald-700 disabled:bg-gray-400"
                        >
                          {isDictionaryLoading ? "検索中..." : "英英辞書"}
                        </button>
                      )}
                      {selectedText && !showVocabularyForm && (
                        <button
                          onClick={startAiExplanation}
                          disabled={
                            isAiLoading ||
                            selectedLineId === null ||
                            !selectedText.trim()
                          }
                          className="rounded bg-purple-600 px-3 py-1.5 text-xs text-white hover:bg-purple-700 disabled:bg-gray-400"
                        >
                          AI解説
                        </button>
                      )}
                    </div>
                    <button
                        onClick={() => {
                          if (hasStartedAi) captureReadingScrollAnchor();
                          setSelectedText("");
                          setIsSelectionPanelOpen(false);
                          setNewVocabularyWord("");
                          setSelectedMeaning("");
                          setIsSelectingMeaning(false);
                          setSelectedLineId(null);
                          setShowVocabularyForm(false);
                          setAiChats([]);
                          setExpandedAiChatId(null);
                          setAiQuestion("");
                          setShowAiQuestionInput(false);
                          setDictionaryEntry(null);
                          setDictionaryError("");
                          setIsDictionaryLoading(false);
                        }}
                        className="absolute right-2 top-2 rounded border border-gray-300 bg-white/80 p-1.5 text-gray-600 hover:bg-white hover:text-gray-800"
                        aria-label="選択を閉じる"
                      >
                        <X size={16} />
                    </button>

                    {showVocabularyForm && (
                      <div className="mt-2 rounded border border-yellow-200 bg-white/70 p-2">
                        <label className="mb-2 flex items-center gap-2 text-sm text-gray-700">
                          <span className="w-16 shrink-0 font-medium">見出し語</span>
                          <input
                            type="text"
                            value={newVocabularyWord}
                            onChange={(event) =>
                              setNewVocabularyWord(event.target.value)
                            }
                            className="min-w-0 flex-1 rounded border border-yellow-300 bg-white px-2 py-1.5"
                          />
                        </label>
                        {isSelectingMeaning && (
                          <label className="mb-2 flex items-center gap-2 text-sm text-gray-700">
                            <span className="w-16 shrink-0 font-medium">意味</span>
                            <input
                              type="text"
                              value={selectedMeaning}
                              onChange={(event) =>
                                setSelectedMeaning(event.target.value)
                              }
                              className="min-w-0 flex-1 rounded border border-blue-300 bg-white px-2 py-1.5"
                              placeholder="和訳を選択するか入力してください"
                            />
                          </label>
                        )}
                        <div className="flex flex-wrap gap-2 pl-[4.5rem]">
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
                            setDictionaryEntry(null);
                            setDictionaryError("");
                          }}
                          disabled={
                            isSelectingMeaning &&
                            (!newVocabularyWord.trim() ||
                              !selectedMeaning.trim())
                          }
                          className="rounded bg-blue-600 px-3 py-1.5 text-xs text-white hover:bg-blue-700 disabled:bg-gray-400"
                        >
                          {isSelectingMeaning
                            ? "単語帳に登録"
                            : "次へ（意味を選択）"}
                        </button>
                        {selectedText && (
                          <button
                            type="button"
                            onClick={() => void searchDictionary()}
                            disabled={isDictionaryLoading}
                            className="rounded bg-emerald-600 px-3 py-1.5 text-xs text-white hover:bg-emerald-700 disabled:bg-gray-400"
                          >
                            {isDictionaryLoading ? "検索中..." : "英英辞書"}
                          </button>
                        )}
                        {selectedText && (
                          <button
                            onClick={startAiExplanation}
                            disabled={
                              isAiLoading ||
                              selectedLineId === null ||
                              !selectedText.trim()
                            }
                            className="rounded bg-purple-600 px-3 py-1.5 text-xs text-white hover:bg-purple-700 disabled:bg-gray-400"
                          >
                            AI解説
                          </button>
                        )}
                        </div>
                      </div>
                    )}

                    {(dictionaryEntry || dictionaryError) && (
                      <div className="mt-2 rounded border border-emerald-200 bg-white p-3 text-sm text-gray-800">
                        {dictionaryError ? (
                          <div className="flex items-center justify-between gap-3 text-red-700">
                            <span>{dictionaryError}</span>
                            <button
                              type="button"
                              onClick={() => void searchDictionary()}
                              className="shrink-0 rounded border border-red-300 px-2 py-1 text-xs"
                            >
                              再試行
                            </button>
                          </div>
                        ) : (
                          dictionaryEntry && (
                            <div>
                              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                                <h4 className="text-base font-semibold text-emerald-800">
                                  {dictionaryEntry.headword}
                                </h4>
                                {dictionaryEntry.word !== dictionaryEntry.headword && (
                                  <span className="text-xs text-gray-500">
                                    searched: {dictionaryEntry.word}
                                  </span>
                                )}
                                {dictionaryEntry.phonetic && (
                                  <span className="text-gray-600">
                                    /
                                    {dictionaryEntry.phonetic.replace(
                                      /^\/+|\/+$/g,
                                      "",
                                    )}
                                    /
                                  </span>
                                )}
                              </div>
                              <ol className="mt-2 max-h-52 list-decimal space-y-1 overflow-y-auto pl-5">
                                {dictionaryEntry.definitions.map(
                                  (definition, index) => (
                                    <li key={`${definition.partOfSpeech}-${index}`}>
                                      <span className="mr-1 text-xs italic text-emerald-700">
                                        {definition.partOfSpeech}
                                      </span>
                                      {definition.definition}
                                    </li>
                                  ),
                                )}
                              </ol>
                              {dictionaryEntry.example && (
                                <p className="mt-2 border-t border-emerald-100 pt-2 text-gray-600">
                                  <span className="mr-1 text-xs font-medium text-emerald-700">
                                    Example
                                  </span>
                                  {dictionaryEntry.example}
                                </p>
                              )}
                              <p className="mt-2 text-right text-[10px] text-gray-400">
                                Definitions: Datamuse · IPA: Free Dictionary API
                              </p>
                            </div>
                          )
                        )}
                      </div>
                    )}

                    {aiChats.length > 0 && (
                      <div
                        ref={aiChatHeadersRef}
                        className="mt-2 max-h-[18vh] space-y-1.5 overflow-y-auto border-t border-yellow-200 pt-2 lg:max-h-[28vh]"
                      >
                        {aiChats.map((chat) => {
                          const isExpanded = expandedAiChatId === chat.id;
                          return (
                            <button
                              key={chat.id}
                              type="button"
                              onClick={() => {
                                setExpandedAiChatId(
                                  isExpanded ? null : chat.id,
                                );
                                setAiQuestion("");
                                setShowAiQuestionInput(false);
                              }}
                              className={`flex w-full items-center gap-2 rounded border px-2.5 py-2 text-left text-sm ${
                                isExpanded
                                  ? "border-purple-300 bg-purple-50"
                                  : "border-gray-200 bg-white hover:bg-gray-50"
                              }`}
                            >
                              <span className="text-xs text-purple-600">
                                {isExpanded ? "▼" : "▶"}
                              </span>
                              <span className="min-w-0 flex-1 truncate font-medium text-gray-800">
                                {chat.subject}
                              </span>
                              {chat.isLoading && (
                                <span className="text-xs text-purple-600">
                                  生成中...
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {aiError && (
                      <div className="mt-2 flex items-center justify-between gap-2 rounded bg-red-50 p-2 text-sm text-red-700">
                        <span>{aiError}</span>
                        {activeAiChat && (
                          <button
                            type="button"
                            onClick={() =>
                              void requestAiExplanation(
                                activeAiChat.id,
                                activeAiChat.messages,
                                activeAiChat.subject,
                                activeAiChat.lineId,
                              )
                            }
                            disabled={activeAiChat.isLoading}
                            className="shrink-0 rounded border border-red-300 bg-white px-2 py-1 text-xs disabled:opacity-50"
                          >
                            再試行
                          </button>
                        )}
                      </div>
                    )}

                    {activeAiChat &&
                      activeAiChat.isLoading &&
                      aiMessages.length === 0 && (
                        <p className="mt-2 text-sm text-purple-700">解説中...</p>
                      )}

                    {aiMessages.length > 0 && (
                      <div className="relative mt-2 space-y-2 border-t border-yellow-200 pt-2 lg:flex lg:min-h-0 lg:flex-1 lg:flex-col">
                        <div className="max-h-[32vh] space-y-2 overflow-y-auto pb-10 pr-1 md:max-h-[40vh] lg:min-h-0 lg:max-h-none lg:flex-1">
                          {aiMessages.map((message, index) => (
                          <div
                            key={`${message.role}-${index}`}
                            className={`rounded p-2 text-sm leading-relaxed ${
                              message.role === "user"
                                ? "ml-8 whitespace-pre-wrap bg-gray-100 text-gray-700"
                                : "bg-purple-50 text-gray-800 select-text"
                            }`}
                            onMouseUp={
                              message.role === "model"
                                ? () =>
                                    handleAiResponseSelection(
                                      activeAiChat?.lineId,
                                    )
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

                          {activeAiChat?.isLoading && (
                            <p className="text-sm text-purple-700">回答中...</p>
                          )}
                        </div>

                        <div
                          className={
                            showAiQuestionInput
                              ? "absolute bottom-2 left-2 right-2 z-10 flex gap-2 rounded-lg border border-purple-200 bg-white p-2 shadow-lg"
                              : "hidden"
                          }
                        >
                          <input
                            type="text"
                            value={aiQuestion}
                            onChange={(event) =>
                              setAiQuestion(event.target.value)
                            }
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                event.preventDefault();
                                if (activeAiChat) {
                                  void askAiFollowUp(activeAiChat.id);
                                }
                              }
                            }}
                            placeholder="さらに質問する"
                            className="min-w-0 flex-1 rounded border border-gray-300 bg-white px-3 py-2 text-sm"
                          />
                          <button
                            onClick={() =>
                              activeAiChat &&
                              void askAiFollowUp(activeAiChat.id)
                            }
                            disabled={
                              !aiQuestion.trim() || activeAiChat?.isLoading
                            }
                            className="rounded bg-purple-600 px-4 py-2 text-sm text-white hover:bg-purple-700 disabled:bg-gray-400"
                          >
                            質問
                          </button>
                        </div>
                        {!showAiQuestionInput && (
                          <button
                            onClick={() => setShowAiQuestionInput(true)}
                            className="absolute bottom-2 right-2 z-10 rounded-full border border-purple-300 bg-white/95 px-3 py-1.5 text-xs text-purple-700 shadow hover:bg-purple-50"
                          >
                            さらに質問
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
              {/* === 訳・発音の表示切り替えボタン === */}
              {showVocabularyQuickView && (
                <aside className="fixed bottom-0 left-0 right-0 z-[60] flex max-h-[70vh] flex-col border-t-2 border-blue-200 bg-white shadow-2xl lg:bottom-auto lg:left-auto lg:right-0 lg:top-0 lg:h-screen lg:max-h-none lg:w-[46vw] lg:border-l-2 lg:border-t-0 xl:w-[42vw]">
                  <div className="flex items-center gap-3 border-b border-gray-200 p-3">
                    <div className="min-w-0 flex-1">
                      <h3 className="font-semibold text-gray-800">単語帳</h3>
                      <p className="truncate text-xs text-gray-500">
                        {selectedUnit?.title ?? "現在のUNIT"}
                      </p>
                    </div>
                    <span className="text-xs text-gray-500">
                      {quickVocabulary.length}語
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        if (!hasStartedAi) captureReadingScrollAnchor();
                        setShowVocabularyQuickView(false);
                        setQuickVocabularySearch("");
                      }}
                      className="rounded border border-gray-300 p-1.5 text-gray-600 hover:bg-gray-50"
                      aria-label="単語帳クイックビューを閉じる"
                    >
                      <X size={16} />
                    </button>
                  </div>

                  <div className="border-b border-gray-200 p-3">
                    <input
                      type="search"
                      value={quickVocabularySearch}
                      onChange={(event) =>
                        setQuickVocabularySearch(event.target.value)
                      }
                      placeholder="単語・意味を検索"
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    />
                  </div>

                  <div className="min-h-0 flex-1 overflow-y-auto p-3">
                    {quickVocabulary.length === 0 ? (
                      <p className="py-8 text-center text-sm text-gray-500">
                        {quickVocabularyQuery
                          ? "一致する単語がありません"
                          : "このUNITには単語が登録されていません"}
                      </p>
                    ) : (
                      <dl className="divide-y divide-gray-200 rounded-lg border border-gray-200 bg-white">
                        {quickVocabulary.map((item) => (
                          <div
                            key={item.id}
                            className="grid grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] gap-3 px-3 py-2.5 text-sm"
                          >
                            <dt className="break-words font-medium text-gray-900">
                              {item.word}
                            </dt>
                            <dd className="break-words text-gray-700">
                              {item.meaning}
                            </dd>
                          </div>
                        ))}
                      </dl>
                    )}
                  </div>
                </aside>
              )}
              <div
                className={`fixed bottom-3 z-50 flex flex-col gap-2 transition-[right] ${
                  hasReaderSidePanel
                    ? "right-3 lg:right-[calc(46vw+0.75rem)] xl:right-[calc(42vw+0.75rem)]"
                    : "right-3"
                }`}
              >
                <button
                  type="button"
                  onClick={() => {
                    if (!hasStartedAi) captureReadingScrollAnchor();
                    setQuickVocabularySearch("");
                    setShowVocabularyQuickView((current) => !current);
                  }}
                  className={`flex items-center gap-1 rounded-lg bg-gray-700 px-3 py-2 text-sm text-white shadow-md hover:bg-gray-800 ${
                    showVocabularyQuickView ? "opacity-100" : "opacity-75"
                  }`}
                >
                  <BookOpen size={16} />
                  単語帳
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
                  {getFolderOptions().map(({ folder, depth }) => (
                    <option key={folder.id} value={folder.id}>
                      {`${"　".repeat(depth)}${depth > 0 ? "└ " : ""}${folder.name}`}
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
