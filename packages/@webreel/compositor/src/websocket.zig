const std = @import("std");
const net = std.net;
const crypto = std.crypto;

pub const Opcode = enum(u4) {
    continuation = 0x0,
    text = 0x1,
    binary = 0x2,
    close = 0x8,
    ping = 0x9,
    pong = 0xA,
};

pub const Frame = struct {
    opcode: Opcode,
    payload: []u8,
    fin: bool,
};

pub const WebSocket = struct {
    stream: net.Stream,
    allocator: std.mem.Allocator,
    read_buf: []u8,
    fragment_buf: std.ArrayList(u8) = .empty,

    pub fn connect(allocator: std.mem.Allocator, host: []const u8, port: u16, path: []const u8) !WebSocket {
        const address = try net.Address.resolveIp(host, port);
        const stream = try net.tcpConnectToAddress(address);

        var key_bytes: [16]u8 = undefined;
        crypto.random.bytes(&key_bytes);
        var key_buf: [24]u8 = undefined;
        _ = std.base64.standard.Encoder.encode(&key_buf, &key_bytes);

        var request_buf: [4096]u8 = undefined;
        const request = std.fmt.bufPrint(&request_buf, "GET {s} HTTP/1.1\r\nHost: {s}:{d}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: {s}\r\nSec-WebSocket-Version: 13\r\n\r\n", .{
            path,
            host,
            port,
            key_buf[0..24],
        }) catch return error.RequestTooLong;

        try stream.writeAll(request);

        var response_buf: [4096]u8 = undefined;
        var total_read: usize = 0;
        while (total_read < response_buf.len) {
            const n = try stream.read(response_buf[total_read..]);
            if (n == 0) return error.ConnectionClosed;
            total_read += n;

            if (std.mem.indexOf(u8, response_buf[0..total_read], "\r\n\r\n")) |_| {
                break;
            }
        }

        const response = response_buf[0..total_read];
        if (!std.mem.startsWith(u8, response, "HTTP/1.1 101")) {
            return error.WebSocketUpgradeFailed;
        }

        const read_buf = try allocator.alloc(u8, 16 * 1024 * 1024);

        return .{
            .stream = stream,
            .allocator = allocator,
            .read_buf = read_buf,
            .fragment_buf = .empty,
        };
    }

    pub fn deinit(self: *WebSocket) void {
        self.allocator.free(self.read_buf);
        self.fragment_buf.deinit(self.allocator);
        self.stream.close();
    }

    pub fn sendText(self: *WebSocket, data: []const u8) !void {
        try self.sendFrame(.text, data);
    }

    pub fn sendFrame(self: *WebSocket, opcode: Opcode, data: []const u8) !void {
        var header: [14]u8 = undefined;
        var header_len: usize = 2;

        header[0] = 0x80 | @as(u8, @intFromEnum(opcode));

        if (data.len < 126) {
            header[1] = 0x80 | @as(u8, @intCast(data.len));
        } else if (data.len <= 65535) {
            header[1] = 0x80 | 126;
            header[2] = @intCast((data.len >> 8) & 0xFF);
            header[3] = @intCast(data.len & 0xFF);
            header_len = 4;
        } else {
            header[1] = 0x80 | 127;
            const len64: u64 = @intCast(data.len);
            inline for (0..8) |i| {
                header[2 + i] = @intCast((len64 >> @intCast(56 - i * 8)) & 0xFF);
            }
            header_len = 10;
        }

        var mask_key: [4]u8 = undefined;
        crypto.random.bytes(&mask_key);
        @memcpy(header[header_len..][0..4], &mask_key);
        header_len += 4;

        try self.stream.writeAll(header[0..header_len]);

        if (data.len > 0) {
            const masked = try self.allocator.alloc(u8, data.len);
            defer self.allocator.free(masked);
            for (data, 0..) |b, i| {
                masked[i] = b ^ mask_key[i % 4];
            }
            try self.stream.writeAll(masked);
        }
    }

    pub fn readMessage(self: *WebSocket) !Frame {
        self.fragment_buf.clearRetainingCapacity();
        var first_opcode: Opcode = .text;

        while (true) {
            const frame = try self.readRawFrame();

            switch (frame.opcode) {
                .ping => {
                    try self.sendFrame(.pong, frame.payload);
                    continue;
                },
                .pong => continue,
                .close => return frame,
                .text, .binary => {
                    if (frame.fin) return frame;
                    first_opcode = frame.opcode;
                    try self.fragment_buf.appendSlice(self.allocator, frame.payload);
                },
                .continuation => {
                    try self.fragment_buf.appendSlice(self.allocator, frame.payload);
                    if (frame.fin) {
                        return .{
                            .opcode = first_opcode,
                            .payload = self.fragment_buf.items,
                            .fin = true,
                        };
                    }
                },
            }
        }
    }

    fn readRawFrame(self: *WebSocket) !Frame {
        var header: [2]u8 = undefined;
        try self.readExact(&header);

        const fin = (header[0] & 0x80) != 0;
        const opcode_val: u4 = @intCast(header[0] & 0x0F);
        const opcode: Opcode = @enumFromInt(opcode_val);
        const masked = (header[1] & 0x80) != 0;
        var payload_len: u64 = header[1] & 0x7F;

        if (payload_len == 126) {
            var ext: [2]u8 = undefined;
            try self.readExact(&ext);
            payload_len = (@as(u64, ext[0]) << 8) | @as(u64, ext[1]);
        } else if (payload_len == 127) {
            var ext: [8]u8 = undefined;
            try self.readExact(&ext);
            payload_len = 0;
            inline for (0..8) |i| {
                payload_len = (payload_len << 8) | @as(u64, ext[i]);
            }
        }

        var mask_key: [4]u8 = undefined;
        if (masked) {
            try self.readExact(&mask_key);
        }

        const len: usize = @intCast(payload_len);
        if (len > self.read_buf.len) return error.FrameTooLarge;

        const payload = self.read_buf[0..len];
        try self.readExact(payload);

        if (masked) {
            for (payload, 0..) |*b, i| {
                b.* ^= mask_key[i % 4];
            }
        }

        return .{
            .opcode = opcode,
            .payload = payload,
            .fin = fin,
        };
    }

    fn readExact(self: *WebSocket, buf: []u8) !void {
        var total: usize = 0;
        while (total < buf.len) {
            const n = self.stream.read(buf[total..]) catch return error.ConnectionClosed;
            if (n == 0) return error.ConnectionClosed;
            total += n;
        }
    }
};
