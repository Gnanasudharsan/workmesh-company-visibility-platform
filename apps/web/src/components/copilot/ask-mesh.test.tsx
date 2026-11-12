import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Workspace } from "@workmesh/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useUi } from "@/lib/store";
import type { CopilotAnswer, CopilotStatus } from "@/lib/types";
import { renderWithData } from "@/test/render";
import { SidebarContent } from "../shell/sidebar";
import { AnswerText } from "./answer";
import { AskMesh, pickSuggestions, STANDARD_ANSWER } from "./ask-mesh";

const P = "fd9505f4-994b-4574-b947-4b1effe1c27c";
const B = "68df12a5-6ed0-42e6-9236-19d7e03b0e86";

const me = (workspaces: Workspace[]) => ({
  user: { id: "u", email: "x@example.com", name: "X" },
  organizations: [],
  active: { organization: { id: "o", name: "Northstar Labs", slug: "n", isDemo: true }, membershipId: "m", role: "MEMBER", onboardedAt: null, profile: null, workspaces, relationships: {} },
  csrfToken: "c",
  demoMode: true,
});

const status: CopilotStatus = {
  enabled: true,
  model: "fake-scripted",
  maxQuestionLength: 500,
  suggestions: {
    employee: ["What am I working on?", "What's blocking Checkout Launch?"],
    manager: ["What is Maya Chen working on?", "Which goals are at risk and why?"],
  },
};

const answer: CopilotAnswer = {
  answer: "Checkout Launch is **at risk** [1].\n\n- Tax provider rate limits [2]\n- Waiting on payments [1]",
  citations: [
    { n: 1, type: "project", id: P, title: "Checkout Launch", href: `/projects/${P}`, map: { mode: "work", node: `project:${P}` } },
    { n: 2, type: "blocker", id: B, title: "Tax provider rate limits in staging", href: `/blockers/${B}`, map: { mode: "work", node: `project:${P}` } },
  ],
  toolCalls: [{ name: "project_blockers", found: true }],
  latencyMs: 1234,
  model: "fake-scripted",
};

type Reply = { status: number; body: unknown } | Promise<{ status: number; body: unknown }>;
function stubAsk(...replies: Reply[]) {
  const calls: Array<{ path: string; body: unknown; headers: Record<string, string> }> = [];
  globalThis.fetch = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ path: url.replace(/^.*\/api/, ""), body: init?.body ? JSON.parse(String(init.body)) : undefined, headers: (init?.headers ?? {}) as Record<string, string> });
    const r = await (replies.length > 1 ? replies.shift()! : replies[0]!);
    return new Response(JSON.stringify(r.body), { status: r.status, headers: { "Content-Type": "application/json" } });
  }) as unknown as typeof fetch;
  return calls;
}

const renderAsk = (data: Record<string, unknown> = {}) => renderWithData(<AskMesh />, { "/copilot/status": status, "/auth/me": me(["employee", "manager"]), ...data });

beforeEach(() => {
  document.cookie = "wm_csrf=test-csrf";
  useUi.setState({ workspace: "employee", pendingQuestion: null });
});
afterEach(() => vi.restoreAllMocks());

describe("Ask the Mesh", () => {
  it("shows the empty state and the active workspace's suggestions first", () => {
    renderAsk();
    expect(screen.getByText(/Ask about projects, people, blockers/)).toBeInTheDocument();
    const group = screen.getByRole("group", { name: "Suggested questions" });
    expect(within(group).getAllByRole("button").map((b) => b.textContent)).toEqual([
      "What am I working on?",
      "What's blocking Checkout Launch?",
      "What is Maya Chen working on?",
      "Which goals are at risk and why?",
    ]);
    expect(pickSuggestions(status, "manager")[0]).toBe("What is Maya Chen working on?");
    expect(pickSuggestions(undefined, "manager")).toEqual([]);
  });

  it("asks with the CSRF header, shows a loading state, then the answer with linked sources", async () => {
    let release!: (v: { status: number; body: unknown }) => void;
    const calls = stubAsk(new Promise((r) => (release = r)));
    renderAsk();
    await userEvent.type(screen.getByLabelText("Ask a question about your company"), "What's blocking Checkout Launch?{Enter}");
    expect(await screen.findByRole("status", { name: "Looking through WorkMesh" })).toBeInTheDocument();
    expect(screen.getByText("What's blocking Checkout Launch?", { selector: "p" })).toBeInTheDocument();
    await act(async () => release({ status: 200, body: answer }));

    expect(calls).toEqual([{ path: "/copilot/ask", body: { question: "What's blocking Checkout Launch?" }, headers: expect.objectContaining({ "X-CSRF-Token": "test-csrf" }) }]);
    const sources = await screen.findByRole("list", { name: "Sources" });
    const chips = within(sources).getAllByRole("link");
    expect(chips.map((a) => a.getAttribute("href"))).toEqual([`/projects/${P}`, `/blockers/${B}`]);
    expect(chips[1]).toHaveTextContent("Blocker: Tax provider rate limits in staging");
    const marker = screen.getAllByRole("link", { name: "Source 1: Checkout Launch" })[0]!;
    expect(marker.getAttribute("href")).toMatch(/^#t\d+-cite-1$/);
    expect(document.getElementById(marker.getAttribute("href")!.slice(1))).toBe(chips[0]!.closest("li"));
    expect(screen.getByText("at risk").tagName).toBe("STRONG");
    expect(screen.getByText(/1 lookup · 1\.2 s · fake-scripted/)).toBeInTheDocument();
    expect(screen.getByLabelText("Ask a question about your company")).toHaveValue("");
    // Both sources sit on Checkout Launch's map node, so the map opens on one highlighted project.
    expect(screen.getByRole("link", { name: "Show 1 cited record on the Company Map" })).toHaveAttribute("href", `/map?mode=work&highlight=project%3A${P}`);
  });

  it("shows the standard answer with a hint and no sources", async () => {
    stubAsk({ status: 200, body: { answer: STANDARD_ANSWER, citations: [], toolCalls: [{ name: "get_project", found: false }], latencyMs: 20, model: "fake-scripted" } });
    renderAsk();
    await userEvent.click(screen.getByRole("button", { name: "What am I working on?" }));
    expect(await screen.findByText(STANDARD_ANSWER)).toBeInTheDocument();
    expect(screen.getByText("Try naming a project, person, team or goal.")).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Sources" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /on the Company Map/ })).not.toBeInTheDocument();
  });

  it.each([
    [429, "RATE_LIMITED", "Too many", /asked a lot of questions/],
    [504, "COPILOT_TIMEOUT", "Ask the Mesh took too long to answer. Try a narrower question.", /took too long/],
    [503, "COPILOT_UNAVAILABLE", "Ask the Mesh can't reach its model right now.", /can't reach its model/],
  ])("explains a %s error and can try again", async (code, errCode, message, shown) => {
    const calls = stubAsk({ status: code, body: { code: errCode, message } }, { status: 200, body: answer });
    renderAsk();
    await userEvent.click(screen.getByRole("button", { name: "What am I working on?" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(shown);
    await userEvent.click(screen.getByRole("button", { name: /Try again/ }));
    expect(await screen.findByRole("list", { name: "Sources" })).toBeInTheDocument();
    expect(calls).toHaveLength(2);
  });

  it("keeps the composer within 500 characters and uses Shift+Enter for new lines", async () => {
    const calls = stubAsk({ status: 200, body: answer });
    renderAsk();
    const box = screen.getByLabelText("Ask a question about your company");
    fireEvent.change(box, { target: { value: "x".repeat(600) } });
    expect(box).toHaveValue("x".repeat(500));
    expect(screen.getByText("500/500")).toBeInTheDocument();
    fireEvent.change(box, { target: { value: "line one" } });
    fireEvent.keyDown(box, { key: "Enter", shiftKey: true });
    expect(calls).toHaveLength(0);
    expect(screen.getByRole("button", { name: "Ask" })).toBeEnabled();
    fireEvent.change(box, { target: { value: "   " } });
    expect(screen.getByRole("button", { name: "Ask" })).toBeDisabled();
  });

  it("answers a question handed over from ⌘K once, without persisting it", async () => {
    const calls = stubAsk({ status: 200, body: answer });
    useUi.setState({ pendingQuestion: "Who can help with pricing?" });
    renderAsk();
    await screen.findByRole("list", { name: "Sources" });
    expect(calls.map((c) => c.body)).toEqual([{ question: "Who can help with pricing?" }]);
    expect(useUi.getState().pendingQuestion).toBeNull();
    expect(localStorage.getItem("workmesh-ui") ?? "").not.toContain("pricing");
  });

  it("explains that the assistant is off when the server says so", () => {
    // The status query has no cached data and the server answers 404, as it does when the copilot is off.
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ code: "NOT_FOUND", message: "Resource not found" }), { status: 404 })) as unknown as typeof fetch;
    renderWithData(<AskMesh />, { "/auth/me": me(["employee"]) });
    return waitFor(() => expect(screen.getByText("Ask the Mesh isn't turned on")).toBeInTheDocument());
  });
});

describe("answer rendering", () => {
  it("never renders HTML from the answer and leaves unknown markers as text", () => {
    const { container } = renderWithData(<AnswerText text={'See <img src=x onerror="alert(1)"> and <script>x()</script> [9] then [1]'} citations={answer.citations} idPrefix="t" />);
    expect(container.querySelector("img, script")).toBeNull();
    expect(container).toHaveTextContent('See <img src=x onerror="alert(1)"> and <script>x()</script> [9] then 1');
    expect(screen.getAllByRole("link")).toHaveLength(1);
  });

  it("renders numbered lists and inline code", () => {
    const { container } = renderWithData(<AnswerText text={"1. First `CHK` [1]\n2. Second"} citations={answer.citations} idPrefix="t" />);
    expect(container.querySelectorAll("ol > li")).toHaveLength(2);
    expect(container.querySelector("code")).toHaveTextContent("CHK");
  });
});

describe("navigation", () => {
  it("shows Ask the Mesh in the sidebar only when the server says it's on", () => {
    const base = { "/auth/me": me(["employee"]), "/notifications?unread=true": { unreadCount: 0, items: [] } };
    const { unmount } = renderWithData(<SidebarContent />, { ...base, "/copilot/status": status });
    expect(screen.getByRole("link", { name: /Ask the Mesh/ })).toHaveAttribute("href", "/ask");
    unmount();
    globalThis.fetch = vi.fn(async () => new Response("{}", { status: 404 })) as unknown as typeof fetch;
    renderWithData(<SidebarContent />, base);
    expect(screen.queryByRole("link", { name: /Ask the Mesh/ })).not.toBeInTheDocument();
  });
});
