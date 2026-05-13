import { describe, expect, it } from "vitest";
import { RepositoryType, SecuritySignalType } from "@prisma/client";
import {
  buildRepositorySearchQuery,
  classifyRepositoryType,
  extractSecurityEvidence,
  hasStrongWeb3Context,
  matchWeb3Topics,
  selectRepositoryCandidates,
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

  it("rejects ambiguous web3 topics without stronger repository context", () => {
    expect(
      hasStrongWeb3Context({
        matchedTopics: ["rollup"],
        description: "OVHcloud Control Panel",
        homepageUrl: "https://ovh.github.io/manager/",
        securityFile: {
          path: "SECURITY.md",
          htmlUrl: "https://github.com/example/repo/blob/main/SECURITY.md",
          body: "Please report security vulnerabilities to security@example.com.",
        },
      }),
    ).toBe(false);
  });

  it("accepts ambiguous topics when repository text clearly indicates web3", () => {
    expect(
      hasStrongWeb3Context({
        topics: ["wallet", "crypto", "cryptocurrency"],
        matchedTopics: ["wallet"],
        description: "Open-source Bitcoin and Ethereum wallet",
        readme: {
          path: "README.md",
          htmlUrl: "https://github.com/example/repo",
          body: "A cryptocurrency wallet for self-custody.",
        },
      }),
    ).toBe(true);
  });

  it("selects repository candidates in a round-robin order across queries", () => {
    const candidates = selectRepositoryCandidates(
      [
        [
          { full_name: "query-a/one" },
          { full_name: "query-a/two" },
          { full_name: "query-a/three" },
        ],
        [
          { full_name: "query-b/one" },
          { full_name: "query-b/two" },
          { full_name: "query-b/three" },
        ],
        [{ full_name: "query-c/one" }],
      ],
      5,
    );

    expect(candidates.map((candidate) => candidate.full_name)).toEqual([
      "query-a/one",
      "query-b/one",
      "query-c/one",
      "query-a/two",
      "query-b/two",
    ]);
  });

  it("deduplicates repeated repositories while keeping later slots available", () => {
    const candidates = selectRepositoryCandidates(
      [
        [
          { full_name: "shared/repo" },
          { full_name: "query-a/two" },
        ],
        [
          { full_name: "shared/repo" },
          { full_name: "query-b/two" },
        ],
      ],
      3,
    );

    expect(candidates.map((candidate) => candidate.full_name)).toEqual([
      "shared/repo",
      "query-a/two",
      "query-b/two",
    ]);
  });
});
