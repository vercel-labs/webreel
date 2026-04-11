const std = @import("std");
const build_options = @import("build_options");
const types = @import("types.zig");
const cpu = @import("cpu_backend.zig");
const jpeg = @import("jpeg.zig");
const nanosvg = @import("nanosvg.zig");
const chrome_mod = @import("chrome.zig");
const hud_mod = @import("hud.zig");
const gpu_mod = if (build_options.enable_gpu) @import("gpu_backend.zig") else struct {
    pub const GpuCompositor = void;
    pub fn is_available() bool {
        return false;
    }
};

pub const Backend = enum { cpu, gpu, auto };

pub const Compositor = struct {
    allocator: std.mem.Allocator,
    framebuffer: cpu.Framebuffer,
    layout: types.Layout,
    cursor_image: ?types.Image,
    bg_color: types.RGBA,
    chrome_config: ?chrome_mod.ChromeConfig,
    font_ctx: ?hud_mod.FontContext,
    hud_config: hud_mod.HudConfig,
    gpu: if (build_options.enable_gpu) ?gpu_mod.GpuCompositor else void,
    use_gpu: bool,

    pub fn init(
        allocator: std.mem.Allocator,
        timeline: types.TimelineData,
        cursor_path: ?[]const u8,
        font_path: ?[]const u8,
        backend: Backend,
    ) !Compositor {
        return initFull(allocator, timeline, cursor_path, null, 0, font_path, backend);
    }

    pub fn initFull(
        allocator: std.mem.Allocator,
        timeline: types.TimelineData,
        cursor_path: ?[]const u8,
        cursor_svg_path: ?[]const u8,
        cursor_size: u32,
        font_path: ?[]const u8,
        backend: Backend,
    ) !Compositor {
        const layout = types.resolve_layout(timeline);

        const svg_size: u32 = if (cursor_size > 0) cursor_size else 32;
        var cursor_image: ?types.Image = null;
        if (cursor_svg_path) |svg_path| {
            cursor_image = nanosvg.rasterize_svg_file(svg_path, svg_size, svg_size, allocator) catch null;
        }
        if (cursor_image == null) {
            if (cursor_path) |cpath| {
                const cursor_data = try std.fs.cwd().readFileAlloc(allocator, cpath, 10 * 1024 * 1024);
                defer allocator.free(cursor_data);
                cursor_image = try jpeg.decode_png(cursor_data, allocator);
            }
        }

        const bg_color = parse_hex_color(
            if (timeline.background) |bg| bg.color else "#e0e0e0",
        );

        const fb = try cpu.Framebuffer.init(allocator, layout.screen_w, layout.screen_h);

        var chrome_config: ?chrome_mod.ChromeConfig = null;
        if (layout.has_chrome) {
            const wc = timeline.window orelse types.WindowConfig{};
            const win_total_h = layout.vp_h + layout.titlebar_h;
            const win_x = (layout.screen_w -| layout.vp_w) / 2;
            const win_y = (layout.screen_h -| win_total_h) / 2;

            chrome_config = .{
                .screen_w = layout.screen_w,
                .screen_h = layout.screen_h,
                .window_x = win_x,
                .window_y = win_y,
                .window_w = layout.vp_w,
                .window_h = layout.vp_h,
                .border_radius = layout.border_radius,
                .bg_color = bg_color,
                .titlebar = .{
                    .visible = wc.titlebar_visible,
                    .height = wc.titlebar_height,
                    .background = parse_hex_color(wc.titlebar_background),
                    .stoplight = wc.titlebar_stoplight,
                },
                .shadow = .{
                    .enabled = wc.shadow_blur > 0,
                    .blur = wc.shadow_blur,
                    .color = .{ .r = 0, .g = 0, .b = 0, .a = 89 },
                    .offset_y = wc.shadow_offset_y,
                },
            };
        }

        var font_ctx: ?hud_mod.FontContext = null;
        if (font_path) |fpath| {
            const font_data = std.fs.cwd().readFileAlloc(allocator, fpath, 50 * 1024 * 1024) catch null;
            if (font_data) |fd| {
                font_ctx = hud_mod.FontContext.init(allocator, fd, @floatFromInt(timeline.hud_font_size)) catch null;
            }
        }

        var use_gpu = false;
        var gpu_instance: if (build_options.enable_gpu) ?gpu_mod.GpuCompositor else void = if (build_options.enable_gpu) null else {};

        if (build_options.enable_gpu) {
            const want_gpu = backend == .gpu or (backend == .auto and gpu_mod.is_available());
            if (want_gpu) {
                const cur_w: u32 = if (cursor_image) |ci| ci.width else 1;
                const cur_h: u32 = if (cursor_image) |ci| ci.height else 1;
                gpu_instance = gpu_mod.GpuCompositor.init(
                    allocator,
                    layout.screen_w,
                    layout.screen_h,
                    layout.vp_w,
                    layout.vp_h,
                    cur_w,
                    cur_h,
                ) catch null;
                if (gpu_instance != null) {
                    use_gpu = true;
                    if (cursor_image) |ci| {
                        gpu_instance.?.upload_cursor(ci.data);
                    }
                    std.debug.print("using GPU backend\n", .{});
                }
            }
        }

        return .{
            .allocator = allocator,
            .framebuffer = fb,
            .layout = layout,
            .cursor_image = cursor_image,
            .bg_color = bg_color,
            .chrome_config = chrome_config,
            .font_ctx = font_ctx,
            .hud_config = .{
                .font_size = timeline.hud_font_size,
                .border_radius = timeline.hud_border_radius,
                .position = timeline.hud_position,
            },
            .gpu = gpu_instance,
            .use_gpu = use_gpu,
        };
    }

    pub fn deinit(self: *Compositor) void {
        self.framebuffer.deinit();
        if (self.cursor_image) |*img| img.deinit();
        if (self.font_ctx) |*fctx| fctx.deinit();
        if (build_options.enable_gpu) {
            if (self.gpu) |*g| g.deinit();
        }
    }

    pub fn compose_frame(
        self: *Compositor,
        content: *const types.Image,
        frame: *const types.FrameData,
    ) []u8 {
        if (build_options.enable_gpu and self.use_gpu) {
            return self.compose_frame_gpu(content, frame);
        }
        return self.compose_frame_cpu(content, frame);
    }

    fn compose_frame_cpu(
        self: *Compositor,
        content: *const types.Image,
        frame: *const types.FrameData,
    ) []u8 {
        if (self.chrome_config) |cc| {
            chrome_mod.render_chrome(&self.framebuffer, cc);
        } else {
            self.framebuffer.clear(self.bg_color);
        }

        self.framebuffer.blit_opaque(content, self.layout.content_x, self.layout.content_y);

        if (self.cursor_image) |*cur| {
            const cx: i32 = @as(i32, @intCast(self.layout.content_x)) + @as(i32, @intFromFloat(frame.cursor.x));
            const cy: i32 = @as(i32, @intCast(self.layout.content_y)) + @as(i32, @intFromFloat(frame.cursor.y));
            self.framebuffer.blit_alpha(cur, cx, cy);
        }

        if (frame.hud) |hud_state| {
            if (self.font_ctx) |*fctx| {
                hud_mod.render_hud_pill(
                    &self.framebuffer,
                    hud_state.labels,
                    fctx,
                    self.hud_config,
                    self.layout.screen_w,
                    self.layout.screen_h,
                );
            }
        }

        return self.framebuffer.data;
    }

    fn compose_frame_gpu(
        self: *Compositor,
        content: *const types.Image,
        frame: *const types.FrameData,
    ) []u8 {
        if (!build_options.enable_gpu) return self.framebuffer.data;

        var g = self.gpu orelse return self.compose_frame_cpu(content, frame);

        g.upload_content(content.data);

        const cursor_x = @as(f32, @floatFromInt(self.layout.content_x)) + @as(f32, @floatCast(frame.cursor.x));
        const cursor_y = @as(f32, @floatFromInt(self.layout.content_y)) + @as(f32, @floatCast(frame.cursor.y));

        g.compose_frame(
            @floatFromInt(self.layout.content_x),
            @floatFromInt(self.layout.content_y),
            cursor_x,
            cursor_y,
            self.bg_color,
            self.framebuffer.data,
        ) catch {
            return self.compose_frame_cpu(content, frame);
        };

        // HUD still done on CPU as it requires font rasterization
        if (frame.hud) |hud_state| {
            if (self.font_ctx) |*fctx| {
                hud_mod.render_hud_pill(
                    &self.framebuffer,
                    hud_state.labels,
                    fctx,
                    self.hud_config,
                    self.layout.screen_w,
                    self.layout.screen_h,
                );
            }
        }

        return self.framebuffer.data;
    }
};

fn parse_hex_color(hex: []const u8) types.RGBA {
    if (hex.len < 4 or hex[0] != '#') {
        return .{ .r = 224, .g = 224, .b = 224, .a = 255 };
    }

    if (hex.len == 4) {
        const r = parse_hex_digit(hex[1]);
        const g = parse_hex_digit(hex[2]);
        const b = parse_hex_digit(hex[3]);
        return .{
            .r = r | (r << 4),
            .g = g | (g << 4),
            .b = b | (b << 4),
            .a = 255,
        };
    }

    if (hex.len >= 7) {
        return .{
            .r = parse_hex_byte(hex[1], hex[2]),
            .g = parse_hex_byte(hex[3], hex[4]),
            .b = parse_hex_byte(hex[5], hex[6]),
            .a = 255,
        };
    }

    return .{ .r = 224, .g = 224, .b = 224, .a = 255 };
}

fn parse_hex_digit(ch: u8) u8 {
    return switch (ch) {
        '0'...'9' => ch - '0',
        'a'...'f' => ch - 'a' + 10,
        'A'...'F' => ch - 'A' + 10,
        else => 0,
    };
}

fn parse_hex_byte(hi: u8, lo: u8) u8 {
    return (parse_hex_digit(hi) << 4) | parse_hex_digit(lo);
}
