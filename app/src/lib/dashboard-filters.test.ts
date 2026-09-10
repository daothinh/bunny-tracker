import { describe, expect, it } from "vitest";
import {
  dashboardFiltersQuerySchema,
  dashboardFiltersToSearchParams,
  parseDashboardFiltersSearchParams,
} from "@/lib/dashboard-filters";

describe("dashboard filters", () => {
  it("parses supported search params for the server page", () => {
    expect(
      parseDashboardFiltersSearchParams({
        q: "  bridge  ",
        scope: "GENERAL",
        reportStatus: "REVIEWING",
        repositoryType: "PROTOCOL",
        bountyLink: "with",
        minStars: "25",
      }),
    ).toEqual({
      q: "bridge",
      scope: "GENERAL",
      reportStatus: "REVIEWING",
      repositoryType: "PROTOCOL",
      bountyLink: "with",
      minStars: 25,
    });
  });

  it("ignores unsupported page filter values", () => {
    expect(
      parseDashboardFiltersSearchParams({
        reportStatus: "NOPE",
        repositoryType: "UNKNOWN",
        bountyLink: "maybe",
        minStars: "-5",
      }),
    ).toEqual({
      q: undefined,
      reportStatus: undefined,
      repositoryType: undefined,
      bountyLink: undefined,
      minStars: undefined,
    });
  });

  it("validates API filter params with coercion", () => {
    const parsed = dashboardFiltersQuerySchema.parse({
      q: "  wallet  ",
      bountyLink: "without",
      minStars: "0",
    });

    expect(parsed).toEqual({
      q: "wallet",
      reportStatus: undefined,
      repositoryType: undefined,
      bountyLink: "without",
      minStars: 0,
    });
  });

  it("rejects invalid numeric API filter params", () => {
    expect(() =>
      dashboardFiltersQuerySchema.parse({
        minStars: "3.5",
      }),
    ).toThrowError(/non-negative integer/i);
  });

  it("serializes every active filter for API pagination requests", () => {
    expect(
      dashboardFiltersToSearchParams({
        q: "bridge",
        scope: "WEB3",
        reportStatus: "REVIEWING",
        repositoryType: "PROTOCOL",
        bountyLink: "with",
        emailContact: "without",
        minStars: 25,
      }).toString(),
    ).toBe(
      "q=bridge&scope=WEB3&reportStatus=REVIEWING&repositoryType=PROTOCOL" +
        "&bountyLink=with&emailContact=without&minStars=25",
    );
  });

  it("omits inactive filters from API pagination requests", () => {
    expect(
      dashboardFiltersToSearchParams({
        q: null,
        scope: null,
        reportStatus: null,
        repositoryType: null,
        bountyLink: null,
        emailContact: null,
        minStars: null,
      }).toString(),
    ).toBe("");
  });
});
