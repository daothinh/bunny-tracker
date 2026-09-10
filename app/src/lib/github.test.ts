import { describe, expect, it } from "vitest";
import {
  RepositoryScope,
  RepositoryType,
  SecuritySignalType,
} from "@prisma/client";
import {
  DEFAULT_WEB3_SEARCH_QUERIES,
  DEFAULT_WEB3_TOPICS,
} from "@/lib/constants";
import {
  buildRepositorySearchQuery,
  classifyRepositoryType,
  consumeRepositoryCandidates,
  detectRepositoryScope,
  extractSecurityEvidence,
  hasStrongWeb3Context,
  matchWeb3Topics,
  rotateQueryOrder,
  selectRepositoryCandidates,
} from "@/lib/github";

describe("github heuristics", () => {
  it("matches configured web3 topics", () => {
    expect(matchWeb3Topics(["solidity", "security", "web3"])).toEqual([
      "solidity",
      "web3",
    ]);
  });

  it("matches compound GitHub topics against configured topic tokens", () => {
    expect(matchWeb3Topics(["bitcoin-wallet", "lightning-network"], [
      "wallet",
      "bitcoin",
    ])).toEqual(["bitcoin", "wallet"]);
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
        body: "Security vulnerabilities should be disclosed through https://immunefi.com/bounty/example and security@company.com.",
      },
      readme: null,
    });

    expect(evidence?.signalType).toBe(SecuritySignalType.SECURITY_FILE);
    expect(evidence?.bountyProgramUrl).toContain("immunefi.com");
    expect(evidence?.securityContact).toBe("security@company.com");
  });

  it("filters out @example.com emails from security contacts", () => {
    const evidence = extractSecurityEvidence({
      matchedTopics: ["solidity"],
      repoHtmlUrl: "https://github.com/example/repo",
      securityFile: {
        path: "SECURITY.md",
        htmlUrl: "https://github.com/example/repo/blob/main/SECURITY.md",
        body: "Report security issues to security@example.com",
      },
      readme: null,
    });

    expect(evidence?.securityContact).toBeUndefined();
  });

  it("filters out @gmail.com emails from security contacts", () => {
    const evidence = extractSecurityEvidence({
      matchedTopics: ["solidity"],
      repoHtmlUrl: "https://github.com/example/repo",
      securityFile: {
        path: "SECURITY.md",
        htmlUrl: "https://github.com/example/repo/blob/main/SECURITY.md",
        body: "Contact maintainer@gmail.com for security issues",
      },
      readme: null,
    });

    expect(evidence?.securityContact).toBeUndefined();
  });

  it("accepts valid corporate emails", () => {
    const evidence = extractSecurityEvidence({
      matchedTopics: ["blockchain"],
      repoHtmlUrl: "https://github.com/company/repo",
      securityFile: {
        path: "SECURITY.md",
        htmlUrl: "https://github.com/company/repo/blob/main/SECURITY.md",
        body: "Report to security@company.io",
      },
      readme: null,
    });

    expect(evidence?.securityContact).toBe("security@company.io");
  });

  it("recognises custom bounty subdomains in security policies", () => {
    const evidence = extractSecurityEvidence({
      matchedTopics: ["blockchain", "cryptocurrency"],
      repoHtmlUrl: "https://github.com/decred/dcrd",
      securityFile: {
        path: "SECURITY.md",
        htmlUrl: "https://github.com/decred/dcrd/blob/master/SECURITY.md",
        body: "The Decred project runs a bug bounty program at https://bounty.decred.org/.",
      },
    });

    expect(evidence?.signalType).toBe(SecuritySignalType.SECURITY_FILE);
    expect(evidence?.bountyProgramUrl).toBe("https://bounty.decred.org/");
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

  it("gates generic language and ecosystem topics behind explicit web3 context", () => {
    expect(
      detectRepositoryScope({
        topics: ["rust"],
        matchedTopics: ["rust"],
        description: "A fast CLI build tool written in Rust",
      }),
    ).toBe(RepositoryScope.GENERAL);

    expect(
      detectRepositoryScope({
        topics: ["rust", "polkadot"],
        matchedTopics: ["rust"],
        description: "Substrate-based blockchain node client",
      }),
    ).toBe(RepositoryScope.WEB3);

    expect(
      detectRepositoryScope({
        topics: ["cairo", "graphics"],
        matchedTopics: ["cairo"],
        description: "2D graphics library bindings",
      }),
    ).toBe(RepositoryScope.GENERAL);

    expect(
      detectRepositoryScope({
        topics: ["cairo"],
        matchedTopics: ["cairo"],
        description: "Smart contract language for Starknet",
      }),
    ).toBe(RepositoryScope.WEB3);
  });

  it("covers every allowlisted web3 topic with at least one search query", () => {
    const queries = DEFAULT_WEB3_SEARCH_QUERIES.join("\n");
    for (const topic of DEFAULT_WEB3_TOPICS) {
      expect(queries).toContain(`topic:${topic}`);
    }
  });

  it("assigns GENERAL scope to a repository without web3 topics", () => {
    expect(
      detectRepositoryScope({
        topics: ["api", "framework"],
        matchedTopics: [],
        description: "HTTP framework for building web services",
        securityFile: {
          path: "SECURITY.md",
          htmlUrl: "https://github.com/example/repo/blob/main/SECURITY.md",
          body: "Report vulnerabilities to security@example.com.",
        },
      }),
    ).toBe(RepositoryScope.GENERAL);
  });

  it("assigns WEB3 scope when web3 topics carry strong context", () => {
    expect(
      detectRepositoryScope({
        topics: ["ethereum", "solidity"],
        matchedTopics: ["ethereum", "solidity"],
        description: "Solidity smart contract library",
      }),
    ).toBe(RepositoryScope.WEB3);
  });

  it("downgrades ambiguous web3 topics without web3 context to GENERAL", () => {
    expect(
      detectRepositoryScope({
        matchedTopics: ["rollup"],
        description: "OVHcloud Control Panel",
        homepageUrl: "https://ovh.github.io/manager/",
        securityFile: {
          path: "SECURITY.md",
          htmlUrl: "https://github.com/example/repo/blob/main/SECURITY.md",
          body: "Please report security vulnerabilities to security@example.com.",
        },
      }),
    ).toBe(RepositoryScope.GENERAL);
  });

  it("summarises general repositories without referencing empty topic lists", () => {
    const evidence = extractSecurityEvidence({
      matchedTopics: [],
      scope: RepositoryScope.GENERAL,
      repoHtmlUrl: "https://github.com/example/repo",
      securityFile: {
        path: "SECURITY.md",
        htmlUrl: "https://github.com/example/repo/blob/main/SECURITY.md",
        body: "Please report security issues to security@example.com.",
      },
    });

    expect(evidence?.signalType).toBe(SecuritySignalType.SECURITY_FILE);
    expect(evidence?.qualificationSummary).toContain("general");
    expect(evidence?.qualificationSummary).not.toContain("topics  ");
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

  it("keeps per-query progress inside the same search page when max repos is lower than fetched hits", () => {
    const selection = consumeRepositoryCandidates(
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
      ],
      [
        { page: 1, itemOffset: 0 },
        { page: 1, itemOffset: 0 },
      ],
      2,
      3,
    );

    expect(selection.candidates.map((candidate) => candidate.full_name)).toEqual([
      "query-a/one",
      "query-b/one",
    ]);
    expect(selection.nextQueryPages).toEqual([
      { page: 1, itemOffset: 1 },
      { page: 1, itemOffset: 1 },
    ]);
  });

  it("advances duplicate-heavy queries without dropping later unique candidates", () => {
    const selection = consumeRepositoryCandidates(
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
      [
        { page: 3, itemOffset: 0 },
        { page: 2, itemOffset: 0 },
      ],
      3,
      2,
    );

    expect(selection.candidates.map((candidate) => candidate.full_name)).toEqual([
      "shared/repo",
      "query-a/two",
      "query-b/two",
    ]);
    expect(selection.nextQueryPages).toEqual([
      { page: 4, itemOffset: 0 },
      { page: 3, itemOffset: 0 },
    ]);
  });

  it("rotates query order by the stored offset so later queries are not starved", () => {
    const queries = ["q-a", "q-b", "q-c", "q-d"];

    expect(rotateQueryOrder(queries, 0)).toEqual(["q-a", "q-b", "q-c", "q-d"]);
    expect(rotateQueryOrder(queries, 1)).toEqual(["q-b", "q-c", "q-d", "q-a"]);
    expect(rotateQueryOrder(queries, 3)).toEqual(["q-d", "q-a", "q-b", "q-c"]);
  });

  it("wraps rotation offsets larger than the query count", () => {
    const queries = ["q-a", "q-b", "q-c"];

    expect(rotateQueryOrder(queries, 4)).toEqual(["q-b", "q-c", "q-a"]);
    expect(rotateQueryOrder([], 2)).toEqual([]);
  });
});
