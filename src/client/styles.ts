const STYLE_ID = 'mind-dsh-styles'

/*
 * All colors come from DSH alias tokens so the panel follows the active
 * light/dark theme. Fallbacks are the light-theme values.
 */
const CSS = `
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
.mind-scroll { flex: 1; min-height: 0; overflow: auto; position: relative; }
/* Horizontal room for the -8px card highlights; without it overflow:auto clips
   the inset and the icon appears flush with the highlight edge. */
.mind-timeline-scroll { padding: 0 8px; }
.mind-page-body { padding-top: 14px; padding-bottom: 80px; }
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
`

export function injectStyles(): () => void {
  if (typeof document === 'undefined') return () => {}
  const existing = document.getElementById(STYLE_ID)
  if (existing !== null) {
    // A hot reload swaps the plugin module but keeps the page DOM. Refresh the
    // rule text so a CSS change is never shadowed by the previous stylesheet.
    existing.textContent = CSS
    return () => {
      if (existing.textContent === CSS) existing.remove()
    }
  }
  const element = document.createElement('style')
  element.id = STYLE_ID
  element.textContent = CSS
  document.head.appendChild(element)
  return () => {
    element.remove()
  }
}
