import {
  describe,
  expect,
  it,
} from "vitest";

import {
  normalizePostAuthReturnTo,
} from "./return-to";

describe(
  "normalizePostAuthReturnTo",
  () => {
    it(
      "accepts canonical Ops URLs",
      () => {
        expect(
          normalizePostAuthReturnTo(
            "https://ops.afuza.id/approvals",
          ),
        ).toBe(
          "https://ops.afuza.id/approvals",
        );

        expect(
          normalizePostAuthReturnTo(
            "https://ops.afuza.id/projects?view=active",
          ),
        ).toBe(
          "https://ops.afuza.id/projects?view=active",
        );
      },
    );

    it(
      "accepts direct internal Ops paths",
      () => {
        expect(
          normalizePostAuthReturnTo(
            "/ops/approvals",
          ),
        ).toBe(
          "/ops/approvals",
        );
      },
    );

    it.each([
      "https://evil.example/",
      "https://ops.afuza.id.evil.example/",
      "//evil.example/",
      "javascript:alert(1)",
      "/dashboard",
      "",
    ])(
      "rejects unsafe destination %s",
      (value) => {
        expect(
          normalizePostAuthReturnTo(
            value,
          ),
        ).toBeNull();
      },
    );
  },
);
