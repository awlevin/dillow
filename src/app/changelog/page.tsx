import type { Metadata } from "next";
import Link from "next/link";
import { readFile } from "node:fs/promises";
import path from "node:path";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { DillowMark } from "../_components/DillowMark";

export const metadata: Metadata = {
  title: "What's new — Dillow",
  description: "Release notes and recent changes to Dillow.",
};

// The changelog is a plain markdown file anyone can edit — update
// src/content/changelog.md and the page re-renders it. Read at build time
// (static); no need to revalidate since the content ships with the deploy.
async function loadChangelog(): Promise<string> {
  return readFile(path.join(process.cwd(), "src", "content", "changelog.md"), "utf8");
}

// Map markdown elements to the app's stone/emerald look instead of pulling in a
// typography plugin — keeps the page on-brand and dependency-light.
const components: Components = {
  h1: ({ children }) => (
    <h1 className="text-3xl font-black tracking-tight text-emerald-900">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="mt-9 border-t border-stone-100 pt-6 text-lg font-bold text-stone-800">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="mt-4 text-sm font-bold tracking-tight text-stone-700">{children}</h3>
  ),
  p: ({ children }) => <p className="mt-2 text-sm leading-relaxed text-stone-500">{children}</p>,
  ul: ({ children }) => (
    <ul className="mt-3 list-disc space-y-2 pl-5 marker:text-stone-400">{children}</ul>
  ),
  li: ({ children }) => <li className="text-sm leading-relaxed text-stone-600">{children}</li>,
  strong: ({ children }) => <strong className="font-semibold text-stone-800">{children}</strong>,
  a: ({ href, children }) => (
    <a href={href} className="text-emerald-700 underline underline-offset-2 hover:text-emerald-900">
      {children}
    </a>
  ),
};

export default async function ChangelogPage() {
  const markdown = await loadChangelog();
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-8 sm:py-12">
      <Link
        href="/"
        className="inline-flex items-center gap-2 text-2xl font-black tracking-tight text-emerald-900 transition hover:opacity-80"
      >
        <DillowMark className="h-7 w-7" />
        dillow
      </Link>
      <article className="mt-8">
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
          {markdown}
        </ReactMarkdown>
      </article>
    </main>
  );
}
