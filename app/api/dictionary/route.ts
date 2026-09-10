import { NextResponse } from "next/server";

type DictionaryRequest = {
  term?: string;
  leftContext?: string;
  rightContext?: string;
};

type DatamuseWord = {
  word?: string;
  defs?: string[];
  defHeadword?: string;
};

type FreeDictionaryEntry = {
  phonetic?: string;
  phonetics?: { text?: string }[];
  meanings?: { definitions?: { example?: string }[] }[];
};

const MAX_TERM_LENGTH = 120;
const PARTS_OF_SPEECH: Record<string, string> = {
  n: "noun",
  v: "verb",
  adj: "adjective",
  adv: "adverb",
  u: "other",
};
const IRREGULAR_FORMS: Record<string, string> = {
  am: "be",
  is: "be",
  are: "be",
  was: "be",
  were: "be",
  been: "be",
  had: "have",
  did: "do",
  done: "do",
  went: "go",
  gone: "go",
  got: "get",
  gotten: "get",
  made: "make",
  said: "say",
  took: "take",
  taken: "take",
  came: "come",
  saw: "see",
  seen: "see",
  knew: "know",
  known: "know",
  thought: "think",
  gave: "give",
  given: "give",
  found: "find",
  told: "tell",
  became: "become",
  left: "leave",
  felt: "feel",
  brought: "bring",
  began: "begin",
  begun: "begin",
  kept: "keep",
  held: "hold",
  wrote: "write",
  written: "write",
  stood: "stand",
  heard: "hear",
  meant: "mean",
  met: "meet",
  ran: "run",
  paid: "pay",
  sat: "sit",
  spoke: "speak",
  spoken: "speak",
  led: "lead",
  grew: "grow",
  grown: "grow",
  lost: "lose",
  fell: "fall",
  fallen: "fall",
  sent: "send",
  built: "build",
  understood: "understand",
  drew: "draw",
  drawn: "draw",
  broke: "break",
  broken: "break",
  spent: "spend",
  rose: "rise",
  risen: "rise",
  drove: "drive",
  driven: "drive",
  bought: "buy",
  wore: "wear",
  worn: "wear",
  chose: "choose",
  chosen: "choose",
};

const normalizeTerm = (value: string) =>
  value
    .normalize("NFKC")
    .replace(/[‘’]/g, "'")
    .replace(/[‐‑‒–—―]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^[^\p{L}\p{N}']+|[^\p{L}\p{N}']+$/gu, "")
    .trim()
    .toLocaleLowerCase();

const getVerbLemmas = (word: string) => {
  const irregular = IRREGULAR_FORMS[word];
  if (irregular) return [irregular];

  const candidates = new Set<string>();
  if (word.endsWith("ied") && word.length > 4) {
    candidates.add(`${word.slice(0, -3)}y`);
  }
  if (word.endsWith("ing") && word.length > 5) {
    const stem = word.slice(0, -3);
    candidates.add(stem);
    if (stem.at(-1) === stem.at(-2)) candidates.add(stem.slice(0, -1));
    candidates.add(`${stem}e`);
  }
  if (word.endsWith("ed") && word.length > 4) {
    const stem = word.slice(0, -2);
    candidates.add(stem);
    candidates.add(word.slice(0, -1));
    if (stem.at(-1) === stem.at(-2)) candidates.add(stem.slice(0, -1));
  }
  if (word.endsWith("ies") && word.length > 4) {
    candidates.add(`${word.slice(0, -3)}y`);
  }
  if (word.endsWith("es") && word.length > 3) {
    candidates.add(word.slice(0, -2));
    candidates.add(word.slice(0, -1));
  } else if (word.endsWith("s") && word.length > 3) {
    candidates.add(word.slice(0, -1));
  }

  return [...candidates].filter((candidate) => candidate.length > 1);
};

const getLookupCandidates = (term: string) => {
  const words = term.split(" ");
  const firstWord = words[0];
  const lemmas = getVerbLemmas(firstWord);
  const lemmaPhrases = lemmas.map((lemma) => [lemma, ...words.slice(1)].join(" "));
  return [
    ...(IRREGULAR_FORMS[firstWord] ? lemmaPhrases : []),
    term,
    ...(IRREGULAR_FORMS[firstWord] ? [] : lemmaPhrases),
  ].filter((candidate, index, candidates) => candidates.indexOf(candidate) === index);
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as DictionaryRequest;
    const rawTerm = body.term?.trim();
    const term = rawTerm ? normalizeTerm(rawTerm) : "";
    if (!term || (rawTerm?.length ?? 0) > MAX_TERM_LENGTH) {
      return NextResponse.json(
        { error: "検索する英単語・表現を正しく指定してください。" },
        { status: 400 },
      );
    }

    const lookupCandidates = getLookupCandidates(term);
    const results = await Promise.all(
      lookupCandidates.map(async (candidate) => {
        const params = new URLSearchParams({ sp: candidate, md: "d", max: "10" });

        const response = await fetch(`https://api.datamuse.com/words?${params}`, {
          signal: AbortSignal.timeout(10_000),
          headers: { "User-Agent": "EnglishReadingApp/1.0" },
        });
        if (!response.ok) throw new Error(`Datamuse returned ${response.status}`);

        const words = (await response.json()) as DatamuseWord[];
        return words.find(
          (word) =>
            word.word?.toLocaleLowerCase() === candidate && word.defs?.length,
        );
      }),
    );
    const entry = results.find((result) => result !== undefined);

    if (!entry?.word || !entry.defs?.length) {
      return NextResponse.json(
        { error: "辞書に一致する英単語・表現が見つかりませんでした。" },
        { status: 404 },
      );
    }

    const definitions = entry.defs.map((definition) => {
      const [partOfSpeechCode, ...definitionParts] = definition.split("\t");
      return {
        partOfSpeech:
          PARTS_OF_SPEECH[partOfSpeechCode] ?? partOfSpeechCode ?? "other",
        definition: definitionParts.join(" ").trim(),
      };
    });
    const headword = entry.defHeadword || entry.word;
    let phonetic = "";
    let example = "";

    try {
      const phoneticResponse = await fetch(
        `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(headword)}`,
        { signal: AbortSignal.timeout(5_000) },
      );
      if (phoneticResponse.ok) {
        const phoneticEntries =
          (await phoneticResponse.json()) as FreeDictionaryEntry[];
        const phoneticEntry = phoneticEntries[0];
        phonetic =
          phoneticEntry?.phonetic?.trim() ||
          phoneticEntry?.phonetics?.find((item) => item.text?.trim())?.text?.trim() ||
          "";
        example =
          phoneticEntry?.meanings
            ?.flatMap((meaning) => meaning.definitions ?? [])
            .find((definition) => definition.example?.trim())
            ?.example?.trim() ?? "";
      }
    } catch {
      // IPA and example are optional; Datamuse definitions remain usable.
    }

    return NextResponse.json(
      { word: term, headword, phonetic, definitions, example },
      {
        headers: {
          "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
        },
      },
    );
  } catch (error) {
    console.error("Dictionary lookup error", error);
    const isTimeout =
      error instanceof Error &&
      (error.name === "TimeoutError" || error.message.toLowerCase().includes("timeout"));
    return NextResponse.json(
      {
        error: isTimeout
          ? "辞書サービスからの応答がタイムアウトしました。再試行してください。"
          : "辞書サービスに接続できませんでした。再試行してください。",
      },
      { status: isTimeout ? 504 : 502 },
    );
  }
}
