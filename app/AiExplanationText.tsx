"use client";

import { memo } from "react";
import ReactMarkdown, { type Components } from "react-markdown";

// Stable component identities preserve the DOM nodes used by native selection.
const components: Components = {
  h1: ({ children }) => <h1 className="mb-2 mt-4 text-xl font-bold first:mt-0">{children}</h1>,
  h2: ({ children }) => <h2 className="mb-2 mt-4 text-lg font-bold first:mt-0">{children}</h2>,
  h3: ({ children }) => <h3 className="mb-1.5 mt-3 font-bold first:mt-0">{children}</h3>,
  p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
  ul: ({ children }) => <ul className="mb-2 list-disc space-y-1 pl-5">{children}</ul>,
  ol: ({ children }) => <ol className="mb-2 list-decimal space-y-1 pl-5">{children}</ol>,
  strong: ({ children }) => <strong className="font-bold text-gray-900">{children}</strong>,
  blockquote: ({ children }) => <blockquote className="my-2 border-l-4 border-purple-300 pl-3 text-gray-600">{children}</blockquote>,
};

export default memo(function AiExplanationText({ text }: { text: string }) {
  return <ReactMarkdown components={components}>{text}</ReactMarkdown>;
});
