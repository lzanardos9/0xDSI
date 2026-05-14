# Component Documentation Template

Use this template for every reusable component in `src/components/`. Copy the skeleton, fill every section, and keep it co-located with the component (`<Component>.md` next to `<Component>.tsx`).

---

## 1. Header

```
# <ComponentName>

> One-sentence purpose. What problem does it solve? Who uses it?

- **Path**: `src/components/<path>/<ComponentName>.tsx`
- **Status**: stable | beta | deprecated
- **Owners**: <team or @handle>
- **Last reviewed**: YYYY-MM-DD
```

## 2. Purpose & When to Use

- **Use when** — list 2–4 concrete scenarios.
- **Do NOT use when** — list anti-patterns and the component to use instead.
- **Design intent** — what UX problem this solves; link to Figma frame if any.

## 3. Anatomy

ASCII or annotated screenshot of the parts the component exposes (slot, header, body, footer, trigger, icon, etc.).

## 4. Props / Parameters

| Prop | Type | Required | Default | Description |
|---|---|---|---|---|
| `prop` | `string` | yes | — | What it controls |

Include type definitions for any non-primitive props. Note which props are controlled vs. uncontrolled.

## 5. Usage Examples

Provide at least three:
1. **Minimal** — smallest valid use.
2. **Typical** — production-realistic.
3. **Advanced** — async data, controlled state, composed with other components.

Each example must compile against the current component API.

## 6. State & Data

- Internal state shape.
- External data dependencies (Supabase tables, hooks, contexts).
- Realtime channels subscribed to (if any).
- Error / loading / empty states and how each renders.

## 7. Accessibility

- **Role / ARIA** — semantic role(s) used and any `aria-*` attributes set.
- **Keyboard** — every interactive shortcut (Tab, Shift+Tab, Enter, Space, Esc, Arrow keys).
- **Focus management** — where focus lands on open/close, focus trap rules.
- **Screen reader** — announcement strings, live regions, hidden labels.
- **Color contrast** — minimum 4.5:1 for body, 3:1 for large text and UI controls. Note both light and dark themes.
- **Reduced motion** — what changes when `prefers-reduced-motion: reduce`.

## 8. Theming & Tokens

- Colors, spacing (8 px scale), radius, shadow tokens used.
- Variants exposed (size, intent, density).
- How to override via Tailwind class merging.

## 9. Edge Cases

Bullet every known edge case and the expected behavior:
- Empty data, single item, very long lists.
- Long text overflow / truncation rules.
- Missing optional props.
- Network failure, slow network, offline.
- Concurrent updates / stale data.
- Permission denied (RLS) responses.
- Mobile viewport (< 640 px), touch input.
- RTL languages.

## 10. Performance

- Render cost (memoization, virtualization).
- Bundle impact (dynamic import? heavy deps?).
- Known re-render hotspots and how to avoid them.

## 11. Testing

- Unit test path.
- Storybook / playground link.
- Manual QA checklist (golden path + 3 edge cases).

## 12. Migration / Changelog

- Breaking changes, deprecations, replacement guidance.

---

# Sample: `<Modal>` Component Documentation

# Modal

> Accessible, focus-trapped overlay used to surface focused tasks (case edit, response approval, confirmation) without leaving the current view.

- **Path**: `src/components/ui/Modal.tsx`
- **Status**: stable
- **Owners**: SOC Platform team
- **Last reviewed**: 2026-05-14

## Purpose & When to Use

**Use when**
- A user must make a focused decision before continuing (e.g., approve a response action).
- An edit form is short and modal interruption is acceptable (case status change, IOC tag).
- A destructive action requires explicit confirmation.

**Do NOT use when**
- The task takes more than ~30 seconds — use a side drawer or full page.
- The content is informational only — use a `Toast` or inline `Alert`.
- The user must reference the underlying page while completing the task — use a side panel.

**Design intent** — preserves SOC analyst context (no route change), enforces a single-responsibility view, escapes cleanly via Esc.

## Anatomy

```
+----------------------------------------+
| [icon] Title                  [close]  | <- Header (sticky)
+----------------------------------------+
|                                        |
|  Body (scrollable)                     |
|                                        |
+----------------------------------------+
| [secondary]            [primary]       | <- Footer (sticky)
+----------------------------------------+
        ^ overlay (rgba 0,0,0,.6)
```

## Props

| Prop | Type | Required | Default | Description |
|---|---|---|---|---|
| `open` | `boolean` | yes | — | Controlled visibility. |
| `onClose` | `() => void` | yes | — | Called for backdrop click, Esc, or close button. |
| `title` | `string` | yes | — | Header title; also serves as `aria-labelledby` source. |
| `description` | `string` | no | — | Secondary line under title; used as `aria-describedby`. |
| `size` | `'sm' \| 'md' \| 'lg' \| 'xl'` | no | `'md'` | Width: 400 / 560 / 720 / 960 px. |
| `icon` | `LucideIcon` | no | — | Title icon. |
| `tone` | `'neutral' \| 'success' \| 'warning' \| 'danger'` | no | `'neutral'` | Header accent + icon color. |
| `dismissOnBackdrop` | `boolean` | no | `true` | If `false`, backdrop click is ignored (use for destructive flows). |
| `dismissOnEsc` | `boolean` | no | `true` | |
| `initialFocusRef` | `RefObject<HTMLElement>` | no | first focusable | Focus target on open. |
| `footer` | `ReactNode` | no | — | Sticky footer slot for actions. |
| `children` | `ReactNode` | yes | — | Body. |

## Usage Examples

**Minimal**
```tsx
<Modal open={open} onClose={() => setOpen(false)} title="Confirm">
  Are you sure?
</Modal>
```

**Typical — case status change with Supabase write**
```tsx
const { data: { user } } = await supabase.auth.getUser();

<Modal
  open={editing}
  onClose={() => setEditing(false)}
  title="Update case status"
  description={`Case ${caseId}`}
  icon={ClipboardCheck}
  tone="neutral"
  footer={
    <>
      <Button variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
      <Button
        loading={saving}
        onClick={async () => {
          setSaving(true);
          const { error } = await supabase
            .from('cases')
            .update({ status, updated_by: user!.id })
            .eq('id', caseId);
          setSaving(false);
          if (!error) setEditing(false);
        }}
      >
        Save
      </Button>
    </>
  }
>
  <StatusSelect value={status} onChange={setStatus} />
</Modal>
```

**Advanced — destructive, no backdrop dismiss, focus on confirm input**
```tsx
const confirmRef = useRef<HTMLInputElement>(null);

<Modal
  open={open}
  onClose={() => setOpen(false)}
  title="Isolate host"
  description="Type the hostname to confirm"
  tone="danger"
  icon={ShieldAlert}
  dismissOnBackdrop={false}
  initialFocusRef={confirmRef}
  footer={
    <Button
      tone="danger"
      disabled={confirm !== host.name}
      onClick={runIsolate}
    >
      Isolate
    </Button>
  }
>
  <input ref={confirmRef} value={confirm} onChange={(e) => setConfirm(e.target.value)} />
</Modal>
```

## State & Data

- Stateless re-mount on `open=true`. Body scroll is locked while open.
- No direct Supabase reads; consumers pass data in. Writes happen in consumer handlers.
- Realtime: not subscribed. If a realtime row update could change the meaning of the modal content, refresh in the consumer and re-open with new props.

## Accessibility

- **Role**: `dialog` with `aria-modal="true"`.
- **Labelling**: `aria-labelledby` → title id, `aria-describedby` → description id (when present).
- **Keyboard**:
  - `Esc` closes (unless `dismissOnEsc=false`).
  - `Tab` / `Shift+Tab` cycles within the modal (focus trap).
  - `Enter` activates the focused button.
- **Focus management**:
  - On open: focus the `initialFocusRef`, else first focusable, else the close button.
  - On close: returns focus to the trigger element that opened the modal.
- **Screen reader**: portal renders into `#modal-root`; the rest of the app gets `aria-hidden="true"` while open.
- **Color contrast**: header text and icons meet 4.5:1 against header background in light + dark themes. Danger tone uses `--red-600` on `--red-50` (light) / `--red-200` on `--red-950` (dark).
- **Reduced motion**: skip enter/exit transitions when `prefers-reduced-motion: reduce`; instant fade only.

## Theming & Tokens

- Sizes follow 8 px spacing.
- Radius: `rounded-2xl`.
- Shadow: `shadow-2xl`.
- Tone colors map to the global ramp (`success`, `warning`, `danger`, `neutral`); never hard-code hex.

## Edge Cases

- **Open while another modal is open** — second modal stacks; only the topmost handles Esc.
- **Body taller than viewport** — body is the only scroll container; header/footer stay sticky.
- **`open` flips false during async save** — pending write must still complete; show toast on resolve.
- **Mobile (< 640 px)** — modal becomes a bottom sheet, full width, max-height 90vh.
- **Title or description missing** — fallback announcement uses the icon's name + "dialog".
- **RTL** — close button mirrors to the start side; arrow icons flip via `[dir=rtl]` rule.
- **Permission denied (RLS) on save** — consumer surfaces inline error inside body; modal stays open.
- **Network offline** — primary button stays disabled; show inline `Alert` "You are offline".
- **Trigger unmounts while open** — focus on close falls back to `document.body` after a tick.

## Performance

- Renders nothing when `open=false` (no portal).
- Body content is rendered eagerly when open; pass heavy children behind `Suspense` if needed.
- Bundle: ~2.1 KB gzip.

## Testing

- Unit: `src/components/ui/Modal.test.tsx` — open/close, focus trap, Esc, backdrop, RTL.
- Storybook: `Modal.stories.tsx` — minimal, danger, large, no-backdrop, mobile.
- Manual QA: open from a button, Tab through, Esc closes, save → toast, screen reader announces title.

## Changelog

- v2.0 — added `tone`, `dismissOnBackdrop`, `initialFocusRef`. Removed legacy `closable` prop (replaced by `dismissOnEsc` + `dismissOnBackdrop`).
- v1.3 — bottom-sheet variant on mobile.
- v1.0 — initial.
