const std = @import("std");
const websocket = @import("websocket.zig");
const base64 = @import("base64.zig");

pub const CdpClient = struct {
    ws: websocket.WebSocket,
    allocator: std.mem.Allocator,
    next_id: u32 = 1,
    response_buf: std.ArrayList(u8) = .empty,

    pub fn connect(allocator: std.mem.Allocator, port: u16) !CdpClient {
        const ws_url = try discoverWebSocketUrl(allocator, port);
        defer allocator.free(ws_url);

        const parsed = parseWsUrl(ws_url) orelse return error.InvalidWebSocketUrl;
        const ws = try websocket.WebSocket.connect(allocator, parsed.host, parsed.port, parsed.path);

        return .{
            .ws = ws,
            .allocator = allocator,
        };
    }

    pub fn deinit(self: *CdpClient) void {
        self.response_buf.deinit(self.allocator);
        self.ws.deinit();
    }

    pub fn send(self: *CdpClient, method: []const u8, params_json: ?[]const u8) !u32 {
        const id = self.next_id;
        self.next_id += 1;

        self.response_buf.clearRetainingCapacity();
        var writer = self.response_buf.writer(self.allocator);

        try writer.print("{{\"id\":{d},\"method\":\"{s}\"", .{ id, method });
        if (params_json) |p| {
            try writer.print(",\"params\":{s}", .{p});
        }
        try writer.writeAll("}");

        try self.ws.sendText(self.response_buf.items);
        return id;
    }

    pub fn readUntilId(self: *CdpClient, target_id: u32) ![]const u8 {
        while (true) {
            const frame = try self.ws.readMessage();
            if (frame.opcode == .close) return error.ConnectionClosed;

            if (extractId(frame.payload)) |id| {
                if (id == target_id) {
                    return frame.payload;
                }
            }
        }
    }

    pub fn call(self: *CdpClient, method: []const u8, params_json: ?[]const u8) ![]const u8 {
        const id = try self.send(method, params_json);
        return self.readUntilId(id);
    }

    pub fn enablePage(self: *CdpClient) !void {
        _ = try self.call("Page.enable", null);
    }

    pub fn enableRuntime(self: *CdpClient) !void {
        _ = try self.call("Runtime.enable", null);
    }

    pub fn setDeviceMetrics(self: *CdpClient, width: u32, height: u32, scale: f64) !void {
        var buf: [256]u8 = undefined;
        const params = std.fmt.bufPrint(&buf, "{{\"width\":{d},\"height\":{d},\"deviceScaleFactor\":{d},\"mobile\":false}}", .{ width, height, scale }) catch return error.BufferTooSmall;
        _ = try self.call("Emulation.setDeviceMetricsOverride", params);
    }

    pub fn setEmulatedMedia(self: *CdpClient, feature_name: []const u8, feature_value: []const u8) !void {
        var param_buf: std.ArrayList(u8) = .empty;
        defer param_buf.deinit(self.allocator);
        var w = param_buf.writer(self.allocator);
        try w.writeAll("{\"features\":[{\"name\":");
        try writeJsonString(w, feature_name);
        try w.writeAll(",\"value\":");
        try writeJsonString(w, feature_value);
        try w.writeAll("}]}");
        _ = try self.call("Emulation.setEmulatedMedia", param_buf.items);
    }

    pub fn navigate(self: *CdpClient, url: []const u8) !void {
        var param_buf: std.ArrayList(u8) = .empty;
        defer param_buf.deinit(self.allocator);
        var w = param_buf.writer(self.allocator);
        try w.writeAll("{\"url\":");
        try writeJsonString(w, url);
        try w.writeAll("}");
        _ = try self.call("Page.navigate", param_buf.items);
    }

    pub fn waitForLoad(self: *CdpClient) !void {
        while (true) {
            const frame = try self.ws.readMessage();
            if (frame.opcode == .close) return error.ConnectionClosed;
            if (std.mem.indexOf(u8, frame.payload, "\"Page.loadEventFired\"")) |_| {
                return;
            }
        }
    }

    pub fn evaluate(self: *CdpClient, expression: []const u8) ![]const u8 {
        var param_buf: std.ArrayList(u8) = .empty;
        defer param_buf.deinit(self.allocator);

        var w = param_buf.writer(self.allocator);
        try w.writeAll("{\"expression\":");
        try writeJsonString(w, expression);
        try w.writeAll(",\"returnByValue\":true}");

        return self.call("Runtime.evaluate", param_buf.items);
    }

    pub fn evaluateValue(self: *CdpClient, expression: []const u8) !?JsonValue {
        const response = try self.evaluate(expression);
        return extractResultValue(response);
    }

    pub fn captureScreenshot(self: *CdpClient, format: []const u8, quality: u32) ![]u8 {
        var buf: [128]u8 = undefined;
        const params = std.fmt.bufPrint(&buf, "{{\"format\":\"{s}\",\"quality\":{d}}}", .{ format, quality }) catch return error.BufferTooSmall;

        const response = try self.call("Page.captureScreenshot", params);
        const data_field = extractStringField(response, "data") orelse return error.NoScreenshotData;
        return base64.decode(self.allocator, data_field);
    }

    pub fn dispatchMouseEvent(self: *CdpClient, event_type: []const u8, x: f64, y: f64, opts: MouseEventOpts) !void {
        var param_buf: std.ArrayList(u8) = .empty;
        defer param_buf.deinit(self.allocator);
        var w = param_buf.writer(self.allocator);

        try w.print("{{\"type\":\"{s}\",\"x\":{d},\"y\":{d}", .{ event_type, x, y });
        if (opts.button) |btn| try w.print(",\"button\":\"{s}\"", .{btn});
        if (opts.click_count) |cc| try w.print(",\"clickCount\":{d}", .{cc});
        if (opts.buttons) |btns| try w.print(",\"buttons\":{d}", .{btns});
        if (opts.modifiers) |mods| try w.print(",\"modifiers\":{d}", .{mods});
        try w.writeAll("}");

        _ = try self.call("Input.dispatchMouseEvent", param_buf.items);
    }

    pub fn dispatchKeyEvent(self: *CdpClient, event_type: []const u8, opts: KeyEventOpts) !void {
        var param_buf: std.ArrayList(u8) = .empty;
        defer param_buf.deinit(self.allocator);
        var w = param_buf.writer(self.allocator);

        try w.print("{{\"type\":\"{s}\"", .{event_type});
        if (opts.key) |k| {
            try w.writeAll(",\"key\":");
            try writeJsonString(w, k);
        }
        if (opts.code) |c| try w.print(",\"code\":\"{s}\"", .{c});
        if (opts.text) |t| {
            try w.writeAll(",\"text\":");
            try writeJsonString(w, t);
        }
        if (opts.key_code) |kc| try w.print(",\"windowsVirtualKeyCode\":{d}", .{kc});
        if (opts.modifiers) |mods| try w.print(",\"modifiers\":{d}", .{mods});
        if (opts.commands) |cmds| {
            try w.writeAll(",\"commands\":[");
            for (cmds, 0..) |cmd, i| {
                if (i > 0) try w.writeAll(",");
                try w.print("\"{s}\"", .{cmd});
            }
            try w.writeAll("]");
        }
        try w.writeAll("}");

        _ = try self.call("Input.dispatchKeyEvent", param_buf.items);
    }
};

pub const MouseEventOpts = struct {
    button: ?[]const u8 = null,
    click_count: ?u32 = null,
    buttons: ?u32 = null,
    modifiers: ?u32 = null,
};

pub const KeyEventOpts = struct {
    key: ?[]const u8 = null,
    code: ?[]const u8 = null,
    text: ?[]const u8 = null,
    key_code: ?u32 = null,
    modifiers: ?u32 = null,
    commands: ?[]const []const u8 = null,
};

pub const JsonValue = union(enum) {
    boolean: bool,
    number: f64,
    string: []const u8,
    null_val: void,
    object: []const u8,
};

fn extractId(json: []const u8) ?u32 {
    const needle = "\"id\":";
    const idx = std.mem.indexOf(u8, json, needle) orelse return null;
    const start = idx + needle.len;
    var end = start;
    while (end < json.len and (json[end] >= '0' and json[end] <= '9')) : (end += 1) {}
    if (end == start) return null;
    return std.fmt.parseInt(u32, json[start..end], 10) catch null;
}

fn extractStringField(json: []const u8, field: []const u8) ?[]const u8 {
    var search_buf: [64]u8 = undefined;
    const search = std.fmt.bufPrint(&search_buf, "\"{s}\":\"", .{field}) catch return null;

    const idx = std.mem.indexOf(u8, json, search) orelse return null;
    const start = idx + search.len;

    var end = start;
    while (end < json.len) {
        if (json[end] == '"' and (end == start or json[end - 1] != '\\')) break;
        end += 1;
    }

    return json[start..end];
}

fn extractResultValue(json: []const u8) ?JsonValue {
    const result_idx = std.mem.indexOf(u8, json, "\"result\":{") orelse return null;
    const value_needle = "\"value\":";
    const value_idx = std.mem.indexOf(u8, json[result_idx..], value_needle) orelse return null;
    const abs_idx = result_idx + value_idx + value_needle.len;

    if (abs_idx >= json.len) return null;

    const ch = json[abs_idx];
    if (ch == 't') return .{ .boolean = true };
    if (ch == 'f') return .{ .boolean = false };
    if (ch == 'n') return .{ .null_val = {} };
    if (ch == '"') {
        const start = abs_idx + 1;
        var end = start;
        while (end < json.len) {
            if (json[end] == '"' and json[end - 1] != '\\') break;
            end += 1;
        }
        return .{ .string = json[start..end] };
    }
    if (ch == '{') {
        var depth: u32 = 0;
        var end = abs_idx;
        while (end < json.len) {
            if (json[end] == '{') depth += 1;
            if (json[end] == '}') {
                depth -= 1;
                if (depth == 0) {
                    return .{ .object = json[abs_idx .. end + 1] };
                }
            }
            end += 1;
        }
        return null;
    }

    // Number
    var end = abs_idx;
    while (end < json.len and (json[end] >= '0' and json[end] <= '9' or json[end] == '.' or json[end] == '-' or json[end] == 'e' or json[end] == 'E' or json[end] == '+')) : (end += 1) {}
    const num_str = json[abs_idx..end];
    const num = std.fmt.parseFloat(f64, num_str) catch return null;
    return .{ .number = num };
}

fn writeJsonString(writer: anytype, s: []const u8) !void {
    try writer.writeByte('"');
    for (s) |c| {
        switch (c) {
            '"' => try writer.writeAll("\\\""),
            '\\' => try writer.writeAll("\\\\"),
            '\n' => try writer.writeAll("\\n"),
            '\r' => try writer.writeAll("\\r"),
            '\t' => try writer.writeAll("\\t"),
            else => {
                if (c < 0x20) {
                    try writer.print("\\u{x:0>4}", .{@as(u16, c)});
                } else {
                    try writer.writeByte(c);
                }
            },
        }
    }
    try writer.writeByte('"');
}

const WsUrlParts = struct {
    host: []const u8,
    port: u16,
    path: []const u8,
};

fn parseWsUrl(url: []const u8) ?WsUrlParts {
    const prefix = "ws://";
    if (!std.mem.startsWith(u8, url, prefix)) return null;
    const rest = url[prefix.len..];

    const slash_idx = std.mem.indexOf(u8, rest, "/") orelse return null;
    const host_port = rest[0..slash_idx];
    const path = rest[slash_idx..];

    const colon_idx = std.mem.indexOf(u8, host_port, ":") orelse return null;
    const host = host_port[0..colon_idx];
    const port_str = host_port[colon_idx + 1 ..];
    const port = std.fmt.parseInt(u16, port_str, 10) catch return null;

    return .{ .host = host, .port = port, .path = path };
}

fn discoverWebSocketUrl(allocator: std.mem.Allocator, port: u16) ![]u8 {
    var addr_buf: [64]u8 = undefined;
    const addr_str = std.fmt.bufPrint(&addr_buf, "127.0.0.1:{d}", .{port}) catch return error.BufferTooSmall;

    const address = try std.net.Address.resolveIp("127.0.0.1", port);
    const stream = try std.net.tcpConnectToAddress(address);
    defer stream.close();

    var req_buf: [256]u8 = undefined;
    const request = std.fmt.bufPrint(&req_buf, "GET /json/version HTTP/1.1\r\nHost: {s}\r\n\r\n", .{addr_str}) catch return error.BufferTooSmall;
    try stream.writeAll(request);

    var response_buf = try allocator.alloc(u8, 16384);
    defer allocator.free(response_buf);
    var total: usize = 0;
    while (total < response_buf.len) {
        const n = stream.read(response_buf[total..]) catch break;
        if (n == 0) break;
        total += n;
        if (std.mem.indexOf(u8, response_buf[0..total], "\r\n\r\n")) |header_end| {
            const body_start = header_end + 4;
            if (std.mem.indexOf(u8, response_buf[body_start..total], "webSocketDebuggerUrl")) |_| {
                break;
            }
        }
    }

    const response = response_buf[0..total];
    const ws_key = "\"webSocketDebuggerUrl\":\"";
    const ws_idx = std.mem.indexOf(u8, response, ws_key) orelse return error.NoWebSocketUrl;
    const ws_start = ws_idx + ws_key.len;
    const ws_end_idx = std.mem.indexOf(u8, response[ws_start..], "\"") orelse return error.NoWebSocketUrl;

    const ws_url = response[ws_start .. ws_start + ws_end_idx];
    return allocator.dupe(u8, ws_url);
}
