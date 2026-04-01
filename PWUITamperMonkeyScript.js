// ==UserScript==
// @name         Playwright Report Helper
// @namespace    local.playwright.report.helper
// @version      2.5.0
// @description  Floating helper for local/localhost Playwright HTML reports: back/next, shortcuts, screenshots jump, copy helpers, progress, title, expand all, and duration sort.
// @match        file:///*
// @match        http://localhost/*
// @match        https://localhost/*
// @match        http://127.0.0.1/*
// @match        https://127.0.0.1/*
// @match        http://[::1]/*
// @match        https://[::1]/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
  "use strict";

  const OVERLAY_ID = "pw-helper-overlay";
  const STYLE_ID = "pw-helper-style";
  const TOAST_ID = "pw-helper-toast";
  const POS_KEY = "pw-helper-overlay-position";
  const SNAPSHOT_PREFIX = "pw-helper-snapshot:";
  const RESOLVED_PREFIX = "pw-helper-resolved:";
  const DRAG_THRESHOLD = 8;

  let overlay = null;
  let progressNode = null;
  let titleWrap = null;
  let buttons = {};
  let refreshTimer = null;
  let refreshSeq = 0;
  let observer = null;
  let dragState = null;
  let intervalStarted = false;

  function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function isVisible(el) {
    if (!el) return false;
    const style = window.getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    return !!(
      rect.width > 0 &&
      rect.height > 0 &&
      style.visibility !== "hidden" &&
      style.display !== "none"
    );
  }

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #${OVERLAY_ID} {
        --pw-bg-top: rgba(49, 49, 58, 0.96);
        --pw-bg-bottom: rgba(24, 24, 31, 0.96);
        --pw-panel-edge: rgba(255,255,255,0.08);
        --pw-pill-bg: rgba(255,255,255,0.08);
        --pw-pill-bg-hover: rgba(255,255,255,0.14);
        --pw-pill-bg-soft: rgba(255,255,255,0.06);
        --pw-text-soft: rgba(255,255,255,0.70);
        --pw-text-strong: rgba(255,255,255,0.96);
        --pw-shadow: 0 20px 44px rgba(0,0,0,0.28);
        position: fixed;
        top: 18px;
        right: 18px;
        z-index: 2147483647;
        width: min(580px, calc(100vw - 20px));
        color: var(--pw-text-strong);
        font: 600 14px/1.35 "Segoe UI", Tahoma, sans-serif;
        border-radius: 20px;
        background: linear-gradient(180deg, var(--pw-bg-top), var(--pw-bg-bottom));
        border: 1px solid var(--pw-panel-edge);
        box-shadow: var(--pw-shadow), inset 0 1px 0 rgba(255,255,255,0.07);
        backdrop-filter: blur(10px);
        user-select: none;
      }

      #${OVERLAY_ID}.pw-helper-dragging {
        cursor: grabbing;
      }

      #${OVERLAY_ID} .pw-helper-header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 12px;
        padding: 14px 14px 10px;
        cursor: grab;
      }

      #${OVERLAY_ID} .pw-helper-title {
        padding-top: 3px;
        font-size: 12px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--pw-text-soft);
        flex: 0 1 auto;
      }

      #${OVERLAY_ID} .pw-helper-progress {
        flex: 0 1 auto;
        max-width: 250px;
        padding: 7px 11px;
        border-radius: 999px;
        background: rgba(255,255,255,0.12);
        color: #fff;
        font-size: 12px;
        line-height: 1.15;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      #${OVERLAY_ID} .pw-helper-body {
        padding: 0 14px 14px;
      }

      #${OVERLAY_ID} .pw-helper-titlebox {
        display: none;
        margin: 0 0 12px;
        padding: 12px 13px;
        border-radius: 14px;
        background: var(--pw-pill-bg-soft);
        color: rgba(255,255,255,0.93);
        font-size: 12px;
        line-height: 1.4;
        overflow: hidden;
        box-shadow: inset 0 1px 0 rgba(255,255,255,0.05);
      }

      #${OVERLAY_ID}.mode-detail .pw-helper-titlebox.has-title {
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
      }

      #${OVERLAY_ID} .pw-helper-grid {
        display: grid;
        gap: 10px;
        align-items: stretch;
      }

      #${OVERLAY_ID}.mode-list .pw-helper-grid {
        grid-template-columns: repeat(3, minmax(0, 1fr));
      }

      #${OVERLAY_ID}.mode-detail .pw-helper-grid {
        grid-template-columns: repeat(3, minmax(0, 1fr));
      }

      #${OVERLAY_ID} button {
        appearance: none;
        border: 0;
        border-radius: 14px;
        min-height: 48px;
        padding: 10px 12px;
        color: #fff;
        background: linear-gradient(180deg, var(--pw-pill-bg), rgba(255,255,255,0.04));
        box-shadow: inset 0 1px 0 rgba(255,255,255,0.06), 0 1px 0 rgba(0,0,0,0.18);
        cursor: pointer;
        font: inherit;
        font-size: 13px;
        line-height: 1.2;
        white-space: normal;
        overflow-wrap: anywhere;
        word-break: break-word;
        text-wrap: balance;
        display: flex;
        align-items: center;
        justify-content: center;
        text-align: center;
        transition: transform 0.12s ease, background 0.12s ease, opacity 0.12s ease;
      }

      #${OVERLAY_ID} button:hover {
        transform: translateY(-1px);
        background: linear-gradient(180deg, var(--pw-pill-bg-hover), rgba(255,255,255,0.07));
      }

      #${OVERLAY_ID} button:active {
        transform: translateY(0);
      }

      #${OVERLAY_ID} button:disabled {
        opacity: 0.45;
        cursor: default;
        transform: none;
      }

      #${OVERLAY_ID}.mode-list button[data-action="expand"] {
        order: 1;
      }

      #${OVERLAY_ID}.mode-list button[data-action="sort"] {
        order: 2;
      }

      #${OVERLAY_ID}.mode-list button[data-action="top"] {
        order: 3;
      }

      #${OVERLAY_ID}.mode-detail button[data-action="back"] {
        order: 1;
      }

      #${OVERLAY_ID}.mode-detail button[data-action="next"] {
        order: 2;
      }

      #${OVERLAY_ID}.mode-detail button[data-action="screenshots"] {
        order: 3;
      }

      #${OVERLAY_ID}.mode-detail button[data-action="top"] {
        order: 4;
      }

      #${OVERLAY_ID}.mode-detail button[data-action="copylink"] {
        order: 5;
      }

      #${OVERLAY_ID}.mode-detail button[data-action="copyid"] {
        order: 6;
      }

      #${TOAST_ID} {
        position: fixed;
        left: 50%;
        bottom: 18px;
        transform: translateX(-50%) translateY(16px);
        z-index: 2147483647;
        padding: 10px 14px;
        color: #fff;
        background: rgba(30,30,36,0.95);
        border: 1px solid rgba(255,255,255,0.08);
        border-radius: 999px;
        box-shadow: 0 12px 30px rgba(0,0,0,0.22);
        font: 600 13px/1 "Segoe UI", Tahoma, sans-serif;
        opacity: 0;
        pointer-events: none;
        transition: opacity 0.18s ease, transform 0.18s ease;
      }

      #${TOAST_ID}.show {
        opacity: 1;
        transform: translateX(-50%) translateY(0);
      }

      @media (max-width: 1180px) {
        #${OVERLAY_ID} {
          width: min(500px, calc(100vw - 12px));
        }

        #${OVERLAY_ID} .pw-helper-progress {
          max-width: 220px;
        }
      }

      @media (max-width: 760px) {
        #${OVERLAY_ID} {
          width: min(410px, calc(100vw - 8px));
          top: 8px;
          right: 8px;
          border-radius: 16px;
        }

        #${OVERLAY_ID} .pw-helper-header {
          gap: 8px;
          padding: 12px 12px 10px;
        }

        #${OVERLAY_ID} .pw-helper-body {
          padding: 0 12px 12px;
        }

        #${OVERLAY_ID}.mode-list .pw-helper-grid,
        #${OVERLAY_ID}.mode-detail .pw-helper-grid {
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 8px;
        }

        #${OVERLAY_ID} button {
          min-height: 46px;
          padding: 10px;
          font-size: 12px;
        }

        #${OVERLAY_ID} .pw-helper-progress {
          max-width: 170px;
        }
      }

      @media (max-width: 520px) {
        #${OVERLAY_ID} {
          width: calc(100vw - 8px);
        }

        #${OVERLAY_ID} .pw-helper-header {
          flex-direction: column;
          align-items: stretch;
        }

        #${OVERLAY_ID} .pw-helper-progress {
          max-width: none;
          width: 100%;
          white-space: normal;
          text-align: center;
        }

        #${OVERLAY_ID}.mode-list .pw-helper-grid,
        #${OVERLAY_ID}.mode-detail .pw-helper-grid {
          grid-template-columns: 1fr;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function toast(message) {
    let el = document.getElementById(TOAST_ID);
    if (!el) {
      el = document.createElement("div");
      el.id = TOAST_ID;
      document.body.appendChild(el);
    }
    el.textContent = message;
    el.classList.add("show");
    clearTimeout(el._pwHideTimer);
    el._pwHideTimer = setTimeout(() => el.classList.remove("show"), 1600);
  }

  function getRouteParams(urlString) {
    const url = new URL(urlString || location.href);
    let raw = "";

    if (url.hash && url.hash.startsWith("#?")) {
      raw = url.hash.slice(2);
    } else if (url.search) {
      raw = url.search.slice(1);
    }

    return new URLSearchParams(raw);
  }

  function getCurrentTestId(urlString) {
    const params = getRouteParams(urlString);
    return params.get("testId") || "";
  }

  function normalizeFilterKey(raw) {
    const value = String(raw || "").trim().toLowerCase();
    if (!value || value === "all") return "all";
    if (value === "passed" || value.includes("s:passed")) return "passed";
    if (value === "failed" || value.includes("s:failed")) return "failed";
    if (value === "flaky" || value.includes("s:flaky")) return "flaky";
    if (value === "skipped" || value.includes("s:skipped")) return "skipped";
    return "query:" + value;
  }

  function prettyFilterName(key) {
    if (key === "all") return "All";
    if (key === "passed") return "Passed";
    if (key === "failed") return "Failed";
    if (key === "flaky") return "Flaky";
    if (key === "skipped") return "Skipped";
    if (key.startsWith("query:")) return "Filtered";
    return "Filtered";
  }

  function getActiveFilterKey() {
    const params = getRouteParams();
    const q = params.get("q");
    if (q) return normalizeFilterKey(q);

    const active = document.querySelector(
      ".subnav-item.selected, .subnav-item.active, .subnav-item[aria-current='page']"
    );

    if (active) {
      const label =
        active.querySelector(".subnav-item-label")?.textContent?.trim() ||
        active.textContent ||
        "";
      return normalizeFilterKey(label);
    }

    return "all";
  }

  function isDetailPage(urlString) {
    return !!getCurrentTestId(urlString);
  }

  function getReportScope() {
    const url = new URL(location.href);
    const path = url.pathname.replace(/\/index\.html$/i, "/");
    return `${url.protocol}//${url.host}${path}`;
  }

  function snapshotKey(filterKey) {
    return SNAPSHOT_PREFIX + getReportScope() + "::" + filterKey;
  }

  function resolvedKey(filterKey, testId) {
    return RESOLVED_PREFIX + getReportScope() + "::" + filterKey + "::" + testId;
  }

  function getSavedPosition() {
    try {
      const raw = localStorage.getItem(POS_KEY + "::" + getReportScope());
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function savePosition(position) {
    try {
      localStorage.setItem(POS_KEY + "::" + getReportScope(), JSON.stringify(position));
    } catch {
      // Ignore quota failures.
    }
  }

  function clearSavedPosition() {
    try {
      localStorage.removeItem(POS_KEY + "::" + getReportScope());
    } catch {
      // Ignore.
    }
  }

  function applyPosition() {
    if (!overlay) return;

    const saved = getSavedPosition();
    overlay.style.left = "";
    overlay.style.top = "";
    overlay.style.right = "18px";
    overlay.style.bottom = "";
    overlay.style.transform = "";

    if (!saved || typeof saved.left !== "number" || typeof saved.top !== "number") return;

    overlay.style.left = Math.max(4, saved.left) + "px";
    overlay.style.top = Math.max(4, saved.top) + "px";
    overlay.style.right = "auto";
  }

  function isInteractiveTarget(event) {
    const el = event.target;
    if (!(el instanceof Element)) return false;
    return !!el.closest("button, input, textarea, select, a");
  }

  function enableDragging(handle) {
    handle.addEventListener("dblclick", () => {
      clearSavedPosition();
      applyPosition();
      toast("Panel position reset");
    });

    handle.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      if (isInteractiveTarget(event)) return;
      if (!overlay) return;

      const rect = overlay.getBoundingClientRect();
      dragState = {
        startX: event.clientX,
        startY: event.clientY,
        left: rect.left,
        top: rect.top,
        moved: false,
        pointerId: event.pointerId,
      };

      overlay.classList.add("pw-helper-dragging");
      handle.setPointerCapture(event.pointerId);
      event.preventDefault();
    });

    handle.addEventListener("pointermove", (event) => {
      if (!dragState || dragState.pointerId !== event.pointerId || !overlay) return;

      const dx = event.clientX - dragState.startX;
      const dy = event.clientY - dragState.startY;

      if (!dragState.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      dragState.moved = true;

      const maxLeft = Math.max(4, window.innerWidth - overlay.offsetWidth - 4);
      const maxTop = Math.max(4, window.innerHeight - overlay.offsetHeight - 4);

      const nextLeft = Math.min(maxLeft, Math.max(4, dragState.left + dx));
      const nextTop = Math.min(maxTop, Math.max(4, dragState.top + dy));

      overlay.style.left = nextLeft + "px";
      overlay.style.top = nextTop + "px";
      overlay.style.right = "auto";
      overlay.style.bottom = "auto";
    });

    const finish = (event) => {
      if (!dragState || dragState.pointerId !== event.pointerId || !overlay) return;

      if (dragState.moved) {
        savePosition({
          left: overlay.getBoundingClientRect().left,
          top: overlay.getBoundingClientRect().top,
        });
      }

      overlay.classList.remove("pw-helper-dragging");
      dragState = null;
    };

    handle.addEventListener("pointerup", finish);
    handle.addEventListener("pointercancel", finish);
  }

  function ensureOverlay() {
    if (overlay && document.body.contains(overlay)) return overlay;

    ensureStyle();

    overlay = document.createElement("div");
    overlay.id = OVERLAY_ID;
    overlay.className = "mode-list";
    overlay.innerHTML = `
      <div class="pw-helper-header">
        <div class="pw-helper-title">PW Helper</div>
        <div class="pw-helper-progress">...</div>
      </div>
      <div class="pw-helper-body">
        <div class="pw-helper-titlebox" title=""></div>
        <div class="pw-helper-grid">
          <button data-action="back">Back (&larr;)</button>
          <button data-action="next">Next (&rarr;)</button>
          <button data-action="expand">Expand All (E)</button>
          <button data-action="sort">Sort Time (D)</button>
          <button data-action="screenshots">Screenshots (S)</button>
          <button data-action="top">Top (T)</button>
          <button data-action="copylink">Copy Link (L)</button>
          <button data-action="copyid">Copy TestId (C)</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    progressNode = overlay.querySelector(".pw-helper-progress");
    titleWrap = overlay.querySelector(".pw-helper-titlebox");

    overlay.querySelectorAll("button[data-action]").forEach((btn) => {
      buttons[btn.dataset.action] = btn;
    });

    buttons.back.addEventListener("click", () => clickDirection("previous"));
    buttons.next.addEventListener("click", () => clickDirection("next"));
    buttons.screenshots.addEventListener("click", jumpToScreenshots);
    buttons.top.addEventListener("click", jumpToTop);
    buttons.copyid.addEventListener("click", onCopyTestId);
    buttons.copylink.addEventListener("click", onCopyLink);
    buttons.expand.addEventListener("click", async () => {
      await expandAllSuites();
      scheduleRefresh();
    });
    buttons.sort.addEventListener("click", async () => {
      await sortExpandedByTimeDesc();
      scheduleRefresh();
    });

    enableDragging(overlay.querySelector(".pw-helper-header"));
    applyPosition();

    return overlay;
  }

  function isReportUrlCandidate() {
    const href = location.href.toLowerCase();
    if (href.includes("playwright-report")) return true;
    if (location.hash.includes("testId=") || location.hash.includes("q=")) return true;
    return false;
  }

  function isPlaywrightReportPage() {
    if (!document.body) return false;
    if (!isReportUrlCandidate()) {
      const hasReportDom =
        !!document.querySelector(".subnav-item, .chip, [data-testid='test-duration']");
      if (!hasReportDom) return false;
    }
    return true;
  }

  function getTopFilterCounts() {
    const counts = {};

    document.querySelectorAll(".subnav-item").forEach((item) => {
      const rawLabel =
        item.querySelector(".subnav-item-label")?.textContent?.trim().toLowerCase() ||
        "";
      const rawCount =
        item.querySelector(".counter")?.textContent?.trim() ||
        item.textContent?.trim() ||
        "";

      const countMatch = rawCount.match(/(\d+)/);
      if (!rawLabel || !countMatch) return;

      const key = normalizeFilterKey(rawLabel);
      counts[key] = parseInt(countMatch[1], 10);
    });

    if (Object.keys(counts).length) return counts;

    const headerText =
      document.querySelector("main > .pt-3")?.textContent?.replace(/\s+/g, " ") || "";
    const regex = /\b(All|Passed|Failed|Flaky|Skipped)\s*(\d+)\b/gi;
    let match;
    while ((match = regex.exec(headerText))) {
      counts[normalizeFilterKey(match[1])] = parseInt(match[2], 10);
    }

    return counts;
  }

  function captureCurrentListSnapshot() {
    if (isDetailPage()) return;

    const filterKey = getActiveFilterKey();
    const ids = [];
    const seen = new Set();

    const links = document.querySelectorAll(
      ".test-file-test a[href*='testId='], a.test-file-title[href*='testId='], a[href*='#?testId=']"
    );

    links.forEach((a) => {
      const testId = getCurrentTestId(a.href);
      if (!testId || seen.has(testId)) return;
      seen.add(testId);
      ids.push(testId);
    });

    if (!ids.length) return;

    try {
      localStorage.setItem(
        snapshotKey(filterKey),
        JSON.stringify({
          ids,
          updatedAt: Date.now(),
        })
      );
    } catch {
      // Ignore quota failures.
    }
  }

  function getStoredSnapshot(filterKey) {
    try {
      const raw = localStorage.getItem(snapshotKey(filterKey));
      const parsed = raw ? JSON.parse(raw) : null;
      return Array.isArray(parsed?.ids) ? parsed.ids : [];
    } catch {
      return [];
    }
  }

  function getCachedResolvedIndex(filterKey, testId) {
    try {
      const raw = localStorage.getItem(resolvedKey(filterKey, testId));
      const parsed = raw ? JSON.parse(raw) : null;
      return typeof parsed?.index === "number" ? parsed.index : null;
    } catch {
      return null;
    }
  }

  function setCachedResolvedIndex(filterKey, testId, index) {
    try {
      localStorage.setItem(
        resolvedKey(filterKey, testId),
        JSON.stringify({ index, updatedAt: Date.now() })
      );
    } catch {
      // Ignore quota failures.
    }
  }

  function findNavTarget(direction, root = document) {
    const isPrevious = direction === "previous";
    const textMatch = isPrevious ? /(previous|prev|back)\b/i : /\bnext\b/i;

    const candidates = Array.from(root.querySelectorAll("a, button, [role='button']"));

    return candidates.find((el) => {
      if (!(el instanceof Element)) return false;
      if (el.closest("#" + OVERLAY_ID)) return false;
      if (!isVisible(el)) return false;

      const disabled =
        el.disabled ||
        el.getAttribute("aria-disabled") === "true" ||
        el.classList.contains("disabled");
      if (disabled) return false;

      const label = [
        el.getAttribute("aria-label"),
        el.getAttribute("title"),
        el.textContent,
      ]
        .filter(Boolean)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();

      if (!textMatch.test(label)) return false;

      if (el.tagName === "A") {
        const href = el.getAttribute("href") || "";
        if (href.includes("testId=")) return true;
      }

      return true;
    }) || null;
  }

  function clickDirection(direction) {
    const target = findNavTarget(direction);
    if (!target) return false;
    target.click();
    return true;
  }

  async function copyText(text) {
    if (!text) return false;

    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      const input = document.createElement("textarea");
      input.value = text;
      input.setAttribute("readonly", "");
      input.style.position = "fixed";
      input.style.opacity = "0";
      document.body.appendChild(input);
      input.select();
      const ok = document.execCommand("copy");
      input.remove();
      return ok;
    }
  }

  async function onCopyTestId() {
    const testId = getCurrentTestId();
    if (!testId) {
      toast("No testId on this page");
      return;
    }

    const ok = await copyText(testId);
    toast(ok ? "Copied testId" : "Copy failed");
  }

  function getFirstNavigatePath() {
    const heading = Array.from(document.querySelectorAll("*")).find((el) => {
      const text = (el.textContent || "").trim();
      return /^Test Steps$/i.test(text);
    });

    const scope = heading?.parentElement?.parentElement || document.body;
    const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);

    while (walker.nextNode()) {
      const text = String(walker.currentNode.nodeValue || "").trim();
      const match = text.match(/Navigate to\s+"([^"]+)"/i);
      if (match) return match[1];
    }

    return null;
  }

  async function onCopyLink() {
    const path = getFirstNavigatePath();
    if (!path) {
      toast("No navigate path found");
      return;
    }

    const ok = await copyText(path);
    toast(ok ? "Copied link" : "Copy failed");
  }

  function jumpToTop() {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function jumpToScreenshots() {
    const candidates = Array.from(
      document.querySelectorAll("h1,h2,h3,h4,button,summary,div,span")
    );

    const target = candidates.find((el) => {
      if (!isVisible(el)) return false;
      const text = (el.textContent || "").trim();
      return /^Screenshots$/i.test(text) || /\bScreenshots\b/i.test(text);
    });

    if (!target) {
      toast("Screenshots section not found");
      return;
    }

    target.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function expandAllSuites() {
    let iterations = 0;

    while (iterations < 30) {
      const collapsed = Array.from(
        document.querySelectorAll("div[role='button'].chip-header.expanded-false")
      ).filter(isVisible);

      if (!collapsed.length) break;

      collapsed.forEach((header) => header.click());
      iterations += 1;
      await wait(120);
    }

    toast("Expanded all");
  }

  function parseDurationToMs(text) {
    const value = String(text || "").trim().toLowerCase();
    const match = value.match(/([\d.]+)\s*(ms|s|m|h)/);
    if (!match) return -1;

    const num = parseFloat(match[1]);
    const unit = match[2];

    if (unit === "ms") return num;
    if (unit === "s") return num * 1000;
    if (unit === "m") return num * 60000;
    if (unit === "h") return num * 3600000;
    return -1;
  }

  async function sortExpandedByTimeDesc() {
    await expandAllSuites();
    await wait(250);

    const main = document.querySelector("main");
    if (!main) {
      toast("No report list found");
      return;
    }

    const chips = Array.from(main.querySelectorAll(":scope > .chip"));
    if (!chips.length) {
      toast("No suites found");
      return;
    }

    const suiteData = chips.map((chip, suiteIndex) => {
      const body = chip.querySelector(":scope > .chip-body");

      if (!body) {
        return { chip, suiteIndex, maxDuration: -1 };
      }

      const rows = Array.from(body.querySelectorAll(":scope > .test-file-test"));
      const rowData = rows.map((row, rowIndex) => ({
        row,
        rowIndex,
        duration: parseDurationToMs(
          row.querySelector("[data-testid='test-duration']")?.textContent || ""
        ),
      }));

      rowData.sort((a, b) => {
        if (b.duration !== a.duration) return b.duration - a.duration;
        return a.rowIndex - b.rowIndex;
      });

      rowData.forEach(({ row }) => body.appendChild(row));

      return {
        chip,
        suiteIndex,
        maxDuration: rowData.length ? rowData[0].duration : -1,
      };
    });

    suiteData.sort((a, b) => {
      if (b.maxDuration !== a.maxDuration) return b.maxDuration - a.maxDuration;
      return a.suiteIndex - b.suiteIndex;
    });

    suiteData.forEach(({ chip }) => main.appendChild(chip));

    toast("Sorted by duration");
  }

  function getCurrentTestTitle() {
    const candidates = [
      ".header-title",
      "[data-testid='test-title']",
      ".test-case-title",
      "main h1",
      "main h2",
    ];

    for (const selector of candidates) {
      const el = document.querySelector(selector);
      if (!el) continue;
      const text = (el.textContent || "").trim().replace(/\s+/g, " ");
      if (text) return text;
    }

    return "";
  }

  function getDetailIndexFromSnapshot(filterKey, testId) {
    const ids = getStoredSnapshot(filterKey);
    if (!ids.length || !testId) return null;
    const idx = ids.indexOf(testId);
    return idx >= 0 ? idx + 1 : null;
  }

  function loadPrevHrefFromDocument(doc) {
    const prevEl = findNavTarget("previous", doc);
    if (!prevEl) return null;

    if (prevEl.tagName === "A" && prevEl.href) {
      return prevEl.href;
    }

    return null;
  }

  function getHiddenFrame() {
    let frame = document.getElementById("pw-helper-hidden-frame");
    if (!frame) {
      frame = document.createElement("iframe");
      frame.id = "pw-helper-hidden-frame";
      frame.style.position = "fixed";
      frame.style.left = "-99999px";
      frame.style.top = "-99999px";
      frame.style.width = "10px";
      frame.style.height = "10px";
      frame.style.opacity = "0";
      frame.setAttribute("aria-hidden", "true");
      document.body.appendChild(frame);
    }
    return frame;
  }

  async function loadFrameDoc(url) {
    const frame = getHiddenFrame();

    return new Promise((resolve) => {
      const done = () => resolve(frame.contentDocument || null);

      frame.onload = done;
      frame.src = url;

      setTimeout(() => {
        resolve(frame.contentDocument || null);
      }, 1800);
    });
  }

  async function resolveIndexFromPrevChain(testId, filterKey) {
    if (!testId) return null;

    let currentUrl = location.href;
    let count = 1;
    const seen = new Set([testId]);

    for (let i = 0; i < 500; i += 1) {
      const doc = await loadFrameDoc(currentUrl);
      if (!doc) break;

      const prevHref = loadPrevHrefFromDocument(doc);
      if (!prevHref) break;

      const prevId = getCurrentTestId(prevHref);
      if (!prevId || seen.has(prevId)) break;

      seen.add(prevId);
      currentUrl = prevHref;
      count += 1;
    }

    if (count > 0) {
      setCachedResolvedIndex(filterKey, testId, count);
      return count;
    }

    return null;
  }

  async function getProgressLabel() {
    const filterKey = getActiveFilterKey();
    const filterName = prettyFilterName(filterKey);
    const counts = getTopFilterCounts();
    const testId = getCurrentTestId();
    let total = counts[filterKey];

    if (typeof total !== "number") {
      const snapshot = getStoredSnapshot(filterKey);
      total = snapshot.length || null;
    }

    if (!testId) {
      return total ? `${filterName} ${total}` : filterName;
    }

    let index = getDetailIndexFromSnapshot(filterKey, testId);
    if (!index) index = getCachedResolvedIndex(filterKey, testId);
    if (!index) index = await resolveIndexFromPrevChain(testId, filterKey);

    if (index && total) return `${filterName} ${index} / ${total}`;
    if (index) return `${filterName} ${index}`;
    if (total) return `${filterName} ${total}`;
    return filterName;
  }

  function setButtonState(button, enabled, visible = true) {
    if (!button) return;
    button.disabled = !enabled;
    button.style.display = visible ? "" : "none";
  }

  function updateTitleBox(detail) {
    const title = detail ? getCurrentTestTitle() : "";

    if (!title) {
      titleWrap.textContent = "";
      titleWrap.title = "";
      titleWrap.classList.remove("has-title");
      return;
    }

    titleWrap.textContent = title;
    titleWrap.title = title;
    titleWrap.classList.add("has-title");
  }

  function updateViewMode(detail) {
    overlay.classList.toggle("mode-detail", detail);
    overlay.classList.toggle("mode-list", !detail);
  }

  function updateButtonVisibility() {
    const detail = isDetailPage();
    const hasPrev = !!findNavTarget("previous");
    const hasNext = !!findNavTarget("next");
    const hasNavigatePath = !!getFirstNavigatePath();
    const hasTestId = !!getCurrentTestId();

    updateViewMode(detail);

    setButtonState(buttons.back, hasPrev, detail);
    setButtonState(buttons.next, hasNext, detail);
    setButtonState(buttons.screenshots, detail, detail);
    setButtonState(buttons.copyid, hasTestId, detail);
    setButtonState(buttons.copylink, hasNavigatePath, detail && hasNavigatePath);
    setButtonState(buttons.expand, true, !detail);
    setButtonState(buttons.sort, true, !detail);
    setButtonState(buttons.top, true, true);

    updateTitleBox(detail);
  }

  async function refreshOverlay() {
    if (!isPlaywrightReportPage()) return;

    ensureOverlay();
    captureCurrentListSnapshot();
    updateButtonVisibility();

    const seq = ++refreshSeq;
    const label = await getProgressLabel();
    if (seq !== refreshSeq || !progressNode) return;

    progressNode.textContent = label;
  }

  function scheduleRefresh() {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => {
      refreshOverlay().catch(() => {
        // Ignore refresh failures.
      });
    }, 80);
  }

  function handleKeydown(event) {
    if (!isPlaywrightReportPage()) return;
    if (event.defaultPrevented) return;

    const tag = event.target?.tagName;
    const editable =
      tag === "INPUT" ||
      tag === "TEXTAREA" ||
      tag === "SELECT" ||
      event.target?.isContentEditable;
    if (editable) return;

    if (event.key === "ArrowLeft") {
      if (clickDirection("previous")) event.preventDefault();
      return;
    }

    if (event.key === "ArrowRight") {
      if (clickDirection("next")) event.preventDefault();
      return;
    }

    const key = event.key.toLowerCase();

    if (key === "s" && isDetailPage()) {
      jumpToScreenshots();
      event.preventDefault();
      return;
    }

    if (key === "t") {
      jumpToTop();
      event.preventDefault();
      return;
    }

    if (key === "c" && isDetailPage() && getCurrentTestId()) {
      onCopyTestId();
      event.preventDefault();
      return;
    }

    if (key === "l" && isDetailPage() && getFirstNavigatePath()) {
      onCopyLink();
      event.preventDefault();
      return;
    }

    if (key === "e" && !isDetailPage()) {
      expandAllSuites().then(scheduleRefresh);
      event.preventDefault();
      return;
    }

    if (key === "d" && !isDetailPage()) {
      sortExpandedByTimeDesc().then(scheduleRefresh);
      event.preventDefault();
    }
  }

  function installObservers() {
    if (observer) return;

    observer = new MutationObserver(() => {
      scheduleRefresh();
    });

    observer.observe(document.documentElement, {
      subtree: true,
      childList: true,
      attributes: false,
    });

    window.addEventListener("hashchange", scheduleRefresh, true);
    window.addEventListener("popstate", scheduleRefresh, true);
    window.addEventListener("resize", scheduleRefresh, true);
    window.addEventListener("keydown", handleKeydown, true);
  }

  function init() {
    if (!document.body) {
      setTimeout(init, 100);
      return;
    }

    if (!isPlaywrightReportPage()) {
      setTimeout(init, 400);
      return;
    }

    ensureOverlay();
    installObservers();
    scheduleRefresh();

    if (!intervalStarted) {
      intervalStarted = true;
      setInterval(() => {
        if (isPlaywrightReportPage()) scheduleRefresh();
      }, 1500);
    }
  }

  init();
})();
