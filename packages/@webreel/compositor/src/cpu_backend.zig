const std = @import("std");
const types = @import("types.zig");

pub const Framebuffer = struct {
    data: []u8,
    width: u32,
    height: u32,
    allocator: std.mem.Allocator,

    pub fn init(allocator: std.mem.Allocator, width: u32, height: u32) !Framebuffer {
        const size = @as(usize, width) * @as(usize, height) * 4;
        const data = try allocator.alloc(u8, size);
        return .{
            .data = data,
            .width = width,
            .height = height,
            .allocator = allocator,
        };
    }

    pub fn deinit(self: *Framebuffer) void {
        self.allocator.free(self.data);
    }

    pub fn clear(self: *Framebuffer, color: types.RGBA) void {
        const pixel: u32 = @as(u32, color.r) |
            (@as(u32, color.g) << 8) |
            (@as(u32, color.b) << 16) |
            (@as(u32, color.a) << 24);

        const pixel_ptr: [*]u32 = @alignCast(@ptrCast(self.data.ptr));
        const pixel_count = self.data.len / 4;

        const V = @Vector(4, u32);
        const pattern: V = @splat(pixel);

        const simd_count = pixel_count / 4;
        const simd_ptr: [*]V = @alignCast(@ptrCast(pixel_ptr));
        for (0..simd_count) |i| {
            simd_ptr[i] = pattern;
        }

        for (simd_count * 4..pixel_count) |i| {
            pixel_ptr[i] = pixel;
        }
    }

    pub fn blit_opaque(self: *Framebuffer, src: *const types.Image, dst_x: u32, dst_y: u32) void {
        const dst_stride: usize = @as(usize, self.width) * 4;

        if (src.channels == 4) {
            const src_stride: usize = @as(usize, src.width) * 4;
            var sy: u32 = 0;
            while (sy < src.height) : (sy += 1) {
                const dy = dst_y + sy;
                if (dy >= self.height) break;

                const copy_w = @min(src.width, self.width -| dst_x);
                if (copy_w == 0) continue;

                const src_row_start = @as(usize, sy) * src_stride;
                const dst_row_start = @as(usize, dy) * dst_stride + @as(usize, dst_x) * 4;
                const byte_count = @as(usize, copy_w) * 4;

                @memcpy(
                    self.data[dst_row_start..][0..byte_count],
                    src.data[src_row_start..][0..byte_count],
                );
            }
        } else {
            const src_stride: usize = @as(usize, src.width) * @as(usize, src.channels);
            var sy: u32 = 0;
            while (sy < src.height) : (sy += 1) {
                const dy = dst_y + sy;
                if (dy >= self.height) break;

                var sx: u32 = 0;
                while (sx < src.width) : (sx += 1) {
                    const dx = dst_x + sx;
                    if (dx >= self.width) break;

                    const src_off = @as(usize, sy) * src_stride + @as(usize, sx) * @as(usize, src.channels);
                    const dst_off = @as(usize, dy) * dst_stride + @as(usize, dx) * 4;

                    self.data[dst_off] = src.data[src_off];
                    self.data[dst_off + 1] = src.data[src_off + 1];
                    self.data[dst_off + 2] = src.data[src_off + 2];
                    self.data[dst_off + 3] = 255;
                }
            }
        }
    }

    pub fn blit_alpha(self: *Framebuffer, src: *const types.Image, dst_x: i32, dst_y: i32) void {
        if (src.channels < 4) {
            self.blit_alpha_rgb(src, dst_x, dst_y);
            return;
        }

        const src_stride: usize = @as(usize, src.width) * 4;
        const dst_stride: usize = @as(usize, self.width) * 4;

        const src_x_start: u32 = if (dst_x < 0) @intCast(-dst_x) else 0;
        const src_y_start: u32 = if (dst_y < 0) @intCast(-dst_y) else 0;
        const dst_x_start: u32 = if (dst_x < 0) 0 else @intCast(dst_x);
        const dst_y_start: u32 = if (dst_y < 0) 0 else @intCast(dst_y);

        const rows = @min(src.height -| src_y_start, self.height -| dst_y_start);
        const cols = @min(src.width -| src_x_start, self.width -| dst_x_start);
        if (rows == 0 or cols == 0) return;

        var row: u32 = 0;
        while (row < rows) : (row += 1) {
            const sy = src_y_start + row;
            const dy = dst_y_start + row;

            const src_row_off = @as(usize, sy) * src_stride + @as(usize, src_x_start) * 4;
            const dst_row_off = @as(usize, dy) * dst_stride + @as(usize, dst_x_start) * 4;

            const src_row = src.data[src_row_off..][0 .. @as(usize, cols) * 4];
            const dst_row = self.data[dst_row_off..][0 .. @as(usize, cols) * 4];

            blend_row_simd(dst_row, src_row, cols);
        }
    }

    fn blit_alpha_rgb(self: *Framebuffer, src: *const types.Image, dst_x: i32, dst_y: i32) void {
        const src_stride: usize = @as(usize, src.width) * @as(usize, src.channels);
        const dst_stride: usize = @as(usize, self.width) * 4;

        var sy: u32 = 0;
        while (sy < src.height) : (sy += 1) {
            const dy_signed = dst_y + @as(i32, @intCast(sy));
            if (dy_signed < 0) continue;
            const dy: u32 = @intCast(dy_signed);
            if (dy >= self.height) break;

            var sx: u32 = 0;
            while (sx < src.width) : (sx += 1) {
                const dx_signed = dst_x + @as(i32, @intCast(sx));
                if (dx_signed < 0) continue;
                const dx: u32 = @intCast(dx_signed);
                if (dx >= self.width) break;

                const src_off = @as(usize, sy) * src_stride + @as(usize, sx) * @as(usize, src.channels);
                const dst_off = @as(usize, dy) * dst_stride + @as(usize, dx) * 4;

                self.data[dst_off] = src.data[src_off];
                self.data[dst_off + 1] = src.data[src_off + 1];
                self.data[dst_off + 2] = src.data[src_off + 2];
                self.data[dst_off + 3] = 255;
            }
        }
    }
};

/// Process 2 pixels at once: 8 channels (RGBA + RGBA) in u16 vectors.
const VLen = 8;
const V16 = @Vector(VLen, u16);
const V_255: V16 = @splat(255);
const V_127: V16 = @splat(127);
const V_0: V16 = @splat(0);

fn blend_row_simd(dst: []u8, src: []const u8, pixel_count: u32) void {
    const count: usize = pixel_count;
    const pairs = count / 2;
    var i: usize = 0;

    while (i < pairs) : (i += 1) {
        const off = i * 8;
        const s = load_8_u16(src[off..][0..8]);
        const d = load_8_u16(dst[off..][0..8]);

        const sa0: u16 = src[off + 3];
        const sa1: u16 = src[off + 7];

        if (sa0 == 0 and sa1 == 0) continue;
        if (sa0 == 255 and sa1 == 255) {
            @memcpy(dst[off..][0..8], src[off..][0..8]);
            continue;
        }

        const alpha = V16{ sa0, sa0, sa0, sa0, sa1, sa1, sa1, sa1 };
        const inv_alpha = V_255 - alpha;

        const result = (s * alpha + d * inv_alpha + V_127) / V_255;
        store_8_u16(dst[off..][0..8], result);
    }

    // Handle trailing pixel if odd count
    if (count % 2 != 0) {
        const off = pairs * 8;
        blend_pixel_scalar(dst, src, off);
    }
}

inline fn load_8_u16(bytes: *const [8]u8) V16 {
    return .{
        bytes[0], bytes[1], bytes[2], bytes[3],
        bytes[4], bytes[5], bytes[6], bytes[7],
    };
}

inline fn store_8_u16(bytes: *[8]u8, v: V16) void {
    const clamped = @min(v, V_255);
    inline for (0..8) |j| {
        bytes[j] = @intCast(clamped[j]);
    }
}

inline fn blend_pixel_scalar(dst: []u8, src: []const u8, off: usize) void {
    const sa: u16 = src[off + 3];
    if (sa == 0) return;
    if (sa == 255) {
        dst[off] = src[off];
        dst[off + 1] = src[off + 1];
        dst[off + 2] = src[off + 2];
        dst[off + 3] = src[off + 3];
        return;
    }
    const inv_sa: u16 = 255 - sa;
    dst[off] = @intCast((@as(u16, src[off]) * sa + @as(u16, dst[off]) * inv_sa + 127) / 255);
    dst[off + 1] = @intCast((@as(u16, src[off + 1]) * sa + @as(u16, dst[off + 1]) * inv_sa + 127) / 255);
    dst[off + 2] = @intCast((@as(u16, src[off + 2]) * sa + @as(u16, dst[off + 2]) * inv_sa + 127) / 255);
    dst[off + 3] = @intCast(@min(@as(u16, 255), @as(u16, dst[off + 3]) + sa - (@as(u16, dst[off + 3]) * sa + 127) / 255));
}
