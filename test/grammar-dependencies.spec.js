import assert from "node:assert/strict";
import test from "node:test";

import {
  createGrammarLoader,
  getExternalLanguages,
  normalizeLanguage
} from "../src/grammar-dependencies.js";
import cpp from "../src/grammars/cpp.mjs";
import html from "../src/grammars/html.mjs";
import markdown from "../src/grammars/markdown.mjs";
import objectiveC from "../src/grammars/objective-c.mjs";
import scss from "../src/grammars/scss.mjs";
import tsx from "../src/grammars/tsx.mjs";
import typescript from "../src/grammars/typescript.mjs";
import svelte from "../src/grammars/svelte.mjs";
import vue from "../src/grammars/vue.mjs";

test("finds external grammar languages in nested rules", () => {
  const grammar = {
    patterns: [
      { include: "#comments" },
      { include: "$self" },
      { include: "source.js#strings" }
    ],
    repository: {
      frontMatter: {
        patterns: [
          { include: "source.yaml" },
          { include: "source.js#comments" }
        ]
      }
    }
  };

  assert.deepEqual([...getExternalLanguages(grammar)], ["js", "yaml"]);
});

test("recognizes source and text scopes but ignores unsupported includes", () => {
  const grammar = {
    patterns: [
      { include: "text.html#tags" },
      { include: "source.css" },
      { include: "meta.embedded.block" }
    ]
  };

  assert.deepEqual([...getExternalLanguages(grammar)], ["html", "css"]);
});

test("normalizes language aliases and preserves canonical names", () => {
  assert.equal(normalizeLanguage("js"), "javascript");
  // jsx and sass are standalone Shiki grammars, not aliases.
  assert.equal(normalizeLanguage("jsx"), "jsx");
  assert.equal(normalizeLanguage("sass"), "sass");
  assert.equal(normalizeLanguage("python"), "python");
  assert.equal(normalizeLanguage("custom-language"), "custom-language");
});

test("ships required embedded grammars alongside each Shiki grammar", () => {
  for (const module of [scss, html, cpp, svelte, vue]) {
    const grammar = module.at(-1);
    const shipped = module.map(entry => entry.name);
    for (const embedded of grammar.embeddedLangs ?? []) {
      assert.ok(shipped.includes(embedded), `${grammar.name} should ship ${embedded}`);
    }
  }

  assert.deepEqual(scss.at(-1).embeddedLangs, ["css"]);
  assert.deepEqual(html.at(-1).embeddedLangs, ["javascript", "css"]);
  assert.deepEqual(markdown.at(-1).embeddedLangs, []);
  assert.deepEqual([...getExternalLanguages(typescript.at(-1))], []);
  assert.deepEqual([...getExternalLanguages(tsx.at(-1))], []);
  assert.deepEqual([...getExternalLanguages(objectiveC.at(-1))], []);
});

test("loads external dependencies once and indexes grammars by language and scope", async () => {
  const grammarFixtures = {
    html: {
      scopeName: "text.html",
      dependencies: ["javascript"],
      patterns: [{ include: "source.js" }]
    },
    javascript: {
      scopeName: "source.js",
      patterns: []
    }
  };
  const importedLanguages = [];
  const load = createGrammarLoader(async language => {
    importedLanguages.push(language);
    return grammarFixtures[language] ?? null;
  });

  const loaded = await load(["html"]);
  await load(["html"]);

  assert.deepEqual(importedLanguages, ["html", "javascript"]);
  assert.deepEqual(loaded.languages, grammarFixtures);
  assert.equal(loaded.scopes.get("text.html"), grammarFixtures.html);
  assert.equal(loaded.scopes.get("source.js"), grammarFixtures.javascript);
});

test("shares in-flight grammar imports between concurrent loads", async () => {
  const grammar = { scopeName: "source.js", patterns: [] };
  let finishImport;
  let importCount = 0;
  const pendingImport = new Promise(resolve => {
    finishImport = resolve;
  });
  const load = createGrammarLoader(() => {
    importCount++;
    return pendingImport;
  });

  const firstLoad = load(["javascript"]);
  await Promise.resolve();
  let secondResolved = false;
  const secondLoad = load(["javascript"]).then(loaded => {
    secondResolved = true;
    return loaded;
  });
  await Promise.resolve();

  assert.equal(secondResolved, false);
  finishImport(grammar);
  const [first, second] = await Promise.all([firstLoad, secondLoad]);

  assert.equal(importCount, 1);
  assert.equal(first.languages.javascript, grammar);
  assert.equal(second.languages.javascript, grammar);
});

test("loads user-provided canonical language names", async () => {
  const customGrammar = { scopeName: "source.custom", patterns: [] };
  const load = createGrammarLoader(async language =>
    language === "custom-language" ? customGrammar : null
  );

  const loaded = await load(["custom-language"]);

  assert.equal(loaded.languages["custom-language"], customGrammar);
});

test("indexes grammars by canonical language only", async () => {
  const grammarFixtures = {
    javascript: { scopeName: "source.js", patterns: [] },
    json: { scopeName: "source.json", patterns: [] }
  };
  const importedLanguages = [];
  const load = createGrammarLoader(async language => {
    importedLanguages.push(language);
    return grammarFixtures[language] ?? null;
  });

  const loaded = await load(["javascript", "json"]);

  assert.deepEqual(importedLanguages, ["javascript", "json"]);
  assert.deepEqual(loaded.languages, grammarFixtures);
});

test("dynamically loads every new canonical grammar and indexes its embedded grammars by scope", async () => {
  const load = createGrammarLoader();
  const newLanguages = [
    "sql", "dockerfile", "toml", "c", "cpp", "csharp", "java", "php",
    "graphql", "kotlin", "swift", "powershell", "tsx"
  ];

  const loaded = await load(newLanguages);

  for (const language of newLanguages) {
    assert.ok(loaded.languages[language], `expected ${language} to load`);
  }

  // Shiki modules bundle their embedded grammars (cpp ships c, glsl, regexp)
  // which are indexed by scope without becoming requested languages.
  assert.equal(loaded.scopes.get("source.c"), loaded.languages.c);
  assert.ok(loaded.scopes.get("source.glsl"), "cpp should index its embedded glsl grammar");
  assert.equal(loaded.languages.glsl, undefined);
  assert.equal(loaded.scopes.get("source.tsx"), loaded.languages.tsx);
});

test("loads normalized first-party aliases by canonical language", async () => {
  const load = createGrammarLoader();
  const loaded = await load([normalizeLanguage("js")]);

  assert.ok(loaded.languages.javascript);
  assert.equal(loaded.languages.js, undefined);
  assert.equal(loaded.scopes.get("source.js"), loaded.languages.javascript);
});

test("dynamically loads every second-batch canonical grammar", async () => {
  const load = createGrammarLoader();
  const newLanguages = ["objective-c", "lua", "dart", "asm", "perl", "r"];

  const loaded = await load(newLanguages);

  for (const language of newLanguages) {
    assert.ok(loaded.languages[language], `expected ${language} to load`);
  }

  // lua ships the shared C grammar for its embedded C API blocks.
  assert.ok(loaded.scopes.get("source.c"), "lua should index its embedded c grammar");
  assert.equal(loaded.scopes.get("source.objc"), loaded.languages["objective-c"]);
});
