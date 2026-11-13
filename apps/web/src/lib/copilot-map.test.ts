import { describe, expect, it } from "vitest";
import { mapLinkFor, MAX_HIGHLIGHTS, modeOf, parseExpand, parseHighlight } from "./copilot-map";
import type { CopilotCitation } from "./types";

const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const cite = (n: number, map: CopilotCitation["map"]): CopilotCitation => ({ n, type: "project", id: U(n), title: `R${n}`, href: "/x", map });

describe("Show on map link", () => {
  it("dedupes cited nodes and opens the mode that holds most of them", () => {
    const link = mapLinkFor([
      cite(1, { mode: "work", node: `project:${U(1)}` }),
      cite(2, { mode: "work", node: `project:${U(1)}` }), // a blocker on the same project
      cite(3, { mode: "work", node: `milestone:${U(3)}`, expand: U(1) }),
      cite(4, { mode: "people", node: `person:${U(4)}` }),
      cite(5, null), // a decision with no map node
    ])!;
    expect(link.mode).toBe("work");
    expect(link.count).toBe(2);
    expect(link.otherCount).toBe(1);
    const url = new URL(link.href, "http://x");
    expect(url.pathname).toBe("/map");
    expect(url.searchParams.get("mode")).toBe("work");
    expect(url.searchParams.get("highlight")!.split(",")).toEqual([`project:${U(1)}`, `milestone:${U(3)}`, `person:${U(4)}`]);
    expect(url.searchParams.get("expand")).toBe(U(1));
  });

  it("prefers people when most cited records are people, and returns nothing without targets", () => {
    expect(mapLinkFor([cite(1, { mode: "people", node: `person:${U(1)}` }), cite(2, { mode: "people", node: `team:${U(2)}` }), cite(3, { mode: "work", node: `goal:${U(3)}` })])!.mode).toBe("people");
    expect(mapLinkFor([cite(1, null)])).toBeNull();
    expect(mapLinkFor([])).toBeNull();
  });

  it("never puts anything but well-formed node ids in the URL", () => {
    const link = mapLinkFor([cite(1, { mode: "work", node: "project:../../etc" }), cite(2, { mode: "work", node: `<script>:${U(2)}` }), cite(3, { mode: "work", node: `goal:${U(3)}`, expand: "nope" })])!;
    expect(new URL(link.href, "http://x").searchParams.get("highlight")).toBe(`goal:${U(3)}`);
    expect(link.href).not.toContain("expand");
  });
});

describe("map highlight parameter", () => {
  it("accepts only the map's node ids, deduplicated and bounded", () => {
    const many = Array.from({ length: 30 }, (_, i) => `project:${U(i)}`);
    expect(parseHighlight([`project:${U(1)}`, `project:${U(1)}`, "person:not-a-uuid", "company:x", `TEAM:${U(2)}`, "<img>"].join(","))).toEqual([`project:${U(1)}`, `TEAM:${U(2)}`]);
    expect(parseHighlight(many.join(","))).toHaveLength(MAX_HIGHLIGHTS);
    expect(parseHighlight(null)).toEqual([]);
    expect(parseExpand(`${U(1)},x,${U(2)}`)).toEqual([U(1), U(2)]);
    expect(modeOf(`team:${U(1)}`)).toBe("people");
    expect(modeOf(`milestone:${U(1)}`)).toBe("work");
  });
});
