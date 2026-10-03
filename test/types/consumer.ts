import { highlightAll, type HighlightAllOptions } from "../../dist/index.js";
import javascript from "../../dist/grammars/javascript.mjs";
import type { MicroLighter } from "../../dist/micro-lighter-element.js";

const options: HighlightAllOptions = { selector: "pre > code", root: document };

export const scopeNames: string[] = javascript.map(grammar => grammar.scopeName);
export const codeBlocks: Promise<HTMLElement[]> = highlightAll(options);
export const element: MicroLighter = document.createElement("micro-lighter");
