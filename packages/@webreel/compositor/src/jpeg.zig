const std = @import("std");
const types = @import("types.zig");

const c = @cImport({
    @cInclude("stb_image.h");
});

pub fn decode(data: []const u8, allocator: std.mem.Allocator) !types.Image {
    var w: c_int = 0;
    var h: c_int = 0;
    var channels: c_int = 0;

    const pixels = c.stbi_load_from_memory(
        data.ptr,
        @intCast(data.len),
        &w,
        &h,
        &channels,
        4, // force RGBA
    );
    if (pixels == null) return error.JpegDecodeFailed;
    defer c.stbi_image_free(pixels);

    const width: u32 = @intCast(w);
    const height: u32 = @intCast(h);
    const size = width * height * 4;

    const buf = try allocator.alloc(u8, size);
    @memcpy(buf, pixels[0..size]);

    return types.Image{
        .data = buf,
        .width = width,
        .height = height,
        .channels = 4,
        .allocator = allocator,
    };
}

pub fn decode_into(data: []const u8, dest: []u8, expected_w: u32, expected_h: u32) !void {
    var w: c_int = 0;
    var h: c_int = 0;
    var channels: c_int = 0;

    const pixels = c.stbi_load_from_memory(
        data.ptr,
        @intCast(data.len),
        &w,
        &h,
        &channels,
        4,
    );
    if (pixels == null) return error.JpegDecodeFailed;
    defer c.stbi_image_free(pixels);

    if (@as(u32, @intCast(w)) != expected_w or @as(u32, @intCast(h)) != expected_h) {
        return error.DimensionMismatch;
    }

    const size: usize = @as(usize, expected_w) * @as(usize, expected_h) * 4;
    @memcpy(dest[0..size], pixels[0..size]);
}

pub fn decode_png(data: []const u8, allocator: std.mem.Allocator) !types.Image {
    var w: c_int = 0;
    var h: c_int = 0;
    var channels: c_int = 0;

    const pixels = c.stbi_load_from_memory(
        data.ptr,
        @intCast(data.len),
        &w,
        &h,
        &channels,
        4,
    );
    if (pixels == null) return error.PngDecodeFailed;
    defer c.stbi_image_free(pixels);

    const width: u32 = @intCast(w);
    const height: u32 = @intCast(h);
    const size = width * height * 4;

    const buf = try allocator.alloc(u8, size);
    @memcpy(buf, pixels[0..size]);

    return types.Image{
        .data = buf,
        .width = width,
        .height = height,
        .channels = 4,
        .allocator = allocator,
    };
}
