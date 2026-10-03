/**
 * @import { Grammar, GrammarValue } from "./grammar.js"
 */

/**
 * @typedef {object} LoadedGrammars
 * @property {Record<string, Grammar>} languages Grammars keyed by module name.
 * @property {Map<string, Grammar>} scopes Grammars keyed by TextMate scope name.
 */

/**
 * @type {Record<string, string>}
 * @see https://github.com/shikijs/textmate-grammars-themes/blob/main/packages/tm-grammars/index.js
 * grammars.reduce((prev, lang) => {(lang.aliases ?? []).forEach(alias => {prev[alias] = lang.name;});return prev;}, {});
 */
const languageAliases = {
    "actionscript": "actionscript-3",
    "as3": "actionscript-3",
    "ahk1": "ahk",
    "adoc": "asciidoc",
    "batch": "bat",
    "cmd": "bat",
    "be": "berry",
    "bird": "bird2",
    "1c": "bsl",
    "cdc": "cadence",
    "chpl": "chapel",
    "clj": "clojure",
    "ql": "codeql",
    "coffeescript": "coffee",
    "lisp": "common-lisp",
    "c++": "cpp",
    "c#": "csharp",
    "cs": "csharp",
    "cql": "cypher",
    "dockerfile": "docker",
    "elisp": "emacs-lisp",
    "erl": "erlang",
    "ftl": "fluent",
    "f": "fortran-fixed-form",
    "for": "fortran-fixed-form",
    "f77": "fortran-fixed-form",
    "f90": "fortran-free-form",
    "f95": "fortran-free-form",
    "f03": "fortran-free-form",
    "f08": "fortran-free-form",
    "f18": "fortran-free-form",
    "f#": "fsharp",
    "fs": "fsharp",
    "tscn": "gdresource",
    "tres": "gdresource",
    "gd": "gdscript",
    "gjs": "glimmer-js",
    "gts": "glimmer-ts",
    "gql": "graphql",
    "hbs": "handlebars",
    "hs": "haskell",
    "properties": "ini",
    "js": "javascript",
    "cjs": "javascript",
    "mjs": "javascript",
    "fsl": "jssm",
    "jl": "julia",
    "justfile": "just",
    "kt": "kotlin",
    "kts": "kotlin",
    "kql": "kusto",
    "lean4": "lean",
    "makefile": "make",
    "md": "markdown",
    "mmd": "mermaid",
    "mips": "mipsasm",
    "mbt": "moonbit",
    "mbti": "moonbit",
    "nar": "narrat",
    "nf": "nextflow",
    "nu": "nushell",
    "objc": "objective-c",
    "scad": "openscad",
    "pot": "po",
    "potx": "po",
    "ps": "powershell",
    "ps1": "powershell",
    "pwsh": "powershell",
    "protobuf": "proto",
    "jade": "pug",
    "py": "python",
    "perl6": "raku",
    "ruby-signature": "rbs",
    "regex": "regexp",
    "rb": "ruby",
    "rs": "rust",
    "1c-query": "sdbl",
    "shader": "shaderlab",
    "bash": "shellscript",
    "sh": "shellscript",
    "shell": "shellscript",
    "zsh": "shellscript",
    "console": "shellsession",
    "closure-templates": "soy",
    "spl": "splunk",
    "styl": "stylus",
    "surql": "surrealql",
    "talon": "talonscript",
    "tf": "terraform",
    "tfvars": "terraform",
    "lit": "ts-tags",
    "ts": "typescript",
    "cts": "typescript",
    "mts": "typescript",
    "tsp": "typespec",
    "typ": "typst",
    "vim": "viml",
    "vimscript": "viml",
    "vy": "vyper",
    "文言": "wenyan",
    "mediawiki": "wikitext",
    "wiki": "wikitext",
    "wl": "wolfram",
    "yml": "yaml"
}

/**
 * Convert a supported language alias to its grammar module name.
 * @param {string} language
 * @param {Record<string, string>} [aliases]
 * @returns {string}
 */
export const normalizeLanguage = (language, aliases = {}) =>
  aliases[language] || languageAliases[language] || language;

/**
 * Find grammar modules referenced by external TextMate scope includes.
 * Local repository references (`#...`, `$self`, and `$base`) are ignored.
 * @param {GrammarValue} value Grammar or nested grammar rule to inspect.
 * @returns {Set<string>} Normalized grammar module names.
 */
export const getExternalLanguages = value => {
  /** @type {Set<string>} */
  const languages = new Set();

  /** @param {GrammarValue} item */
  const visit = item => {
    if (Array.isArray(item)) {
      item.forEach(visit);
    } else if (item && typeof item === "object" && !(item instanceof RegExp)) {
      if (typeof item.include === "string" && !/^[#$]/.test(item.include)) {
        const scope = item.include.split("#")[0];
        const match = scope.match(/^(?:source|text)\.([a-z0-9_-]+)/);
        if (match) languages.add(match[1]);
      }
      Object.values(item).forEach(visit);
    }
  };

  visit(value);
  return languages;
};

/**
 * Dynamically import a shipped grammar.
 * @param {string} language
 * @returns {Promise<Grammar | null>}
 */
const getGrammar = language => import(`./grammars/${language}.mjs`)
  .then(module => module.default)
  .catch(() => null);

/**
 * Create a cached loader that also resolves external grammar dependencies.
 * @param {(language: string) => Promise<Grammar | null>} [importLanguage]
 * @returns {(languages: string[]) => Promise<LoadedGrammars>}
 */
export const createGrammarLoader = (importLanguage = getGrammar) => {
  /** @type {Map<string, Promise<Grammar | null>>} */
  const loadingLanguages = new Map();
  /** @type {LoadedGrammars} */
  const grammars = {
    languages: {},
    scopes: new Map()
  };

  /**
   * Import and index a grammar once for the lifetime of this loader.
   * @param {string} language
   * @returns {Promise<Grammar | null>}
   */
  const loadGrammar = language => {
    if (!loadingLanguages.has(language)) {
      const grammarModule = importLanguage(language).then(grammar => {
        if (grammar) {
          grammars.languages[language] = grammar;
          grammars.scopes.set(grammar.scopeName, grammar);
        }
        return grammar;
      });
      loadingLanguages.set(language, grammarModule);
    }

    return /** @type {Promise<Grammar | null>} */ (loadingLanguages.get(language));
  };

  return async languages => {
    const visited = new Set();
    let pending = [...new Set(languages)]
      .filter(language => /^[a-z0-9_-]+$/.test(language));

    while (pending.length) {
      pending.forEach(language => visited.add(language));
      const loaded = /** @type {Grammar[]} */ (
        (await Promise.all(pending.map(loadGrammar))).filter(Boolean)
      );
      pending = [...new Set(loaded.flatMap(grammar =>
        grammar.dependencies || [...getExternalLanguages(grammar)]
      ))].map(language => normalizeLanguage(language)).filter(language => !visited.has(language));
    }

    return grammars;
  };
};
