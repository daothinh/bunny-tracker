import { syncGitHubRepository } from "@/lib/github";

async function main() {
  const repositories = process.argv.slice(2).map((value) => value.trim()).filter(Boolean);
  if (repositories.length === 0) {
    throw new Error(
      "Pass at least one repository full name, for example: npm run sync:repo -- spesmilo/electrum",
    );
  }

  const results = [];

  for (const fullName of repositories) {
    const repository = await syncGitHubRepository(fullName);
    results.push({
      fullName,
      status: repository ? "qualified" : "skipped",
      trackedId: repository?.id ?? null,
    });
  }

  console.log(JSON.stringify(results, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
