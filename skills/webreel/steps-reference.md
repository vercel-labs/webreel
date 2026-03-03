# Step types reference

Every step object requires an `action` field. Most steps also accept these optional fields:

- `label` (string) - display label for the keystroke HUD overlay
- `delay` (number) - milliseconds to wait after the step completes
- `description` (string) - human-readable note (not used at runtime)

## Element targeting

Several steps target DOM elements via these fields:

- `text` (string) - match by visible text content
- `selector` (string) - match by CSS selector
- `within` (string) - CSS selector to scope the search to a parent element

Use `text` or `selector`, not both. `within` is always optional.

---

## pause

Wait for a fixed duration.

| Field    | Type      | Required | Description              |
| -------- | --------- | -------- | ------------------------ |
| `action` | `"pause"` | yes      |                          |
| `ms`     | number    | yes      | Duration in milliseconds |

```json
{ "action": "pause", "ms": 500 }
```

## click

Click a DOM element.

| Field       | Type      | Required | Description                                                   |
| ----------- | --------- | -------- | ------------------------------------------------------------- |
| `action`    | `"click"` | yes      |                                                               |
| `text`      | string    | no       | Match element by visible text                                 |
| `selector`  | string    | no       | Match element by CSS selector                                 |
| `within`    | string    | no       | Scope search to a parent selector                             |
| `modifiers` | string[]  | no       | Modifier keys held during click (e.g. `["shift"]`, `["cmd"]`) |

Provide `text` or `selector` (at least one).

```json
{ "action": "click", "text": "Submit" }
{ "action": "click", "selector": "#save-btn", "delay": 500 }
{ "action": "click", "text": "Item 3", "modifiers": ["shift"] }
{ "action": "click", "text": "Delete", "within": ".modal" }
```

## type

Type text into an input element. If no target is specified, types into the currently focused element.

| Field       | Type     | Required | Description                         |
| ----------- | -------- | -------- | ----------------------------------- |
| `action`    | `"type"` | yes      |                                     |
| `text`      | string   | yes      | Text to type                        |
| `selector`  | string   | no       | Target input by CSS selector        |
| `within`    | string   | no       | Scope search to a parent selector   |
| `charDelay` | number   | no       | Milliseconds between each character |

```json
{ "action": "type", "text": "user@example.com", "selector": "#email", "charDelay": 40 }
```

## key

Press a keyboard shortcut or key combination.

| Field    | Type                    | Required | Description                      |
| -------- | ----------------------- | -------- | -------------------------------- |
| `action` | `"key"`                 | yes      |                                  |
| `key`    | string                  | yes      | Key or combo string              |
| `target` | string or ElementTarget | no       | Element to focus before pressing |

Key combo syntax uses `+` to join modifiers: `"cmd+s"`, `"ctrl+shift+p"`, `"alt+tab"`, `"Enter"`, `"Escape"`, `"ArrowDown"`.

Modifier names: `cmd`, `ctrl`, `shift`, `alt`, `meta`.

```json
{ "action": "key", "key": "cmd+s" }
{ "action": "key", "key": "Enter", "delay": 500 }
{ "action": "key", "key": "ctrl+shift+p", "label": "Command Palette" }
```

## drag

Drag from one element to another.

| Field    | Type          | Required | Description                                           |
| -------- | ------------- | -------- | ----------------------------------------------------- |
| `action` | `"drag"`      | yes      |                                                       |
| `from`   | ElementTarget | yes      | Source element (`{ text?, selector?, within? }`)      |
| `to`     | ElementTarget | yes      | Destination element (`{ text?, selector?, within? }`) |

```json
{
  "action": "drag",
  "from": { "text": "Task A", "within": ".column-todo" },
  "to": { "selector": ".card-list", "within": ".column-done" },
  "delay": 600
}
```

## scroll

Scroll the page or a specific element.

| Field      | Type       | Required | Description                            |
| ---------- | ---------- | -------- | -------------------------------------- |
| `action`   | `"scroll"` | yes      |                                        |
| `x`        | number     | no       | Horizontal scroll delta in pixels      |
| `y`        | number     | no       | Vertical scroll delta in pixels        |
| `text`     | string     | no       | Scroll element matched by text         |
| `selector` | string     | no       | Scroll element matched by CSS selector |
| `within`   | string     | no       | Scope search to a parent selector      |

If no element target is given, scrolls the page.

```json
{ "action": "scroll", "y": 400 }
{ "action": "scroll", "y": 300, "selector": ".scrollable-panel" }
```

## wait

Wait for an element to appear in the DOM.

| Field      | Type     | Required | Description                              |
| ---------- | -------- | -------- | ---------------------------------------- |
| `action`   | `"wait"` | yes      |                                          |
| `selector` | string   | no       | Wait for element matching CSS selector   |
| `text`     | string   | no       | Wait for element containing text         |
| `within`   | string   | no       | Scope search to a parent selector        |
| `timeout`  | number   | no       | Maximum wait time in ms (default varies) |

Provide `selector` or `text` (at least one).

```json
{ "action": "wait", "selector": ".results-loaded", "timeout": 5000 }
{ "action": "wait", "text": "Success" }
```

## moveTo

Move the cursor to an element without clicking.

| Field      | Type       | Required | Description                       |
| ---------- | ---------- | -------- | --------------------------------- |
| `action`   | `"moveTo"` | yes      |                                   |
| `text`     | string     | no       | Match element by visible text     |
| `selector` | string     | no       | Match element by CSS selector     |
| `within`   | string     | no       | Scope search to a parent selector |

```json
{ "action": "moveTo", "text": "Settings", "delay": 400 }
```

## hover

Hover over an element (triggers CSS :hover and mouseenter events).

| Field      | Type      | Required | Description                       |
| ---------- | --------- | -------- | --------------------------------- |
| `action`   | `"hover"` | yes      |                                   |
| `text`     | string    | no       | Match element by visible text     |
| `selector` | string    | no       | Match element by CSS selector     |
| `within`   | string    | no       | Scope search to a parent selector |

```json
{ "action": "hover", "selector": ".tooltip-trigger" }
```

## navigate

Navigate the browser to a new URL.

| Field    | Type         | Required | Description                                            |
| -------- | ------------ | -------- | ------------------------------------------------------ |
| `action` | `"navigate"` | yes      |                                                        |
| `url`    | string       | yes      | URL to navigate to (absolute or relative to `baseUrl`) |

```json
{ "action": "navigate", "url": "https://example.com/dashboard" }
{ "action": "navigate", "url": "/settings" }
```

## select

Select a value in a `<select>` dropdown.

| Field      | Type       | Required | Description                          |
| ---------- | ---------- | -------- | ------------------------------------ |
| `action`   | `"select"` | yes      |                                      |
| `text`     | string     | no       | Match select element by visible text |
| `selector` | string     | no       | Match select element by CSS selector |
| `within`   | string     | no       | Scope search to a parent selector    |
| `value`    | string     | yes      | The option value to select           |

```json
{ "action": "select", "selector": "#country", "value": "us" }
```

## screenshot

Capture a PNG screenshot of the current viewport.

| Field    | Type           | Required | Description                  |
| -------- | -------------- | -------- | ---------------------------- |
| `action` | `"screenshot"` | yes      |                              |
| `output` | string         | yes      | File path for the PNG output |

```json
{ "action": "screenshot", "output": "screenshots/final-state.png" }
```
