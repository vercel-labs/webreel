const std = @import("std");
const types = @import("types.zig");
const cpu = @import("cpu_backend.zig");

const c = @cImport({
    @cInclude("stb_truetype.h");
});

pub const HudConfig = struct {
    font_size: u32 = 16,
    border_radius: u32 = 8,
    bg_color: types.RGBA = .{ .r = 0, .g = 0, .b = 0, .a = 191 },
    text_color: types.RGBA = .{ .r = 255, .g = 255, .b = 255, .a = 255 },
    position: types.HudPosition = .bottom,
    padding_h: u32 = 36,
    padding_v: u32 = 16,
    margin: u32 = 48,
};

pub const FontContext = struct {
    font_info: c.stbtt_fontinfo,
    font_data: []const u8,
    allocator: std.mem.Allocator,
    scale: f32,

    pub fn init(allocator: std.mem.Allocator, font_data: []const u8, font_size: f32) !FontContext {
        var info: c.stbtt_fontinfo = undefined;
        if (c.stbtt_InitFont(&info, font_data.ptr, 0) == 0) {
            return error.FontInitFailed;
        }
        const scale = c.stbtt_ScaleForPixelHeight(&info, font_size);
        return .{
            .font_info = info,
            .font_data = font_data,
            .allocator = allocator,
            .scale = scale,
        };
    }

    pub fn deinit(self: *FontContext) void {
        self.allocator.free(self.font_data);
    }

    pub fn text_width(self: *const FontContext, text: []const u8) f32 {
        var w: f32 = 0;
        for (text) |ch| {
            var advance: c_int = 0;
            var lsb: c_int = 0;
            c.stbtt_GetCodepointHMetrics(&self.font_info, @intCast(ch), &advance, &lsb);
            w += @as(f32, @floatFromInt(advance)) * self.scale;
        }
        return w;
    }

    pub fn render_text(
        self: *const FontContext,
        fb: *cpu.Framebuffer,
        text: []const u8,
        start_x: i32,
        baseline_y: i32,
        color: types.RGBA,
    ) void {
        var x_pos: f32 = @floatFromInt(start_x);

        for (text) |ch| {
            var x0: c_int = 0;
            var y0: c_int = 0;
            var x1: c_int = 0;
            var y1: c_int = 0;
            c.stbtt_GetCodepointBitmapBox(
                &self.font_info,
                @intCast(ch),
                self.scale,
                self.scale,
                &x0,
                &y0,
                &x1,
                &y1,
            );

            const glyph_w: u32 = @intCast(x1 - x0);
            const glyph_h: u32 = @intCast(y1 - y0);
            if (glyph_w == 0 or glyph_h == 0) {
                var advance: c_int = 0;
                var lsb: c_int = 0;
                c.stbtt_GetCodepointHMetrics(&self.font_info, @intCast(ch), &advance, &lsb);
                x_pos += @as(f32, @floatFromInt(advance)) * self.scale;
                continue;
            }

            const buf = self.allocator.alloc(u8, glyph_w * glyph_h) catch continue;
            defer self.allocator.free(buf);

            c.stbtt_MakeCodepointBitmap(
                &self.font_info,
                buf.ptr,
                @intCast(glyph_w),
                @intCast(glyph_h),
                @intCast(glyph_w),
                self.scale,
                self.scale,
                @intCast(ch),
            );

            const draw_x = @as(i32, @intFromFloat(x_pos)) + x0;
            const draw_y = baseline_y + y0;

            blit_glyph(fb, buf, glyph_w, glyph_h, draw_x, draw_y, color);

            var advance: c_int = 0;
            var lsb: c_int = 0;
            c.stbtt_GetCodepointHMetrics(&self.font_info, @intCast(ch), &advance, &lsb);
            x_pos += @as(f32, @floatFromInt(advance)) * self.scale;
        }
    }
};

fn blit_glyph(
    fb: *cpu.Framebuffer,
    glyph: []const u8,
    gw: u32,
    gh: u32,
    dst_x: i32,
    dst_y: i32,
    color: types.RGBA,
) void {
    const stride: usize = @as(usize, fb.width) * 4;

    var gy: u32 = 0;
    while (gy < gh) : (gy += 1) {
        const dy_signed = dst_y + @as(i32, @intCast(gy));
        if (dy_signed < 0) continue;
        const dy: u32 = @intCast(dy_signed);
        if (dy >= fb.height) break;

        var gx: u32 = 0;
        while (gx < gw) : (gx += 1) {
            const dx_signed = dst_x + @as(i32, @intCast(gx));
            if (dx_signed < 0) continue;
            const dx: u32 = @intCast(dx_signed);
            if (dx >= fb.width) break;

            const alpha = glyph[@as(usize, gy) * @as(usize, gw) + @as(usize, gx)];
            if (alpha == 0) continue;

            const off = @as(usize, dy) * stride + @as(usize, dx) * 4;
            const sa: u16 = @as(u16, alpha) * @as(u16, color.a) / 255;
            if (sa == 0) continue;

            const inv_sa: u16 = 255 - sa;
            fb.data[off] = @intCast((@as(u16, color.r) * sa + @as(u16, fb.data[off]) * inv_sa + 127) / 255);
            fb.data[off + 1] = @intCast((@as(u16, color.g) * sa + @as(u16, fb.data[off + 1]) * inv_sa + 127) / 255);
            fb.data[off + 2] = @intCast((@as(u16, color.b) * sa + @as(u16, fb.data[off + 2]) * inv_sa + 127) / 255);
            fb.data[off + 3] = @intCast(@min(@as(u16, 255), @as(u16, fb.data[off + 3]) + sa - (@as(u16, fb.data[off + 3]) * sa + 127) / 255));
        }
    }
}

pub fn render_hud_pill(
    fb: *cpu.Framebuffer,
    labels: []const []const u8,
    font_ctx: *const FontContext,
    config: HudConfig,
    viewport_w: u32,
    viewport_h: u32,
) void {
    if (labels.len == 0) return;

    const gap: f32 = 14;
    var total_text_width: f32 = 0;
    for (labels) |label| {
        total_text_width += font_ctx.text_width(label);
    }
    total_text_width += gap * @as(f32, @floatFromInt(labels.len -| 1));

    const pill_w: u32 = @intFromFloat(total_text_width + @as(f32, @floatFromInt(config.padding_h * 2)));
    const pill_h: u32 = @intFromFloat(@as(f32, @floatFromInt(config.font_size)) * 1.6 + @as(f32, @floatFromInt(config.padding_v * 2)));

    const pill_x = (viewport_w -| pill_w) / 2;
    const pill_y = switch (config.position) {
        .top => config.margin,
        .bottom => viewport_h -| pill_h -| config.margin,
    };

    fill_rounded_rect(fb, pill_x, pill_y, pill_w, pill_h, config.border_radius, config.bg_color);

    var text_x: f32 = @floatFromInt(pill_x + config.padding_h);
    const baseline_y: i32 = @intCast(pill_y + pill_h / 2 + config.font_size / 3);

    for (labels, 0..) |label, i| {
        font_ctx.render_text(fb, label, @intFromFloat(text_x), baseline_y, config.text_color);
        text_x += font_ctx.text_width(label);
        if (i < labels.len - 1) {
            text_x += gap;
        }
    }
}

fn fill_rounded_rect(fb: *cpu.Framebuffer, x: u32, y: u32, w: u32, h: u32, r: u32, color: types.RGBA) void {
    const stride: usize = @as(usize, fb.width) * 4;

    var dy: u32 = 0;
    while (dy < h) : (dy += 1) {
        const py = y + dy;
        if (py >= fb.height) break;

        var dx: u32 = 0;
        while (dx < w) : (dx += 1) {
            const px = x + dx;
            if (px >= fb.width) break;

            if (r > 0) {
                const in_left = dx < r;
                const in_right = dx >= w -| r;
                const in_top = dy < r;
                const in_bottom = dy >= h -| r;

                if ((in_top or in_bottom) and (in_left or in_right)) {
                    const cx: i32 = if (in_left) @as(i32, @intCast(r)) else @as(i32, @intCast(w -| r -| 1));
                    const cy: i32 = if (in_top) @as(i32, @intCast(r)) else @as(i32, @intCast(h -| r -| 1));
                    const ddx = @as(i32, @intCast(dx)) - cx;
                    const ddy = @as(i32, @intCast(dy)) - cy;
                    const dist_sq: u32 = @intCast(ddx * ddx + ddy * ddy);
                    if (dist_sq > r * r) continue;
                }
            }

            const off = @as(usize, py) * stride + @as(usize, px) * 4;
            if (color.a == 255) {
                fb.data[off] = color.r;
                fb.data[off + 1] = color.g;
                fb.data[off + 2] = color.b;
                fb.data[off + 3] = 255;
            } else {
                const sa: u16 = color.a;
                const inv_sa: u16 = 255 - sa;
                fb.data[off] = @intCast((@as(u16, color.r) * sa + @as(u16, fb.data[off]) * inv_sa + 127) / 255);
                fb.data[off + 1] = @intCast((@as(u16, color.g) * sa + @as(u16, fb.data[off + 1]) * inv_sa + 127) / 255);
                fb.data[off + 2] = @intCast((@as(u16, color.b) * sa + @as(u16, fb.data[off + 2]) * inv_sa + 127) / 255);
                fb.data[off + 3] = @intCast(@min(@as(u16, 255), @as(u16, fb.data[off + 3]) + sa - (@as(u16, fb.data[off + 3]) * sa + 127) / 255));
            }
        }
    }
}
