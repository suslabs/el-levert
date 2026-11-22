import { describe, expect, test } from "vitest";

import HtmlUtil from "../../../src/util/misc/HtmlUtil.js";

describe("HtmlUtil", () => {
    test("decodes named and numeric entities", () => {
        expect(HtmlUtil.decodeEntities("Steel &amp; Iron &lt;3 &#39;x&#39; &#x41; &nbsp;&unknown;")).toBe(
            "Steel & Iron <3 'x' A  &unknown;"
        );
    });

    test("strips tags", () => {
        expect(HtmlUtil.stripTags(" Steel is <b>iron</b> &amp; carbon ")).toBe("Steel is iron & carbon");
    });

    test("extracts the title and readable text", () => {
        const html = `<html><head><title>Steel &amp; Co</title><style>p{}</style></head>
            <body><nav>menu</nav><p>Steel is an alloy.</p><ul><li>Iron</li><li>Carbon</li></ul>
            <script>evil()</script><!-- hidden --></body></html>`;

        const { title, text } = HtmlUtil.toText(html);

        expect(title).toBe("Steel & Co");
        expect(text).toContain("Steel is an alloy.");
        expect(text).toContain("• Iron");
        expect(text).not.toContain("evil");
        expect(text).not.toContain("hidden");
        expect(text).not.toContain("p{}");
    });

    test("drops a title outside of the head", () => {
        expect(HtmlUtil.toText("<title>Steel</title><p>Body</p>")).toEqual({ title: "Steel", text: "Body" });
    });

    test("prefers a long main element", () => {
        const main = `<main>${"<p>Real content.</p>".repeat(120)}</main>`,
            { text } = HtmlUtil.toText(`<div>Sidebar junk</div>${main}`);

        expect(text).not.toContain("Sidebar junk");
        expect(text.startsWith("Real content.")).toBe(true);
    });
});
