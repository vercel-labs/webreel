const std = @import("std");
const types = @import("types.zig");
const comp = @import("compositor.zig");
const jpeg_mod = @import("jpeg.zig");
const nanosvg = @import("nanosvg.zig");
const cdp_mod = @import("cdp.zig");
const actions_mod = @import("actions.zig");
const runner_mod = @import("runner.zig");
const timeline_mod = @import("timeline.zig");
const base64_mod = @import("base64.zig");

const config_mod = @import("config.zig");
const install_mod = @import("install.zig");

const Mode = enum { compose, stream, record, record_full, init, validate, install };

const Args = struct {
    mode: Mode = .compose,
    input: ?[]const u8 = null,
    output: ?[]const u8 = null,
    timeline: ?[]const u8 = null,
    cursor: ?[]const u8 = null,
    cursor_svg: ?[]const u8 = null,
    cursor_size: u32 = 0,
    font: ?[]const u8 = null,
    ffmpeg: []const u8 = "ffmpeg",
    crf: u32 = 18,
    backend: comp.Backend = .auto,
    config_path: ?[]const u8 = null,
    video_name: ?[]const u8 = null,
    verbose: bool = false,
    cdp_port: u16 = 0,
    url: ?[]const u8 = null,
    width: u32 = 1080,
    height: u32 = 1080,
    fps: u32 = 60,
    steps_json: ?[]const u8 = null,
    color_scheme: ?[]const u8 = null,
    default_delay: ?u64 = null,
    click_dwell: ?u64 = null,
    screen_width: ?u32 = null,
    screen_height: ?u32 = null,
};

fn parse_args(allocator: std.mem.Allocator) !Args {
    var args_iter = try std.process.argsWithAllocator(allocator);
    defer args_iter.deinit();

    _ = args_iter.next(); // skip program name

    var args = Args{};

    while (args_iter.next()) |arg| {
        if (std.mem.eql(u8, arg, "--mode")) {
            if (args_iter.next()) |m| {
                if (std.mem.eql(u8, m, "stream")) args.mode = .stream
                else if (std.mem.eql(u8, m, "record")) args.mode = .record
                else if (std.mem.eql(u8, m, "record-full")) args.mode = .record_full
                else if (std.mem.eql(u8, m, "init")) args.mode = .init
                else if (std.mem.eql(u8, m, "validate")) args.mode = .validate
                else if (std.mem.eql(u8, m, "install")) args.mode = .install;
            }
        } else if (std.mem.eql(u8, arg, "record-full") or std.mem.eql(u8, arg, "record") or std.mem.eql(u8, arg, "init") or std.mem.eql(u8, arg, "validate") or std.mem.eql(u8, arg, "install")) {
            if (std.mem.eql(u8, arg, "record-full")) args.mode = .record_full
            else if (std.mem.eql(u8, arg, "record")) args.mode = .record
            else if (std.mem.eql(u8, arg, "init")) args.mode = .init
            else if (std.mem.eql(u8, arg, "validate")) args.mode = .validate
            else if (std.mem.eql(u8, arg, "install")) args.mode = .install;
        } else if (std.mem.eql(u8, arg, "--config") or std.mem.eql(u8, arg, "-c")) {
            args.config_path = args_iter.next();
        } else if (std.mem.eql(u8, arg, "--name") or std.mem.eql(u8, arg, "-n")) {
            args.video_name = args_iter.next();
        } else if (std.mem.eql(u8, arg, "--verbose") or std.mem.eql(u8, arg, "-v")) {
            args.verbose = true;
        } else if (std.mem.eql(u8, arg, "--cdp-port")) {
            if (args_iter.next()) |p| {
                args.cdp_port = std.fmt.parseInt(u16, p, 10) catch 0;
            }
        } else if (std.mem.eql(u8, arg, "--url")) {
            args.url = args_iter.next();
        } else if (std.mem.eql(u8, arg, "--width")) {
            if (args_iter.next()) |v| {
                args.width = std.fmt.parseInt(u32, v, 10) catch 1080;
            }
        } else if (std.mem.eql(u8, arg, "--height")) {
            if (args_iter.next()) |v| {
                args.height = std.fmt.parseInt(u32, v, 10) catch 1080;
            }
        } else if (std.mem.eql(u8, arg, "--fps")) {
            if (args_iter.next()) |v| {
                args.fps = std.fmt.parseInt(u32, v, 10) catch 60;
            }
        } else if (std.mem.eql(u8, arg, "--steps")) {
            args.steps_json = args_iter.next();
        } else if (std.mem.eql(u8, arg, "--color-scheme")) {
            args.color_scheme = args_iter.next();
        } else if (std.mem.eql(u8, arg, "--default-delay")) {
            if (args_iter.next()) |v| {
                args.default_delay = std.fmt.parseInt(u64, v, 10) catch null;
            }
        } else if (std.mem.eql(u8, arg, "--click-dwell")) {
            if (args_iter.next()) |v| {
                args.click_dwell = std.fmt.parseInt(u64, v, 10) catch null;
            }
        } else if (std.mem.eql(u8, arg, "--screen-width")) {
            if (args_iter.next()) |v| {
                args.screen_width = std.fmt.parseInt(u32, v, 10) catch null;
            }
        } else if (std.mem.eql(u8, arg, "--screen-height")) {
            if (args_iter.next()) |v| {
                args.screen_height = std.fmt.parseInt(u32, v, 10) catch null;
            }
        } else if (std.mem.eql(u8, arg, "--input")) {
            args.input = args_iter.next();
        } else if (std.mem.eql(u8, arg, "--output")) {
            args.output = args_iter.next();
        } else if (std.mem.eql(u8, arg, "--timeline")) {
            args.timeline = args_iter.next();
        } else if (std.mem.eql(u8, arg, "--cursor")) {
            args.cursor = args_iter.next();
        } else if (std.mem.eql(u8, arg, "--cursor-svg")) {
            args.cursor_svg = args_iter.next();
        } else if (std.mem.eql(u8, arg, "--cursor-size")) {
            if (args_iter.next()) |s| {
                args.cursor_size = std.fmt.parseInt(u32, s, 10) catch 0;
            }
        } else if (std.mem.eql(u8, arg, "--font")) {
            args.font = args_iter.next();
        } else if (std.mem.eql(u8, arg, "--ffmpeg")) {
            args.ffmpeg = args_iter.next() orelse "ffmpeg";
        } else if (std.mem.eql(u8, arg, "--crf")) {
            if (args_iter.next()) |crf_str| {
                args.crf = std.fmt.parseInt(u32, crf_str, 10) catch 18;
            }
        } else if (std.mem.eql(u8, arg, "--backend")) {
            if (args_iter.next()) |b| {
                if (std.mem.eql(u8, b, "gpu")) args.backend = .gpu
                else if (std.mem.eql(u8, b, "cpu")) args.backend = .cpu
                else args.backend = .auto;
            }
        }
    }

    return args;
}

const WindowJson = struct {
    titlebar_visible: bool = false,
    titlebar_title: ?[]const u8 = null,
    titlebar_stoplight: bool = true,
    titlebar_height: u32 = 36,
    titlebar_background: []const u8 = "#e8e8e8",
    border_radius: u32 = 0,
    shadow_blur: u32 = 40,
    shadow_color: []const u8 = "rgba(0,0,0,0.35)",
    shadow_offset_y: i32 = 10,
};

const BackgroundJson = struct {
    color: []const u8 = "#e0e0e0",
};

const TimelineJson = struct {
    fps: u32 = 30,
    width: u32 = 1920,
    height: u32 = 1080,
    zoom: f64 = 1,
    screen_width: ?u32 = null,
    screen_height: ?u32 = null,
    window: ?WindowJson = null,
    background: ?BackgroundJson = null,
    hud_font_size: u32 = 16,
    hud_border_radius: u32 = 8,
    hud_position: []const u8 = "bottom",
    frames: []const FrameJson = &.{},
};

const FrameJson = struct {
    cursor: CursorJson = .{},
    hud: ?HudJson = null,
};

const CursorJson = struct {
    x: f64 = 0,
    y: f64 = 0,
    scale: f64 = 1,
};

const HudJson = struct {
    labels: []const []const u8 = &.{},
};

fn dupeStr(allocator: std.mem.Allocator, s: []const u8) ![]const u8 {
    return allocator.dupe(u8, s);
}

fn dupeOptionalStr(allocator: std.mem.Allocator, s: ?[]const u8) !?[]const u8 {
    if (s) |str| return try allocator.dupe(u8, str);
    return null;
}

fn load_timeline(allocator: std.mem.Allocator, path: []const u8) !struct { types.TimelineData, []types.FrameData } {
    const json_data = try std.fs.cwd().readFileAlloc(allocator, path, 100 * 1024 * 1024);
    defer allocator.free(json_data);

    const parsed = try std.json.parseFromSlice(TimelineJson, allocator, json_data, .{
        .ignore_unknown_fields = true,
    });
    defer parsed.deinit();

    const tj = parsed.value;

    const frames = try allocator.alloc(types.FrameData, tj.frames.len);
    for (tj.frames, 0..) |f, i| {
        var hud_state: ?types.HudState = null;
        if (f.hud) |h| {
            if (h.labels.len > 0) {
                const duped_labels = try allocator.alloc([]const u8, h.labels.len);
                for (h.labels, 0..) |label, li| {
                    duped_labels[li] = try dupeStr(allocator, label);
                }
                hud_state = .{ .labels = duped_labels };
            }
        }
        frames[i] = .{
            .cursor = .{
                .x = f.cursor.x,
                .y = f.cursor.y,
                .scale = f.cursor.scale,
            },
            .hud = hud_state,
        };
    }

    var window_config: ?types.WindowConfig = null;
    if (tj.window) |wj| {
        window_config = .{
            .titlebar_visible = wj.titlebar_visible,
            .titlebar_title = try dupeOptionalStr(allocator, wj.titlebar_title),
            .titlebar_stoplight = wj.titlebar_stoplight,
            .titlebar_height = wj.titlebar_height,
            .titlebar_background = try dupeStr(allocator, wj.titlebar_background),
            .border_radius = wj.border_radius,
            .shadow_blur = wj.shadow_blur,
            .shadow_color = try dupeStr(allocator, wj.shadow_color),
            .shadow_offset_y = wj.shadow_offset_y,
        };
    }

    var background_config: ?types.BackgroundConfig = null;
    if (tj.background) |bj| {
        background_config = .{
            .bg_type = .solid,
            .color = try dupeStr(allocator, bj.color),
        };
    }

    const hud_pos: types.HudPosition = if (std.mem.eql(u8, tj.hud_position, "top")) .top else .bottom;

    const timeline = types.TimelineData{
        .fps = tj.fps,
        .width = tj.width,
        .height = tj.height,
        .zoom = tj.zoom,
        .screen_width = tj.screen_width,
        .screen_height = tj.screen_height,
        .window = window_config,
        .background = background_config,
        .hud_font_size = tj.hud_font_size,
        .hud_border_radius = tj.hud_border_radius,
        .hud_position = hud_pos,
        .frames = frames,
    };

    return .{ timeline, frames };
}

fn run_compose(allocator: std.mem.Allocator, args: Args) !void {
    const input_path = args.input orelse return error.MissingInput;
    const output_path = args.output orelse return error.MissingOutput;
    const timeline_path = args.timeline orelse return error.MissingTimeline;

    const result = try load_timeline(allocator, timeline_path);
    const timeline = result[0];
    const frames = result[1];
    defer allocator.free(frames);

    var compositor = try comp.Compositor.initFull(allocator, timeline, args.cursor, args.cursor_svg, args.cursor_size, args.font, args.backend);
    defer compositor.deinit();

    const screen_w = timeline.screen_width orelse timeline.width;
    const screen_h = timeline.screen_height orelse timeline.height;

    var width_buf: [16]u8 = undefined;
    var height_buf: [16]u8 = undefined;
    var fps_buf: [16]u8 = undefined;
    var crf_buf: [16]u8 = undefined;

    const width_str = std.fmt.bufPrint(&width_buf, "{d}", .{screen_w}) catch unreachable;
    const height_str = std.fmt.bufPrint(&height_buf, "{d}", .{screen_h}) catch unreachable;
    const fps_str = std.fmt.bufPrint(&fps_buf, "{d}", .{timeline.fps}) catch unreachable;
    const crf_str = std.fmt.bufPrint(&crf_buf, "{d}", .{args.crf}) catch unreachable;

    var size_buf: [33]u8 = undefined;
    const size_str = std.fmt.bufPrint(&size_buf, "{s}x{s}", .{ width_str, height_str }) catch unreachable;

    var decoder = std.process.Child.init(
        &.{
            args.ffmpeg,
            "-hide_banner",
            "-loglevel",
            "error",
            "-i",
            input_path,
            "-f",
            "rawvideo",
            "-pix_fmt",
            "rgba",
            "-v",
            "error",
            "-",
        },
        allocator,
    );
    decoder.stdout_behavior = .Pipe;
    decoder.stderr_behavior = .Ignore;
    try decoder.spawn();

    var encoder = std.process.Child.init(
        &.{
            args.ffmpeg,
            "-hide_banner",
            "-loglevel",
            "error",
            "-f",
            "rawvideo",
            "-pixel_format",
            "rgba",
            "-video_size",
            size_str,
            "-framerate",
            fps_str,
            "-i",
            "pipe:0",
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            "-crf",
            crf_str,
            "-preset",
            "medium",
            "-movflags",
            "+faststart",
            "-y",
            output_path,
        },
        allocator,
    );
    encoder.stdin_behavior = .Pipe;
    encoder.stderr_behavior = .Ignore;
    try encoder.spawn();

    const frame_size = @as(usize, timeline.width) * @as(usize, timeline.height) * 4;
    const frame_buf = try allocator.alloc(u8, frame_size);
    defer allocator.free(frame_buf);

    const decoder_stdout = decoder.stdout.?;
    const encoder_stdin = encoder.stdin.?;

    var frame_idx: usize = 0;
    while (frame_idx < timeline.frames.len) : (frame_idx += 1) {
        var total_read: usize = 0;
        while (total_read < frame_size) {
            const n = decoder_stdout.read(frame_buf[total_read..frame_size]) catch {
                break;
            };
            if (n == 0) break;
            total_read += n;
        }
        if (total_read < frame_size) break;

        var content_image = types.Image{
            .data = frame_buf,
            .width = timeline.width,
            .height = timeline.height,
            .channels = 4,
            .allocator = allocator,
        };

        const composited = compositor.compose_frame(&content_image, &timeline.frames[frame_idx]);
        const out_size = @as(usize, screen_w) * @as(usize, screen_h) * 4;
        encoder_stdin.writeAll(composited[0..out_size]) catch |err| {
            std.debug.print("encoder write error: {}\n", .{err});
            break;
        };

        // Prevent deinit from freeing the borrowed frame_buf
        content_image.data = &.{};
    }

    encoder.stdin.?.close();
    encoder.stdin = null;

    decoder.stdout.?.close();
    decoder.stdout = null;

    const enc_term = try encoder.wait();
    const dec_term = try decoder.wait();

    switch (enc_term) {
        .Exited => |code| {
            if (code != 0) {
                std.debug.print("ffmpeg encoder exited with code {d}\n", .{code});
                return error.FfmpegEncodeFailed;
            }
        },
        else => {
            std.debug.print("ffmpeg encoder terminated abnormally\n", .{});
            return error.FfmpegEncodeFailed;
        },
    }

    switch (dec_term) {
        .Exited => |code| {
            if (code != 0) {
                std.debug.print("ffmpeg decoder exited with code {d}\n", .{code});
            }
        },
        else => {},
    }

    std.debug.print("composed {d} frames -> {s}\n", .{ frame_idx, output_path });
}

const StreamConfigJson = struct {
    fps: u32 = 60,
    width: u32 = 1920,
    height: u32 = 1080,
    zoom: f64 = 1,
    screen_width: ?u32 = null,
    screen_height: ?u32 = null,
    window: ?WindowJson = null,
    background: ?BackgroundJson = null,
    hud_font_size: u32 = 16,
    hud_border_radius: u32 = 8,
    hud_position: []const u8 = "bottom",
};

const StreamFrameJson = struct {
    cursor: CursorJson = .{},
    hud: ?HudJson = null,
};

fn read_exact(file: std.fs.File, buf: []u8) !void {
    var total: usize = 0;
    while (total < buf.len) {
        const n = file.read(buf[total..]) catch return error.ReadFailed;
        if (n == 0) return error.UnexpectedEof;
        total += n;
    }
}

fn read_u32_le(file: std.fs.File) !u32 {
    var buf: [4]u8 = undefined;
    try read_exact(file, &buf);
    return std.mem.readInt(u32, &buf, .little);
}

fn build_timeline_from_stream_config(cfg: StreamConfigJson) struct { types.TimelineData, ?types.WindowConfig, ?types.BackgroundConfig } {
    var window_config: ?types.WindowConfig = null;
    if (cfg.window) |wj| {
        window_config = .{
            .titlebar_visible = wj.titlebar_visible,
            .titlebar_title = wj.titlebar_title,
            .titlebar_stoplight = wj.titlebar_stoplight,
            .titlebar_height = wj.titlebar_height,
            .titlebar_background = wj.titlebar_background,
            .border_radius = wj.border_radius,
            .shadow_blur = wj.shadow_blur,
            .shadow_color = wj.shadow_color,
            .shadow_offset_y = wj.shadow_offset_y,
        };
    }

    var background_config: ?types.BackgroundConfig = null;
    if (cfg.background) |bj| {
        background_config = .{
            .bg_type = .solid,
            .color = bj.color,
        };
    }

    const hud_pos: types.HudPosition = if (std.mem.eql(u8, cfg.hud_position, "top")) .top else .bottom;

    const timeline = types.TimelineData{
        .fps = cfg.fps,
        .width = cfg.width,
        .height = cfg.height,
        .zoom = cfg.zoom,
        .screen_width = cfg.screen_width,
        .screen_height = cfg.screen_height,
        .window = window_config,
        .background = background_config,
        .hud_font_size = cfg.hud_font_size,
        .hud_border_radius = cfg.hud_border_radius,
        .hud_position = hud_pos,
        .frames = &.{},
    };

    return .{ timeline, window_config, background_config };
}

fn run_stream(allocator: std.mem.Allocator, args: Args) !void {
    const output_path = args.output orelse return error.MissingOutput;
    const stdin_file = std.fs.File{ .handle = std.posix.STDIN_FILENO };

    var magic: [4]u8 = undefined;
    try read_exact(stdin_file, &magic);
    if (!std.mem.eql(u8, &magic, "WRST")) return error.InvalidMagic;

    const config_len = try read_u32_le(stdin_file);
    if (config_len > 10 * 1024 * 1024) return error.ConfigTooLarge;
    const config_json = try allocator.alloc(u8, config_len);
    defer allocator.free(config_json);
    try read_exact(stdin_file, config_json);

    const parsed = try std.json.parseFromSlice(StreamConfigJson, allocator, config_json, .{
        .ignore_unknown_fields = true,
    });
    defer parsed.deinit();
    const cfg = parsed.value;

    const result = build_timeline_from_stream_config(cfg);
    const timeline = result[0];

    var compositor = try comp.Compositor.initFull(allocator, timeline, args.cursor, args.cursor_svg, args.cursor_size, args.font, args.backend);
    defer compositor.deinit();

    const screen_w = timeline.screen_width orelse timeline.width;
    const screen_h = timeline.screen_height orelse timeline.height;

    var width_buf: [16]u8 = undefined;
    var height_buf: [16]u8 = undefined;
    var fps_buf: [16]u8 = undefined;
    var crf_buf: [16]u8 = undefined;

    const width_str = std.fmt.bufPrint(&width_buf, "{d}", .{screen_w}) catch unreachable;
    const height_str = std.fmt.bufPrint(&height_buf, "{d}", .{screen_h}) catch unreachable;
    const fps_str = std.fmt.bufPrint(&fps_buf, "{d}", .{cfg.fps}) catch unreachable;
    const crf_str = std.fmt.bufPrint(&crf_buf, "{d}", .{args.crf}) catch unreachable;

    var size_buf: [33]u8 = undefined;
    const size_str = std.fmt.bufPrint(&size_buf, "{s}x{s}", .{ width_str, height_str }) catch unreachable;

    var encoder = std.process.Child.init(
        &.{
            args.ffmpeg,
            "-hide_banner",
            "-loglevel",
            "error",
            "-f",
            "rawvideo",
            "-pixel_format",
            "rgba",
            "-video_size",
            size_str,
            "-framerate",
            fps_str,
            "-i",
            "pipe:0",
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            "-crf",
            crf_str,
            "-preset",
            "medium",
            "-color_primaries",
            "bt709",
            "-color_trc",
            "bt709",
            "-colorspace",
            "bt709",
            "-movflags",
            "+faststart",
            "-y",
            output_path,
        },
        allocator,
    );
    encoder.stdin_behavior = .Pipe;
    encoder.stderr_behavior = .Ignore;
    try encoder.spawn();

    const frame_pixel_size: usize = @as(usize, cfg.width) * @as(usize, cfg.height) * 4;
    const frame_buf = try allocator.alloc(u8, frame_pixel_size);
    defer allocator.free(frame_buf);

    const out_size: usize = @as(usize, screen_w) * @as(usize, screen_h) * 4;
    const encoder_stdin = encoder.stdin.?;

    var jpeg_buf = try allocator.alloc(u8, 2 * 1024 * 1024);
    defer allocator.free(jpeg_buf);
    var meta_buf = try allocator.alloc(u8, 4096);
    defer allocator.free(meta_buf);

    var frame_idx: usize = 0;
    while (true) {
        const jpeg_len = read_u32_le(stdin_file) catch break;
        if (jpeg_len == 0) break;

        if (jpeg_len > jpeg_buf.len) {
            jpeg_buf = try allocator.realloc(jpeg_buf, jpeg_len);
        }
        read_exact(stdin_file, jpeg_buf[0..jpeg_len]) catch break;

        const meta_len = read_u32_le(stdin_file) catch break;
        if (meta_len > meta_buf.len) {
            meta_buf = try allocator.realloc(meta_buf, meta_len);
        }
        read_exact(stdin_file, meta_buf[0..meta_len]) catch break;

        const frame_parsed = std.json.parseFromSlice(StreamFrameJson, allocator, meta_buf[0..meta_len], .{
            .ignore_unknown_fields = true,
        }) catch continue;
        defer frame_parsed.deinit();
        const fm = frame_parsed.value;

        jpeg_mod.decode_into(jpeg_buf[0..jpeg_len], frame_buf, cfg.width, cfg.height) catch continue;

        var hud_state: ?types.HudState = null;
        if (fm.hud) |h| {
            if (h.labels.len > 0) {
                hud_state = .{ .labels = h.labels };
            }
        }
        var frame_data = types.FrameData{
            .cursor = .{
                .x = fm.cursor.x,
                .y = fm.cursor.y,
                .scale = fm.cursor.scale,
            },
            .hud = hud_state,
        };

        var content_image = types.Image{
            .data = frame_buf,
            .width = cfg.width,
            .height = cfg.height,
            .channels = 4,
            .allocator = allocator,
        };

        const composited = compositor.compose_frame(&content_image, &frame_data);
        encoder_stdin.writeAll(composited[0..out_size]) catch |err| {
            std.debug.print("encoder write error: {}\n", .{err});
            break;
        };

        content_image.data = &.{};
        frame_idx += 1;
    }

    encoder.stdin.?.close();
    encoder.stdin = null;

    const enc_term = try encoder.wait();
    switch (enc_term) {
        .Exited => |code| {
            if (code != 0) {
                std.debug.print("ffmpeg encoder exited with code {d}\n", .{code});
                return error.FfmpegEncodeFailed;
            }
        },
        else => {
            std.debug.print("ffmpeg encoder terminated abnormally\n", .{});
            return error.FfmpegEncodeFailed;
        },
    }

    std.debug.print("streamed {d} frames -> {s}\n", .{ frame_idx, output_path });
}

fn dupeOptionalTarget(allocator: std.mem.Allocator, t: ?StepTargetJson) !?runner_mod.StepTarget {
    if (t) |target| {
        return runner_mod.StepTarget{
            .text = try dupeOptionalStr(allocator, target.text),
            .selector = try dupeOptionalStr(allocator, target.selector),
            .within = try dupeOptionalStr(allocator, target.within),
        };
    }
    return null;
}

fn parse_steps(allocator: std.mem.Allocator, json_path: []const u8) ![]runner_mod.Step {
    const json_data = std.fs.cwd().readFileAlloc(allocator, json_path, 50 * 1024 * 1024) catch return error.StepsFileNotFound;
    defer allocator.free(json_data);

    const parsed = std.json.parseFromSlice([]const StepJson, allocator, json_data, .{
        .ignore_unknown_fields = true,
    }) catch return error.StepsParseError;
    defer parsed.deinit();

    const step_jsons = parsed.value;
    const steps = try allocator.alloc(runner_mod.Step, step_jsons.len);

    for (step_jsons, 0..) |sj, i| {
        steps[i] = .{
            .action = parseStepAction(sj.action) orelse .pause,
            .ms = sj.ms,
            .text = try dupeOptionalStr(allocator, sj.text),
            .selector = try dupeOptionalStr(allocator, sj.selector),
            .within = try dupeOptionalStr(allocator, sj.within),
            .key = try dupeOptionalStr(allocator, sj.key),
            .label = try dupeOptionalStr(allocator, sj.label),
            .x = sj.x,
            .y = sj.y,
            .url = try dupeOptionalStr(allocator, sj.url),
            .output = try dupeOptionalStr(allocator, sj.output),
            .value = try dupeOptionalStr(allocator, sj.value),
            .delay = sj.delay,
            .char_delay = sj.charDelay,
            .timeout = sj.timeout,
            .from = try dupeOptionalTarget(allocator, sj.from),
            .to = try dupeOptionalTarget(allocator, sj.to),
            .target = try dupeOptionalStr(allocator, sj.target),
        };
    }

    return steps;
}

const StepTargetJson = struct {
    text: ?[]const u8 = null,
    selector: ?[]const u8 = null,
    within: ?[]const u8 = null,
};

const StepJson = struct {
    action: []const u8 = "pause",
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
    charDelay: ?u64 = null,
    timeout: ?u64 = null,
    from: ?StepTargetJson = null,
    to: ?StepTargetJson = null,
    target: ?[]const u8 = null,
};

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

fn run_record(allocator: std.mem.Allocator, args: Args) !void {
    const output_path = args.output orelse return error.MissingOutput;
    if (args.cdp_port == 0) return error.MissingCdpPort;

    std.debug.print("connecting to Chrome on port {d}...\n", .{args.cdp_port});
    var client = try cdp_mod.CdpClient.connect(allocator, args.cdp_port);
    defer client.deinit();

    try client.enablePage();
    try client.enableRuntime();
    try client.setDeviceMetrics(args.width, args.height, 1.0);

    if (args.color_scheme) |cs| {
        try client.setEmulatedMedia("prefers-color-scheme", cs);
    }

    if (args.url) |url| {
        std.debug.print("navigating to {s}...\n", .{url});
        client.navigate(url) catch return error.NavigateFailed;
        client.waitForLoad() catch return error.WaitForLoadFailed;
    }

    actions_mod.sleepMs(200);

    var ctx = actions_mod.RecordingContext.init(allocator);
    ctx.mode = .record;
    ctx.resetCursorPosition(args.width, args.height);
    if (args.click_dwell) |d| {
        ctx.click_dwell = @floatFromInt(d);
    }

    var tl = timeline_mod.Timeline.init(allocator, args.width, args.height, args.fps, 1.0, timeline_mod.CursorState{
        .x = ctx.cursor_x,
        .y = ctx.cursor_y,
        .scale = 1.0,
    });
    defer tl.deinit();
    ctx.timeline = &tl;

    const screen_w = args.screen_width orelse args.width;
    const screen_h = args.screen_height orelse args.height;

    const timeline_data = types.TimelineData{
        .fps = args.fps,
        .width = args.width,
        .height = args.height,
        .zoom = 1.0,
        .screen_width = args.screen_width,
        .screen_height = args.screen_height,
        .window = null,
        .background = null,
        .hud_font_size = 16,
        .hud_border_radius = 8,
        .hud_position = .bottom,
        .frames = &.{},
    };

    var compositor = try comp.Compositor.initFull(
        allocator,
        timeline_data,
        args.cursor,
        args.cursor_svg,
        args.cursor_size,
        args.font,
        args.backend,
    );
    defer compositor.deinit();

    var width_buf: [16]u8 = undefined;
    var height_buf: [16]u8 = undefined;
    var fps_buf: [16]u8 = undefined;
    var crf_buf: [16]u8 = undefined;

    const w_str = std.fmt.bufPrint(&width_buf, "{d}", .{screen_w}) catch unreachable;
    const h_str = std.fmt.bufPrint(&height_buf, "{d}", .{screen_h}) catch unreachable;
    const fps_str = std.fmt.bufPrint(&fps_buf, "{d}", .{args.fps}) catch unreachable;
    const crf_str = std.fmt.bufPrint(&crf_buf, "{d}", .{args.crf}) catch unreachable;

    var size_buf: [33]u8 = undefined;
    const size_str = std.fmt.bufPrint(&size_buf, "{s}x{s}", .{ w_str, h_str }) catch unreachable;

    var encoder = std.process.Child.init(
        &.{
            args.ffmpeg,
            "-hide_banner",
            "-loglevel",
            "error",
            "-f",
            "rawvideo",
            "-pixel_format",
            "rgba",
            "-video_size",
            size_str,
            "-framerate",
            fps_str,
            "-i",
            "pipe:0",
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            "-crf",
            crf_str,
            "-preset",
            "medium",
            "-color_primaries",
            "bt709",
            "-color_trc",
            "bt709",
            "-colorspace",
            "bt709",
            "-movflags",
            "+faststart",
            "-y",
            output_path,
        },
        allocator,
    );
    encoder.stdin_behavior = .Pipe;
    encoder.stderr_behavior = .Ignore;
    try encoder.spawn();

    const out_size: usize = @as(usize, screen_w) * @as(usize, screen_h) * 4;
    const encoder_stdin = encoder.stdin.?;

    const frame_ms: f64 = 1000.0 / @as(f64, @floatFromInt(args.fps));

    std.debug.print("recording started, executing steps...\n", .{});
    actions_mod.sleepMs(500);

    // Execute steps while capturing frames in a simple loop:
    // For each step, we capture screenshots and composite them.
    // Steps are executed synchronously, and between each step
    // we capture as many frames as needed to maintain framerate.
    if (args.steps_json) |steps_path| {
        const steps = parse_steps(allocator, steps_path) catch |err| {
            std.debug.print("failed to load steps: {}\n", .{err});
            return err;
        };
        defer allocator.free(steps);

        const capture_start = std.time.milliTimestamp();
        var frame_count: usize = 0;

        for (steps, 0..) |step, i| {
            std.debug.print("  step {d}: {s}\n", .{ i, @tagName(step.action) });

            runner_mod.executeStep(&ctx, &client, step) catch |err| {
                std.debug.print("  step {d} failed: {}\n", .{ i, err });
                break;
            };

            // Capture frames to maintain framerate after step
            const now = std.time.milliTimestamp();
            const elapsed_ms: f64 = @floatFromInt(now - capture_start);
            const expected_frames = @max(frame_count + 1, @as(usize, @intFromFloat(@round(elapsed_ms / frame_ms))));

            while (frame_count < expected_frames) {
                const jpeg_data = client.captureScreenshot("jpeg", 92) catch break;
                defer allocator.free(jpeg_data);

                tl.tick();
                const frame = tl.getLastFrame() orelse continue;

                const frame_pixel_size: usize = @as(usize, args.width) * @as(usize, args.height) * 4;
                const frame_buf = allocator.alloc(u8, frame_pixel_size) catch break;
                defer allocator.free(frame_buf);

                jpeg_mod.decode_into(jpeg_data, frame_buf, args.width, args.height) catch continue;

                var content_image = types.Image{
                    .data = frame_buf,
                    .width = args.width,
                    .height = args.height,
                    .channels = 4,
                    .allocator = allocator,
                };

                var frame_data = types.FrameData{
                    .cursor = .{
                        .x = frame.cursor.x,
                        .y = frame.cursor.y,
                        .scale = frame.cursor.scale,
                    },
                    .hud = if (frame.hud) |h| types.HudState{ .labels = h.labels } else null,
                };

                const composited = compositor.compose_frame(&content_image, &frame_data);
                encoder_stdin.writeAll(composited[0..out_size]) catch break;

                content_image.data = &.{};
                frame_count += 1;
            }
        }

        // Capture a few trailing frames after all steps complete
        for (0..@as(usize, args.fps / 2)) |_| {
            const jpeg_data = client.captureScreenshot("jpeg", 92) catch break;
            defer allocator.free(jpeg_data);

            tl.tick();
            const frame = tl.getLastFrame() orelse continue;

            const frame_pixel_size: usize = @as(usize, args.width) * @as(usize, args.height) * 4;
            const frame_buf = allocator.alloc(u8, frame_pixel_size) catch break;
            defer allocator.free(frame_buf);

            jpeg_mod.decode_into(jpeg_data, frame_buf, args.width, args.height) catch continue;

            var content_image = types.Image{
                .data = frame_buf,
                .width = args.width,
                .height = args.height,
                .channels = 4,
                .allocator = allocator,
            };

            var frame_data = types.FrameData{
                .cursor = .{
                    .x = frame.cursor.x,
                    .y = frame.cursor.y,
                    .scale = frame.cursor.scale,
                },
                .hud = if (frame.hud) |h| types.HudState{ .labels = h.labels } else null,
            };

            const composited = compositor.compose_frame(&content_image, &frame_data);
            encoder_stdin.writeAll(composited[0..out_size]) catch break;

            content_image.data = &.{};
            frame_count += 1;
        }

        std.debug.print("recorded {d} frames\n", .{frame_count});
    }

    encoder.stdin.?.close();
    encoder.stdin = null;

    const enc_term = try encoder.wait();
    switch (enc_term) {
        .Exited => |code| {
            if (code != 0) {
                std.debug.print("ffmpeg encoder exited with code {d}\n", .{code});
                return error.FfmpegEncodeFailed;
            }
        },
        else => {
            std.debug.print("ffmpeg encoder terminated abnormally\n", .{});
            return error.FfmpegEncodeFailed;
        },
    }

    std.debug.print("recorded -> {s}\n", .{output_path});
}

fn run_record_full(allocator: std.mem.Allocator, args: Args) !void {
    const config_path = config_mod.resolveConfigPath(allocator, args.config_path) catch {
        std.debug.print("error: no config file found. Create a webreel.config.json or specify one with --config.\n", .{});
        return error.NoConfigFileFound;
    };
    defer allocator.free(config_path);

    std.debug.print("loading config: {s}\n", .{config_path});
    var config = config_mod.loadConfig(allocator, config_path) catch |err| {
        std.debug.print("error loading config: {}\n", .{err});
        return err;
    };

    config_mod.validateConfig(&config) catch |err| {
        std.debug.print("config validation failed: {}\n", .{err});
        return err;
    };

    var single_video: [1]config_mod.VideoConfig = undefined;
    var videos_to_run = config.videos;
    if (args.video_name) |name| {
        for (config.videos) |video| {
            if (std.mem.eql(u8, video.name, name)) {
                single_video = [1]config_mod.VideoConfig{video};
                videos_to_run = &single_video;
                break;
            }
        }
    }

    for (videos_to_run) |video| {
        std.debug.print("\nrecording: {s}\n", .{video.name});

        std.debug.print("launching Chrome...\n", .{});
        var chrome = install_mod.launchChrome(allocator, true) catch |err| {
            std.debug.print("failed to launch Chrome: {}\n", .{err});
            return err;
        };

        actions_mod.sleepMs(1000);

        std.debug.print("connecting to Chrome on port {d}...\n", .{chrome.port});
        var client = cdp_mod.CdpClient.connect(allocator, chrome.port) catch |err| {
            std.debug.print("failed to connect CDP: {}\n", .{err});
            _ = chrome.process.kill() catch {};
            return err;
        };
        defer client.deinit();

        try client.enablePage();
        try client.enableRuntime();
        try client.setDeviceMetrics(video.width, video.height, 1.0);

        if (video.color_scheme) |cs| {
            try client.setEmulatedMedia("prefers-color-scheme", cs);
        }

        const base_url = video.base_url orelse "";
        var url_buf = std.ArrayList(u8).empty;
        defer url_buf.deinit(allocator);
        try url_buf.appendSlice(allocator, base_url);
        try url_buf.appendSlice(allocator, video.url);

        std.debug.print("navigating to {s}...\n", .{url_buf.items});
        client.navigate(url_buf.items) catch |err| {
            std.debug.print("navigation failed: {}\n", .{err});
            _ = chrome.process.kill() catch {};
            return err;
        };
        client.waitForLoad() catch {};

        actions_mod.sleepMs(200);

        var ctx = actions_mod.RecordingContext.init(allocator);
        ctx.mode = .record;
        ctx.resetCursorPosition(video.width, video.height);
        if (video.click_dwell) |d| {
            ctx.click_dwell = @floatFromInt(d);
        }

        var tl = timeline_mod.Timeline.init(allocator, video.width, video.height, video.fps, video.zoom, timeline_mod.CursorState{
            .x = ctx.cursor_x,
            .y = ctx.cursor_y,
            .scale = 1.0,
        });
        defer tl.deinit();
        ctx.timeline = &tl;

        const screen_w = video.screen_width orelse video.width;
        const screen_h = video.screen_height orelse video.height;

        const timeline_data = types.TimelineData{
            .fps = video.fps,
            .width = video.width,
            .height = video.height,
            .zoom = video.zoom,
            .screen_width = video.screen_width,
            .screen_height = video.screen_height,
            .window = null,
            .background = null,
            .hud_font_size = 16,
            .hud_border_radius = 8,
            .hud_position = .bottom,
            .frames = &.{},
        };

        var compositor = comp.Compositor.initFull(
            allocator,
            timeline_data,
            args.cursor,
            args.cursor_svg orelse video.cursor_svg_path,
            args.cursor_size,
            args.font orelse video.font_path,
            args.backend,
        ) catch |err| {
            std.debug.print("failed to init compositor: {}\n", .{err});
            _ = chrome.process.kill() catch {};
            return err;
        };
        defer compositor.deinit();

        const output_path = video.output orelse blk: {
            const buf = std.fmt.allocPrint(allocator, "videos/{s}.mp4", .{video.name}) catch break :blk "output.mp4";
            break :blk buf;
        };

        const ffmpeg_path = video.ffmpeg_path;
        var width_buf2: [16]u8 = undefined;
        var height_buf2: [16]u8 = undefined;
        var fps_buf2: [16]u8 = undefined;
        var crf_buf2: [16]u8 = undefined;

        const w_str2 = std.fmt.bufPrint(&width_buf2, "{d}", .{screen_w}) catch unreachable;
        const h_str2 = std.fmt.bufPrint(&height_buf2, "{d}", .{screen_h}) catch unreachable;
        const fps_str2 = std.fmt.bufPrint(&fps_buf2, "{d}", .{video.fps}) catch unreachable;
        const crf_str2 = std.fmt.bufPrint(&crf_buf2, "{d}", .{video.crf}) catch unreachable;

        var size_buf2: [33]u8 = undefined;
        const size_str2 = std.fmt.bufPrint(&size_buf2, "{s}x{s}", .{ w_str2, h_str2 }) catch unreachable;

        // Ensure output directory exists
        if (std.fs.path.dirname(output_path)) |dir| {
            std.fs.cwd().makePath(dir) catch {};
        }

        var encoder = std.process.Child.init(
            &.{
                ffmpeg_path,
                "-hide_banner",
                "-loglevel",
                "error",
                "-f",
                "rawvideo",
                "-pixel_format",
                "rgba",
                "-video_size",
                size_str2,
                "-framerate",
                fps_str2,
                "-i",
                "pipe:0",
                "-c:v",
                "libx264",
                "-pix_fmt",
                "yuv420p",
                "-crf",
                crf_str2,
                "-preset",
                "medium",
                "-color_primaries",
                "bt709",
                "-color_trc",
                "bt709",
                "-colorspace",
                "bt709",
                "-movflags",
                "+faststart",
                "-y",
                output_path,
            },
            allocator,
        );
        encoder.stdin_behavior = .Pipe;
        encoder.stderr_behavior = .Ignore;
        try encoder.spawn();

        const out_size: usize = @as(usize, screen_w) * @as(usize, screen_h) * 4;
        const encoder_stdin = encoder.stdin.?;
        const frame_ms_val: f64 = 1000.0 / @as(f64, @floatFromInt(video.fps));

        std.debug.print("recording started, executing {d} steps...\n", .{video.steps.len});
        actions_mod.sleepMs(500);

        const capture_start = std.time.milliTimestamp();
        var frame_count: usize = 0;

        for (video.steps, 0..) |step, i| {
            if (args.verbose) std.debug.print("  step {d}: {s}\n", .{ i, @tagName(step.action) });

            runner_mod.executeStep(&ctx, &client, step) catch |err| {
                std.debug.print("  step {d} failed: {}\n", .{ i, err });
                break;
            };

            const now = std.time.milliTimestamp();
            const elapsed_ms: f64 = @floatFromInt(now - capture_start);
            const expected_frames = @max(frame_count + 1, @as(usize, @intFromFloat(@round(elapsed_ms / frame_ms_val))));

            while (frame_count < expected_frames) {
                const jpeg_data = client.captureScreenshot("jpeg", 92) catch break;
                defer allocator.free(jpeg_data);

                tl.tick();
                const frame = tl.getLastFrame() orelse continue;

                const frame_pixel_size: usize = @as(usize, video.width) * @as(usize, video.height) * 4;
                const frame_buf2 = allocator.alloc(u8, frame_pixel_size) catch break;
                defer allocator.free(frame_buf2);

                jpeg_mod.decode_into(jpeg_data, frame_buf2, video.width, video.height) catch continue;

                var content_image = types.Image{
                    .data = frame_buf2,
                    .width = video.width,
                    .height = video.height,
                    .channels = 4,
                    .allocator = allocator,
                };

                var frame_data = types.FrameData{
                    .cursor = .{
                        .x = frame.cursor.x,
                        .y = frame.cursor.y,
                        .scale = frame.cursor.scale,
                    },
                    .hud = if (frame.hud) |h| types.HudState{ .labels = h.labels } else null,
                };

                const composited = compositor.compose_frame(&content_image, &frame_data);
                encoder_stdin.writeAll(composited[0..out_size]) catch break;

                content_image.data = &.{};
                frame_count += 1;
            }
        }

        // Trailing frames
        for (0..@as(usize, video.fps / 2)) |_| {
            const jpeg_data = client.captureScreenshot("jpeg", 92) catch break;
            defer allocator.free(jpeg_data);
            tl.tick();
            const frame = tl.getLastFrame() orelse continue;
            const frame_pixel_size: usize = @as(usize, video.width) * @as(usize, video.height) * 4;
            const frame_buf2 = allocator.alloc(u8, frame_pixel_size) catch break;
            defer allocator.free(frame_buf2);
            jpeg_mod.decode_into(jpeg_data, frame_buf2, video.width, video.height) catch continue;
            var content_image = types.Image{ .data = frame_buf2, .width = video.width, .height = video.height, .channels = 4, .allocator = allocator };
            var frame_data = types.FrameData{
                .cursor = .{ .x = frame.cursor.x, .y = frame.cursor.y, .scale = frame.cursor.scale },
                .hud = if (frame.hud) |h| types.HudState{ .labels = h.labels } else null,
            };
            const composited = compositor.compose_frame(&content_image, &frame_data);
            encoder_stdin.writeAll(composited[0..out_size]) catch break;
            content_image.data = &.{};
            frame_count += 1;
        }

        encoder.stdin.?.close();
        encoder.stdin = null;
        const enc_term = try encoder.wait();
        switch (enc_term) {
            .Exited => |code| {
                if (code != 0) {
                    std.debug.print("ffmpeg exited with code {d}\n", .{code});
                }
            },
            else => {},
        }

        _ = chrome.process.kill() catch {};

        std.debug.print("done: {s} ({d} frames)\n", .{ output_path, frame_count });
    }
}

fn run_init(_: std.mem.Allocator, _: Args) !void {
    const config_content =
        \\{
        \\  "$schema": "https://webreel.dev/schema/v1.json",
        \\  "baseUrl": "http://localhost:3000",
        \\  "videos": {
        \\    "demo": {
        \\      "url": "/",
        \\      "viewport": "desktop",
        \\      "steps": [
        \\        { "action": "pause", "ms": 1000 }
        \\      ]
        \\    }
        \\  }
        \\}
        \\
    ;

    const file = std.fs.cwd().createFile("webreel.config.json", .{ .exclusive = true }) catch |err| {
        if (err == error.PathAlreadyExists) {
            std.debug.print("webreel.config.json already exists\n", .{});
            return;
        }
        return err;
    };
    defer file.close();
    try file.writeAll(config_content);
    std.debug.print("created webreel.config.json\n", .{});
}

fn run_validate(allocator: std.mem.Allocator, args: Args) !void {
    const config_path = config_mod.resolveConfigPath(allocator, args.config_path) catch {
        std.debug.print("error: no config file found\n", .{});
        return error.NoConfigFileFound;
    };
    defer allocator.free(config_path);

    std.debug.print("validating {s}...\n", .{config_path});
    const config = config_mod.loadConfig(allocator, config_path) catch |err| {
        std.debug.print("config error: {}\n", .{err});
        return err;
    };

    config_mod.validateConfig(&config) catch |err| {
        std.debug.print("validation failed: {}\n", .{err});
        return err;
    };

    std.debug.print("valid ({d} video(s))\n", .{config.videos.len});
    for (config.videos) |video| {
        std.debug.print("  - {s}: {s} ({d} steps)\n", .{ video.name, video.url, video.steps.len });
    }
}

fn run_install(allocator: std.mem.Allocator, _: Args) !void {
    std.debug.print("checking dependencies...\n", .{});

    const chrome_path = install_mod.ensureChrome(allocator) catch {
        std.debug.print("Chrome: not found (install manually or set CHROME_PATH)\n", .{});
        return;
    };
    defer allocator.free(chrome_path);
    std.debug.print("Chrome: {s}\n", .{chrome_path});

    const ffmpeg_path = install_mod.ensureFfmpeg(allocator) catch {
        std.debug.print("ffmpeg: not found (install manually or set FFMPEG_PATH)\n", .{});
        return;
    };
    defer allocator.free(ffmpeg_path);
    std.debug.print("ffmpeg: {s}\n", .{ffmpeg_path});

    std.debug.print("all dependencies found\n", .{});
}

pub fn main() !void {
    var gpa = std.heap.GeneralPurposeAllocator(.{}){};
    defer _ = gpa.deinit();
    const allocator = gpa.allocator();

    const args = try parse_args(allocator);

    switch (args.mode) {
        .compose => run_compose(allocator, args) catch |err| {
            std.debug.print("error: {}\n", .{err});
            std.process.exit(1);
        },
        .stream => run_stream(allocator, args) catch |err| {
            std.debug.print("error: {}\n", .{err});
            std.process.exit(1);
        },
        .record => run_record(allocator, args) catch |err| {
            std.debug.print("error: {}\n", .{err});
            std.process.exit(1);
        },
        .record_full => run_record_full(allocator, args) catch |err| {
            std.debug.print("error: {}\n", .{err});
            std.process.exit(1);
        },
        .init => run_init(allocator, args) catch |err| {
            std.debug.print("error: {}\n", .{err});
            std.process.exit(1);
        },
        .validate => run_validate(allocator, args) catch |err| {
            std.debug.print("error: {}\n", .{err});
            std.process.exit(1);
        },
        .install => run_install(allocator, args) catch |err| {
            std.debug.print("error: {}\n", .{err});
            std.process.exit(1);
        },
    }
}
