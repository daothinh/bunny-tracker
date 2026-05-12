# GitHub API Plan For Web3 Target Discovery

Date: 2026-05-12

## Goal

Build a tracker that discovers candidate web3 bug-bounty targets only from GitHub repositories, then enriches each repo with enough metadata to decide whether it is a real target worth tracking.

## Recommendation

Use a REST-first ingestion pipeline.

- Use REST repository search for candidate discovery.
- Use REST repository/community/README/contents endpoints for validation and enrichment.
- Use GraphQL only as an optional batch-enrichment layer after you already know exact repositories.

Why:

- REST has the clearest first-class repo discovery endpoint: `GET /search/repositories`.
- REST search responses already include most screening fields: `topics`, `language`, `stargazers_count`, `fork`, `archived`, `pushed_at`, `license`, `default_branch`, `has_discussions`, `is_template`, etc.
- REST has purpose-built endpoints for preferred README and community profile.
- GraphQL search is flexible, but it still caps search at 1,000 results and introduces point-cost, node-limit, and timeout pressure.
- For `SECURITY.md`, GraphQL can work, but REST `contents` is simpler and more explicit.

## API Split

### 1. Candidate discovery

Primary endpoint:

- `GET /search/repositories`

Use multiple narrow queries instead of one broad query. The docs cap search at:

- 1,000 returned results per search
- 4,000 repositories searched per query
- 256 query characters
- 5 boolean operators

Practical seed queries for a web3 tracker:

- `topic:solidity fork:false archived:false`
- `topic:smart-contracts fork:false archived:false`
- `topic:defi fork:false archived:false`
- `topic:web3 fork:false archived:false`
- `language:Solidity fork:false archived:false`
- `topic:ethereum fork:false archived:false`

Then shard broad queries by one of:

- `pushed:YYYY-MM-DD..YYYY-MM-DD`
- `stars:min..max`
- `created:YYYY-MM-DD..YYYY-MM-DD`

Use sort modes when helpful:

- `sort=updated`
- `sort=stars`
- `sort=forks`

Example:

```text
GET /search/repositories?q=topic:solidity fork:false archived:false pushed:2026-01-01..2026-03-31&sort=updated&order=desc
```

### 2. Lightweight repo validation

Primary endpoint:

- `GET /repos/{owner}/{repo}`

Use this when you need a canonical refresh after discovery or when search payloads are stale/incomplete.

Fields to keep:

- `id`
- `node_id`
- `full_name`
- `owner.login`
- `html_url`
- `description`
- `homepage`
- `topics`
- `language`
- `fork`
- `archived`
- `disabled`
- `visibility`
- `created_at`
- `updated_at`
- `pushed_at`
- `stargazers_count`
- `forks_count`
- `open_issues_count`
- `default_branch`
- `license`
- `has_issues`
- `has_discussions`
- `allow_forking`
- `is_template`

### 3. README enrichment

Primary endpoint:

- `GET /repos/{owner}/{repo}/readme`

Use this instead of guessing file paths. It returns the preferred README for the repo and supports raw or HTML media types.

Use it to extract:

- protocol/app identity
- chains mentioned
- deployment links
- docs/audit links
- bug-bounty or disclosure language
- archived/legacy status hints

### 4. Community-profile enrichment

Primary endpoint:

- `GET /repos/{owner}/{repo}/community/profile`

Use this for low-cost trust/maintenance signals. It returns:

- `health_percentage`
- detected `documentation`
- detected `code_of_conduct`
- detected `license`
- presence of `README`
- presence of `CONTRIBUTING`
- issue / PR templates

Important limitation:

- the repo cannot be a fork

### 5. SECURITY.md / disclosure policy detection

There is no better current REST shortcut in the docs than checking repository contents directly.

Use:

- `GET /repos/{owner}/{repo}/contents/{path}`

Check these candidate paths in order:

1. `SECURITY.md`
2. `.github/SECURITY.md`
3. `docs/SECURITY.md`

That path order comes from GitHub's security policy docs, which say a security policy can live in the repository root, `.github`, or `docs`.

If found, record:

- presence
- path
- sha
- extracted disclosure channels
- supported version text
- whether the policy points to an external bug-bounty platform

## Optional GraphQL Layer

Use GraphQL only after the REST pipeline works.

Good uses:

- batch-fetching known repos by `node_id` via `nodes(ids: ...)`
- fetching topics through `repositoryTopics`
- pulling file blobs for exact known paths
- reducing N REST calls when you already have a small curated repo set

Relevant GraphQL objects and limits from the docs:

- `search(query:, type:)` returns at most 1,000 results
- `Repository.repositoryTopics`
- `Repository.object(expression:)`
- `Blob.text`
- `Blob.isTruncated`
- `rateLimit.cost`
- 5,000 points/hour per user
- `first` / `last` required on connections
- max 100 items per connection page
- max 500,000 nodes per call
- 10 second timeout window

Inferred GraphQL pattern from the schema docs:

```graphql
query($ids: [ID!]!) {
  nodes(ids: $ids) {
    ... on Repository {
      id
      nameWithOwner
      isArchived
      isFork
      pushedAt
      repositoryTopics(first: 20) {
        nodes {
          topic {
            name
          }
        }
      }
      readme: object(expression: "HEAD:README.md") {
        ... on Blob {
          text
          isTruncated
        }
      }
      security: object(expression: "HEAD:SECURITY.md") {
        ... on Blob {
          text
          isTruncated
        }
      }
    }
  }
  rateLimit {
    cost
    remaining
    resetAt
  }
}
```

This query shape is an inference, not a verbatim doc example. It is based on the documented `Repository.object(expression:)` field plus the documented `Blob.text` field.

## End-To-End Ingestion Strategy

### Phase 1: discovery

Run a scheduled set of search queries.

- Keep queries narrow.
- Prefer topic + anti-noise filters first.
- Add time shards when `total_count` is large.
- Add star shards when a topic is too broad.

Suggested baseline filters:

- `fork:false`
- `archived:false`
- `mirror:false` if you later choose GraphQL or repo metadata filters that expose it
- `pushed:>=YYYY-MM-DD` rolling freshness window

### Phase 2: dedupe

Deduplicate by immutable repo `id`, not `full_name`.

Keep:

- current `full_name`
- `node_id`
- latest observed owner/name

That protects you from renames.

### Phase 3: repo validation

For each candidate repo:

1. Save search payload.
2. Fetch `GET /repos/{owner}/{repo}` if the candidate is new or stale.
3. Reject obvious noise:
   - forks
   - archived repos
   - disabled repos
   - stale repos below your freshness threshold
   - low-signal toy repos if they fail your minimum score

### Phase 4: enrichment

Fetch:

1. `GET /repos/{owner}/{repo}/community/profile`
2. `GET /repos/{owner}/{repo}/readme`
3. `GET /repos/{owner}/{repo}/contents/SECURITY.md`
4. `GET /repos/{owner}/{repo}/contents/.github/SECURITY.md`
5. `GET /repos/{owner}/{repo}/contents/docs/SECURITY.md`

Optional later:

- `GET /rate_limit` for telemetry
- GraphQL `nodes(ids: ...)` batch refresh for hot repos

### Phase 5: scoring

Compute a target score from:

- topic match strength
- language match strength
- repo freshness
- org vs personal owner
- star / fork thresholds
- README mentions of protocol, contracts, audits, testnet/mainnet, bug bounty
- `SECURITY.md` presence
- community `health_percentage`

### Phase 6: refresh policy

Split refreshes into:

- hot repos: daily
- warm repos: weekly
- cold repos: monthly

Re-run discovery queries on a schedule and re-enrich only changed repos.

## Rate-Limit Guidance

REST:

- unauthenticated core: 60 requests/hour
- authenticated core: 5,000 requests/hour
- authenticated search: 30 requests/minute
- unauthenticated search: 10 requests/minute

GraphQL:

- user tokens: 5,000 points/hour

Shared secondary limits worth designing around:

- no more than 100 concurrent requests across REST + GraphQL
- no more than 900 REST points/minute
- no more than 2,000 GraphQL points/minute

Implementation rules:

- authenticate from day 1
- keep search concurrency low
- respect `x-ratelimit-*` headers
- use `GET /rate_limit` for telemetry, not per-request control flow
- back off on `403` / `429`
- treat `incomplete_results=true` as partial data, not success

## Recommended First Version

Do this first:

1. REST `search/repositories` discovery runner
2. repo dedupe table keyed by repo `id`
3. REST repo/readme/community/security enrichment
4. simple scorecard
5. scheduled re-crawl with sharded queries

Do not do this first:

- GraphQL-first discovery
- code search as the main discovery source
- very broad `topic:web3` searches without sharding
- deep GraphQL nested enrichment

## Known Limitations

- Search is capped at 1,000 results per query, so broad ecosystems must be sharded.
- Search can return `incomplete_results=true`.
- Community profile does not cover `SECURITY.md`.
- Community profile cannot be used on forks.
- `README` is easy through REST, but `SECURITY.md` still needs explicit path checks unless you move to a GraphQL batch pattern.
- Global GitHub webhooks do not exist for discovering arbitrary third-party public repos; discovery stays poll-based.

## Sources

- REST search docs: https://docs.github.com/rest/search/search
- Search syntax docs: https://docs.github.com/en/github/searching-for-information-on-github/understanding-the-search-syntax
- REST repositories docs: https://docs.github.com/en/rest/repos/repos
- REST repository contents docs: https://docs.github.com/en/rest/repos/contents
- REST community metrics docs: https://docs.github.com/rest/metrics/community
- REST rate-limit overview: https://docs.github.com/en/rest/overview/rate-limits-for-the-rest-api
- REST rate-limit endpoint: https://docs.github.com/en/rest/rate-limit/rate-limit
- GraphQL queries reference: https://docs.github.com/graphql/reference/queries
- GraphQL objects reference: https://docs.github.com/en/graphql/reference/objects
- GraphQL rate and query limits: https://docs.github.com/en/graphql/overview/rate-limits-and-query-limits-for-the-graphql-api
- Security policy location docs: https://docs.github.com/articles/adding-a-security-policy-to-your-repository

## Open Questions

- What minimum freshness threshold should define an active target: 90 days, 180 days, or 365 days?
- Do you want to track only contract repos, or also SDK, frontend, infra, and docs repos owned by the same org?
- Should “target” mean only repos with explicit disclosure/security signals, or also high-probability protocol repos without a visible policy?
