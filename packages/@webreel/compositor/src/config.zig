const std = @import("std");
const runner_mod = @import("runner.zig");

pub const WebreelConfig = struct {
    out_dir: ?[]const u8 = null,
    base_url: ?[]const u8 = null,
    default_delay: ?u64 = null,
    click_dwell: ?u64 = null,
    color_scheme: ?[]const u8 = null,
    videos: []VideoConfig = &.{},
};

pub const VideoConfig = struct {
    name: []const u8,
    url: []const u8,
    base_url: ?[]const u8 = null,
    width: u32 = 1080,
    height: u32 = 1080,
    zoom: f64 = 1.0,
    fps: u32 = 60,
    quality: ?u32 = null,
    crf: u32 = 18,
    output: ?[]const u8 = null,
    color_scheme: ?[]const u8 = null,
    default_delay: ?u64 = null,
    click_dwell: ?u64 = null,
    cursor_svg_path: ?[]const u8 = null,
    screen_width: ?u32 = null,
    screen_height: ?u32 = null,
    steps: []runner_mod.Step = &.{},
    ffmpeg_path: []const u8 = "ffmpeg",
    font_path: ?[]const u8 = null,
};

pub fn stripJsoncComments(allocator: std.mem.Allocator, input: []const u8) ![]u8 {
    var output: std.ArrayList(u8) = .empty;
    errdefer output.deinit(allocator);

    var i: usize = 0;
    while (i < input.len) {
        if (input[i] == '"') {
            try output.append(allocator, '"');
            i += 1;
            while (i < input.len and input[i] != '"') {
                if (input[i] == '\\' and i + 1 < input.len) {
                    try output.append(allocator, '\\');
                    i += 1;
                    try output.append(allocator, input[i]);
                    i += 1;
                } else {
                    try output.append(allocator, input[i]);
                    i += 1;
                }
            }
            if (i < input.len) {
                try output.append(allocator, '"');
                i += 1;
            }
        } else if (i + 1 < input.len and input[i] == '/' and input[i + 1] == '/') {
            while (i < input.len and input[i] != '\n') : (i += 1) {}
        } else if (i + 1 < input.len and input[i] == '/' and input[i + 1] == '*') {
            i += 2;
            while (i + 1 < input.len) {
                if (input[i] == '*' and input[i + 1] == '/') {
                    i += 2;
                    break;
                }
                i += 1;
            }
        } else {
            try output.append(allocator, input[i]);
            i += 1;
        }
    }

    return output.toOwnedSlice(allocator);
}

pub fn substituteEnvVars(allocator: std.mem.Allocator, input: []const u8) ![]u8 {
    var output: std.ArrayList(u8) = .empty;
    errdefer output.deinit(allocator);

    var i: usize = 0;
    while (i < input.len) {
        if (input[i] == '"') {
            try output.append(allocator, '"');
            i += 1;
            while (i < input.len and input[i] != '"') {
                if (input[i] == '\\' and i + 1 < input.len) {
                    try output.append(allocator, '\\');
                    i += 1;
                    try output.append(allocator, input[i]);
                    i += 1;
                    continue;
                }
                if (input[i] == '$') {
                    if (i + 1 < input.len and input[i + 1] == '{') {
                        const start = i + 2;
                        var end = start;
                        while (end < input.len and input[end] != '}') : (end += 1) {}
                        if (end < input.len) {
                            const var_name = input[start..end];
                            const env_val = std.posix.getenv(var_name);
                            if (env_val) |val| {
                                try output.appendSlice(allocator, val);
                            } else {
                                try output.appendSlice(allocator, input[i .. end + 1]);
                            }
                            i = end + 1;
                            continue;
                        }
                    } else if (i + 1 < input.len and isEnvVarStart(input[i + 1])) {
                        const start = i + 1;
                        var end = start;
                        while (end < input.len and isEnvVarChar(input[end])) : (end += 1) {}
                        const var_name = input[start..end];
                        const env_val = std.posix.getenv(var_name);
                        if (env_val) |val| {
                            try output.appendSlice(allocator, val);
                        } else {
                            try output.appendSlice(allocator, input[i..end]);
                        }
                        i = end;
                        continue;
                    }
                }
                try output.append(allocator, input[i]);
                i += 1;
            }
            if (i < input.len) {
                try output.append(allocator, '"');
                i += 1;
            }
        } else {
            try output.append(allocator, input[i]);
            i += 1;
        }
    }

    return output.toOwnedSlice(allocator);
}

fn isEnvVarStart(c: u8) bool {
    return (c >= 'A' and c <= 'Z') or c == '_';
}

fn isEnvVarChar(c: u8) bool {
    return (c >= 'A' and c <= 'Z') or (c >= '0' and c <= '9') or c == '_';
}

const ViewportPreset = struct {
    name: []const u8,
    width: u32,
    height: u32,
};

const VIEWPORT_PRESETS = [_]ViewportPreset{
    .{ .name = "desktop", .width = 1920, .height = 1080 },
    .{ .name = "desktop-hd", .width = 2560, .height = 1440 },
    .{ .name = "laptop", .width = 1366, .height = 768 },
    .{ .name = "macbook-air", .width = 1440, .height = 900 },
    .{ .name = "macbook-pro", .width = 1512, .height = 982 },
    .{ .name = "ipad", .width = 1024, .height = 1366 },
    .{ .name = "ipad-pro", .width = 834, .height = 1194 },
    .{ .name = "ipad-mini", .width = 768, .height = 1024 },
    .{ .name = "iphone-15", .width = 393, .height = 852 },
    .{ .name = "iphone-15-pro-max", .width = 430, .height = 932 },
    .{ .name = "iphone-se", .width = 375, .height = 667 },
    .{ .name = "pixel-8", .width = 412, .height = 915 },
    .{ .name = "galaxy-s24", .width = 360, .height = 780 },
};

fn resolveViewportPreset(name: []const u8) ?struct { width: u32, height: u32 } {
    for (&VIEWPORT_PRESETS) |preset| {
        if (std.mem.eql(u8, preset.name, name)) {
            return .{ .width = preset.width, .height = preset.height };
        }
    }
    return null;
}

const ConfigJson = struct {
    outDir: ?[]const u8 = null,
    baseUrl: ?[]const u8 = null,
    defaultDelay: ?u64 = null,
    clickDwell: ?u64 = null,
    colorScheme: ?[]const u8 = null,
    viewport: ?std.json.Value = null,
};

pub fn loadConfig(allocator: std.mem.Allocator, file_path: []const u8) !WebreelConfig {
    const raw = std.fs.cwd().readFileAlloc(allocator, file_path, 50 * 1024 * 1024) catch
        return error.ConfigFileNotFound;
    defer allocator.free(raw);

    const stripped = try stripJsoncComments(allocator, raw);
    defer allocator.free(stripped);

    const substituted = try substituteEnvVars(allocator, stripped);
    defer allocator.free(substituted);

    const parsed = std.json.parseFromSlice(std.json.Value, allocator, substituted, .{}) catch
        return error.ConfigParseError;
    defer parsed.deinit();

    const root = parsed.value;
    if (root != .object) return error.ConfigMustBeObject;

    var config = WebreelConfig{};

    if (root.object.get("outDir")) |v| {
        if (v == .string) config.out_dir = v.string;
    }
    if (root.object.get("baseUrl")) |v| {
        if (v == .string) config.base_url = v.string;
    }
    if (root.object.get("colorScheme")) |v| {
        if (v == .string) config.color_scheme = v.string;
    }
    if (root.object.get("defaultDelay")) |v| {
        config.default_delay = jsonToU64(v);
    }
    if (root.object.get("clickDwell")) |v| {
        config.click_dwell = jsonToU64(v);
    }

    var global_width: u32 = 1080;
    var global_height: u32 = 1080;
    if (root.object.get("viewport")) |vp| {
        if (vp == .string) {
            if (resolveViewportPreset(vp.string)) |preset| {
                global_width = preset.width;
                global_height = preset.height;
            }
        } else if (vp == .object) {
            if (vp.object.get("width")) |w| global_width = jsonToU32(w) orelse 1080;
            if (vp.object.get("height")) |h| global_height = jsonToU32(h) orelse 1080;
        }
    }

    const videos_val = root.object.get("videos") orelse return error.MissingVideos;
    if (videos_val != .object) return error.VideosMustBeObject;

    const video_names = videos_val.object.keys();
    var video_list = std.ArrayList(VideoConfig).empty;
    defer video_list.deinit(allocator);

    for (video_names) |name| {
        const video_val = videos_val.object.get(name) orelse continue;
        if (video_val != .object) continue;

        var vc = VideoConfig{
            .name = name,
            .url = "",
            .width = global_width,
            .height = global_height,
        };

        if (video_val.object.get("url")) |v| {
            if (v == .string) vc.url = v.string;
        }
        if (video_val.object.get("baseUrl")) |v| {
            if (v == .string) vc.base_url = v.string;
        } else {
            vc.base_url = config.base_url;
        }
        if (video_val.object.get("viewport")) |vp| {
            if (vp == .string) {
                if (resolveViewportPreset(vp.string)) |preset| {
                    vc.width = preset.width;
                    vc.height = preset.height;
                }
            } else if (vp == .object) {
                if (vp.object.get("width")) |w| vc.width = jsonToU32(w) orelse vc.width;
                if (vp.object.get("height")) |h| vc.height = jsonToU32(h) orelse vc.height;
            }
        }
        if (video_val.object.get("zoom")) |v| {
            vc.zoom = jsonToF64(v) orelse 1.0;
        }
        if (video_val.object.get("fps")) |v| {
            vc.fps = jsonToU32(v) orelse 60;
        }
        if (video_val.object.get("quality")) |v| {
            vc.quality = jsonToU32(v);
            if (vc.quality) |q| {
                vc.crf = @as(u32, @intFromFloat(@round(51.0 * (1.0 - @as(f64, @floatFromInt(q)) / 100.0))));
            }
        }
        if (video_val.object.get("output")) |v| {
            if (v == .string) vc.output = v.string;
        }
        if (video_val.object.get("colorScheme")) |v| {
            if (v == .string) vc.color_scheme = v.string;
        } else {
            vc.color_scheme = config.color_scheme;
        }
        if (video_val.object.get("defaultDelay")) |v| {
            vc.default_delay = jsonToU64(v);
        } else {
            vc.default_delay = config.default_delay;
        }
        if (video_val.object.get("clickDwell")) |v| {
            vc.click_dwell = jsonToU64(v);
        } else {
            vc.click_dwell = config.click_dwell;
        }

        if (video_val.object.get("screen")) |sc| {
            if (sc == .object) {
                if (sc.object.get("width")) |w| vc.screen_width = jsonToU32(w);
                if (sc.object.get("height")) |h| vc.screen_height = jsonToU32(h);
            }
        }

        if (video_val.object.get("steps")) |steps_val| {
            if (steps_val == .array) {
                var step_list = std.ArrayList(runner_mod.Step).empty;
                defer step_list.deinit(allocator);

                for (steps_val.array.items) |step_val| {
                    if (step_val != .object) continue;
                    const step = parseStepFromJson(step_val.object) orelse continue;
                    try step_list.append(allocator, step);
                }

                vc.steps = try step_list.toOwnedSlice(allocator);
            }
        }

        try video_list.append(allocator, vc);
    }

    config.videos = try video_list.toOwnedSlice(allocator);
    return config;
}

fn parseStepFromJson(obj: std.json.ObjectMap) ?runner_mod.Step {
    const action_val = obj.get("action") orelse return null;
    if (action_val != .string) return null;

    const action = parseStepAction(action_val.string) orelse return null;

    return runner_mod.Step{
        .action = action,
        .ms = if (obj.get("ms")) |v| jsonToU64(v) else null,
        .text = if (obj.get("text")) |v| jsonString(v) else null,
        .selector = if (obj.get("selector")) |v| jsonString(v) else null,
        .within = if (obj.get("within")) |v| jsonString(v) else null,
        .key = if (obj.get("key")) |v| jsonString(v) else null,
        .label = if (obj.get("label")) |v| jsonString(v) else null,
        .x = if (obj.get("x")) |v| jsonToI32(v) else null,
        .y = if (obj.get("y")) |v| jsonToI32(v) else null,
        .url = if (obj.get("url")) |v| jsonString(v) else null,
        .output = if (obj.get("output")) |v| jsonString(v) else null,
        .value = if (obj.get("value")) |v| jsonString(v) else null,
        .delay = if (obj.get("delay")) |v| jsonToU64(v) else null,
        .char_delay = if (obj.get("charDelay")) |v| jsonToU64(v) else null,
        .timeout = if (obj.get("timeout")) |v| jsonToU64(v) else null,
        .from = if (obj.get("from")) |v| parseStepTarget(v) else null,
        .to = if (obj.get("to")) |v| parseStepTarget(v) else null,
        .target = if (obj.get("target")) |v| jsonString(v) else null,
    };
}

fn parseStepTarget(val: std.json.Value) ?runner_mod.StepTarget {
    if (val != .object) return null;
    return .{
        .text = if (val.object.get("text")) |v| jsonString(v) else null,
        .selector = if (val.object.get("selector")) |v| jsonString(v) else null,
        .within = if (val.object.get("within")) |v| jsonString(v) else null,
    };
}

fn parseStepAction(action: []const u8) ?runner_mod.StepAction {
    if (std.mem.eql(u8, action, "pause")) return .pause;
    if (std.mem.eql(u8, action, "click")) return .click;
    if (std.mem.eql(u8, action, "key")) return .key;
    if (std.mem.eql(u8, action, "type")) return .@"type";
    if (std.mem.eql(u8, action, "scroll")) return .scroll;
    if (std.mem.eql(u8, action, "wait")) return .wait;
    if (std.mem.eql(u8, action, "drag")) return .drag;
    if (std.mem.eql(u8, action, "moveTo")) return .moveTo;
    if (std.mem.eql(u8, action, "screenshot")) return .screenshot;
    if (std.mem.eql(u8, action, "navigate")) return .navigate;
    if (std.mem.eql(u8, action, "hover")) return .hover;
    if (std.mem.eql(u8, action, "select")) return .select;
    return null;
}

fn jsonString(val: std.json.Value) ?[]const u8 {
    return if (val == .string) val.string else null;
}

fn jsonToU32(val: std.json.Value) ?u32 {
    return switch (val) {
        .integer => |i| if (i >= 0 and i <= std.math.maxInt(u32)) @intCast(i) else null,
        .float => |f| if (f >= 0 and f <= @as(f64, @floatFromInt(std.math.maxInt(u32)))) @intFromFloat(f) else null,
        else => null,
    };
}

fn jsonToU64(val: std.json.Value) ?u64 {
    return switch (val) {
        .integer => |i| if (i >= 0) @intCast(i) else null,
        .float => |f| if (f >= 0) @intFromFloat(f) else null,
        else => null,
    };
}

fn jsonToI32(val: std.json.Value) ?i32 {
    return switch (val) {
        .integer => |i| if (i >= std.math.minInt(i32) and i <= std.math.maxInt(i32)) @intCast(i) else null,
        .float => |f| @intFromFloat(f),
        else => null,
    };
}

fn jsonToF64(val: std.json.Value) ?f64 {
    return switch (val) {
        .integer => |i| @floatFromInt(i),
        .float => |f| f,
        else => null,
    };
}

pub fn resolveConfigPath(allocator: std.mem.Allocator, config_path: ?[]const u8) ![]const u8 {
    if (config_path) |cp| {
        if (std.fs.cwd().statFile(cp)) |_| {
            return allocator.dupe(u8, cp);
        } else |_| {
            return error.ConfigFileNotFound;
        }
    }

    const config_names = [_][]const u8{
        "webreel.config.json",
        "webreel.config.ts",
        "webreel.config.mts",
        "webreel.config.js",
        "webreel.config.mjs",
    };

    for (&config_names) |name| {
        if (std.fs.cwd().statFile(name)) |_| {
            return allocator.dupe(u8, name);
        } else |_| {
            continue;
        }
    }

    return error.NoConfigFileFound;
}

pub fn validateConfig(config: *const WebreelConfig) !void {
    if (config.videos.len == 0) return error.NoVideosConfigured;

    for (config.videos) |video| {
        if (video.url.len == 0) return error.MissingVideoUrl;
    }
}
