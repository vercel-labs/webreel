const std = @import("std");
const types = @import("types.zig");

const c = @cImport({
    @cInclude("nanosvg.h");
    @cInclude("nanosvgrast.h");
});

pub fn rasterize_svg(
    svg_data: []const u8,
    target_w: u32,
    target_h: u32,
    allocator: std.mem.Allocator,
) !types.Image {
    const buf = try allocator.alloc(u8, svg_data.len + 1);
    defer allocator.free(buf);
    @memcpy(buf[0..svg_data.len], svg_data);
    buf[svg_data.len] = 0;

    const image = c.nsvgParse(buf.ptr, "px", 96.0);
    if (image == null) return error.SvgParseFailed;
    defer c.nsvgDelete(image);

    const svg_w: f32 = image.*.width;
    const svg_h: f32 = image.*.height;
    if (svg_w < 1 or svg_h < 1) return error.SvgEmpty;

    const scale_x: f32 = @as(f32, @floatFromInt(target_w)) / svg_w;
    const scale_y: f32 = @as(f32, @floatFromInt(target_h)) / svg_h;
    const scale = @min(scale_x, scale_y);

    const rasterizer = c.nsvgCreateRasterizer();
    if (rasterizer == null) return error.RasterizerCreateFailed;
    defer c.nsvgDeleteRasterizer(rasterizer);

    const pixel_count: usize = @as(usize, target_w) * @as(usize, target_h) * 4;
    const pixel_buf = try allocator.alloc(u8, pixel_count);

    c.nsvgRasterize(
        rasterizer,
        image,
        0,
        0,
        scale,
        pixel_buf.ptr,
        @intCast(target_w),
        @intCast(target_h),
        @intCast(target_w * 4),
    );

    return types.Image{
        .data = pixel_buf,
        .width = target_w,
        .height = target_h,
        .channels = 4,
        .allocator = allocator,
    };
}

pub fn rasterize_svg_file(
    path: []const u8,
    target_w: u32,
    target_h: u32,
    allocator: std.mem.Allocator,
) !types.Image {
    const svg_data = try std.fs.cwd().readFileAlloc(allocator, path, 10 * 1024 * 1024);
    defer allocator.free(svg_data);
    return rasterize_svg(svg_data, target_w, target_h, allocator);
}
