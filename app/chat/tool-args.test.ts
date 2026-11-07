import { describe, expect, test } from "bun:test";

import { parseToolArgs } from "./tool-args";

describe("parseToolArgs", () => {
    test("accepts valid JSON unchanged", () => {
        const text = `{"path":"a.html","content":"<p>hi</p>"}`;
        expect(parseToolArgs(text)).toEqual({
            path: "a.html",
            content: "<p>hi</p>",
        });
    });

    test("rejects non-object payloads", () => {
        expect(parseToolArgs("[1,2]")).toBeNull();
        expect(parseToolArgs("42")).toBeNull();
        expect(parseToolArgs("not json at all")).toBeNull();
        expect(parseToolArgs("")).toBeNull();
    });

    test("escapes raw newlines and tabs inside strings", () => {
        const text = '{"content":"第一行\n第二行\t缩进"}';
        expect(parseToolArgs(text)).toEqual({
            content: "第一行\n第二行\t缩进",
        });
    });

    test("keeps unknown escapes as literal backslash + char", () => {
        const text = '{"code":"re = /\\d+/g"}';
        // The model meant the regex /\d+/g but only escaped once.
        expect(parseToolArgs(text)).toEqual({ code: "re = /\\d+/g" });
    });

    test("turns \\' into a plain quote", () => {
        const text = `{"content":"it\\'s fine"}`;
        expect(parseToolArgs(text)).toEqual({ content: "it's fine" });
    });

    test("escapes unescaped inner quotes", () => {
        const text = `{"content":"他说"你好"，然后离开"}`;
        expect(parseToolArgs(text)).toEqual({
            content: `他说"你好"，然后离开`,
        });
    });

    test("escapes font names the model left unquoted-in-string", () => {
        // Real DeepSeek payload: font-family quotes arrive raw while the
        // structural quotes are escaped — a raw quote before `,` looks like
        // a close but is content.
        const text =
            '{"content":"body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC",sans-serif;}"}';
        expect(parseToolArgs(text)).toEqual({
            content:
                'body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC",sans-serif;}',
        });
    });

    test("backtracks when a CSS content quote ends before a brace", () => {
        const text = '{"content":"q::after{content:"◆" }\\n更多"}';
        expect(parseToolArgs(text)).toEqual({
            content: `q::after{content:"◆" }\n更多`,
        });
    });

    test("drops trailing commas", () => {
        const text = `{"a":1,}`;
        expect(parseToolArgs(text)).toEqual({ a: 1 });
    });

    test("closes a truncated tail by default", () => {
        const text = `{"path":"a.html","content":"<html>\\n<p>未完`;
        expect(parseToolArgs(text)).toEqual({
            path: "a.html",
            content: "<html>\n<p>未完",
        });
    });

    test("refuses to close the tail when closeTail=false", () => {
        const text = `{"path":"a.html","content":"<html>\\n<p>未完`;
        expect(parseToolArgs(text, { closeTail: false })).toBeNull();
    });

    test("repairs a realistic sandbox_write payload", () => {
        // Raw newline between CSS rules, an invalid \d escape in a regex and
        // an unescaped quote — the malformations fast models actually emit.
        const text = [
            '{"path":"制通单.html","content":"<!DOCTYPE html>\\n<style>',
            ":root{ --blue:#14508f; }",
            ".row:nth-child(2n){ background:#f5f7fb; }",
            'const re = /\\d+/g; // "匹配数字"',
            "</style>",
        ].join("\n");
        const parsed = parseToolArgs(text);
        expect(parsed?.path).toBe("制通单.html");
        expect(parsed?.content).toContain("\n<style>");
        expect(parsed?.content).toContain("/\\d+/g");
        expect(parsed?.content).toContain(`"匹配数字"`);
    });

    test("still fails on hopeless garbage", () => {
        expect(parseToolArgs('{"a": "b" "c": !!}')).toBeNull();
    });
});
