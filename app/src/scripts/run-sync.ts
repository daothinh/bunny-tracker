import { runGitHubSync } from "@/lib/github";

async function main() {
  const summary = await runGitHubSync("manual");
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
