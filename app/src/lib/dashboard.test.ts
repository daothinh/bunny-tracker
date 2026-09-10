import { describe, expect, it } from "vitest";
import { buildRepositoryWhere } from "@/lib/dashboard";

describe("buildRepositoryWhere", () => {
  it("adds bounty link and minimum stars filters to the Prisma query", () => {
    expect(
      buildRepositoryWhere({
        q: "bridge",
        bountyLink: "with",
        minStars: 50,
      }),
    ).toEqual({
      AND: [
        {
          OR: [
            {
              fullName: {
                contains: "bridge",
                mode: "insensitive",
              },
            },
            {
              description: {
                contains: "bridge",
                mode: "insensitive",
              },
            },
            {
              qualificationSummary: {
                contains: "bridge",
                mode: "insensitive",
              },
            },
          ],
        },
        {
          bountyProgramUrl: {
            not: null,
          },
        },
        {
          stars: {
            gte: 50,
          },
        },
      ],
    });
  });

  it("filters repositories without bounty links", () => {
    expect(
      buildRepositoryWhere({
        bountyLink: "without",
      }),
    ).toEqual({
      AND: [
        {
          bountyProgramUrl: null,
        },
      ],
    });
  });

  it("filters repositories by scope", () => {
    expect(
      buildRepositoryWhere({
        scope: "GENERAL",
      }),
    ).toEqual({
      AND: [
        {
          scope: "GENERAL",
        },
      ],
    });
  });
});
