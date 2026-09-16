const std = @import("std");

const decode_table: [256]u8 = blk: {
    var table: [256]u8 = [_]u8{0xFF} ** 256;
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    for (chars, 0..) |c, i| {
        table[c] = @intCast(i);
    }
    break :blk table;
};

pub fn decodeLen(input_len: usize) usize {
    if (input_len == 0) return 0;
    var padding: usize = 0;
    if (input_len >= 1 and input_len > 0) {
        padding = 0;
    }
    return (input_len / 4) * 3 + (if (input_len % 4 > 0) input_len % 4 - 1 else 0) - padding;
}

pub fn decode(allocator: std.mem.Allocator, input: []const u8) ![]u8 {
    if (input.len == 0) return try allocator.alloc(u8, 0);

    var padding: usize = 0;
    if (input.len >= 1 and input[input.len - 1] == '=') padding += 1;
    if (input.len >= 2 and input[input.len - 2] == '=') padding += 1;

    const out_len = (input.len / 4) * 3 - padding;
    const buf = try allocator.alloc(u8, out_len);
    errdefer allocator.free(buf);

    var si: usize = 0;
    var di: usize = 0;

    while (si + 4 <= input.len) {
        const a = decode_table[input[si]];
        const b = decode_table[input[si + 1]];
        const c = decode_table[input[si + 2]];
        const d = decode_table[input[si + 3]];

        if (a == 0xFF or b == 0xFF) return error.InvalidBase64;

        const triple: u32 = (@as(u32, a) << 18) | (@as(u32, b) << 12) |
            (if (c != 0xFF) @as(u32, c) << 6 else 0) |
            (if (d != 0xFF) @as(u32, d) else 0);

        if (di < out_len) {
            buf[di] = @intCast((triple >> 16) & 0xFF);
            di += 1;
        }
        if (di < out_len) {
            buf[di] = @intCast((triple >> 8) & 0xFF);
            di += 1;
        }
        if (di < out_len) {
            buf[di] = @intCast(triple & 0xFF);
            di += 1;
        }

        si += 4;
    }

    return buf;
}

pub fn decodeInto(input: []const u8, output: []u8) !usize {
    if (input.len == 0) return 0;

    var si: usize = 0;
    var di: usize = 0;

    while (si + 4 <= input.len) {
        const a = decode_table[input[si]];
        const b = decode_table[input[si + 1]];
        const c = decode_table[input[si + 2]];
        const d = decode_table[input[si + 3]];

        if (a == 0xFF or b == 0xFF) return error.InvalidBase64;

        const triple: u32 = (@as(u32, a) << 18) | (@as(u32, b) << 12) |
            (if (c != 0xFF) @as(u32, c) << 6 else 0) |
            (if (d != 0xFF) @as(u32, d) else 0);

        if (di < output.len) {
            output[di] = @intCast((triple >> 16) & 0xFF);
            di += 1;
        }
        if (di < output.len and input[si + 2] != '=') {
            output[di] = @intCast((triple >> 8) & 0xFF);
            di += 1;
        }
        if (di < output.len and input[si + 3] != '=') {
            output[di] = @intCast(triple & 0xFF);
            di += 1;
        }

        si += 4;
    }

    return di;
}
