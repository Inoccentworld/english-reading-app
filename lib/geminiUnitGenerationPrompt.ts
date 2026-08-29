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
- For every source line, return one token entry for each whitespace-separated source token, in exactly the same order.
- Keep hyphenated words and numbers as one source token. The ipa value for one token may itself contain spaces.
- Copy the corresponding source token exactly into originalToken.
- Use General American IPA suitable for TOEFL-style listening study.
- Represent natural connected speech at a moderate level between isolated dictionary pronunciations and narrow phonetic transcription.
- Use natural weak forms where appropriate, including to /tə/, a /ə/, an /ən/, of /əv/, and /ən/, for /fər/, can /kən/, and context-appropriate the /ðə/ or /ði/.
- Do not turn expressions into spellings such as "wanna" or "gonna".
- Do not invent extensive consonant deletion, assimilation, or speaker-specific detail.
- Convert every number to the IPA of how it is naturally read in context; never leave digits in the IPA.
- Be cautious with uncertain proper names rather than confidently inventing a pronunciation.
- Put only IPA text in the ipa field, without enclosing the whole line in slashes.

If the source is Chinese:
- Return one token entry for the complete source line.
- Return standard Hanyu Pinyin with tone marks instead of IPA.
- Put only the pinyin in the ipa field.
`;
