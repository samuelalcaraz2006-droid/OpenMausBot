// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Message } from "@/state/store";
import { t } from "@/lib/i18n";
import { ConnectorCard } from "./ConnectorCard";

// Only the external HTTP boundary is replaced. React and the real card,
// effects, buttons, link validation and external-opening helper all run.
const { api } = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock("@/state/store", () => ({ api }));

let root: Root;
let host: HTMLDivElement;
let finishAuthorization: (result: { url: string }) => void;
let opened: string[];
const url = "https://connect.composio.dev/fixture-only";
const card = (changes: Partial<NonNullable<Message["connector"]>> = {}, id = "card-1") => createElement(ConnectorCard, {
  botId: "fixture-bot", threadId: "fixture-thread",
  message: { id, role: "bot", kind: "connector", at: 1, connector: {
    slug: "instagram", label: "Instagram", description: "Synthetic Instagram account",
    alias: "fixture-brand", status: "required", resumeKey: "fixture", ...changes,
  } },
});
const button = (label: string) => [...host.querySelectorAll("button")].find((item) => item.textContent === label)!;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  opened = [];
  Object.assign(window, { ogb: { openExternal: async (value: string) => { opened.push(value); } } });
  api.mockReset();
  api.mockImplementation(() => new Promise((resolve) => { finishAuthorization = resolve; }));
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount()); host.remove();
  delete (window as unknown as { ogb?: unknown }).ogb;
  vi.unstubAllGlobals();
});

describe("ConnectorCard authorization lifecycle", () => {
  it("opens and reuses the issued link when the server adds dismissed=false while authorization is pending", async () => {
    await act(async () => root.render(card()));
    await act(async () => button(t("connectors.card.connectSecurely")).click());
    await act(async () => root.render(card({ status: "authorizing", dismissed: false })));
    await act(async () => finishAuthorization({ url }));
    expect(host.querySelector("a")?.href).toBe(url);
    expect(opened).toEqual([url]);
    await act(async () => button(t("connectors.card.openAgain")).click());
    expect(opened).toEqual([url, url]);
    expect(api).toHaveBeenCalledTimes(1);
  });

  it("still cancels late opening when the person dismisses the card", async () => {
    await act(async () => root.render(card()));
    await act(async () => button(t("connectors.card.connectSecurely")).click());
    await act(async () => root.render(card({ status: "authorizing", dismissed: true })));
    await act(async () => finishAuthorization({ url }));
    expect(host.children).toHaveLength(0);
    expect(opened).toEqual([]);
  });

  it("does not open or attach an old link after a different card replaces its target", async () => {
    await act(async () => root.render(card()));
    await act(async () => button(t("connectors.card.connectSecurely")).click());
    await act(async () => root.render(card({}, "card-2")));
    await act(async () => finishAuthorization({ url }));
    expect(host.querySelector("a")).toBeNull();
    expect(opened).toEqual([]);
    expect(button(t("connectors.card.connectSecurely")).disabled).toBe(false);
  });
});
