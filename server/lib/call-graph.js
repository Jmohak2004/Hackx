const { parse } = require("@babel/parser");
const path = require("node:path");
const { AppError } = require("./errors");

const FUNCTION_NODES = new Set([
  "FunctionDeclaration", "FunctionExpression", "ArrowFunctionExpression",
  "ObjectMethod", "ClassMethod", "ClassPrivateMethod",
]);
const SKIP_KEYS = new Set(["loc", "start", "end", "extra", "comments", "leadingComments", "trailingComments", "innerComments", "tokens", "errors"]);

function identifier(node) {
  return node?.name || (typeof node?.value === "string" ? node.value : null);
}

function analyzeJavaScript(code, filename) {
  const plugins = ["decorators-legacy", "importAttributes", "explicitResourceManagement"];
  if (/\.[cm]?tsx?$/.test(filename)) plugins.push("typescript");
  if (/\.[jt]sx$/.test(filename) || /\.jsx?$/.test(filename)) plugins.push("jsx");
  let ast;
  try {
    ast = parse(code, {
      sourceType: "unambiguous", plugins, attachComment: false,
      allowUndeclaredExports: true, allowReturnOutsideFunction: true,
    });
  } catch {
    throw new AppError(422, "UNSUPPORTED_SOURCE_SYNTAX", "A JavaScript/TypeScript source file could not be parsed: " + filename);
  }
  const functions = new Set();
  const classes = new Set();
  const imports = new Set();
  const importBindings = Object.create(null);
  const exportBindings = Object.create(null);
  const calls = [];
  const stack = [{ node: ast.program, parent: null, scope: null }];
  let visited = 0;
  while (stack.length) {
    const { node, parent, scope } = stack.pop();
    if (++visited > 150_000) throw new AppError(422, "AST_LIMIT", "A source file exceeds the syntax analysis limit");
    let nextScope = scope;
    if (FUNCTION_NODES.has(node.type)) {
      const name = identifier(node.id) || identifier(node.key) ||
        (parent?.type === "VariableDeclarator" ? identifier(parent.id) : null) ||
        (["ObjectProperty", "ClassProperty"].includes(parent?.type) ? identifier(parent.key) : null) ||
        (parent?.type === "ExportDefaultDeclaration" ? "default" : null);
      if (name) { functions.add(name); nextScope = name; }
      if (parent?.type === "ExportDefaultDeclaration" && name) exportBindings.default = name;
    }
    if (node.type === "ClassDeclaration" || node.type === "ClassExpression") {
      const name = identifier(node.id) || (parent?.type === "VariableDeclarator" ? identifier(parent.id) : null);
      if (name) classes.add(name);
    }
    if (node.type === "ImportDeclaration") {
      imports.add(node.source.value);
      for (const specifier of node.specifiers) {
        importBindings[specifier.local.name] = {
          source: node.source.value,
          imported: specifier.type === "ImportDefaultSpecifier" ? "default"
            : specifier.type === "ImportNamespaceSpecifier" ? "*" : identifier(specifier.imported),
        };
      }
    }
    if (node.type === "ExportNamedDeclaration") {
      for (const specifier of node.specifiers || []) {
        const exported = identifier(specifier.exported);
        const local = identifier(specifier.local);
        if (exported && local) exportBindings[exported] = local;
      }
    }
    if (node.type === "CallExpression" && node.callee.type === "Identifier" && node.callee.name === "require" &&
        node.arguments[0]?.type === "StringLiteral") {
      const source = node.arguments[0].value;
      imports.add(source);
      if (parent?.type === "VariableDeclarator" && parent.id.type === "Identifier") {
        importBindings[parent.id.name] = { source, imported: "*" };
      }
      if (parent?.type === "VariableDeclarator" && parent.id.type === "ObjectPattern") {
        for (const property of parent.id.properties) {
          const local = identifier(property.value);
          const imported = identifier(property.key);
          if (local && imported) importBindings[local] = { source, imported };
        }
      }
    }
    if (nextScope && ["CallExpression", "OptionalCallExpression"].includes(node.type)) {
      const callee = node.callee;
      if (callee.type === "Identifier") {
        calls.push({ caller: nextScope, callee: callee.name });
      } else if (["MemberExpression", "OptionalMemberExpression"].includes(callee.type) && !callee.computed) {
        const member = identifier(callee.property);
        if (member && callee.object.type === "ThisExpression") {
          calls.push({ caller: nextScope, callee: member, local: true });
        } else if (member && callee.object.type === "Identifier") {
          calls.push({ caller: nextScope, callee: member, namespace: callee.object.name });
        }
      }
    }
    for (const [key, value] of Object.entries(node)) {
      if (SKIP_KEYS.has(key)) continue;
      if (Array.isArray(value)) {
        for (let index = value.length - 1; index >= 0; index--) {
          if (value[index] && typeof value[index].type === "string") stack.push({ node: value[index], parent: node, scope: nextScope });
        }
      } else if (value && typeof value.type === "string") stack.push({ node: value, parent: node, scope: nextScope });
    }
  }
  return {
    functions: [...functions], classes: [...classes], imports: [...imports],
    callReferences: calls, importBindings, exportBindings, isModule: ast.program.sourceType === "module",
  };
}

// Non-JS languages use bounded lexical body analysis. This deliberately avoids
// treating every declaration in a file as a call from every other declaration.
function maskStringsAndComments(code) {
  const result = code.split("");
  let quote = null;
  let block = false;
  let line = false;
  for (let index = 0; index < code.length; index++) {
    const char = code[index];
    const next = code[index + 1];
    if (line) {
      if (char === "\n") line = false; else result[index] = " ";
    } else if (block) {
      if (char !== "\n") result[index] = " ";
      if (char === "*" && next === "/") { result[++index] = " "; block = false; }
    } else if (quote) {
      if (char !== "\n") result[index] = " ";
      if (char === "\\") { if (next !== "\n") result[++index] = " "; }
      else if (char === quote) quote = null;
    } else if (char === "/" && next === "*") {
      result[index] = result[++index] = " "; block = true;
    } else if ((char === "/" && next === "/") || char === "#") {
      result[index] = " "; line = true;
    } else if (char === '"' || char === "'" || char === String.fromCharCode(96)) {
      result[index] = " "; quote = char;
    }
  }
  return result.join("");
}

function lexicalReferences(file) {
  const code = maskStringsAndComments(file.code);
  const references = [];
  for (const name of file.functions) {
    const escaped = name.replace(/[.*+?^{}$()|[\]\\]/g, "\\$&");
    let body = "";
    if (file.language === "python" || file.language === "ruby") {
      const lines = code.split("\n");
      const declaration = new RegExp("^(\\s*)(?:async\\s+)?def\\s+(?:self\\.)?" + escaped + "\\b");
      const start = lines.findIndex((line) => declaration.test(line));
      if (start < 0) continue;
      const indent = declaration.exec(lines[start])[1].replace(/\t/g, "    ").length;
      const end = lines.findIndex((line, index) => index > start && line.trim() &&
        line.match(/^\s*/)[0].replace(/\t/g, "    ").length <= indent);
      body = lines.slice(start + 1, end < 0 ? lines.length : end)
        .filter((line) => !/^\s*(?:async\s+)?def\s/.test(line)).join("\n");
    } else {
      const declaration = new RegExp("\\b" + escaped + "\\s*(?:<[^>{}]*>)?\\s*\\([^)]*\\)[^{;]*\\{").exec(code);
      if (!declaration) continue;
      const start = declaration.index + declaration[0].length;
      let depth = 1;
      let end = start;
      for (; end < code.length && depth; end++) {
        if (code[end] === "{") depth++;
        if (code[end] === "}") depth--;
      }
      body = code.slice(start, end - 1);
    }
    for (const match of body.matchAll(/\b([A-Za-z_]\w*)\s*\(/g)) {
      references.push({ caller: name, callee: match[1] });
    }
  }
  return references;
}

function inferFunctionCalls(files) {
  const registry = new Map();
  const byPath = new Map(files.map((file) => [file.file, file]));
  for (const file of files) for (const name of file.functions) {
    if (!registry.has(name)) registry.set(name, []);
    registry.get(name).push({ file: file.file, name });
  }
  const pairs = [];
  const seen = new Set();
  for (const file of files) {
    for (const reference of file.callReferences || lexicalReferences(file)) {
      let name = reference.callee;
      let binding = file.importBindings?.[reference.namespace || name];
      if (reference.namespace && (!binding || binding.imported !== "*")) continue;
      let targets = [];
      if (binding) {
        if (!binding.source.startsWith(".")) continue;
        const base = path.posix.normalize(path.posix.join(path.posix.dirname(file.file), binding.source));
        const candidates = [base, ...[".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs", "/index.js", "/index.ts", "/index.tsx"].map((suffix) => base + suffix)];
        const targetFile = candidates.map((candidate) => byPath.get(candidate)).find(Boolean);
        if (!targetFile) continue;
        if (!reference.namespace) name = binding.imported;
        name = targetFile.exportBindings?.[name] || name;
        if (targetFile.functions.includes(name)) targets = [{ file: targetFile.file, name }];
      } else {
        const local = (registry.get(name) || []).filter((target) => target.file === file.file);
        targets = local.length ? local : file.isModule || reference.local ? [] : registry.get(name) || [];
      }
      for (const target of targets) {
        if (target.file === file.file && target.name === reference.caller) continue;
        const key = [file.file, reference.caller, target.file, target.name].join(":");
        if (seen.has(key)) continue;
        seen.add(key);
        pairs.push({ callerFile: file.file, caller: reference.caller, calleeFile: target.file, callee: target.name });
        if (pairs.length >= 20_000) return pairs;
      }
    }
  }
  return pairs;
}

module.exports = { analyzeJavaScript, inferFunctionCalls };
