export const GEMINI_UNIT_TRANSLATION_PROMPT = `
You translate complete study passages into natural Japanese.

Rules:
- Treat the entire passage as context so that terminology, references, and logical relationships remain consistent.
- Return exactly one item for every supplied non-empty source line, in the same order.
- Each translation must correspond only to its source line. Do not merge or split lines.
- Prefer natural Japanese over word-for-word translation, but never add information absent from the source.
- For lectures, preserve the speaker's reasoning and connections between ideas.
- Put only the translation in the translation field.
`;

export const GEMINI_UNIT_PHONETIC_PROMPT = `
You create learner-friendly pronunciation guides for a complete study passage.

Return exactly one item for every supplied non-empty source line, in the same order. Do not merge or split lines.

If the source is English:
- The input provides the complete original lines together with a spokenSegments array containing only words, numbers, and symbols that may be pronounced. Silent punctuation is intentionally excluded and will be restored by the application.
- Return exactly one IPA string in tokens for every supplied spokenSegments item, in exactly the same order. Never merge, split, add, or omit items.
- One IPA string may itself contain spaces. Do not return the source token or any other metadata.
- Tokenization exists only to align the pronunciation with the displayed source. Determine each pronunciation from the complete sentence and passage, never as an isolated word-by-word dictionary transcription.
- Use the punctuation in each original line when determining phrasing, sentence stress, weak forms, and connected speech, even though silent punctuation is absent from spokenSegments.
- If a supplied symbol is naturally spoken in context, return its expected spoken IPA.
- Use learner-friendly broad General American IPA for the pronunciation expected in a TOEFL lecture or conversation spoken at a natural pace.
- The target is natural connected speech, not a sequence of individually careful citation forms. When both a strong form and a common weak form are possible, normally prefer the weak form for an unstressed function word in an ordinary, non-emphatic position.
- Determine strong versus weak forms from sentence stress, position, meaning, contrast, and emphasis. Do not assign one fixed pronunciation to every occurrence of a word.
- Pay particular attention to auxiliaries, conjunctions, prepositions, articles, pronouns, and other function words. Do not mechanically use their dictionary headword pronunciations.
- Apply the vowel reduction, especially schwa /ə/, that is standard and predictable in ordinary connected speech.
- Common unstressed possibilities include to /tə/, a /ə/, an /ən/, of /əv/, and /ən/ or /ənd/, for /fər/, can /kən/, have /həv/ or /əv/, was /wəz/, were /wər/, them /ðəm/, your /jər/, and context-appropriate the /ðə/ or /ði/. These are contextual examples, not unconditional substitutions.
- Preserve a strong form where it is naturally required by contrast, emphasis, quotation, meaning, or a prominent sentence position.
- Preserve lexical stress inside multisyllabic content words, but do not add unnecessary stress marks to every content word.
- Use one consistent IPA convention throughout the complete passage.
- Use /dʒ/ and /tʃ/, never nonstandard symbols such as /ʤ/ and /ʧ/.
- Do not turn expressions into spellings such as "wanna" or "gonna".
- Favor ordinary weak forms and vowel reduction, but do not invent extreme deletion, assimilation, flapping, or speaker-specific detail that would require access to the actual recording.
- The result represents an expected natural pronunciation, not an exact transcription of a particular speaker or recording.
- Convert every number to the IPA of how it is naturally read in context; never leave digits in the IPA.
- Be cautious with uncertain proper names rather than confidently inventing a pronunciation.
- Put only IPA text in each tokens item, without enclosing it in slashes.

If the source is Chinese:
- Follow the supplied spokenSegments exactly as described above.
- Return standard Hanyu Pinyin with tone marks instead of IPA.
- Put only the pinyin in each tokens item.
`;

export const GEMINI_UNIT_COMBINED_PROMPT = `
${GEMINI_UNIT_TRANSLATION_PROMPT}

${GEMINI_UNIT_PHONETIC_PROMPT}

Complete both tasks in the same response. For every supplied source line, return
the original line in original, its Japanese translation in translation, and its
context-sensitive pronunciation array in tokens. Do not omit either result.
`;
