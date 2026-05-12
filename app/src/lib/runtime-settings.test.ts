import { describe, expect, it } from "vitest";
import {
  parseSearchQueryInput,
  parseTopicInput,
} from "@/lib/runtime-settings";

describe("runtime settings parsers", () => {
  it("normalises topic input as lowercase unique values", () => {
    expect(parseTopicInput("Solidity, defi, Solidity,  Wallet ")).toEqual([
      "solidity",
      "defi",
      "wallet",
    ]);
  });

  it("preserves GitHub query casing and deduplicates full lines", () => {
    expect(
      parseSearchQueryInput(
        "topic:defi OR topic:wallet\n\ntopic:defi OR topic:wallet\nlanguage:Solidity stars:>=25",
      ),
    ).toEqual([
      "topic:defi OR topic:wallet",
      "language:Solidity stars:>=25",
    ]);
  });
});
