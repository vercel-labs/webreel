# webreel config examples

## Minimal hello-world

The simplest possible config. Navigates to a page, waits for it to load, then clicks a link.

```json
{
  "$schema": "https://webreel.dev/schema/v1.json",
  "videos": {
    "hello-world": {
      "url": "./web/index.html",
      "viewport": { "width": 1920, "height": 1080 },
      "zoom": 2,
      "waitFor": ".cta",
      "steps": [
        { "action": "pause", "ms": 500 },
        { "action": "click", "selector": "a.cta", "delay": 1000 }
      ]
    }
  }
}
```

## Form filling

Type into inputs with character-by-character animation, then click submit.

```json
{
  "$schema": "https://webreel.dev/schema/v1.json",
  "videos": {
    "form-filling": {
      "url": "./web/index.html",
      "viewport": { "width": 1920, "height": 1080 },
      "zoom": 2,
      "waitFor": "#email",
      "defaultDelay": 300,
      "steps": [
        { "action": "pause", "ms": 500 },
        {
          "action": "type",
          "text": "user@example.com",
          "selector": "#email",
          "charDelay": 40
        },
        {
          "action": "type",
          "text": "supersecret123",
          "selector": "#password",
          "charDelay": 30,
          "delay": 500
        },
        { "action": "click", "text": "Sign In" },
        { "action": "pause", "ms": 2500 }
      ]
    }
  }
}
```

## Drag and drop

Move items between containers on a kanban board.

```json
{
  "$schema": "https://webreel.dev/schema/v1.json",
  "videos": {
    "drag-and-drop": {
      "url": "./web/index.html",
      "viewport": { "width": 1920, "height": 1080 },
      "zoom": 2,
      "waitFor": ".board",
      "steps": [
        { "action": "pause", "ms": 500 },
        { "action": "moveTo", "text": "Write unit tests", "delay": 400 },
        {
          "action": "drag",
          "from": { "text": "Write unit tests", "within": ".column-todo" },
          "to": { "selector": ".card-list", "within": ".column-in-progress" },
          "delay": 600
        },
        {
          "action": "drag",
          "from": { "text": "Build API endpoints", "within": ".column-in-progress" },
          "to": { "selector": ".card-list", "within": ".column-done" },
          "delay": 1000
        }
      ]
    }
  }
}
```

## Keyboard shortcuts

Demonstrate key combos in a text editor.

```json
{
  "$schema": "https://webreel.dev/schema/v1.json",
  "videos": {
    "keyboard-shortcuts": {
      "url": "./web/index.html",
      "viewport": { "width": 1920, "height": 1080 },
      "zoom": 2,
      "waitFor": ".editor",
      "defaultDelay": 600,
      "steps": [
        { "action": "pause", "ms": 500 },
        { "action": "click", "selector": ".editor" },
        { "action": "key", "key": "cmd+a" },
        { "action": "key", "key": "cmd+b", "delay": 800 },
        { "action": "click", "selector": ".editor p:first-of-type" },
        { "action": "key", "key": "cmd+s", "delay": 1200 },
        { "action": "key", "key": "cmd+k", "delay": 1000 },
        { "action": "key", "key": "Escape", "delay": 800 },
        { "action": "pause", "ms": 500 }
      ]
    }
  }
}
```

## Custom theme

Override the cursor image and keystroke HUD appearance.

```json
{
  "$schema": "https://webreel.dev/schema/v1.json",
  "theme": {
    "cursor": {
      "image": "./cursor.svg",
      "size": 32,
      "hotspot": "center"
    },
    "hud": {
      "background": "rgba(30, 41, 59, 0.85)",
      "color": "#e2e8f0",
      "fontSize": 48,
      "fontFamily": "\"SF Mono\", \"Fira Code\", monospace",
      "borderRadius": 12,
      "position": "top"
    }
  },
  "videos": {
    "custom-theme": {
      "url": "./web/index.html",
      "viewport": { "width": 1920, "height": 1080 },
      "zoom": 2,
      "waitFor": ".editor",
      "defaultDelay": 400,
      "steps": [
        { "action": "pause", "ms": 500 },
        { "action": "click", "text": "config.ts" },
        { "action": "click", "text": "utils.ts", "delay": 800 },
        { "action": "key", "key": "cmd+s", "delay": 1000 },
        { "action": "pause", "ms": 1500 }
      ]
    }
  }
}
```

## Multiple videos in one config

Define several recordings that share top-level settings.

```json
{
  "$schema": "https://webreel.dev/schema/v1.json",
  "viewport": { "width": 1920, "height": 1080 },
  "defaultDelay": 500,
  "videos": {
    "homepage": {
      "url": "./web/index.html",
      "zoom": 2,
      "waitFor": ".hero",
      "steps": [
        { "action": "pause", "ms": 500 },
        { "action": "click", "text": "Get Started", "delay": 1000 }
      ]
    },
    "features": {
      "url": "./web/index.html",
      "zoom": 2,
      "waitFor": ".features",
      "steps": [
        { "action": "pause", "ms": 500 },
        { "action": "scroll", "y": 400, "delay": 600 },
        { "action": "click", "text": "Fast Deploys", "delay": 1000 }
      ]
    },
    "pricing": {
      "url": "./web/index.html",
      "zoom": 2,
      "waitFor": ".pricing",
      "steps": [
        { "action": "pause", "ms": 500 },
        { "action": "scroll", "y": 600 },
        { "action": "click", "text": "Subscribe", "delay": 1000 }
      ]
    }
  }
}
```

Record a specific subset: `webreel record homepage pricing`.

## Shared steps via include

Factor reusable steps into a separate file and include them.

**steps/setup.json:**

```json
{
  "steps": [
    { "action": "wait", "selector": ".cookie-banner", "timeout": 5000 },
    { "action": "click", "selector": ".accept-btn", "delay": 300 }
  ]
}
```

**webreel.config.json:**

```json
{
  "$schema": "https://webreel.dev/schema/v1.json",
  "include": ["./steps/setup.json"],
  "videos": {
    "shared-steps": {
      "url": "./web/index.html",
      "viewport": { "width": 1920, "height": 1080 },
      "zoom": 2,
      "waitFor": ".page",
      "steps": [
        { "action": "click", "text": "Learn more about our platform", "delay": 1000 }
      ]
    }
  }
}
```

The included steps run before the video's own steps.

## Mobile viewport

Record a mobile-sized viewport with a centered cursor hotspot.

```json
{
  "$schema": "https://webreel.dev/schema/v1.json",
  "videos": {
    "mobile-viewport": {
      "url": "./web/index.html",
      "viewport": { "width": 390, "height": 844 },
      "zoom": 2,
      "waitFor": ".content",
      "theme": {
        "cursor": { "hotspot": "center" }
      },
      "defaultDelay": 600,
      "steps": [
        { "action": "pause", "ms": 500 },
        { "action": "click", "selector": ".menu-btn" },
        { "action": "pause", "ms": 1000 },
        { "action": "click", "selector": "#menuOverlay" },
        { "action": "scroll", "y": 300, "delay": 800 },
        { "action": "pause", "ms": 500 }
      ]
    }
  }
}
```

## GIF output

Set the `output` field to a `.gif` extension.

```json
{
  "$schema": "https://webreel.dev/schema/v1.json",
  "videos": {
    "gif-output": {
      "url": "./web/index.html",
      "viewport": { "width": 1920, "height": 1080 },
      "zoom": 2,
      "output": "gif-output.gif",
      "waitFor": ".primary",
      "steps": [
        { "action": "pause", "ms": 500 },
        { "action": "click", "selector": "a.primary", "delay": 1000 }
      ]
    }
  }
}
```

## WebM output

Set the `output` field to a `.webm` extension.

```json
{
  "$schema": "https://webreel.dev/schema/v1.json",
  "videos": {
    "webm-output": {
      "url": "./web/index.html",
      "viewport": { "width": 1920, "height": 1080 },
      "zoom": 2,
      "output": "webm-output.webm",
      "waitFor": ".chart",
      "steps": [
        { "action": "pause", "ms": 500 },
        { "action": "click", "text": "View All Reports", "delay": 1000 }
      ]
    }
  }
}
```
