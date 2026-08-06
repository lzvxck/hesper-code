import { describe, expect, test } from "bun:test";

import { textNodes } from "../src/index";

describe("textNodes", () => {
  test("undoes React's five escapes", () => {
    expect(textNodes("<p>&amp;&lt;&gt;&quot;&#x27;</p>")).toBe("&<>\"'");
  });

  /*
   * The regression the one-list rewrite closed. The pattern and the table used to be two hand
   * -maintained lists, so an entity named in one and missing from the other resolved to
   * `undefined` and was spliced into the copy the policy patterns then scanned — measured as
   * "a&nbsp;b" coming back "aundefinedb". Leaving it undecoded is the correct answer: React
   * emits no &nbsp;, so text holding one was written that way.
   */
  test("leaves an entity outside the table alone rather than splicing in 'undefined'", () => {
    expect(textNodes("<p>a&nbsp;b</p>")).toBe("a&nbsp;b");
  });
});
