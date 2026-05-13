import {
  ReportStatus,
  RepositoryType,
  SecuritySignalType,
} from "@prisma/client";

export const APP_TITLE = "Pug Bunny Tricker";
export const SESSION_COOKIE_NAME = "pbt_manager_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 12;
export const MANAGEMENT_KEY_HEADER = "x-management-key";

export const DEFAULT_WEB3_TOPICS = [
  "web3",
  "ethereum",
  "evm",
  "solidity",
  "defi",
  "smart-contracts",
  "blockchain",
  "wallet",
  "bridge",
  "layer2",
  "rollup",
  "foundry",
  "hardhat",
  "zk",
  "dao",
  "nft",
] as const;

export const DEFAULT_SEARCH_QUERIES = [
  "topic:smart-contracts language:Solidity",
  "topic:defi language:Solidity",
  "topic:wallet topic:ethereum",
  "topic:wallet topic:blockchain",
  "topic:bridge topic:ethereum",
  "topic:bridge topic:blockchain",
  "topic:rollup topic:ethereum",
  "topic:layer2 topic:ethereum",
  "topic:foundry language:Solidity",
] as const;

export const SECURITY_FILE_CANDIDATES = [
  "SECURITY.md",
  ".github/SECURITY.md",
  "docs/SECURITY.md",
];

export const BUG_BOUNTY_HOSTS = [
  "immunefi.com",
  "hackerone.com",
  "bugcrowd.com",
  "code4rena.com",
  "cantina.xyz",
  "hackenproof.com",
];

export const REPORT_STATUS_OPTIONS = Object.values(ReportStatus);
export const REPOSITORY_TYPE_OPTIONS = Object.values(RepositoryType);

export const REPORT_STATUS_LABELS: Record<ReportStatus, string> = {
  NEW: "New",
  REVIEWING: "Reviewing",
  DRAFTING: "Drafting",
  SUBMITTED: "Submitted",
  TRIAGED: "Triaged",
  RESOLVED: "Resolved",
  NOT_APPLICABLE: "N/A",
};

export const REPOSITORY_TYPE_LABELS: Record<RepositoryType, string> = {
  SMART_CONTRACTS: "Smart Contracts",
  PROTOCOL: "Protocol",
  INFRASTRUCTURE: "Infrastructure",
  TOOLING: "SDK / Tooling",
  WALLET: "Wallet",
  APPLICATION: "Application",
  OTHER: "Other",
};

export const SECURITY_SIGNAL_LABELS: Record<SecuritySignalType, string> = {
  SECURITY_FILE: "Security file",
  BUG_BOUNTY: "Bug bounty",
  SECURITY_CONTACT: "Security contact",
  RESPONSIBLE_DISCLOSURE: "Responsible disclosure",
  README_MENTION: "README signal",
};
