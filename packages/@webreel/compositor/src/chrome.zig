const std = @import("std");
const types = @import("types.zig");
const cpu = @import("cpu_backend.zig");

pub const TitlebarConfig = struct {
    visible: bool = false,
    height: u32 = 36,
    background: types.RGBA = .{ .r = 232, .g = 232, .b = 232, .a = 255 },
    stoplight: bool = true,
    title: ?[]const u8 = null,
};

pub const ShadowConfig = struct {
    enabled: bool = false,
    blur: u32 = 40,
    color: types.RGBA = .{ .r = 0, .g = 0, .b = 0, .a = 89 },
    offset_y: i32 = 10,
};

pub const ChromeConfig = struct {
    screen_w: u32,
    screen_h: u32,
    window_x: u32,
    window_y: u32,
    window_w: u32,
    window_h: u32,
    border_radius: u32 = 0,
    titlebar: TitlebarConfig = .{},
    shadow: ShadowConfig = .{},
    bg_color: types.RGBA = .{ .r = 224, .g = 224, .b = 224, .a = 255 },
};

pub fn render_chrome(fb: *cpu.Framebuffer, config: ChromeConfig) void {
    fb.clear(config.bg_color);

    if (config.shadow.enabled) {
        render_shadow(fb, config);
    }

    if (config.titlebar.visible) {
        render_titlebar(fb, config);
    }

    if (config.border_radius > 0) {
        render_border(fb, config);
    }
}

fn render_shadow(fb: *cpu.Framebuffer, config: ChromeConfig) void {
    const sc = config.shadow;
    const radius = sc.blur / 2;
    if (radius == 0) return;

    const expand = radius * 2;
    const sx = @as(i32, @intCast(config.window_x)) - @as(i32, @intCast(expand));
    const sy = @as(i32, @intCast(config.window_y)) + sc.offset_y - @as(i32, @intCast(expand));
    const total_h = config.window_h + (if (config.titlebar.visible) config.titlebar.height else 0);
    const sw = config.window_w + expand * 2;
    const sh = total_h + expand * 2;

    var y: u32 = 0;
    while (y < sh) : (y += 1) {
        const dy_signed = sy + @as(i32, @intCast(y));
        if (dy_signed < 0) continue;
        const dy: u32 = @intCast(dy_signed);
        if (dy >= fb.height) break;

        const y_dist = edge_distance(y, sh, expand);

        var x: u32 = 0;
        while (x < sw) : (x += 1) {
            const dx_signed = sx + @as(i32, @intCast(x));
            if (dx_signed < 0) continue;
            const dx: u32 = @intCast(dx_signed);
            if (dx >= fb.width) break;

            const x_dist = edge_distance(x, sw, expand);
            const dist = @max(x_dist, y_dist);

            if (dist == 0) {
                blend_pixel(fb, dx, dy, sc.color);
            } else {
                const t: f32 = @as(f32, @floatFromInt(dist)) / @as(f32, @floatFromInt(expand));
                const falloff = 1.0 - t * t;
                if (falloff > 0) {
                    const alpha: u8 = @intFromFloat(@as(f32, @floatFromInt(sc.color.a)) * falloff);
                    blend_pixel(fb, dx, dy, .{ .r = sc.color.r, .g = sc.color.g, .b = sc.color.b, .a = alpha });
                }
            }
        }
    }
}

fn edge_distance(pos: u32, size: u32, margin: u32) u32 {
    if (pos < margin) return margin - pos;
    if (pos >= size - margin) return pos - (size - margin) + 1;
    return 0;
}

fn render_titlebar(fb: *cpu.Framebuffer, config: ChromeConfig) void {
    const tb = config.titlebar;
    const y_start = config.window_y;
    const y_end = config.window_y + tb.height;
    const x_start = config.window_x;
    const x_end = config.window_x + config.window_w;
    const stride: usize = @as(usize, fb.width) * 4;

    var y: u32 = y_start;
    while (y < y_end and y < fb.height) : (y += 1) {
        var x: u32 = x_start;
        while (x < x_end and x < fb.width) : (x += 1) {
            if (config.border_radius > 0 and y < y_start + config.border_radius) {
                if (!in_rounded_corner(x, y, x_start, y_start, x_end, config.border_radius)) continue;
            }
            const off = @as(usize, y) * stride + @as(usize, x) * 4;
            fb.data[off] = tb.background.r;
            fb.data[off + 1] = tb.background.g;
            fb.data[off + 2] = tb.background.b;
            fb.data[off + 3] = 255;
        }
    }

    if (tb.stoplight) {
        render_stoplight_dots(fb, config);
    }
}

fn render_stoplight_dots(fb: *cpu.Framebuffer, config: ChromeConfig) void {
    const tb = config.titlebar;
    const dot_r: u32 = 6;
    const dot_cy = config.window_y + tb.height / 2;
    const dot_start_x = config.window_x + 16;
    const dot_gap: u32 = 20;

    const colors = [3]types.RGBA{
        .{ .r = 255, .g = 95, .b = 87, .a = 255 },
        .{ .r = 254, .g = 188, .b = 46, .a = 255 },
        .{ .r = 40, .g = 200, .b = 64, .a = 255 },
    };

    for (0..3) |i| {
        const cx = dot_start_x + @as(u32, @intCast(i)) * dot_gap;
        fill_circle(fb, cx, dot_cy, dot_r, colors[i]);
    }
}

fn fill_circle(fb: *cpu.Framebuffer, cx: u32, cy: u32, r: u32, color: types.RGBA) void {
    const stride: usize = @as(usize, fb.width) * 4;
    const r_sq = r * r;

    var dy: i32 = -@as(i32, @intCast(r));
    while (dy <= @as(i32, @intCast(r))) : (dy += 1) {
        const py_signed = @as(i32, @intCast(cy)) + dy;
        if (py_signed < 0) continue;
        const py: u32 = @intCast(py_signed);
        if (py >= fb.height) continue;

        var dx: i32 = -@as(i32, @intCast(r));
        while (dx <= @as(i32, @intCast(r))) : (dx += 1) {
            const dist_sq = @as(u32, @intCast(dy * dy + dx * dx));
            if (dist_sq > r_sq) continue;

            const px_signed = @as(i32, @intCast(cx)) + dx;
            if (px_signed < 0) continue;
            const px: u32 = @intCast(px_signed);
            if (px >= fb.width) continue;

            const off = @as(usize, py) * stride + @as(usize, px) * 4;

            if (dist_sq > r_sq - r * 2) {
                const edge_t = @as(f32, @floatFromInt(r_sq - dist_sq)) / @as(f32, @floatFromInt(r * 2));
                const alpha: u8 = @intFromFloat(@as(f32, @floatFromInt(color.a)) * @min(edge_t, 1.0));
                blend_pixel_at(fb.data, off, .{ .r = color.r, .g = color.g, .b = color.b, .a = alpha });
            } else {
                fb.data[off] = color.r;
                fb.data[off + 1] = color.g;
                fb.data[off + 2] = color.b;
                fb.data[off + 3] = color.a;
            }
        }
    }
}

fn render_border(fb: *cpu.Framebuffer, config: ChromeConfig) void {
    const total_h = config.window_h + (if (config.titlebar.visible) config.titlebar.height else 0);
    const x0 = config.window_x;
    const y0 = config.window_y;
    const x1 = config.window_x + config.window_w;
    const y1 = config.window_y + total_h;
    const r = config.border_radius;
    const stride: usize = @as(usize, fb.width) * 4;
    const border_color = types.RGBA{ .r = 0, .g = 0, .b = 0, .a = 26 };

    // Top and bottom edges
    var x: u32 = x0 + r;
    while (x < x1 -| r) : (x += 1) {
        if (y0 > 0 and y0 < fb.height and x < fb.width) {
            blend_pixel(fb, x, y0, border_color);
        }
        if (y1 > 0 and y1 < fb.height and x < fb.width) {
            blend_pixel(fb, x, y1 -| 1, border_color);
        }
    }

    // Left and right edges
    var y: u32 = y0 + r;
    while (y < y1 -| r) : (y += 1) {
        if (x0 < fb.width and y < fb.height) {
            blend_pixel(fb, x0, y, border_color);
        }
        if (x1 > 0 and x1 -| 1 < fb.width and y < fb.height) {
            blend_pixel(fb, x1 -| 1, y, border_color);
        }
    }

    // Corner arcs
    render_corner_arc(fb, x0 + r, y0 + r, r, border_color, stride, .top_left);
    render_corner_arc(fb, x1 -| r -| 1, y0 + r, r, border_color, stride, .top_right);
    render_corner_arc(fb, x0 + r, y1 -| r -| 1, r, border_color, stride, .bottom_left);
    render_corner_arc(fb, x1 -| r -| 1, y1 -| r -| 1, r, border_color, stride, .bottom_right);
}

const Corner = enum { top_left, top_right, bottom_left, bottom_right };

fn render_corner_arc(fb: *cpu.Framebuffer, cx: u32, cy: u32, r: u32, color: types.RGBA, stride: usize, corner: Corner) void {
    _ = stride;
    const r_f: f32 = @floatFromInt(r);

    var angle: f32 = 0;
    const step = 1.0 / r_f;
    const half_pi = std.math.pi / 2.0;

    while (angle < half_pi) : (angle += step) {
        const cos_a = @cos(angle);
        const sin_a = @sin(angle);

        const ox: i32 = @intFromFloat(cos_a * r_f);
        const oy: i32 = @intFromFloat(sin_a * r_f);

        const px: i32 = switch (corner) {
            .top_left, .bottom_left => @as(i32, @intCast(cx)) - ox,
            .top_right, .bottom_right => @as(i32, @intCast(cx)) + ox,
        };
        const py: i32 = switch (corner) {
            .top_left, .top_right => @as(i32, @intCast(cy)) - oy,
            .bottom_left, .bottom_right => @as(i32, @intCast(cy)) + oy,
        };

        if (px >= 0 and py >= 0) {
            const ux: u32 = @intCast(px);
            const uy: u32 = @intCast(py);
            if (ux < fb.width and uy < fb.height) {
                blend_pixel(fb, ux, uy, color);
            }
        }
    }
}

fn in_rounded_corner(x: u32, y: u32, x_start: u32, y_start: u32, x_end: u32, r: u32) bool {
    const in_left = x < x_start + r;
    const in_top = y < y_start + r;
    const in_right = x >= x_end -| r;

    if (in_top and in_left) {
        const dx = @as(i32, @intCast(x_start + r)) - @as(i32, @intCast(x));
        const dy = @as(i32, @intCast(y_start + r)) - @as(i32, @intCast(y));
        return dx * dx + dy * dy <= @as(i32, @intCast(r * r));
    }
    if (in_top and in_right) {
        const dx = @as(i32, @intCast(x)) - @as(i32, @intCast(x_end -| r));
        const dy = @as(i32, @intCast(y_start + r)) - @as(i32, @intCast(y));
        return dx * dx + dy * dy <= @as(i32, @intCast(r * r));
    }
    return true;
}

fn blend_pixel(fb: *cpu.Framebuffer, x: u32, y: u32, color: types.RGBA) void {
    const stride: usize = @as(usize, fb.width) * 4;
    const off = @as(usize, y) * stride + @as(usize, x) * 4;
    blend_pixel_at(fb.data, off, color);
}

fn blend_pixel_at(data: []u8, off: usize, color: types.RGBA) void {
    if (off + 3 >= data.len) return;
    if (color.a == 255) {
        data[off] = color.r;
        data[off + 1] = color.g;
        data[off + 2] = color.b;
        data[off + 3] = 255;
        return;
    }
    if (color.a == 0) return;
    const sa: u16 = color.a;
    const inv_sa: u16 = 255 - sa;
    data[off] = @intCast((@as(u16, color.r) * sa + @as(u16, data[off]) * inv_sa + 127) / 255);
    data[off + 1] = @intCast((@as(u16, color.g) * sa + @as(u16, data[off + 1]) * inv_sa + 127) / 255);
    data[off + 2] = @intCast((@as(u16, color.b) * sa + @as(u16, data[off + 2]) * inv_sa + 127) / 255);
    data[off + 3] = @intCast(@min(@as(u16, 255), @as(u16, data[off + 3]) + sa - (@as(u16, data[off + 3]) * sa + 127) / 255));
}
