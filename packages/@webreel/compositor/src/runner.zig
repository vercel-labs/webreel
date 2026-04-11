const std = @import("std");
const cdp = @import("cdp.zig");
const actions = @import("actions.zig");
const timeline_mod = @import("timeline.zig");
const cursor_motion = @import("cursor_motion.zig");

pub const StepAction = enum {
    pause,
    click,
    key,
    @"type",
    scroll,
    wait,
    drag,
    moveTo,
    screenshot,
    navigate,
    hover,
    select,
};

pub const StepTarget = struct {
    text: ?[]const u8 = null,
    selector: ?[]const u8 = null,
    within: ?[]const u8 = null,
};

pub const Step = struct {
    action: StepAction,
    ms: ?u64 = null,
    text: ?[]const u8 = null,
    selector: ?[]const u8 = null,
    within: ?[]const u8 = null,
    key: ?[]const u8 = null,
    label: ?[]const u8 = null,
    x: ?i32 = null,
    y: ?i32 = null,
    url: ?[]const u8 = null,
    output: ?[]const u8 = null,
    value: ?[]const u8 = null,
    delay: ?u64 = null,
    char_delay: ?u64 = null,
    timeout: ?u64 = null,
    modifiers: ?u32 = null,
    from: ?StepTarget = null,
    to: ?StepTarget = null,
    target: ?[]const u8 = null,
};

pub const VideoConfig = struct {
    name: []const u8,
    url: []const u8,
    base_url: []const u8 = "",
    output: ?[]const u8 = null,
    width: u32 = actions.DEFAULT_VIEWPORT_SIZE,
    height: u32 = actions.DEFAULT_VIEWPORT_SIZE,
    zoom: f64 = 1.0,
    fps: u32 = 60,
    crf: u32 = 18,
    color_scheme: ?[]const u8 = null,
    default_delay: ?u64 = null,
    click_dwell: ?u64 = null,
    steps: []const Step = &.{},
    ffmpeg_path: []const u8 = "ffmpeg",
    cursor_svg_path: ?[]const u8 = null,
    font_path: ?[]const u8 = null,
    screen_width: ?u32 = null,
    screen_height: ?u32 = null,
};

pub fn resolveTarget(client: *cdp.CdpClient, target: StepTarget, timeout_ms: u64) !actions.BoundingBox {
    if (target.text == null and target.selector == null) {
        return error.NoTargetSpecified;
    }

    const start = std.time.milliTimestamp();
    while (true) {
        var box: ?actions.BoundingBox = null;
        if (target.text) |text| {
            box = actions.findElementByText(client, text, target.within) catch null;
        } else if (target.selector) |sel| {
            box = actions.findElementBySelector(client, sel, target.within) catch null;
        }

        if (box) |b| {
            if (b.width > 0 and b.height > 0) return b;
        }

        if (@as(u64, @intCast(std.time.milliTimestamp() - start)) >= timeout_ms) {
            return error.ElementNotFound;
        }
        actions.sleepMs(200);
    }
}

pub fn executeStep(ctx: *actions.RecordingContext, client: *cdp.CdpClient, step: Step) !void {
    switch (step.action) {
        .pause => {
            actions.sleepMs(step.ms orelse 1200);
        },
        .click => {
            const target = StepTarget{
                .text = step.text,
                .selector = step.selector,
                .within = step.within,
            };
            const box = try resolveTarget(client, target, step.timeout orelse 10000);
            const pt = actions.randomPointInBox(box, 0.25);
            try actions.clickAt(ctx, client, pt.x, pt.y, step.modifiers);
        },
        .key => {
            const key_str = step.key orelse return error.MissingKey;
            if (step.target) |sel| {
                var expr: std.ArrayList(u8) = .empty;
                defer expr.deinit(ctx.allocator);
                var ew = expr.writer(ctx.allocator);
                try ew.writeAll("document.querySelector(\"");
                try ew.writeAll(sel);
                try ew.writeAll("\")?.focus()");
                _ = client.evaluate(expr.items) catch {};
                actions.sleepMs(100);
            }
            try actions.pressKey(ctx, client, key_str, step.label);
        },
        .@"type" => {
            const text = step.text orelse return error.MissingText;
            if (step.selector) |_| {
                const target = StepTarget{
                    .text = step.text,
                    .selector = step.selector,
                    .within = step.within,
                };
                const box = try resolveTarget(client, target, step.timeout orelse 10000);
                const pt = actions.randomPointInBox(box, 0.25);
                try actions.clickAt(ctx, client, pt.x, pt.y, null);
                actions.sleepMsF(300.0 + prng() * 200.0);
            }
            try actions.typeText(ctx, client, text, step.char_delay);
        },
        .scroll => {
            const sx = step.x orelse 0;
            const sy = step.y orelse 0;
            try actions.scroll(client, step.selector, sx, sy);
        },
        .wait => {
            const timeout = step.timeout orelse 30000;
            if (step.selector) |sel| {
                try actions.waitForSelector(client, sel, timeout);
            } else if (step.text) |text| {
                try actions.waitForText(client, text, step.within, timeout);
            }
        },
        .drag => {
            const from_target = step.from orelse return error.MissingDragFrom;
            const to_target = step.to orelse return error.MissingDragTo;
            const from_box = try resolveTarget(client, from_target, step.timeout orelse 10000);
            const to_box = try resolveTarget(client, to_target, step.timeout orelse 10000);

            const fx = from_box.x + from_box.width / 2.0;
            const fy = from_box.y + from_box.height / 2.0;
            const tx = to_box.x + to_box.width / 2.0;
            const ty = to_box.y + to_box.height / 2.0;

            try actions.moveCursorTo(ctx, client, fx, fy);
            ctx.markEvent(.click);

            try client.dispatchMouseEvent("mousePressed", fx, fy, .{
                .button = "left",
                .click_count = 1,
            });

            actions.sleepMs(150);

            const dist = @sqrt((tx - fx) * (tx - fx) + (ty - fy) * (ty - fy));
            const timing = cursor_motion.computeDragTiming(dist);
            const waypoints = try cursor_motion.computeEasedPath(ctx.allocator, fx, fy, tx, ty, timing.steps);
            defer ctx.allocator.free(waypoints);

            for (waypoints) |wp| {
                try client.dispatchMouseEvent("mouseMoved", wp.x, wp.y, .{
                    .button = "left",
                    .buttons = 1,
                });
                if (ctx.isRecording()) {
                    if (ctx.timeline) |tl| {
                        const path_arr = [_]cursor_motion.Point{wp};
                        tl.setCursorPath(&path_arr);
                    }
                }
                actions.sleepMsF(timing.delay_ms + (prng() - 0.5) * 8.0);
            }

            try client.dispatchMouseEvent("mouseReleased", tx, ty, .{
                .button = "left",
                .click_count = 1,
            });

            ctx.setCursorPosition(tx, ty);
        },
        .moveTo => {
            const target = StepTarget{
                .text = step.text,
                .selector = step.selector,
                .within = step.within,
            };
            const box = try resolveTarget(client, target, step.timeout orelse 10000);
            const pt = actions.randomPointInBox(box, 0.1);
            try actions.moveCursorTo(ctx, client, pt.x, pt.y);
        },
        .screenshot => {
            const output = step.output orelse return error.MissingOutput;
            try actions.captureScreenshotToFile(client, output);
        },
        .navigate => {
            const url = step.url orelse return error.MissingUrl;
            try actions.navigateTo(client, url);
        },
        .hover => {
            const target = StepTarget{
                .text = step.text,
                .selector = step.selector,
                .within = step.within,
            };
            const box = try resolveTarget(client, target, step.timeout orelse 10000);
            const pt = actions.randomPointInBox(box, 0.1);
            try actions.moveCursorTo(ctx, client, pt.x, pt.y);
            try client.dispatchMouseEvent("mouseMoved", pt.x, pt.y, .{});
        },
        .select => {
            const sel = step.selector orelse return error.MissingSelector;
            const val = step.value orelse return error.MissingValue;
            try actions.selectValue(client, sel, val);
        },
    }

    if (step.delay) |d| {
        actions.sleepMs(d);
    }
}

pub fn executeSteps(ctx: *actions.RecordingContext, client: *cdp.CdpClient, steps: []const Step, default_delay: ?u64) !void {
    for (steps, 0..) |step, i| {
        executeStep(ctx, client, step) catch |err| {
            std.debug.print("Step {d} ({s}) failed: {}\n", .{ i, @tagName(step.action), err });
            return err;
        };

        if (step.delay == null) {
            if (default_delay) |d| {
                if (d > 0) actions.sleepMs(d);
            }
        }
    }
}

var runner_rng_state: u64 = 0;
var runner_rng_initialized: bool = false;

fn prng() f64 {
    if (!runner_rng_initialized) {
        runner_rng_state = @truncate(@as(u128, @bitCast(std.time.nanoTimestamp())) ^ 0xabcdef0123456789);
        runner_rng_initialized = true;
    }
    runner_rng_state ^= runner_rng_state << 13;
    runner_rng_state ^= runner_rng_state >> 7;
    runner_rng_state ^= runner_rng_state << 17;
    const float_bits = (runner_rng_state >> 12) | (0x3FF << 52);
    return @as(f64, @bitCast(float_bits)) - 1.0;
}
