const std = @import("std");

pub const CursorState = struct {
    x: f64,
    y: f64,
    scale: f64,
};

pub const HudState = struct {
    labels: []const []const u8,
};

pub const FrameData = struct {
    cursor: CursorState,
    hud: ?HudState,
};

pub const WindowConfig = struct {
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

pub const BackgroundConfig = struct {
    bg_type: enum { solid, gradient, image },
    color: []const u8 = "#e0e0e0",
    gradient_from: ?[]const u8 = null,
    gradient_to: ?[]const u8 = null,
    gradient_angle: f64 = 180,
    image_path: ?[]const u8 = null,
};

pub const HudTheme = struct {
    background: []const u8 = "rgba(0,0,0,0.75)",
    color: []const u8 = "#ffffff",
    font_size: u32 = 16,
    font_family: []const u8 = "system-ui",
    border_radius: u32 = 8,
    position: enum { top, bottom } = .bottom,
};

pub const HudPosition = enum { top, bottom };

pub const TimelineData = struct {
    fps: u32,
    width: u32,
    height: u32,
    zoom: f64 = 1,
    screen_width: ?u32 = null,
    screen_height: ?u32 = null,
    window: ?WindowConfig = null,
    background: ?BackgroundConfig = null,
    cursor_hotspot: enum { top_left, center } = .top_left,
    hud_font_size: u32 = 16,
    hud_border_radius: u32 = 8,
    hud_position: HudPosition = .bottom,
    frames: []const FrameData,
};

pub const Layout = struct {
    screen_w: u32,
    screen_h: u32,
    vp_w: u32,
    vp_h: u32,
    titlebar_h: u32,
    border_radius: u32,
    content_x: u32,
    content_y: u32,
    has_chrome: bool,
};

pub fn resolve_layout(td: TimelineData) Layout {
    const vp_w = td.width;
    const vp_h = td.height;

    if (td.screen_width == null or td.screen_height == null) {
        return .{
            .screen_w = vp_w,
            .screen_h = vp_h,
            .vp_w = vp_w,
            .vp_h = vp_h,
            .titlebar_h = 0,
            .border_radius = 0,
            .content_x = 0,
            .content_y = 0,
            .has_chrome = false,
        };
    }

    const screen_w = td.screen_width.?;
    const screen_h = td.screen_height.?;
    const wc = td.window orelse WindowConfig{};
    const titlebar_h: u32 = if (wc.titlebar_visible) wc.titlebar_height else 0;
    const border_radius = wc.border_radius;
    const window_total_h = vp_h + titlebar_h;
    const win_x = (screen_w -| vp_w) / 2;
    const win_y = (screen_h -| window_total_h) / 2;

    return .{
        .screen_w = screen_w,
        .screen_h = screen_h,
        .vp_w = vp_w,
        .vp_h = vp_h,
        .titlebar_h = titlebar_h,
        .border_radius = border_radius,
        .content_x = win_x,
        .content_y = win_y + titlebar_h,
        .has_chrome = true,
    };
}

pub const ComposeConfig = struct {
    input_path: []const u8,
    output_path: []const u8,
    timeline_path: []const u8,
    cursor_path: ?[]const u8 = null,
    chrome_path: ?[]const u8 = null,
    ffmpeg_path: []const u8 = "ffmpeg",
    crf: u32 = 18,
    backend: enum { auto, cpu, gpu } = .auto,
};

pub const RGBA = struct {
    r: u8,
    g: u8,
    b: u8,
    a: u8,
};

pub const Image = struct {
    data: []u8,
    width: u32,
    height: u32,
    channels: u32,
    allocator: std.mem.Allocator,

    pub fn deinit(self: *Image) void {
        self.allocator.free(self.data);
    }

    pub fn pixel(self: *const Image, x: u32, y: u32) RGBA {
        const stride = self.width * self.channels;
        const offset = y * stride + x * self.channels;
        if (offset + 3 >= self.data.len) return .{ .r = 0, .g = 0, .b = 0, .a = 0 };
        return .{
            .r = self.data[offset],
            .g = self.data[offset + 1],
            .b = self.data[offset + 2],
            .a = if (self.channels >= 4) self.data[offset + 3] else 255,
        };
    }
};
