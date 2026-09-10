import {
  ReportStatus,
  RepositoryScope,
  RepositoryType,
  SecuritySignalType,
} from "@prisma/client";

export const APP_TITLE = "Pug Bunny Tricker";
export const SESSION_COOKIE_NAME = "pbt_manager_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 12;
export const MANAGEMENT_KEY_HEADER = "x-management-key";

// Allowlist topic web3 dùng để gắn scope WEB3 vs GENERAL. Các topic generic
// (cũng dùng ngoài web3) được chặn thêm ở CONTEXT_REQUIRED_WEB3_TOPICS trong
// lib/github.ts: phải có ngữ cảnh web3 rõ ràng mới tính là WEB3.
export const DEFAULT_WEB3_TOPICS = [
  "web3",
  "blockchain",
  "crypto",
  "cryptocurrency",
  "dapp",
  "dapps",
  "decentralized",
  "smart-contracts",
  "smartcontract",
  "solidity",
  "vyper",
  "rust",
  "move-language",
  "cairo",
  "ink",
  "wallet",
  "crypto-wallet",
  "web3-wallet",
  "multisig",
  "account-abstraction",
  "eip-4337",
  "ethereum",
  "evm",
  "bitcoin",
  "solana",
  "polkadot",
  "substrate",
  "near-protocol",
  "nearprotocol",
  "cosmos-sdk",
  "avalanche",
  "polygon",
  "arbitrum",
  "optimism",
  "starknet",
  "zksync",
  "binance-smart-chain",
  "bsc",
  "tron",
  "cardano",
  "defi",
  "dex",
  "amm",
  "yield-farming",
  "lending-protocol",
  "liquidity-pool",
  "stablecoin",
  "nft",
  "nft-marketplace",
  "erc721",
  "erc1155",
  "gamefi",
  "play-to-earn",
  "metaverse",
  "bridge",
  "cross-chain",
  "layer2",
  "rollup",
  "zk-rollup",
  "optimistic-rollup",
  "hardhat",
  "foundry",
  "truffle",
  "ethers-js",
  "web3js",
  "web3-js",
  "wagmi",
  "viem",
  "thirdweb",
  "openzeppelin",
  "oracle",
  "chainlink",
  "ipfs",
  "the-graph",
  "indexer",
  "dao",
  "governance",
  "voting",
] as const;

// Query search web3: phủ mỗi topic một query (GitHub topic search khớp chính
// xác, không tách token nên các biến thể như dapp/dapps cần query riêng), cộng
// combo cho các topic "bọc ngoài" ngôn ngữ cụ thể. Mục tiêu là lấy gần đúng
// danh sách repo rộng nhất rồi để bước lọc sau siết lại.
export const DEFAULT_WEB3_SEARCH_QUERIES = [
  // Ngành/nền tảng tổng quát.
  "topic:web3",
  "topic:blockchain",
  "topic:crypto",
  "topic:cryptocurrency",
  "topic:dapp stars:>=10",
  "topic:dapps stars:>=10",
  "topic:decentralized stars:>=10",
  // Ngôn ngữ hợp đồng / VM.
  "topic:smart-contracts",
  "topic:smartcontract",
  "topic:solidity",
  "topic:vyper",
  "topic:cairo topic:starknet",
  "topic:ink topic:substrate",
  "topic:move-language",
  // Ví / tài khoản.
  "topic:wallet stars:>=10",
  "topic:crypto-wallet",
  "topic:web3-wallet",
  "topic:multisig",
  "topic:account-abstraction",
  "topic:eip-4337",
  // Chuỗi/nền tảng lớn.
  "topic:ethereum",
  "topic:evm",
  "topic:bitcoin stars:>=10",
  "topic:solana",
  "topic:polkadot",
  "topic:substrate",
  "topic:near-protocol",
  "topic:nearprotocol",
  "topic:cosmos-sdk",
  "topic:avalanche stars:>=10",
  "topic:polygon",
  "topic:arbitrum",
  "topic:optimism",
  "topic:starknet",
  "topic:zksync",
  "topic:binance-smart-chain",
  "topic:bsc stars:>=10",
  "topic:tron",
  "topic:cardano",
  // Combo ngôn ngữ + hệ sinh thái (topic:rust một mình quá nhiễu).
  "topic:rust topic:solana",
  "topic:rust topic:near-protocol",
  "topic:rust topic:polkadot",
  "topic:rust topic:cosmos-sdk",
  "topic:rust topic:substrate",
  // DeFi.
  "topic:defi",
  "topic:dex stars:>=10",
  "topic:amm",
  "topic:yield-farming",
  "topic:lending-protocol",
  "topic:liquidity-pool",
  "topic:stablecoin",
  // NFT / gaming.
  "topic:nft stars:>=10",
  "topic:nft-marketplace",
  "topic:erc721",
  "topic:erc1155",
  "topic:gamefi",
  "topic:play-to-earn",
  "topic:metaverse stars:>=10",
  // Hạ tầng mở rộng.
  "topic:bridge stars:>=10",
  "topic:cross-chain",
  "topic:layer2",
  "topic:rollup",
  "topic:zk-rollup",
  "topic:optimistic-rollup",
  // Tooling / thư viện.
  "topic:hardhat",
  "topic:foundry",
  "topic:truffle",
  "topic:ethers-js",
  "topic:web3js",
  "topic:web3-js",
  "topic:wagmi",
  "topic:viem",
  "topic:thirdweb",
  "topic:openzeppelin",
  // Oracle / lưu trữ / index.
  "topic:oracle topic:blockchain",
  "topic:chainlink",
  "topic:ipfs",
  "topic:the-graph",
  "topic:indexer topic:blockchain",
  // DAO / quản trị.
  "topic:dao",
  "topic:governance topic:blockchain",
  "topic:voting topic:blockchain",
] as const;

// Queries nhắm tới "phần còn lại" (non-web3). GitHub Search không lọc được
// theo file SECURITY, nên các query này chủ động ưu tiên repo phổ biến và
// mảng security/infra; bước qualify sau đó bắt buộc phải có file SECURITY.
export const DEFAULT_GENERAL_SEARCH_QUERIES = [
  "topic:security stars:>=200",
  "topic:cybersecurity stars:>=200",
  "topic:security-tools stars:>=1000",
  "topic:vulnerability stars:>=500",
  "org:microsoft topic:security",
  "org:google topic:security",
  "org:netflix",
  "org:cloudflare",
  "topic:database stars:>=5000",
  "topic:web-framework stars:>=2000",
  "topic:api language:Go stars:>=500",
  "topic:monitoring stars:>=1000",
  "topic:authentication stars:>=500",
] as const;

export const DEFAULT_SEARCH_QUERIES = [
  ...DEFAULT_WEB3_SEARCH_QUERIES,
  ...DEFAULT_GENERAL_SEARCH_QUERIES,
] as const;

export const SECURITY_FILE_CANDIDATES = [
  "SECURITY",
  "SECURITY.txt",
  "SECURITY.md",
  ".github/SECURITY",
  ".github/SECURITY.txt",
  ".github/SECURITY.md",
  "docs/SECURITY",
  "docs/SECURITY.txt",
  "docs/SECURITY.md",
  ".well-known/security.txt",
  "security.txt",
];

export const BUG_BOUNTY_HOSTS = [
  "immunefi.com",
  "hackerone.com",
  "bugcrowd.com",
  "code4rena.com",
  "cantina.xyz",
  "hackenproof.com",
  "bounty.decred.org",
];

export const REPORT_STATUS_OPTIONS = Object.values(ReportStatus);
export const REPOSITORY_TYPE_OPTIONS = Object.values(RepositoryType);
export const REPOSITORY_SCOPE_OPTIONS = Object.values(RepositoryScope);

export const REPOSITORY_SCOPE_LABELS: Record<RepositoryScope, string> = {
  WEB3: "Web3",
  GENERAL: "General",
};

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
