const test = require("node:test");
const assert = require("node:assert/strict");
const { analyzeJavaScript, inferFunctionCalls } = require("../lib/call-graph");

function file(name, source) {
  return { file: name, language: name.endsWith(".ts") ? "typescript" : "javascript",
    code: source, ...analyzeJavaScript(source, name) };
}

test("does not create calls between unrelated function declarations", () => {
  const input = file("app.js", "function first() { return 1; }\nfunction second() { return 2; }");
  assert.equal(input.functions.length, 2);
  assert.deepEqual(inferFunctionCalls([input]), []);
});

test("attributes actual calls to their containing function without counting strings", () => {
  const input = file("app.js", 'function first() { return second(); }\nfunction second() { return "first()"; }');
  assert.deepEqual(inferFunctionCalls([input]), [
    { callerFile: "app.js", caller: "first", calleeFile: "app.js", callee: "second" },
  ]);
});

test("resolves named import aliases and TypeScript calls to the correct file", () => {
  const inputs = [
    file("src/main.ts", 'import { score as judge } from "./judge"; export const submit = () => judge(7);'),
    file("src/judge.ts", "export function score(value: number): number { return value; }"),
    file("src/other.ts", "export function score(): number { return 0; }"),
  ];
  assert.deepEqual(inferFunctionCalls(inputs), [
    { callerFile: "src/main.ts", caller: "submit", calleeFile: "src/judge.ts", callee: "score" },
  ]);
});

test("does not connect external package calls to similarly named project functions", () => {
  const inputs = [
    file("main.js", 'import { parse } from "some-library"; function run() { return parse("x"); }'),
    file("unrelated.js", "export function parse() { return 1; }"),
  ];
  assert.deepEqual(inferFunctionCalls(inputs), []);
});

test("handles namespace imports and default exported functions", () => {
  const inputs = [
    file("main.ts", 'import judge from "./judge"; import * as util from "./util"; function run() { judge(); util.help(); }'),
    file("judge.ts", "export default function evaluate() { return 7; }"),
    file("util.ts", "export function help() { return 1; }"),
  ];
  const calls = inferFunctionCalls(inputs);
  assert.equal(calls.length, 2);
  assert.ok(calls.some((call) => call.calleeFile === "judge.ts" && call.callee === "evaluate"));
  assert.ok(calls.some((call) => call.calleeFile === "util.ts" && call.callee === "help"));
});
