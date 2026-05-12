import { describe, expect, it } from "vitest";
import { RepositoryType, SecuritySignalType } from "@prisma/client";
import {
  buildRepositorySearchQuery,
  classifyRepositoryType,
  extractSecurityEvidence,
  matchWeb3Topics,
} from "@/lib/github";

describe("github heuristics", () => {
  it("matches configured web3 topics", () => {
    expect(matchWeb3Topics(["solidity", "security", "web3"])).toEqual([
      "solidity",
      "web3",
    ]);
  });

  it("classifies smart contract repositories", () => {
    expect(
      classifyRepositoryType(["solidity", "ethereum"], "Solidity"),
    ).toBe(RepositoryType.SMART_CONTRACTS);
  });

  it("adds stable GitHub search qualifiers to raw queries", () => {
    expect(
      buildRepositorySearchQuery("topic:smart-contracts language:Solidity", new Date("2026-05-12T00:00:00Z")),
    ).toBe(
      "topic:smart-contracts language:Solidity fork:false archived:false is:public mirror:false stars:>=5 pushed:>=2024-11-18",
    );
  });

  it("preserves explicit GitHub search qualifiers", () => {
    expect(
      buildRepositorySearchQuery(
        "topic:defi stars:>=25 pushed:>=2026-01-01 fork:true archived:true",
        new Date("2026-05-12T00:00:00Z"),
      ),
    ).toBe(
      "topic:defi stars:>=25 pushed:>=2026-01-01 fork:true archived:true is:public mirror:false",
    );
  });

  it("extracts SECURITY.md evidence with bounty data", () => {
    const evidence = extractSecurityEvidence({
      matchedTopics: ["solidity"],
      repoHtmlUrl: "https://github.com/example/repo",
      securityFile: {
        path: "SECURITY.md",
        htmlUrl: "https://github.com/example/repo/blob/main/SECURITY.md",
        body: "Security vulnerabilities should be disclosed through https://immunefi.com/bounty/example and security@example.com.",
      },
      readme: null,
    });

    expect(evidence?.signalType).toBe(SecuritySignalType.SECURITY_FILE);
    expect(evidence?.bountyProgramUrl).toContain("immunefi.com");
    expect(evidence?.securityContact).toBe("security@example.com");
  });
});
