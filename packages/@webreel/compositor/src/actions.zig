const std = @import("std");
const cdp = @import("cdp.zig");
const cursor_motion = @import("cursor_motion.zig");
const timeline_mod = @import("timeline.zig");

pub const OFFSCREEN_MARGIN: f64 = 40.0;
pub const DEFAULT_VIEWPORT_SIZE: u32 = 1080;

pub const RecordingContext = struct {
    mode: enum { record, preview } = .preview,
    timeline: ?*timeline_mod.Timeline = null,
    cursor_x: f64 = -OFFSCREEN_MARGIN,
    cursor_y: f64 = -OFFSCREEN_MARGIN,
    click_dwell: ?f64 = null,
    allocator: std.mem.Allocator,

    pub fn init(allocator: std.mem.Allocator) RecordingContext {
        return .{ .allocator = allocator };
    }

    pub fn isRecording(self: *const RecordingContext) bool {
        return self.mode == .record and self.timeline != null;
    }

    pub fn setCursorPosition(self: *RecordingContext, x: f64, y: f64) void {
        self.cursor_x = x;
        self.cursor_y = y;
    }

    pub fn getClickDwellMs(self: *const RecordingContext) f64 {
        if (self.click_dwell) |d| return d;
        return 80.0 + prng() * 100.0;
    }

    pub fn markEvent(self: *RecordingContext, event_type: timeline_mod.EventType) void {
        if (self.timeline) |tl| {
            tl.addEvent(event_type);
        }
    }

    pub fn resetCursorPosition(self: *RecordingContext, css_width: ?u32, css_height: ?u32) void {
        const w: f64 = @floatFromInt(css_width orelse DEFAULT_VIEWPORT_SIZE);
        const h: f64 = @floatFromInt(css_height orelse DEFAULT_VIEWPORT_SIZE);
        const edge = @as(u2, @intFromFloat(@mod(prng() * 4.0, 4.0)));
        const along = 0.2 + prng() * 0.6;
        switch (edge) {
            0 => {
                self.cursor_x = along * w;
                self.cursor_y = -OFFSCREEN_MARGIN;
            },
            1 => {
                self.cursor_x = w + OFFSCREEN_MARGIN;
                self.cursor_y = along * h;
            },
            2 => {
                self.cursor_x = along * w;
                self.cursor_y = h + OFFSCREEN_MARGIN;
            },
            3 => {
                self.cursor_x = -OFFSCREEN_MARGIN;
                self.cursor_y = along * h;
            },
        }
    }
};

pub fn sleepMs(ms: u64) void {
    std.Thread.sleep(ms * std.time.ns_per_ms);
}

pub fn sleepMsF(ms: f64) void {
    if (ms <= 0) return;
    const ns: u64 = @intFromFloat(ms * @as(f64, @floatFromInt(std.time.ns_per_ms)));
    std.Thread.sleep(ns);
}

pub fn navigateTo(client: *cdp.CdpClient, url: []const u8) !void {
    client.navigate(url) catch return error.NavigateFailed;
    client.waitForLoad() catch return error.WaitForLoadFailed;
}

pub fn waitForSelector(client: *cdp.CdpClient, selector: []const u8, timeout_ms: u64) !void {
    var buf: std.ArrayList(u8) = .empty;
    defer buf.deinit(client.allocator);

    var bw = buf.writer(client.allocator);
    try bw.writeAll("!!document.querySelector(");
    try writeJsString(bw, selector);
    try bw.writeAll(")");

    const start = std.time.milliTimestamp();
    while (true) {
        const val = client.evaluateValue(buf.items) catch null;
        if (val) |v| {
            switch (v) {
                .boolean => |b| {
                    if (b) return;
                },
                else => {},
            }
        }
        if (@as(u64, @intCast(std.time.milliTimestamp() - start)) >= timeout_ms) {
            return error.SelectorTimeout;
        }
        sleepMs(200);
    }
}

pub fn waitForText(client: *cdp.CdpClient, text: []const u8, within: ?[]const u8, timeout_ms: u64) !void {
    const start = std.time.milliTimestamp();
    while (true) {
        const box = try findElementByText(client, text, within);
        if (box != null) return;
        if (@as(u64, @intCast(std.time.milliTimestamp() - start)) >= timeout_ms) {
            return error.TextTimeout;
        }
        sleepMs(200);
    }
}

pub const BoundingBox = struct {
    x: f64,
    y: f64,
    width: f64,
    height: f64,
};

pub fn findElementByText(client: *cdp.CdpClient, text: []const u8, within: ?[]const u8) !?BoundingBox {
    var expr: std.ArrayList(u8) = .empty;
    defer expr.deinit(client.allocator);

    var w = expr.writer(client.allocator);
    try w.writeAll("(() => { const scope = ");
    if (within) |ws| {
        try w.writeAll("document.querySelector(");
        try writeJsString(w, ws);
        try w.writeAll(")");
    } else {
        try w.writeAll("document.body");
    }
    try w.writeAll("; if (!scope) return null; const target = ");
    try writeJsString(w, text);
    try w.writeAll(
        \\; let best = null; let bestArea = Infinity;
        \\const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
        \\while (walker.nextNode()) {
        \\  const node = walker.currentNode;
        \\  if (!node.textContent || !node.textContent.includes(target)) continue;
        \\  let el = node.parentElement;
        \\  while (el && el !== scope) {
        \\    if (el.textContent && el.textContent.includes(target)) {
        \\      const r = el.getBoundingClientRect();
        \\      if (r.width > 0 && r.height > 0) {
        \\        const area = r.width * r.height;
        \\        if (area < bestArea) { bestArea = area; best = { x: r.x, y: r.y, width: r.width, height: r.height }; }
        \\      }
        \\    }
        \\    el = el.parentElement;
        \\  }
        \\} return best; })()
    );

    const val = client.evaluateValue(expr.items) catch return null;
    if (val) |v| {
        switch (v) {
            .object => |obj| return parseBoundingBox(obj),
            else => return null,
        }
    }
    return null;
}

pub fn findElementBySelector(client: *cdp.CdpClient, selector: []const u8, within: ?[]const u8) !?BoundingBox {
    var expr: std.ArrayList(u8) = .empty;
    defer expr.deinit(client.allocator);

    var w = expr.writer(client.allocator);
    try w.writeAll("(() => { const scope = ");
    if (within) |ws| {
        try w.writeAll("document.querySelector(");
        try writeJsString(w, ws);
        try w.writeAll(")");
    } else {
        try w.writeAll("document");
    }
    try w.writeAll("; if (!scope) return null; const el = scope.querySelector(");
    try writeJsString(w, selector);
    try w.writeAll("); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; })()");

    const val = client.evaluateValue(expr.items) catch return null;
    if (val) |v| {
        switch (v) {
            .object => |obj| return parseBoundingBox(obj),
            else => return null,
        }
    }
    return null;
}

pub fn moveCursorTo(ctx: *RecordingContext, client: *cdp.CdpClient, x: f64, y: f64) !void {
    const result = try cursor_motion.computeMovePath(ctx.allocator, ctx.cursor_x, ctx.cursor_y, x, y);
    defer ctx.allocator.free(result.positions);

    if (ctx.isRecording()) {
        if (ctx.timeline) |tl| {
            tl.setCursorPath(result.positions);
        }
        sleepMsF(result.duration);
        try client.dispatchMouseEvent("mouseMoved", x, y, .{});
    } else {
        sleepMsF(result.duration);
        try client.dispatchMouseEvent("mouseMoved", x, y, .{});
    }

    ctx.setCursorPosition(x, y);
    sleepMsF(40.0 + prng() * 30.0);
}

pub fn clickAt(ctx: *RecordingContext, client: *cdp.CdpClient, x: f64, y: f64, modifiers: ?u32) !void {
    const flag = modifiers orelse 0;

    try moveCursorTo(ctx, client, x, y);

    const dwell = ctx.getClickDwellMs();
    if (dwell > 0) sleepMsF(dwell);

    try client.dispatchMouseEvent("mouseMoved", x, y, .{ .modifiers = flag });

    if (ctx.isRecording()) {
        if (ctx.timeline) |tl| {
            tl.setCursorScaleAnimated(0.75, 4);
        }
    }
    sleepMs(100);
    ctx.markEvent(.click);

    const meta_flag = (flag & 4) != 0;
    const ctrl_flag = (flag & 2) != 0;
    const shift_flag = (flag & 8) != 0;
    const alt_flag = (flag & 1) != 0;

    var block_expr: std.ArrayList(u8) = .empty;
    defer block_expr.deinit(ctx.allocator);
    try block_expr.writer(ctx.allocator).writeAll(
        \\(() => {
        \\  var events = ['pointerdown','mousedown','pointerup','mouseup','click'];
        \\  events.forEach(function(evt) {
        \\    document.addEventListener(evt, function __wrBlock(e) {
        \\      if (e.__wrSynthetic) return;
        \\      e.stopImmediatePropagation();
        \\      if (evt === 'click') e.preventDefault();
        \\      document.removeEventListener(evt, __wrBlock, true);
        \\    }, true);
        \\  });
        \\})()
    );
    _ = client.evaluate(block_expr.items) catch {};

    try client.dispatchMouseEvent("mousePressed", x, y, .{ .button = "left", .click_count = 1, .modifiers = flag });
    sleepMs(50);
    try client.dispatchMouseEvent("mouseReleased", x, y, .{ .button = "left", .click_count = 1, .modifiers = flag });
    sleepMs(30);

    var synth_expr: std.ArrayList(u8) = .empty;
    defer synth_expr.deinit(ctx.allocator);
    var sw = synth_expr.writer(ctx.allocator);
    try sw.print(
        \\(() => {{
        \\  var el = document.elementFromPoint({d}, {d});
        \\  if (!el) return;
        \\  var opts = {{
        \\    bubbles: true, cancelable: true, clientX: {d}, clientY: {d},
        \\    metaKey: {s}, ctrlKey: {s}, shiftKey: {s}, altKey: {s},
        \\    button: 0, buttons: 1
        \\  }};
        \\  function fire(Ctor, type) {{
        \\    var ev = new Ctor(type, opts);
        \\    ev.__wrSynthetic = true;
        \\    el.dispatchEvent(ev);
        \\  }}
        \\  fire(PointerEvent, 'pointerdown');
        \\  fire(MouseEvent, 'mousedown');
        \\  fire(PointerEvent, 'pointerup');
        \\  fire(MouseEvent, 'mouseup');
        \\  fire(MouseEvent, 'click');
        \\}})()
    , .{
        x,
        y,
        x,
        y,
        if (meta_flag) "true" else "false",
        if (ctrl_flag) "true" else "false",
        if (shift_flag) "true" else "false",
        if (alt_flag) "true" else "false",
    });
    _ = client.evaluate(synth_expr.items) catch {};

    sleepMs(30);
    if (ctx.isRecording()) {
        if (ctx.timeline) |tl| {
            tl.setCursorScaleAnimated(1.0, 6);
        }
    }
}

pub const KeyCodeInfo = struct {
    code: []const u8,
    key_code: u32,
};

pub fn getKeyCode(key: []const u8) ?KeyCodeInfo {
    if (std.mem.eql(u8, key, "Delete")) return .{ .code = "Delete", .key_code = 46 };
    if (std.mem.eql(u8, key, "Backspace")) return .{ .code = "Backspace", .key_code = 8 };
    if (std.mem.eql(u8, key, "Escape")) return .{ .code = "Escape", .key_code = 27 };
    if (std.mem.eql(u8, key, "Enter")) return .{ .code = "Enter", .key_code = 13 };
    if (std.mem.eql(u8, key, "Tab")) return .{ .code = "Tab", .key_code = 9 };
    if (std.mem.eql(u8, key, "ArrowUp")) return .{ .code = "ArrowUp", .key_code = 38 };
    if (std.mem.eql(u8, key, "ArrowDown")) return .{ .code = "ArrowDown", .key_code = 40 };
    if (std.mem.eql(u8, key, "ArrowLeft")) return .{ .code = "ArrowLeft", .key_code = 37 };
    if (std.mem.eql(u8, key, "ArrowRight")) return .{ .code = "ArrowRight", .key_code = 39 };
    if (key.len == 1) {
        const ch = key[0];
        if (ch >= 'a' and ch <= 'z') return .{ .code = "KeyA", .key_code = ch - 'a' + 65 };
        if (ch >= 'A' and ch <= 'Z') return .{ .code = "KeyA", .key_code = ch };
    }
    return null;
}

pub fn getCharCode(ch: u8) KeyCodeInfo {
    return switch (ch) {
        ' ' => .{ .code = "Space", .key_code = 32 },
        '0'...'9' => .{ .code = "Digit0", .key_code = @as(u32, ch) },
        ';' => .{ .code = "Semicolon", .key_code = 186 },
        '=' => .{ .code = "Equal", .key_code = 187 },
        ',' => .{ .code = "Comma", .key_code = 188 },
        '-' => .{ .code = "Minus", .key_code = 189 },
        '.' => .{ .code = "Period", .key_code = 190 },
        '/' => .{ .code = "Slash", .key_code = 191 },
        '`' => .{ .code = "Backquote", .key_code = 192 },
        '[' => .{ .code = "BracketLeft", .key_code = 219 },
        '\\' => .{ .code = "Backslash", .key_code = 220 },
        ']' => .{ .code = "BracketRight", .key_code = 221 },
        '\'' => .{ .code = "Quote", .key_code = 222 },
        'a'...'z' => .{ .code = "KeyA", .key_code = @as(u32, ch) - 32 },
        'A'...'Z' => .{ .code = "KeyA", .key_code = @as(u32, ch) },
        else => .{ .code = "", .key_code = 0 },
    };
}

pub fn modifierFlag(mod: []const u8) u32 {
    if (std.mem.eql(u8, mod, "alt")) return 1;
    if (std.mem.eql(u8, mod, "ctrl") or std.mem.eql(u8, mod, "control")) return 2;
    if (std.mem.eql(u8, mod, "cmd") or std.mem.eql(u8, mod, "meta")) return 4;
    if (std.mem.eql(u8, mod, "shift")) return 8;
    return 0;
}

pub fn modLabel(mod: []const u8) []const u8 {
    if (std.mem.eql(u8, mod, "cmd") or std.mem.eql(u8, mod, "meta")) return "\xe2\x8c\x98";
    if (std.mem.eql(u8, mod, "ctrl") or std.mem.eql(u8, mod, "control")) return "Ctrl";
    if (std.mem.eql(u8, mod, "shift")) return "\xe2\x87\xa7";
    if (std.mem.eql(u8, mod, "alt")) return "\xe2\x8c\xa5";
    return mod;
}

pub fn pressKey(ctx: *RecordingContext, client: *cdp.CdpClient, key: []const u8, label: ?[]const u8) !void {
    _ = label;
    const info = getKeyCode(key) orelse KeyCodeInfo{ .code = "", .key_code = 0 };

    ctx.markEvent(.key);

    try client.dispatchKeyEvent("keyDown", .{
        .key = key,
        .code = info.code,
        .key_code = info.key_code,
    });
    try client.dispatchKeyEvent("keyUp", .{
        .key = key,
        .code = info.code,
        .key_code = info.key_code,
    });

    sleepMs(800);
}

pub fn typeText(ctx: *RecordingContext, client: *cdp.CdpClient, text: []const u8, delay_ms: ?u64) !void {
    const base_delay = delay_ms orelse 120;

    for (text) |ch| {
        const char_info = getCharCode(ch);
        const char_slice: [1]u8 = .{ch};

        try client.dispatchKeyEvent("rawKeyDown", .{
            .key = &char_slice,
            .code = char_info.code,
            .key_code = char_info.key_code,
        });
        try client.dispatchKeyEvent("char", .{
            .key = &char_slice,
            .text = &char_slice,
        });
        try client.dispatchKeyEvent("keyUp", .{
            .key = &char_slice,
            .code = char_info.code,
            .key_code = char_info.key_code,
        });

        ctx.markEvent(.key);
        sleepMsF(humanDelay(@floatFromInt(base_delay)));
    }
}

fn humanDelay(base: f64) f64 {
    const jitter = base * (0.6 + prng() * 0.9);
    if (prng() < 0.12) return jitter + base * 1.5 + prng() * base * 2.0;
    return jitter;
}

pub fn scroll(client: *cdp.CdpClient, selector: ?[]const u8, scroll_x: i32, scroll_y: i32) !void {
    var expr: std.ArrayList(u8) = .empty;
    defer expr.deinit(client.allocator);

    var ew = expr.writer(client.allocator);
    if (selector) |sel| {
        try ew.writeAll("(() => { const el = document.querySelector(");
        try writeJsString(ew, sel);
        try ew.print("); if (el) el.scrollBy({{ left: {d}, top: {d}, behavior: 'smooth' }}); }})()", .{ scroll_x, scroll_y });
    } else {
        try ew.print("window.scrollBy({{ left: {d}, top: {d}, behavior: 'smooth' }})", .{ scroll_x, scroll_y });
    }

    _ = client.evaluate(expr.items) catch {};
    sleepMs(500);
}

pub fn selectValue(client: *cdp.CdpClient, selector: []const u8, value: []const u8) !void {
    var expr: std.ArrayList(u8) = .empty;
    defer expr.deinit(client.allocator);
    var w = expr.writer(client.allocator);

    try w.writeAll("(() => { const el = document.querySelector(");
    try writeJsString(w, selector);
    try w.writeAll("); if (!el) return; el.value = ");
    try writeJsString(w, value);
    try w.writeAll("; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); })()");

    _ = client.evaluate(expr.items) catch {};
}

pub fn captureScreenshotToFile(client: *cdp.CdpClient, output_path: []const u8) !void {
    const data = try client.captureScreenshot("png", 100);
    defer client.allocator.free(data);

    const dir = std.fs.path.dirname(output_path);
    if (dir) |d| {
        std.fs.cwd().makePath(d) catch {};
    }

    const file = try std.fs.cwd().createFile(output_path, .{});
    defer file.close();
    try file.writeAll(data);
}

fn parseBoundingBox(json: []const u8) ?BoundingBox {
    const x = extractNumberField(json, "x") orelse return null;
    const y = extractNumberField(json, "y") orelse return null;
    const width = extractNumberField(json, "width") orelse return null;
    const height = extractNumberField(json, "height") orelse return null;
    return .{ .x = x, .y = y, .width = width, .height = height };
}

fn extractNumberField(json: []const u8, field: []const u8) ?f64 {
    var search_buf: [64]u8 = undefined;
    const search = std.fmt.bufPrint(&search_buf, "\"{s}\":", .{field}) catch return null;
    const idx = std.mem.indexOf(u8, json, search) orelse return null;
    var start = idx + search.len;
    while (start < json.len and json[start] == ' ') : (start += 1) {}
    var end = start;
    while (end < json.len and (json[end] >= '0' and json[end] <= '9' or json[end] == '.' or json[end] == '-' or json[end] == 'e' or json[end] == 'E' or json[end] == '+')) : (end += 1) {}
    if (start == end) return null;
    return std.fmt.parseFloat(f64, json[start..end]) catch null;
}

fn writeJsString(writer: anytype, s: []const u8) !void {
    try writer.writeByte('"');
    for (s) |c| {
        switch (c) {
            '"' => try writer.writeAll("\\\""),
            '\\' => try writer.writeAll("\\\\"),
            '\n' => try writer.writeAll("\\n"),
            '\r' => try writer.writeAll("\\r"),
            '\t' => try writer.writeAll("\\t"),
            else => try writer.writeByte(c),
        }
    }
    try writer.writeByte('"');
}

pub fn randomPointInBox(box: BoundingBox, spread: f64) struct { x: f64, y: f64 } {
    const center = 0.5 - spread / 2.0;
    return .{
        .x = box.x + box.width * (center + prng() * spread),
        .y = box.y + box.height * (center + prng() * spread),
    };
}

var action_rng_state: u64 = 0;
var action_rng_initialized: bool = false;

fn prng() f64 {
    if (!action_rng_initialized) {
        action_rng_state = @truncate(@as(u128, @bitCast(std.time.nanoTimestamp())) ^ 0xdeadbeefcafe1234);
        action_rng_initialized = true;
    }
    action_rng_state ^= action_rng_state << 13;
    action_rng_state ^= action_rng_state >> 7;
    action_rng_state ^= action_rng_state << 17;
    const float_bits = (action_rng_state >> 12) | (0x3FF << 52);
    return @as(f64, @bitCast(float_bits)) - 1.0;
}
