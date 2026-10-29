window.__ModuleLoader__.load({
  id: "mind-dsh",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client/index.tsx
var index_exports = {};
__export(index_exports, {
  apply: () => apply,
  inject: () => inject
});
module.exports = __toCommonJS(index_exports);

// src/client/styles.ts
var STYLE_ID = "mind-dsh-styles";
var CSS = `
.mind-root {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: var(--dsw-alias-bg-base, #ffffff);
  color: var(--dsw-alias-label-primary, #0f1115);
  font-family: -apple-system, "system-ui", "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Helvetica Neue", Helvetica, Arial, sans-serif;
  font-size: 13px;
  line-height: 1.5;
}
.mind-head { flex: 0 0 auto; }
.mind-page {
  width: 100%;
  max-width: 1056px;
  margin: 0 auto;
  padding: 0 48px;
  box-sizing: border-box;
}
.mind-page-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24px;
  padding-top: calc(28px + var(--dsh-frame-top-clearance, 0px));
}
.mind-title { font-size: 20px; line-height: 28px; font-weight: 500; color: var(--dsw-alias-label-primary, #0f1115); }
.mind-subtitle { margin-top: 4px; font-size: 13px; line-height: 20px; color: var(--dsw-alias-label-secondary, #61666b); }
.mind-tabs { display: flex; align-items: center; gap: 6px; margin-top: 26px; }
.mind-tab {
  appearance: none;
  border: 0;
  background: transparent;
  color: var(--dsw-alias-label-tertiary, #81858c);
  font: inherit;
  font-size: 14px;
  line-height: 22px;
  height: 28px;
  padding: 0 10px;
  border-radius: 14px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
}
.mind-tab:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(38, 49, 72, .04)); }
.mind-tab[data-active="true"] {
  background: var(--dsw-alias-interactive-bg-hover, rgba(38, 49, 72, .06));
  color: var(--dsw-alias-label-primary, #0f1115);
}
.mind-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 16px;
  height: 16px;
  padding: 0 5px;
  margin-left: 6px;
  border-radius: 999px;
  background: var(--dsw-alias-interactive-bg-hover, rgba(38, 49, 72, .06));
  color: var(--dsw-alias-label-secondary, #61666b);
  font-size: 10px;
  font-weight: 500;
}
.mind-chevron {
  flex: 0 0 auto;
  margin-left: 4px;
  color: var(--dsw-alias-label-caption, #9aa0a6);
  transition: transform .15s;
}
.mind-chevron[data-open="true"] { transform: rotate(90deg); }
.mind-inline {
  margin-left: 56px;
  padding: 10px 0 12px 10px;
}
.mind-inline-item { padding-bottom: 2px; }
.mind-inline-item + .mind-inline-item { border-top: 1px solid var(--dsw-alias-border-l1, #f0f0f0); }
.mind-inline-turn {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 40px;
  padding: 12px 8px;
  margin: 0 -8px;
  border-radius: 16px;
  cursor: pointer;
}
.mind-inline-turn:hover, .mind-inline-turn[data-expanded="true"] {
  background: var(--dsw-alias-interactive-bg-hover, rgba(38, 49, 72, .04));
}
.mind-inline-title {
  flex: 1;
  min-width: 0;
  font-size: 14px;
  line-height: 22px;
  color: var(--dsw-alias-label-primary, #0f1115);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.mind-inline-conclusion {
  margin: 10px 10px 12px 52px;
  color: var(--dsw-alias-label-tertiary, #81858c);
  font-size: 13px;
  line-height: 18px;
}
.mind-report-block {
  margin: 8px 10px 12px 52px;
}
.mind-report-toggle {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.mind-report-body {
  margin-top: 8px;
  max-height: 420px;
  overflow: auto;
  padding: 12px 14px;
  border: 1px solid var(--dsw-alias-border-l1, #f0f0f0);
  border-radius: 10px;
  background: var(--dsw-alias-bg-base, #ffffff);
}
.mind-inline-raw {
  margin: 12px 0 14px 16px;
  border: 1px solid var(--dsw-alias-border-l1, #f0f0f0);
  border-radius: 8px;
  overflow: hidden;
  background: var(--dsw-alias-bg-base, #ffffff);
}
.mind-body { flex: 1; min-height: 0; display: flex; position: relative; }
.mind-main { flex: 1; min-width: 0; min-height: 0; display: flex; flex-direction: column; }
.mind-list-wrap {
  flex: 1;
  min-height: 0;
  width: 100%;
  max-width: 1056px;
  margin: 0 auto;
  padding: 14px 40px 0;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
}
.mind-timeline-bar {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 0 12px;
}
.mind-timeline-bar-label {
  flex: 0 0 auto;
  white-space: nowrap;
  font-size: 12px;
  line-height: 18px;
  color: var(--dsw-alias-label-tertiary, #81858c);
}
.mind-select-root {
  flex: 1 1 0;
  width: auto;
  min-width: 0;
  max-width: 100%;
  display: flex;
  align-items: center;
}
.mind-select-root > span {
  display: flex;
  width: 100%;
  min-width: 0;
}
.mind-select-trigger {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-width: 180px;
  max-width: 100%;
  height: 30px;
  padding: 0 10px;
  border: 1px solid var(--dsw-alias-border-l2, #ececec);
  border-radius: 8px;
  background: var(--dsw-alias-bg-layer-1, #ffffff);
  color: var(--dsw-alias-label-primary, #0f1115);
  font: inherit;
  font-size: 13px;
  line-height: 20px;
  cursor: pointer;
  box-sizing: border-box;
}
.mind-select-trigger:hover {
  background: var(--dsw-alias-interactive-bg-hover, rgba(38, 49, 72, .04));
}
.mind-select-trigger:focus-visible {
  outline: 2px solid var(--dsw-alias-state-business-primary, #3b82f6);
  outline-offset: 1px;
}
.mind-select-trigger svg {
  flex: 0 0 auto;
  color: var(--dsw-alias-label-caption, #9aa0a6);
}
.mind-select-value {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: left;
}
.mind-select-caret {
  flex: 0 0 auto;
  color: var(--dsw-alias-label-caption, #9aa0a6);
  font-size: 12px;
  line-height: 1;
}
.mind-tree-label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding-left: 14px;
  color: var(--dsw-alias-label-primary, #0f1115);
}
.mind-tree-branch {
  color: var(--dsw-alias-label-caption, #9aa0a6);
  font-family: var(--dsw-font-mono, ui-monospace, monospace);
}
.mind-select-fallback {
  margin-left: 6px;
  height: 30px;
  max-width: 320px;
  border: 1px solid var(--dsw-alias-border-l2, #ececec);
  border-radius: 8px;
  background: var(--dsw-alias-bg-layer-1, #ffffff);
  color: var(--dsw-alias-label-primary, #0f1115);
  font: inherit;
  font-size: 13px;
}
.mind-scroll { flex: 1; min-height: 0; overflow: auto; position: relative; }
/* Horizontal room for the -8px card highlights; without it overflow:auto clips
   the inset and the icon appears flush with the highlight edge. */
.mind-timeline-scroll { padding: 0 8px; }
.mind-timeline-flow { display: block; }
.mind-timeline-item { display: block; }
.mind-timeline-summary { height: 72px; }
.mind-timeline-detail { display: block; }
.mind-page-body { padding-top: 14px; padding-bottom: 80px; }
.mind-report-layout {
  flex: 1;
  min-height: 0;
  display: flex;
  gap: 16px;
  padding: 4px 8px 24px;
}
.mind-report-list {
  flex: 0 0 260px;
  min-width: 0;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.mind-report-list-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  width: 100%;
  padding: 10px 12px;
  border: 0;
  border-radius: 12px;
  background: transparent;
  color: var(--dsw-alias-label-primary, #0f1115);
  text-align: left;
  font: inherit;
  cursor: pointer;
}
.mind-report-list-item:hover,
.mind-report-list-item[data-active="true"] {
  background: var(--dsw-alias-interactive-bg-hover, rgba(38, 49, 72, .04));
}
.mind-report-period { font-size: 13px; font-weight: 500; }
.mind-report-sub {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--dsw-alias-label-tertiary, #81858c);
  font-size: 12px;
}
.mind-report-view {
  flex: 1;
  min-width: 0;
  overflow: auto;
  padding: 4px 8px 24px;
}
.mind-spacer { position: relative; }
.mind-row-abs { position: absolute; left: 0; right: 0; box-sizing: border-box; }
.mind-row {
  display: flex;
  align-items: center;
  gap: 16px;
  height: 100%;
  min-height: 72px;
  padding: 12px 8px;
  margin: 0 -8px;
  box-sizing: border-box;
  border-radius: 20px;
  cursor: pointer;
}
.mind-row:hover, .mind-row[data-expanded="true"] {
  background: var(--dsw-alias-interactive-bg-hover, rgba(38, 49, 72, .04));
}
.mind-row-main { flex: 1; min-width: 0; }
.mind-row-title {
  font-size: 14px;
  line-height: 22px;
  font-weight: 500;
  color: var(--dsw-alias-label-primary, #0f1115);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
/* The workspace name gets all remaining width; the date never truncates. */
.mind-day-title { display: flex; align-items: baseline; min-width: 0; }
.mind-day-workspace {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.mind-day-date { flex: 0 0 auto; white-space: nowrap; }
.mind-row-sub {
  font-size: 13px;
  line-height: 18px;
  color: var(--dsw-alias-label-tertiary, #81858c);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.mind-row-meta {
  flex: 0 0 auto;
  font-size: 12px;
  line-height: 18px;
  color: var(--dsw-alias-label-caption, #9aa0a6);
  white-space: nowrap;
}
.mind-row-workspace-name {
  display: inline-block;
  max-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;
  vertical-align: bottom;
  white-space: nowrap;
}
.mind-row-workspace-missing { color: var(--dsw-alias-state-warning-primary, #d97706); }
.mind-proposal-target { margin-top: 8px; max-width: 320px; }
.mind-icon-tile {
  flex: 0 0 auto;
  width: 40px;
  height: 40px;
  box-sizing: border-box;
  border-radius: 10px;
  border: 1px solid var(--dsw-alias-border-l2, #ececec);
  background: var(--dsw-alias-bg-layer-1, #ffffff);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--dsw-alias-label-secondary, #61666b);
}
.mind-icon-tile[data-kind="workspace"], .mind-icon-tile[data-kind="project"] { color: var(--dsw-alias-state-business-primary, #3b82f6); }
.mind-icon-tile[data-kind="whiteboard"] { color: #a78bfa; }
.mind-icon-tile[data-kind="user"] { color: #34d399; }
.mind-icon-tile[data-kind="rule"] { color: #fbbf24; }
.mind-icon-tile[data-kind="proposal"] { color: var(--dsw-alias-label-secondary, #61666b); }
.mind-empty, .mind-state {
  padding: 48px 0;
  color: var(--dsw-alias-label-tertiary, #81858c);
  font-size: 13px;
  text-align: center;
}
.mind-error {
  margin: 16px 0;
  padding: 12px 14px;
  border: 1px solid var(--dsw-alias-state-error-primary, #d9534f);
  border-radius: 10px;
  color: var(--dsw-alias-state-error-primary, #b42318);
  background: var(--dsw-alias-bg-base, #ffffff);
  font-size: 13px;
}
.mind-error button { margin-top: 8px; }
.mind-detail {
  flex: 0 0 42%;
  width: 42%;
  min-width: 340px;
  max-width: 720px;
  min-height: 0;
  display: flex;
  flex-direction: column;
  border-left: 1px solid var(--dsw-alias-border-l1, #f0f0f0);
  background: var(--dsw-alias-bg-base, #ffffff);
}
.mind-detail-header {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 16px;
  border-bottom: 1px solid var(--dsw-alias-border-l1, #f0f0f0);
}
.mind-detail-title {
  flex: 1;
  min-width: 0;
  font-size: 14px;
  line-height: 22px;
  font-weight: 500;
  color: var(--dsw-alias-label-primary, #0f1115);
}
.mind-detail-sub {
  color: var(--dsw-alias-label-tertiary, #81858c);
  font-size: 12px;
  line-height: 18px;
  font-weight: 400;
}
.mind-detail-body { flex: 1; min-height: 0; overflow: auto; }
.mind-btn {
  appearance: none;
  height: 32px;
  padding: 0 14px;
  border: 1px solid var(--dsw-alias-border-l2, #e3e5e8);
  border-radius: 8px;
  background: var(--dsw-alias-bg-layer-1, #ffffff);
  color: var(--dsw-alias-label-primary, #0f1115);
  font: inherit;
  font-size: 13px;
  line-height: 20px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.mind-btn:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover, rgba(38, 49, 72, .04)); }
.mind-btn:disabled { opacity: .5; cursor: default; }
.mind-btn-primary {
  background: var(--dsw-alias-label-primary, #0f1115);
  border-color: var(--dsw-alias-label-primary, #0f1115);
  color: var(--dsw-alias-bg-base, #ffffff);
}
.mind-btn-primary:hover:not(:disabled) { background: var(--dsw-alias-label-secondary, #61666b); border-color: var(--dsw-alias-label-secondary, #61666b); }
.mind-btn-ghost { border-color: transparent; background: transparent; color: var(--dsw-alias-label-secondary, #61666b); padding: 0 8px; }
.mind-btn-ghost:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover, rgba(38, 49, 72, .04)); }
.mind-turn-row { height: auto; min-height: 56px; flex-direction: column; align-items: stretch; gap: 2px; }
.mind-turn-top { display: flex; align-items: baseline; gap: 10px; }
.mind-turn-time { flex: 0 0 auto; color: var(--dsw-alias-label-caption, #9aa0a6); font-size: 12px; font-variant-numeric: tabular-nums; }
.mind-turn-title {
  flex: 1;
  min-width: 0;
  font-size: 14px;
  line-height: 22px;
  font-weight: 500;
  color: var(--dsw-alias-label-primary, #0f1115);
  overflow-wrap: anywhere;
}
.mind-turn-conclusion { color: var(--dsw-alias-label-tertiary, #81858c); font-size: 13px; line-height: 18px; overflow-wrap: anywhere; }
.mind-origin {
  flex: 0 0 auto;
  font-size: 11px;
  line-height: 18px;
  color: var(--dsw-alias-label-tertiary, #81858c);
  border: 1px solid var(--dsw-alias-border-l2, #ececec);
  border-radius: 6px;
  padding: 0 5px;
}
.mind-raw {
  margin: 0;
  padding: 16px;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
  line-height: 1.6;
  color: var(--dsw-alias-label-primary, #0f1115);
}
.mind-chunk-footer {
  position: sticky;
  bottom: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 16px;
  border-top: 1px solid var(--dsw-alias-border-l1, #f0f0f0);
  background: var(--dsw-alias-bg-base, #ffffff);
  color: var(--dsw-alias-label-tertiary, #81858c);
  font-size: 12px;
}
.mind-section-title {
  margin: 32px 0 10px;
  padding: 0;
  color: var(--dsw-alias-label-primary, #0f1115);
  font-size: 14px;
  line-height: 22px;
  font-weight: 500;
}
.mind-section-title:first-child { margin-top: 0; }
.mind-item { height: auto; min-height: 72px; }
.mind-item .mind-row-main { display: flex; flex-direction: column; gap: 1px; }
.mind-item-content {
  color: var(--dsw-alias-label-tertiary, #81858c);
  font-size: 13px;
  line-height: 18px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
}
.mind-pill {
  display: inline-flex;
  align-items: center;
  height: 18px;
  padding: 0 6px;
  margin-left: 8px;
  border-radius: 999px;
  background: var(--dsw-alias-interactive-bg-hover, rgba(38, 49, 72, .06));
  color: var(--dsw-alias-label-tertiary, #81858c);
  font-size: 11px;
  font-weight: 400;
  vertical-align: middle;
}
.mind-disabled { opacity: .5; }
.mind-modal-mask {
  position: fixed;
  inset: 0;
  z-index: 40;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, .32);
}
.mind-modal {
  width: min(760px, 92vw);
  max-height: 86vh;
  display: flex;
  flex-direction: column;
  background: var(--dsw-alias-bg-layer-1, #ffffff);
  border: 1px solid var(--dsw-alias-border-l2, #ececec);
  border-radius: 12px;
  box-shadow: var(--dsw-elevation-prominent, 0 18px 48px rgba(15, 17, 21, .18));
  overflow: hidden;
}
.mind-modal-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 16px 20px;
  border-bottom: 1px solid var(--dsw-alias-border-l1, #f0f0f0);
  font-size: 14px;
  line-height: 22px;
  font-weight: 500;
}
.mind-modal-body { flex: 1; min-height: 0; overflow: auto; padding: 16px 20px; }
.mind-modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 20px;
  border-top: 1px solid var(--dsw-alias-border-l1, #f0f0f0);
}
.mind-field { display: flex; flex-direction: column; gap: 6px; margin-bottom: 14px; }
.mind-field-label { color: var(--dsw-alias-label-secondary, #61666b); font-size: 13px; line-height: 18px; }
.mind-input, .mind-select, .mind-textarea {
  box-sizing: border-box;
  width: 100%;
  border: 1px solid var(--dsw-alias-border-l2, #e3e5e8);
  border-radius: 8px;
  background: var(--dsw-alias-bg-base, #ffffff);
  color: var(--dsw-alias-label-primary, #0f1115);
  font: inherit;
  font-size: 14px;
}
.mind-input, .mind-select { height: 36px; padding: 0 10px; }
.mind-textarea {
  min-height: 220px;
  padding: 10px;
  resize: vertical;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 13px;
  line-height: 1.6;
}
.mind-input:focus, .mind-select:focus, .mind-textarea:focus {
  outline: none;
  border-color: var(--dsw-alias-label-primary, #0f1115);
}
.mind-segmented {
  display: inline-flex;
  padding: 2px;
  border-radius: 8px;
  background: var(--dsw-alias-interactive-bg-hover, rgba(38, 49, 72, .06));
}
.mind-segmented button {
  appearance: none;
  border: 0;
  background: transparent;
  color: var(--dsw-alias-label-secondary, #61666b);
  font: inherit;
  font-size: 13px;
  line-height: 20px;
  height: 26px;
  padding: 0 12px;
  border-radius: 6px;
  cursor: pointer;
}
.mind-segmented button[data-active="true"] {
  background: var(--dsw-alias-bg-base, #ffffff);
  color: var(--dsw-alias-label-primary, #0f1115);
  box-shadow: 0 1px 2px rgba(15, 17, 21, .08);
}
.mind-preview {
  min-height: 220px;
  border: 1px solid var(--dsw-alias-border-l2, #e3e5e8);
  border-radius: 8px;
  padding: 12px 14px;
  overflow: auto;
  background: var(--dsw-alias-bg-base, #ffffff);
}
.mind-switch {
  flex: 0 0 auto;
  width: 36px;
  height: 20px;
  padding: 2px;
  border: 0;
  border-radius: 999px;
  background: var(--dsw-alias-border-l3, rgba(0, 0, 0, .16));
  display: flex;
  align-items: center;
  cursor: pointer;
  transition: background .15s;
}
.mind-switch[data-on="true"] { background: var(--dsw-alias-label-primary, #0f1115); }
.mind-switch-knob {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #ffffff;
  transition: transform .15s;
}
.mind-switch[data-on="true"] .mind-switch-knob { background: var(--dsw-alias-bg-base, #ffffff); transform: translateX(16px); }
body[data-ds-dark-theme] .mind-switch[data-on="false"] .mind-switch-knob { background: var(--dsw-alias-label-tertiary, #adb2b8); }
.mind-switch:disabled { opacity: .5; cursor: default; }
.mind-proposal-content {
  margin: 4px 0 0;
  color: var(--dsw-alias-label-secondary, #61666b);
  font-size: 13px;
  line-height: 20px;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.mind-proposal-meta { color: var(--dsw-alias-label-caption, #9aa0a6); font-size: 12px; line-height: 18px; }
.mind-proposal-actions { display: flex; flex: 0 0 auto; gap: 8px; align-items: center; }
.mind-mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12px; overflow-wrap: anywhere; }
.mind-path { color: var(--dsw-alias-label-tertiary, #81858c); }
.mind-settings { padding: 0; }
.mind-setting {
  display: flex;
  align-items: center;
  gap: 16px;
  min-height: 72px;
  padding: 12px 8px;
  margin: 0 -8px;
  border-radius: 20px;
}
.mind-setting:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(38, 49, 72, .03)); }
.mind-setting-main { flex: 1; min-width: 0; }
.mind-setting-label { font-size: 14px; line-height: 22px; font-weight: 500; color: var(--dsw-alias-label-primary, #0f1115); }
.mind-setting-desc { font-size: 13px; line-height: 18px; color: var(--dsw-alias-label-tertiary, #81858c); }
.mind-setting-value { font-size: 13px; line-height: 18px; color: var(--dsw-alias-label-secondary, #61666b); }
.mind-md { line-height: 1.65; font-size: 13px; color: var(--dsw-alias-label-primary, #0f1115); overflow-wrap: anywhere; }
.mind-md-p { margin: 0 0 8px; }
.mind-md-heading { margin: 12px 0 6px; font-size: 14px; font-weight: 500; }
.mind-md-list { margin: 0 0 8px; padding-left: 20px; }
.mind-md-quote {
  margin: 0 0 8px;
  padding-left: 10px;
  border-left: 3px solid var(--dsw-alias-border-l2, #ececec);
  color: var(--dsw-alias-label-secondary, #61666b);
}
.mind-md-rule { border: 0; border-top: 1px solid var(--dsw-alias-border-l1, #f0f0f0); margin: 10px 0; }
.mind-md-code {
  position: relative;
  margin: 0 0 8px;
  padding: 10px 12px;
  overflow: auto;
  border-radius: 8px;
  background: var(--dsw-alias-bg-module-platform, #f7f8fa);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
}
.mind-md-lang { position: absolute; top: 4px; right: 8px; color: var(--dsw-alias-label-caption, #9aa0a6); font-size: 10px; }
.mind-md-inline {
  padding: 1px 4px;
  border-radius: 4px;
  background: var(--dsw-alias-bg-module-platform, #f7f8fa);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
}
.mind-md-link { color: var(--dsw-alias-state-business-primary, #3b82f6); text-decoration: none; }
.mind-md-link:hover { text-decoration: underline; }
.mind-back { display: none; }
@media (max-width: 700px) {
  .mind-page { padding: 0 20px; }
  .mind-list-wrap { padding-left: 12px; padding-right: 12px; }
  .mind-page-body { padding-top: 14px; }
}
@media (max-width: 1000px) {
  .mind-detail { position: absolute; inset: 0; width: auto; max-width: none; min-width: 0; z-index: 5; }
  .mind-body[data-detail="false"] .mind-detail { display: none; }
  .mind-back { display: inline-flex; }
}
`;
function injectStyles() {
  if (typeof document === "undefined") return () => {
  };
  const existing = document.getElementById(STYLE_ID);
  if (existing !== null) {
    existing.textContent = CSS;
    return () => {
      if (existing.textContent === CSS) existing.remove();
    };
  }
  const element = document.createElement("style");
  element.id = STYLE_ID;
  element.textContent = CSS;
  document.head.appendChild(element);
  return () => {
    element.remove();
  };
}

// src/client/ui.tsx
var import_react2 = require("react");

// src/client/api.ts
var ApiError = class extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
    this.name = "ApiError";
  }
};
async function callApi(endpoint, payload = {}, signal) {
  let response;
  const init = {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  };
  if (signal !== void 0) init.signal = signal;
  try {
    response = await fetch(`/api/mind.${endpoint}`, init);
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new ApiError("network", "\u65E0\u6CD5\u8FDE\u63A5 MIND Host");
  }
  let body = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  if (!response.ok) {
    throw new ApiError(body?.error?.code ?? `http-${response.status}`, body?.error?.message ?? `HTTP ${response.status}`);
  }
  if (body === null || body.ok !== true) {
    throw new ApiError(body?.error?.code ?? "unknown", body?.error?.message ?? "MIND Host \u8FD4\u56DE\u4E86\u65E0\u6548\u54CD\u5E94");
  }
  return body.value;
}

// src/client/markdown.tsx
var import_react = require("react");
var import_jsx_runtime = require("react/jsx-runtime");
function MarkdownPreview({ text }) {
  const blocks = (0, import_react.useMemo)(() => parseBlocks(text), [text]);
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "mind-md", children: blocks });
}
function parseBlocks(text) {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const nodes = [];
  let index = 0;
  let key = 0;
  while (index < lines.length) {
    const line = lines[index] ?? "";
    if (line.trim() === "") {
      index += 1;
      continue;
    }
    const fence = /^```(.*)$/.exec(line);
    if (fence !== null) {
      const language = fence[1]?.trim() ?? "";
      const body = [];
      index += 1;
      while (index < lines.length && !/^```/.test(lines[index] ?? "")) {
        body.push(lines[index] ?? "");
        index += 1;
      }
      index += 1;
      nodes.push(
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("pre", { className: "mind-md-code", children: [
          language === "" ? null : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "mind-md-lang", children: language }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("code", { children: body.join("\n") })
        ] }, key++)
      );
      continue;
    }
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading !== null) {
      const level = heading[1]?.length ?? 1;
      const content = heading[2] ?? "";
      const Tag = `h${Math.min(6, level + 2)}`;
      nodes.push(
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Tag, { className: "mind-md-heading", children: inline(content) }, key++)
      );
      index += 1;
      continue;
    }
    if (/^(-{3,}|\*{3,})$/.test(line.trim())) {
      nodes.push(/* @__PURE__ */ (0, import_jsx_runtime.jsx)("hr", { className: "mind-md-rule" }, key++));
      index += 1;
      continue;
    }
    if (/^>\s?/.test(line)) {
      const body = [];
      while (index < lines.length && /^>\s?/.test(lines[index] ?? "")) {
        body.push((lines[index] ?? "").replace(/^>\s?/, ""));
        index += 1;
      }
      nodes.push(
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("blockquote", { className: "mind-md-quote", children: inline(body.join("\n")) }, key++)
      );
      continue;
    }
    if (/^\s*([-*+]|\d+\.)\s+/.test(line)) {
      const ordered = /^\s*\d+\./.test(line);
      const items = [];
      while (index < lines.length && /^\s*([-*+]|\d+\.)\s+/.test(lines[index] ?? "")) {
        items.push((lines[index] ?? "").replace(/^\s*([-*+]|\d+\.)\s+/, ""));
        index += 1;
      }
      const ListTag = ordered ? "ol" : "ul";
      nodes.push(
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ListTag, { className: "mind-md-list", children: items.map((item, itemIndex) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", { children: inline(item) }, itemIndex)) }, key++)
      );
      continue;
    }
    const paragraph = [line];
    index += 1;
    while (index < lines.length) {
      const next = lines[index] ?? "";
      if (next.trim() === "" || /^(#{1,6})\s|^```|^>\s?|^\s*([-*+]|\d+\.)\s+/.test(next)) break;
      paragraph.push(next);
      index += 1;
    }
    nodes.push(
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "mind-md-p", children: inline(paragraph.join("\n")) }, key++)
    );
  }
  return nodes;
}
function inline(text) {
  const parts = [];
  const pattern = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*]+\*)|(\[[^\]]+\]\((https?:\/\/[^)\s]+)\))/g;
  let last = 0;
  let match;
  let key = 0;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) parts.push(/* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_react.Fragment, { children: text.slice(last, match.index) }, key++));
    const token = match[0];
    if (match[1] !== void 0) {
      parts.push(
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("code", { className: "mind-md-inline", children: token.slice(1, -1) }, key++)
      );
    } else if (match[2] !== void 0) {
      parts.push(/* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: token.slice(2, -2) }, key++));
    } else if (match[3] !== void 0) {
      parts.push(/* @__PURE__ */ (0, import_jsx_runtime.jsx)("em", { children: token.slice(1, -1) }, key++));
    } else {
      const label = match[4]?.slice(1, match[4].indexOf("]")) ?? "";
      const href = match[5] ?? "";
      parts.push(
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("a", { className: "mind-md-link", href, rel: "noreferrer noopener", target: "_blank", children: label }, key++)
      );
    }
    last = match.index + token.length;
  }
  if (last < text.length) parts.push(/* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_react.Fragment, { children: text.slice(last) }, key++));
  return parts;
}

// src/client/ui.tsx
var import_jsx_runtime2 = require("react/jsx-runtime");
var dshPrimitives = null;
try {
  dshPrimitives = require("@deepseek-ai/dsh-client-ui-primitives");
} catch {
  dshPrimitives = null;
}
var DshMenu = dshPrimitives?.Menu;
var ChevronsUpDown = dshPrimitives?.IconChevronsUpDownOutlineRegular;
function workspaceLabel(name) {
  if (name !== "default-workspace") return name;
  const language = typeof navigator === "undefined" ? "zh" : navigator.language;
  return language.toLowerCase().startsWith("zh") ? "\u9ED8\u8BA4\u5DE5\u4F5C\u533A" : "Default Workspace";
}
function childWorkspaceLabel(name, parent) {
  const label = workspaceLabel(name);
  const prefix = `${parent} / `;
  return label.startsWith(prefix) ? label.slice(prefix.length) : label;
}
function workspaceTreeOptions(workspaces) {
  const parentNames = ["Archived", "GameExpert", "Opensource"];
  const pathOf = (workspace) => workspace.paths[0]?.path ?? "";
  const parents = parentNames.map((name) => workspaces.find((workspace) => workspace.displayName === name)).filter((workspace) => workspace !== void 0);
  const used = /* @__PURE__ */ new Set();
  const options = [{ id: "__all__", label: "\u5168\u90E8\u5DE5\u4F5C\u533A" }];
  for (const parent of parents) {
    const parentPath = pathOf(parent);
    if (parentPath === "") continue;
    const children = workspaces.filter((workspace) => {
      if (workspace.workspaceId === parent.workspaceId) return false;
      return pathOf(workspace).startsWith(parentPath + "/");
    }).sort((a, b) => workspaceLabel(a.displayName).localeCompare(workspaceLabel(b.displayName)));
    if (children.length === 0) continue;
    used.add(parent.workspaceId);
    for (const child of children) used.add(child.workspaceId);
    options.push({
      id: `__group__${parent.workspaceId}`,
      label: `${parent.displayName} \u203A`,
      submenu: children.map((child) => ({
        id: child.workspaceId,
        label: childWorkspaceLabel(child.displayName, parent.displayName)
      }))
    });
  }
  for (const workspace of workspaces.filter((workspace2) => !used.has(workspace2.workspaceId)).sort((a, b) => workspaceLabel(a.displayName).localeCompare(workspaceLabel(b.displayName)))) {
    options.push({ id: workspace.workspaceId, label: workspaceLabel(workspace.displayName) });
  }
  return options;
}
function findSelectOption(options, id) {
  for (const option of options) {
    if (option.id === id) return option;
    const nested = option.submenu === void 0 ? void 0 : findSelectOption(option.submenu, id);
    if (nested !== void 0) return nested;
  }
  return void 0;
}
function flattenSelectOptions(options) {
  const flat = [];
  for (const option of options) {
    if (option.type !== void 0) continue;
    if (option.submenu !== void 0) {
      flat.push(...flattenSelectOptions(option.submenu));
    } else {
      flat.push(option);
    }
  }
  return flat;
}
function menuItems(options) {
  return options.map((option) => {
    if (option.type === "label") return { type: "label", text: option.label };
    if (option.type === "separator") return { type: "separator" };
    return {
      id: option.id,
      label: option.display ?? option.label,
      ...option.submenu === void 0 ? {} : { submenu: menuItems(option.submenu) }
    };
  });
}
function DshSelect({
  id,
  label,
  options,
  value,
  onChange
}) {
  const [open, setOpen] = (0, import_react2.useState)(false);
  const selected = findSelectOption(options, value);
  if (DshMenu === void 0) {
    return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "mind-select-root", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
      "select",
      {
        "aria-label": label,
        className: "mind-select-fallback",
        onChange: (event) => onChange(event.target.value),
        value,
        children: flattenSelectOptions(options).map((option) => /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("option", { value: option.id, children: option.label }, option.id))
      }
    ) });
  }
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "mind-select-root", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
    DshMenu,
    {
      anchor: /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
        "button",
        {
          "aria-expanded": open,
          "aria-haspopup": "menu",
          "aria-label": label,
          className: "mind-select-trigger",
          id,
          onClick: () => setOpen((current) => !current),
          type: "button",
          children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "mind-select-value", children: selected?.label ?? label }),
            ChevronsUpDown === void 0 ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { "aria-hidden": "true", className: "mind-select-caret", children: "\u2304" }) : /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(ChevronsUpDown, {})
          ]
        }
      ),
      items: menuItems(options),
      onClose: () => setOpen(false),
      onSelect: (next) => {
        if (typeof next !== "string" || next === "") return;
        onChange(next);
        setOpen(false);
      },
      open,
      portal: true,
      selectedId: value,
      side: "bottom"
    }
  ) });
}
function useAsync(loader, deps) {
  const [state, setState] = (0, import_react2.useState)({ data: null, error: null, loading: true });
  const [revision, setRevision] = (0, import_react2.useState)(0);
  (0, import_react2.useEffect)(() => {
    const controller = new AbortController();
    let active = true;
    setState((previous) => ({ data: previous.data, error: null, loading: true }));
    loader(controller.signal).then((data) => {
      if (active) setState({ data, error: null, loading: false });
    }).catch((error) => {
      if (!active || controller.signal.aborted) return;
      setState({ data: null, error: messageOf(error), loading: false });
    });
    return () => {
      active = false;
      controller.abort();
    };
  }, [...deps, revision]);
  const reload = (0, import_react2.useCallback)(() => setRevision((value) => value + 1), []);
  return { ...state, reload };
}
function messageOf(error) {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return String(error);
}
function timeOf(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Shanghai"
  }).format(date);
}
function dateOf(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    timeZone: "Asia/Shanghai"
  }).format(date);
}
function ErrorBox({ message, onRetry }) {
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "mind-error", children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { children: message }),
    onRetry === void 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { className: "mind-btn", onClick: onRetry, type: "button", children: "\u91CD\u8BD5" })
  ] });
}
var ICON_PATHS = {
  calendar: /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("rect", { height: "16", rx: "2", width: "18", x: "3", y: "5" }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("path", { d: "M16 3v4M8 3v4M3 10h18" })
  ] }),
  project: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("path", { d: "M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" }),
  workspace: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("path", { d: "M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" }),
  whiteboard: /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("rect", { height: "14", rx: "2", width: "18", x: "3", y: "4" }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("path", { d: "M8 21h8M12 18v3" })
  ] }),
  user: /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("circle", { cx: "12", cy: "8", r: "4" }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("path", { d: "M4 21a8 8 0 0 1 16 0" })
  ] }),
  rule: /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("path", { d: "M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6l7-3Z" }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("path", { d: "M9.5 12l1.8 1.8 3.5-3.6" })
  ] }),
  proposal: /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("path", { d: "M9 18h6M10 21h4" }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("path", { d: "M12 3a6 6 0 0 0-4 10c.8.8 1 1.5 1 2h6c0-.5.2-1.2 1-2a6 6 0 0 0-4-10Z" })
  ] })
};
function RowIcon({ kind }) {
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "mind-icon-tile", "data-kind": kind, children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
    "svg",
    {
      "aria-hidden": "true",
      fill: "none",
      height: 20,
      stroke: "currentColor",
      strokeLinecap: "round",
      strokeLinejoin: "round",
      strokeWidth: 1.5,
      viewBox: "0 0 24 24",
      width: 20,
      children: ICON_PATHS[kind]
    }
  ) });
}
function Switch({
  checked,
  disabled = false,
  label,
  onChange
}) {
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
    "button",
    {
      "aria-checked": checked,
      "aria-label": label,
      className: "mind-switch",
      "data-on": checked,
      disabled,
      onClick: () => onChange(!checked),
      role: "switch",
      type: "button",
      children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "mind-switch-knob" })
    }
  );
}
function Chevron({ open }) {
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
    "svg",
    {
      "aria-hidden": "true",
      className: "mind-chevron",
      "data-open": open,
      fill: "none",
      height: 16,
      stroke: "currentColor",
      strokeLinecap: "round",
      strokeLinejoin: "round",
      strokeWidth: 1.5,
      viewBox: "0 0 24 24",
      width: 16,
      children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("path", { d: "M9 6l6 6-6 6" })
    }
  );
}
function VirtualTimeline({
  items,
  expandedKey,
  onNearEnd,
  renderRow,
  renderDetail
}) {
  const viewport = (0, import_react2.useRef)(null);
  (0, import_react2.useEffect)(() => {
    const element = viewport.current;
    if (element === null) return;
    const onScroll = () => {
      if (onNearEnd !== void 0 && element.scrollHeight - (element.scrollTop + element.clientHeight) < 400) {
        onNearEnd();
      }
    };
    element.addEventListener("scroll", onScroll, { passive: true });
    return () => element.removeEventListener("scroll", onScroll);
  }, [onNearEnd]);
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "mind-scroll mind-timeline-scroll", ref: viewport, children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "mind-timeline-flow", children: items.map((item) => {
    const key = timelineKey(item);
    const expanded = key === expandedKey;
    return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "mind-timeline-item", children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "mind-timeline-summary", children: renderRow(item, expanded) }),
      expanded ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "mind-timeline-detail", children: renderDetail(item) }) : null
    ] }, key);
  }) }) });
}
function ReportBlock({ path }) {
  const [open, setOpen] = (0, import_react2.useState)(false);
  const state = useAsync(
    (signal) => open ? callApi("report", { path }, signal) : Promise.resolve(null),
    [path, open]
  );
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "mind-report-block", children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
      "button",
      {
        "aria-expanded": open,
        className: "mind-btn mind-btn-ghost mind-report-toggle",
        onClick: () => setOpen((value) => !value),
        type: "button",
        children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Chevron, { open }),
          "\u65E5\u62A5"
        ]
      }
    ),
    open ? state.loading ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "mind-state", children: "\u52A0\u8F7D\u65E5\u62A5\u2026" }) : state.error !== null ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(ErrorBox, { message: state.error, onRetry: state.reload }) : state.data === null ? null : /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "mind-report-body", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(MarkdownPreview, { text: state.data.content }) }) : null
  ] });
}
function DayInline({
  row,
  expandedTurn,
  onToggleTurn
}) {
  const state = useAsync(
    (signal) => callApi("day", { workspaceId: row.workspaceId, date: row.date }, signal),
    [row.workspaceId, row.date]
  );
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "mind-inline", children: [
    row.reportPath === null ? null : /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(ReportBlock, { path: row.reportPath }),
    state.loading ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "mind-state", children: "\u52A0\u8F7D\u4E2D\u2026" }) : state.error !== null ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(ErrorBox, { message: state.error, onRetry: state.reload }) : state.data === null || state.data.rows.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "mind-empty", children: "\u8FD9\u4E00\u5929\u6CA1\u6709\u8BB0\u5F55\u3002" }) : state.data.rows.map((item) => /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "mind-inline-item", children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
        "div",
        {
          className: "mind-inline-turn",
          "data-expanded": expandedTurn === item.turnId,
          onClick: () => onToggleTurn(item.turnId),
          children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "mind-turn-time", children: timeOf(item.occurredAt) }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "mind-inline-title", children: item.title ?? item.preview ?? "\u672A\u6458\u8981" }),
            item.indexed ? null : /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "mind-origin", children: "\u672A\u6458\u8981" }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Chevron, { open: expandedTurn === item.turnId })
          ]
        }
      ),
      item.conclusion === null || item.conclusion === "" ? null : /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "mind-inline-conclusion", children: item.conclusion }),
      expandedTurn === item.turnId ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "mind-inline-raw", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(TurnContent, { turn: item }) }) : null
    ] }, item.turnId)),
    state.data?.truncated ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "mind-state", children: "\u5F53\u5929\u8BB0\u5F55\u8FC7\u591A\uFF0C\u4EC5\u663E\u793A\u524D 300 \u6761\u3002" }) : null
  ] });
}
function timelineKey(row) {
  return `${row.date}\0${row.workspaceId}`;
}
function Timeline() {
  const [rows, setRows] = (0, import_react2.useState)([]);
  const [next, setNext] = (0, import_react2.useState)(null);
  const [loading, setLoading] = (0, import_react2.useState)(true);
  const [error, setError] = (0, import_react2.useState)(null);
  const [expandedKey, setExpandedKey] = (0, import_react2.useState)(null);
  const [expandedTurn, setExpandedTurn] = (0, import_react2.useState)(null);
  const [workspaceFilter, setWorkspaceFilter] = (0, import_react2.useState)("");
  const [workspaces, setWorkspaces] = (0, import_react2.useState)([]);
  const inFlight = (0, import_react2.useRef)(false);
  const requestId = (0, import_react2.useRef)(0);
  (0, import_react2.useEffect)(() => {
    let active = true;
    callApi("workspaces", { limit: 200 }).then((page) => {
      if (active) setWorkspaces(page.rows);
    }).catch(() => {
    });
    return () => {
      active = false;
    };
  }, []);
  const loadPage = (0, import_react2.useCallback)(
    async (before, replace) => {
      const id = ++requestId.current;
      inFlight.current = true;
      if (replace) setLoading(true);
      setError(null);
      try {
        const payload = before === null ? { limit: 50 } : { before, limit: 50 };
        if (workspaceFilter !== "") payload.workspaceId = workspaceFilter;
        const page = await callApi("timeline", payload);
        if (id !== requestId.current) return;
        setRows((previous) => replace ? page.rows : mergeUnique(previous, page.rows));
        setNext(page.next);
      } catch (caught) {
        if (id !== requestId.current) return;
        setError(messageOf(caught));
      } finally {
        if (id === requestId.current) {
          inFlight.current = false;
          setLoading(false);
        }
      }
    },
    [workspaceFilter]
  );
  (0, import_react2.useEffect)(() => {
    inFlight.current = false;
    setRows([]);
    setNext(null);
    setExpandedKey(null);
    setExpandedTurn(null);
    void loadPage(null, true);
  }, [loadPage]);
  const loadMore = (0, import_react2.useCallback)(() => {
    if (next === null || inFlight.current) return;
    void loadPage(next, false);
  }, [next, loadPage]);
  const workspaceOptions = (0, import_react2.useMemo)(() => workspaceTreeOptions(workspaces), [workspaces]);
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "mind-main", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "mind-list-wrap", children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "mind-timeline-bar", children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "mind-timeline-bar-label", children: "\u5DE5\u4F5C\u533A" }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
        DshSelect,
        {
          label: "\u5DE5\u4F5C\u533A",
          onChange: (next2) => setWorkspaceFilter(next2 === "__all__" ? "" : next2),
          options: workspaceOptions,
          value: workspaceFilter === "" ? "__all__" : workspaceFilter
        }
      )
    ] }),
    loading && rows.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "mind-state", children: "\u52A0\u8F7D\u4E2D\u2026" }) : error !== null ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(ErrorBox, { message: error, onRetry: () => void loadPage(null, true) }) : rows.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "mind-empty", children: "\u8FD8\u6CA1\u6709\u8BB0\u5FC6\u3002\u5F00\u59CB\u4E00\u8F6E\u5BF9\u8BDD\u5C31\u4F1A\u81EA\u52A8\u8BB0\u5F55\u3002" }) : /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
      VirtualTimeline,
      {
        items: rows,
        expandedKey,
        onNearEnd: loadMore,
        renderRow: (row, isExpanded) => /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
          "div",
          {
            className: "mind-row",
            "data-expanded": isExpanded,
            onClick: () => {
              setExpandedKey((current) => current === timelineKey(row) ? null : timelineKey(row));
              setExpandedTurn(null);
            },
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(RowIcon, { kind: "calendar" }),
              /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "mind-row-main", children: [
                /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "mind-row-title mind-day-title", children: [
                  /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "mind-day-workspace", children: workspaceLabel(row.workspaceName) }),
                  /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "mind-day-date", children: ` - ${row.date}` })
                ] }),
                /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "mind-row-sub", children: row.title === "" ? "\uFF08\u65E0\u6458\u8981\uFF09" : row.title })
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "mind-row-meta", children: [
                row.turnCount,
                " turns"
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Chevron, { open: isExpanded })
            ]
          }
        ),
        renderDetail: (row) => /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
          DayInline,
          {
            row,
            expandedTurn,
            onToggleTurn: (turnId) => setExpandedTurn((current) => current === turnId ? null : turnId)
          }
        )
      }
    )
  ] }) });
}
function mergeUnique(previous, incoming) {
  const seen = new Set(previous.map((row) => `${row.date}\0${row.workspaceId}`));
  const merged = [...previous];
  for (const row of incoming) {
    const key = `${row.date}\0${row.workspaceId}`;
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(row);
    }
  }
  return merged;
}
function TurnContent({ turn }) {
  const [text, setText] = (0, import_react2.useState)("");
  const [total, setTotal] = (0, import_react2.useState)(0);
  const [next, setNext] = (0, import_react2.useState)(0);
  const [loading, setLoading] = (0, import_react2.useState)(true);
  const [error, setError] = (0, import_react2.useState)(null);
  const generation = (0, import_react2.useRef)(0);
  const load = (0, import_react2.useCallback)(
    async (from, append) => {
      const request = ++generation.current;
      setLoading(true);
      setError(null);
      try {
        const chunk = await callApi("turn", { turnId: turn.turnId, offset: from, max: 2e4 });
        if (request !== generation.current) return;
        setText((previous) => append ? previous + chunk.chunk : chunk.chunk);
        setTotal(chunk.total);
        setNext(chunk.next);
      } catch (caught) {
        if (request !== generation.current) return;
        setError(messageOf(caught));
      } finally {
        if (request === generation.current) setLoading(false);
      }
    },
    [turn.turnId]
  );
  (0, import_react2.useEffect)(() => {
    setText("");
    setTotal(0);
    setNext(0);
    setError(null);
    void load(0, false);
    return () => {
      generation.current += 1;
    };
  }, [load]);
  const loaded = next === null ? total : next;
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: { display: "flex", flexDirection: "column", minHeight: "100%" }, children: [
    error !== null ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(ErrorBox, { message: error, onRetry: () => void load(0, false) }) : loading && text === "" ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "mind-state", children: "\u52A0\u8F7D\u4E2D\u2026" }) : /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("pre", { className: "mind-raw", children: text }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "mind-chunk-footer", children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { children: [
        "\u5DF2\u52A0\u8F7D ",
        loaded,
        " / ",
        total,
        " \u5B57\u7B26"
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { style: { flex: 1 } }),
      next === null ? null : /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { className: "mind-btn", disabled: loading, onClick: () => void load(next, true), type: "button", children: loading ? "\u52A0\u8F7D\u4E2D\u2026" : "\u52A0\u8F7D\u66F4\u591A" })
    ] })
  ] });
}
function CurrentPage() {
  const state = useAsync(async (signal) => {
    const [entries, workspaces] = await Promise.all([
      callApi("current", { limit: 500 }, signal),
      callApi("workspaces", { limit: 500 }, signal)
    ]);
    return { entries, workspaces };
  }, []);
  const [editing, setEditing] = (0, import_react2.useState)(null);
  if (state.loading) {
    return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "mind-scroll", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "mind-page mind-page-body", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "mind-state", children: "\u52A0\u8F7D\u4E2D\u2026" }) }) });
  }
  if (state.error !== null) return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(ErrorBox, { message: state.error, onRetry: state.reload });
  if (state.data === null) {
    return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "mind-scroll", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "mind-page mind-page-body", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "mind-empty", children: "\u6CA1\u6709\u5F53\u524D\u8BA4\u77E5\u3002" }) }) });
  }
  const rules = state.data?.entries.rows.filter((entry) => entry.layer === "rule" || entry.layer === "user") ?? [];
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "mind-scroll", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "mind-page mind-page-body", children: [
      rules.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "mind-empty", children: "\u8FD8\u6CA1\u6709\u89C4\u5219\u3002\u6279\u51C6\u63D0\u6848\u540E\u4F1A\u51FA\u73B0\u5728\u8FD9\u91CC\u3002" }) : /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "mind-section-title", children: "\u89C4\u5219" }),
        rules.map((entry) => /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
          "div",
          {
            className: `mind-row mind-item${entry.enabled ? "" : " mind-disabled"}`,
            onClick: () => setEditing(entry),
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(RowIcon, { kind: "rule" }),
              /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "mind-row-main", children: [
                /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "mind-row-title", children: [
                  entry.title,
                  entry.enabled ? null : /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "mind-pill", children: "\u5DF2\u505C\u7528" })
                ] }),
                /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "mind-item-content", children: entry.content })
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "mind-row-meta", children: [
                "v",
                entry.version,
                " \xB7",
                " ",
                entry.workspaceId === null ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "mind-row-workspace-name mind-row-workspace-missing", children: "\u672A\u5F52\u5C5E\u9879\u76EE\uFF08\u8BF7\u9009\u62E9\uFF09" }) : /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "mind-row-workspace-name", title: workspaceLabel(entry.workspaceName), children: workspaceLabel(entry.workspaceName) }),
                " ",
                "\xB7 ",
                dateOf(entry.updatedAt)
              ] })
            ]
          },
          entry.id
        ))
      ] }),
      state.data.entries.truncated ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "mind-state", children: "\u6761\u76EE\u8FC7\u591A\uFF0C\u4EC5\u663E\u793A\u524D 500 \u6761\u3002" }) : null
    ] }) }),
    editing === null ? null : /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
      EntryEditor,
      {
        entry: editing,
        workspaces: state.data.workspaces.rows,
        onClose: () => setEditing(null),
        onSaved: () => {
          setEditing(null);
          state.reload();
        }
      }
    )
  ] });
}
function EntryEditor({
  entry,
  workspaces,
  onClose,
  onSaved
}) {
  const [title, setTitle] = (0, import_react2.useState)(entry.title);
  const [content, setContent] = (0, import_react2.useState)(entry.content);
  const [enabled, setEnabled] = (0, import_react2.useState)(entry.enabled);
  const [workspaceId, setWorkspaceId] = (0, import_react2.useState)(entry.workspaceId ?? "");
  const [preview, setPreview] = (0, import_react2.useState)(false);
  const [saving, setSaving] = (0, import_react2.useState)(false);
  const [error, setError] = (0, import_react2.useState)(null);
  const workspaceOptions = (0, import_react2.useMemo)(() => {
    const options = workspaces.map((workspace) => ({
      id: workspace.workspaceId,
      name: workspaceLabel(workspace.displayName)
    }));
    if (entry.workspaceId !== null && !options.some((option) => option.id === entry.workspaceId)) {
      options.push({ id: entry.workspaceId, name: workspaceLabel(entry.workspaceName) });
    }
    return options;
  }, [entry.workspaceId, entry.workspaceName, workspaces]);
  const save = async () => {
    if (title.trim() === "") {
      setError("\u6807\u9898\u4E0D\u80FD\u4E3A\u7A7A");
      return;
    }
    if (workspaceId === "") {
      setError("\u8BF7\u5148\u9009\u62E9\u89C4\u5219\u6240\u5C5E\u9879\u76EE");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await callApi("saveEntry", {
        id: entry.id,
        layer: "rule",
        title: title.trim(),
        content,
        enabled,
        workspaceId: workspaceId === "" ? null : workspaceId
      });
      onSaved();
    } catch (caught) {
      setError(messageOf(caught));
    } finally {
      setSaving(false);
    }
  };
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "mind-modal-mask", onMouseDown: (event) => event.target === event.currentTarget && onClose(), children: /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "mind-modal", role: "dialog", "aria-modal": "true", children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "mind-modal-header", children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { style: { flex: 1 }, children: "\u7F16\u8F91\u89C4\u5219" }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { className: "mind-setting-desc", children: [
        "v",
        entry.version
      ] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "mind-modal-body", children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "mind-field", children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("label", { className: "mind-field-label", htmlFor: "mind-title", children: "\u6807\u9898" }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
          "input",
          {
            className: "mind-input",
            id: "mind-title",
            onChange: (event) => setTitle(event.target.value),
            value: title
          }
        )
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "mind-field", children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("label", { className: "mind-field-label", htmlFor: "mind-workspace", children: "\u9879\u76EE" }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
          DshSelect,
          {
            id: "mind-workspace",
            label: "\u8BF7\u9009\u62E9\u9879\u76EE",
            onChange: setWorkspaceId,
            options: [
              ...workspaceId === "" ? [{ id: "", label: "\u8BF7\u9009\u62E9\u9879\u76EE" }] : [],
              ...workspaceOptions.map((workspace) => ({
                id: workspace.id,
                label: workspace.name
              }))
            ],
            value: workspaceId
          }
        ),
        workspaceOptions.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "mind-setting-desc", children: "\u8FD8\u6CA1\u6709\u5DE5\u4F5C\u533A\u3002\u5148\u5728 DSH \u91CC\u6253\u5F00\u4E00\u4E2A\u76EE\u5F55\u5BF9\u8BDD\uFF0C\u518D\u8BBE\u7F6E\u89C4\u5219\u3002" }) : null
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "mind-field", children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: { display: "flex", alignItems: "center", gap: 10 }, children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "mind-field-label", style: { flex: 1 }, children: "\u5185\u5BB9" }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "mind-segmented", children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { "data-active": !preview, onClick: () => setPreview(false), type: "button", children: "\u7F16\u8F91" }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { "data-active": preview, onClick: () => setPreview(true), type: "button", children: "\u9884\u89C8" })
          ] })
        ] }),
        preview ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "mind-preview", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(MarkdownPreview, { text: content }) }) : /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
          "textarea",
          {
            className: "mind-textarea",
            onChange: (event) => setContent(event.target.value),
            value: content
          }
        )
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "mind-field", style: { flexDirection: "row", alignItems: "center", gap: 10 }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "mind-field-label", style: { flex: 1 }, children: "\u542F\u7528\uFF08\u505C\u7528\u540E\u4E0D\u53C2\u4E0E\u6BCF\u8F6E\u6CE8\u5165\uFF09" }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Switch, { checked: enabled, label: "\u542F\u7528", onChange: setEnabled })
      ] }),
      error === null ? null : /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(ErrorBox, { message: error })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "mind-modal-footer", children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { className: "mind-btn", disabled: saving, onClick: onClose, type: "button", children: "\u53D6\u6D88" }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
        "button",
        {
          className: "mind-btn mind-btn-primary",
          disabled: saving || workspaceId === "" || workspaceOptions.length === 0,
          onClick: () => void save(),
          type: "button",
          children: saving ? "\u4FDD\u5B58\u4E2D\u2026" : "\u4FDD\u5B58"
        }
      )
    ] })
  ] }) });
}
function WorkspacesPage() {
  const state = useAsync((signal) => callApi("workspaces", {}, signal), []);
  const [copied, setCopied] = (0, import_react2.useState)(null);
  const copy = async (id) => {
    try {
      await navigator.clipboard.writeText(id);
      setCopied(id);
    } catch {
      setCopied(null);
    }
  };
  if (state.loading) return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "mind-state", children: "\u52A0\u8F7D\u4E2D\u2026" });
  if (state.error !== null) return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(ErrorBox, { message: state.error, onRetry: state.reload });
  if (state.data === null || state.data.rows.length === 0) {
    return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "mind-empty", children: "\u8FD8\u6CA1\u6709\u5DE5\u4F5C\u533A\u3002\u5728 DSH \u91CC\u6253\u5F00\u4E00\u4E2A\u76EE\u5F55\u5BF9\u8BDD\u540E\u4F1A\u81EA\u52A8\u767B\u8BB0\u3002" });
  }
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "mind-scroll", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "mind-page mind-page-body", children: [
    state.data.truncated ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "mind-state", children: "\u5DE5\u4F5C\u533A\u8FC7\u591A\uFF0C\u4EC5\u663E\u793A\u524D 200 \u4E2A\u3002" }) : null,
    state.data.rows.map((workspace) => {
      const primary = workspace.paths[0];
      return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "mind-row mind-item", children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(RowIcon, { kind: "workspace" }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "mind-row-main", children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "mind-row-title", children: workspaceLabel(workspace.displayName) }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "mind-row-sub mind-mono", children: primary?.path ?? "\uFF08\u65E0\u6D3B\u52A8\u8DEF\u5F84\uFF09" }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "mind-row-sub mind-mono", children: [
            workspace.workspaceId,
            primary === void 0 ? "" : ` \xB7 inode ${primary.inode ?? "?"} \xB7 ${primary.confidence}`
          ] })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "mind-row-meta", children: [
          workspace.turnCount,
          " turns",
          workspace.lastTurnAt === null ? "" : ` \xB7 ${dateOf(workspace.lastTurnAt)}`
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { className: "mind-btn", onClick: () => void copy(workspace.workspaceId), type: "button", children: copied === workspace.workspaceId ? "\u5DF2\u590D\u5236" : "\u590D\u5236 ID" })
      ] }, workspace.workspaceId);
    })
  ] }) });
}
function ProposalsPage({ onPendingChange }) {
  const state = useAsync((signal) => callApi("proposals", { status: "pending", limit: 200 }, signal), []);
  const workspaceState = useAsync((signal) => callApi("workspaces", {}, signal), []);
  const [acting, setActing] = (0, import_react2.useState)(null);
  const [actionError, setActionError] = (0, import_react2.useState)(null);
  const [targets, setTargets] = (0, import_react2.useState)({});
  (0, import_react2.useEffect)(() => {
    if (state.data !== null) onPendingChange(state.data.pendingCount);
  }, [state.data, onPendingChange]);
  const act = async (proposal, action) => {
    setActing(proposal.id);
    setActionError(null);
    try {
      const workspaceId = proposal.workspaceId ?? targets[proposal.id];
      await callApi("resolveProposal", {
        id: proposal.id,
        action,
        ...workspaceId === void 0 || workspaceId === "" ? {} : { workspaceId }
      });
      state.reload();
    } catch (caught) {
      setActionError(messageOf(caught));
    } finally {
      setActing(null);
    }
  };
  if (state.loading) return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "mind-state", children: "\u52A0\u8F7D\u4E2D\u2026" });
  if (state.error !== null) return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(ErrorBox, { message: state.error, onRetry: state.reload });
  if (state.data === null || state.data.rows.length === 0) return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "mind-empty", children: "\u6CA1\u6709\u5F85\u5BA1\u63D0\u6848\u3002" });
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "mind-scroll", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "mind-page mind-page-body", children: [
    actionError === null ? null : /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(ErrorBox, { message: actionError }),
    state.data.truncated ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "mind-state", children: "\u5F85\u5BA1\u63D0\u6848\u8FC7\u591A\uFF0C\u4EC5\u663E\u793A\u524D 200 \u6761\u3002" }) : null,
    state.data.rows.map((proposal) => /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "mind-row mind-item", children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(RowIcon, { kind: "proposal" }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "mind-row-main", children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "mind-row-title", children: proposal.title }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "mind-proposal-content", children: proposal.content }),
        proposal.workspaceId === null ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "mind-proposal-target", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
          DshSelect,
          {
            label: "\u9009\u62E9\u9879\u76EE",
            onChange: (next) => setTargets((current) => ({ ...current, [proposal.id]: next })),
            options: workspaceState.data?.rows.map((workspace) => ({
              id: workspace.workspaceId,
              label: workspaceLabel(workspace.displayName)
            })) ?? [],
            value: targets[proposal.id] ?? ""
          }
        ) }) : null,
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "mind-proposal-meta", children: [
          workspaceLabel(proposal.workspaceName),
          " \xB7 ",
          dateOf(proposal.createdAt),
          proposal.sourceTurn === null ? "" : ` \xB7 ${proposal.sourceTurn}`
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "mind-proposal-actions", children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
          "button",
          {
            className: "mind-btn mind-btn-primary",
            disabled: acting === proposal.id || proposal.workspaceId === null && (targets[proposal.id] ?? "") === "",
            onClick: () => void act(proposal, "approve"),
            type: "button",
            children: "\u6279\u51C6"
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
          "button",
          {
            className: "mind-btn",
            disabled: acting === proposal.id,
            onClick: () => void act(proposal, "reject"),
            type: "button",
            children: "\u62D2\u7EDD"
          }
        )
      ] })
    ] }, proposal.id))
  ] }) });
}
function SettingsPage() {
  const state = useAsync((signal) => callApi("settings", {}, signal), []);
  const [local, setLocal] = (0, import_react2.useState)(null);
  const [saving, setSaving] = (0, import_react2.useState)(null);
  const [actionError, setActionError] = (0, import_react2.useState)(null);
  (0, import_react2.useEffect)(() => {
    if (state.data !== null) setLocal(state.data);
  }, [state.data]);
  const toggle = async (key, value) => {
    setSaving(key);
    setActionError(null);
    try {
      const updated = await callApi("updateSettings", { [key]: value });
      setLocal(updated);
    } catch (caught) {
      setActionError(messageOf(caught));
    } finally {
      setSaving(null);
    }
  };
  if (state.loading && local === null) return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "mind-state", children: "\u52A0\u8F7D\u4E2D\u2026" });
  if (state.error !== null && local === null) return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(ErrorBox, { message: state.error, onRetry: state.reload });
  if (local === null) return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "mind-empty", children: "\u6CA1\u6709\u8BBE\u7F6E\u3002" });
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "mind-scroll", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "mind-page mind-page-body", children: [
    actionError === null ? null : /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(ErrorBox, { message: actionError }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "mind-section-title", children: "\u901A\u7528" }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "mind-setting", children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "mind-setting-main", children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "mind-setting-label", children: "\u6355\u83B7" }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "mind-setting-desc", children: "\u6BCF\u8F6E\u7ED3\u675F\u540E\u81EA\u52A8\u628A\u539F\u59CB\u5BF9\u8BDD\u5199\u5165 MIND\u3002" })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
        Switch,
        {
          checked: local.captureEnabled,
          disabled: saving !== null,
          label: "\u6355\u83B7",
          onChange: (value) => void toggle("captureEnabled", value)
        }
      )
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "mind-setting", children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "mind-setting-main", children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "mind-setting-label", children: "\u6CE8\u5165" }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "mind-setting-desc", children: "\u628A\u89C4\u8303\u3001\u5F53\u524D\u8BA4\u77E5\u548C\u65F6\u95F4\u8F74\u6CE8\u5165\u6A21\u578B\u4E0A\u4E0B\u6587\u3002" })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
        Switch,
        {
          checked: local.injectEnabled,
          disabled: saving !== null,
          label: "\u6CE8\u5165",
          onChange: (value) => void toggle("injectEnabled", value)
        }
      )
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "mind-section-title", children: "\u5B58\u50A8" }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "mind-setting", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "mind-setting-main", children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "mind-setting-label", children: "MIND \u6839\u76EE\u5F55" }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "mind-setting-value mind-mono", children: local.mindRoot })
    ] }) }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "mind-setting", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "mind-setting-main", children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "mind-setting-label", children: "\u89C4\u8303\u76EE\u5F55" }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "mind-setting-value mind-mono", children: local.standardsDir })
    ] }) }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "mind-section-title", children: "\u7EDF\u8BA1" }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "mind-setting", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "mind-setting-main", children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "mind-setting-label", children: [
        local.turnCount,
        " turns \xB7 ",
        local.pendingProposals,
        " \u6761\u5F85\u5BA1\u63D0\u6848"
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "mind-setting-desc", children: [
        "\u65E5\u754C ",
        String(Math.floor(local.dayBoundaryMinutes / 60)).padStart(2, "0"),
        ":",
        String(local.dayBoundaryMinutes % 60).padStart(2, "0")
      ] })
    ] }) })
  ] }) });
}
function ReportsPage() {
  const workspaces = useAsync(
    (signal) => callApi("workspaces", { limit: 500 }, signal),
    []
  );
  const [workspaceId, setWorkspaceId] = (0, import_react2.useState)("");
  const [selected, setSelected] = (0, import_react2.useState)(null);
  (0, import_react2.useEffect)(() => {
    setSelected(null);
  }, [workspaceId]);
  const periods = useAsync(
    (signal) => workspaceId === "" ? Promise.resolve(null) : callApi("reports", { workspaceId, kind: "month", limit: 200 }, signal),
    [workspaceId]
  );
  const report = useAsync(
    (signal) => selected === null ? Promise.resolve(null) : callApi("report", { path: selected.reportPath }, signal),
    [selected]
  );
  (0, import_react2.useEffect)(() => {
    if (selected === null && periods.data !== null && periods.data.rows.length > 0) {
      setSelected(periods.data.rows[0] ?? null);
    }
  }, [periods.data, selected]);
  const options = workspaceTreeOptions(workspaces.data?.rows ?? []);
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "mind-main", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "mind-list-wrap", children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "mind-timeline-bar", children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "mind-timeline-bar-label", children: "\u5DE5\u4F5C\u533A" }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
        DshSelect,
        {
          label: "\u5DE5\u4F5C\u533A",
          onChange: setWorkspaceId,
          options,
          value: workspaceId
        }
      )
    ] }),
    workspaceId === "" ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "mind-empty", children: "\u5148\u9009\u62E9\u4E00\u4E2A\u5DE5\u4F5C\u533A\uFF0C\u518D\u67E5\u770B\u6708\u62A5\u3002" }) : periods.loading ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "mind-state", children: "\u52A0\u8F7D\u62A5\u544A\u2026" }) : periods.error !== null ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(ErrorBox, { message: periods.error, onRetry: periods.reload }) : periods.data === null || periods.data.rows.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "mind-empty", children: "\u8FD9\u4E2A\u5DE5\u4F5C\u533A\u8FD8\u6CA1\u6709\u6708\u62A5\u3002" }) : /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "mind-report-layout", children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "mind-report-list", children: periods.data.rows.map((period) => /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
        "button",
        {
          className: "mind-report-list-item",
          "data-active": selected?.period === period.period,
          onClick: () => setSelected(period),
          type: "button",
          children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "mind-report-period", children: period.period }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "mind-report-sub", children: period.title })
          ]
        },
        period.period
      )) }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "mind-report-view", children: selected === null ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "mind-empty", children: "\u9009\u62E9\u4E00\u4E2A\u6708\u4EFD\u67E5\u770B\u6708\u62A5\u3002" }) : report.loading ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "mind-state", children: "\u52A0\u8F7D\u4E2D\u2026" }) : report.error !== null ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(ErrorBox, { message: report.error, onRetry: report.reload }) : report.data === null ? null : /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(MarkdownPreview, { text: report.data.content }) })
    ] })
  ] }) });
}
var TABS = [
  { id: "timeline", label: "\u65F6\u95F4\u7EBF" },
  { id: "reports", label: "\u62A5\u544A" },
  { id: "current", label: "\u89C4\u5219" },
  { id: "workspaces", label: "\u5DE5\u4F5C\u533A" },
  { id: "proposals", label: "\u63D0\u6848" },
  { id: "settings", label: "\u8BBE\u7F6E" }
];
function MindApp() {
  const [tab, setTab] = (0, import_react2.useState)("timeline");
  const [pending, setPending] = (0, import_react2.useState)(0);
  const [gate, setGate] = (0, import_react2.useState)("loading");
  (0, import_react2.useEffect)(() => {
    let active = true;
    callApi("settings", {}).then((settings) => {
      if (active) setGate(settings.uiEnabled ? "ready" : "disabled");
    }).catch(() => {
      if (active) setGate("ready");
    });
    return () => {
      active = false;
    };
  }, []);
  (0, import_react2.useEffect)(() => {
    if (gate !== "ready") return;
    let active = true;
    callApi("proposals", { status: "pending", limit: 1 }).then((page) => {
      if (active) setPending(page.pendingCount);
    }).catch(() => {
    });
    return () => {
      active = false;
    };
  }, [gate]);
  if (gate === "loading") {
    return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "mind-root", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "mind-page", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "mind-state", children: "\u52A0\u8F7D\u4E2D\u2026" }) }) });
  }
  if (gate === "disabled") {
    return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "mind-root", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "mind-page", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "mind-empty", children: "\u8BB0\u5FC6 UI \u5DF2\u5728\u914D\u7F6E\u4E2D\u505C\u7528\uFF08uiEnabled=false\uFF09\u3002" }) }) });
  }
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "mind-root", children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "mind-head", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "mind-page", children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "mind-page-head", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "mind-title", children: "\u8BB0\u5FC6" }) }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "mind-tabs", children: TABS.map((item) => /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
        "button",
        {
          className: "mind-tab",
          "data-active": tab === item.id,
          onClick: () => setTab(item.id),
          type: "button",
          children: [
            item.label,
            item.id === "proposals" && pending > 0 ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "mind-badge", children: pending }) : null
          ]
        },
        item.id
      )) })
    ] }) }),
    tab === "timeline" ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Timeline, {}) : null,
    tab === "reports" ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(ReportsPage, {}) : null,
    tab === "current" ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(CurrentPage, {}) : null,
    tab === "workspaces" ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(WorkspacesPage, {}) : null,
    tab === "proposals" ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(ProposalsPage, { onPendingChange: setPending }) : null,
    tab === "settings" ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(SettingsPage, {}) : null
  ] });
}

// src/client/index.tsx
var import_jsx_runtime3 = require("react/jsx-runtime");
var inject = ["slots"];
function apply(ctx) {
  ctx.effect(() => injectStyles(), "mind-dsh: styles");
  ctx.slots.inject(
    "main",
    () => ctx.slots.register({ name: "main", key: "mind" }, MindApp)
  );
  ctx.slots.inject(
    "sidebar.panellist",
    () => ctx.slots.register(
      { name: "sidebar.panellist", id: "mind", order: 30, label: "\u8BB0\u5FC6" },
      MindIcon
    )
  );
}
function MindIcon({ size = 16 }) {
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(
    "svg",
    {
      "aria-hidden": "true",
      fill: "none",
      height: size,
      stroke: "currentColor",
      strokeLinecap: "round",
      strokeLinejoin: "round",
      strokeWidth: 1.5,
      viewBox: "0 0 24 24",
      width: size,
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("path", { d: "M5 4.5A1.5 1.5 0 0 1 6.5 3h9A1.5 1.5 0 0 1 17 4.5V21l-6-3-6 3V4.5Z" }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("path", { d: "M9 8h4" }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("path", { d: "M9 11.5h4" })
      ]
    }
  );
}

    return module.exports;
  }
});
