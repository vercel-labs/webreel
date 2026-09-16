const std = @import("std");
const cursor_motion = @import("cursor_motion.zig");

pub const EventType = enum {
    click,
    key,
};

pub const SoundEvent = struct {
    event_type: EventType,
    time_ms: f64,
};

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

pub const Timeline = struct {
    allocator: std.mem.Allocator,
    cursor_path: ?[]const cursor_motion.Point = null,
    path_index: usize = 0,
    scale_path: ?[]f64 = null,
    scale_path_index: usize = 0,
    current_cursor: CursorState,
    current_hud: ?HudState = null,
    frames: std.ArrayList(FrameData) = .empty,
    events: std.ArrayList(SoundEvent) = .empty,
    frame_count: usize = 0,
    width: u32,
    height: u32,
    zoom: f64,
    fps: u32,

    pub fn init(allocator: std.mem.Allocator, width: u32, height: u32, fps: u32, zoom: f64, initial_cursor: ?CursorState) Timeline {
        return .{
            .allocator = allocator,
            .width = width,
            .height = height,
            .fps = fps,
            .zoom = zoom,
            .current_cursor = initial_cursor orelse CursorState{ .x = -40, .y = -40, .scale = 1.0 },
            .frames = .empty,
            .events = .empty,
        };
    }

    pub fn deinit(self: *Timeline) void {
        self.frames.deinit(self.allocator);
        self.events.deinit(self.allocator);
        if (self.scale_path) |sp| self.allocator.free(sp);
    }

    pub fn setCursorPath(self: *Timeline, positions: []const cursor_motion.Point) void {
        self.cursor_path = positions;
        self.path_index = 0;
    }

    pub fn setCursorScale(self: *Timeline, scale: f64) void {
        self.current_cursor.scale = scale;
    }

    pub fn setCursorScaleAnimated(self: *Timeline, target_scale: f64, frame_count: usize) void {
        const start_scale = self.current_cursor.scale;
        const steps = self.allocator.alloc(f64, frame_count) catch return;

        for (0..frame_count) |i| {
            const t = @as(f64, @floatFromInt(i + 1)) / @as(f64, @floatFromInt(frame_count));
            const eased = 1.0 - (1.0 - t) * (1.0 - t);
            steps[i] = start_scale + (target_scale - start_scale) * eased;
        }

        if (self.scale_path) |old| self.allocator.free(old);
        self.scale_path = steps;
        self.scale_path_index = 0;
    }

    pub fn showHud(self: *Timeline, labels: []const []const u8) void {
        self.current_hud = .{ .labels = labels };
    }

    pub fn hideHud(self: *Timeline) void {
        self.current_hud = null;
    }

    pub fn addEvent(self: *Timeline, event_type: EventType) void {
        const time_ms = @as(f64, @floatFromInt(self.frame_count)) / @as(f64, @floatFromInt(self.fps)) * 1000.0;
        self.events.append(self.allocator, .{ .event_type = event_type, .time_ms = time_ms }) catch {};
    }

    pub fn tick(self: *Timeline) void {
        if (self.cursor_path) |path| {
            if (self.path_index < path.len) {
                const p = path[self.path_index];
                self.current_cursor.x = p.x;
                self.current_cursor.y = p.y;
                self.path_index += 1;
                if (self.path_index >= path.len) {
                    self.cursor_path = null;
                }
            }
        }

        if (self.scale_path) |sp| {
            if (self.scale_path_index < sp.len) {
                self.current_cursor.scale = sp[self.scale_path_index];
                self.scale_path_index += 1;
                if (self.scale_path_index >= sp.len) {
                    self.allocator.free(sp);
                    self.scale_path = null;
                }
            }
        }

        self.pushCurrentState();
    }

    pub fn getLastFrame(self: *const Timeline) ?FrameData {
        if (self.frames.items.len == 0) return null;
        return self.frames.items[self.frames.items.len - 1];
    }

    fn pushCurrentState(self: *Timeline) void {
        self.frames.append(self.allocator, .{
            .cursor = self.current_cursor,
            .hud = self.current_hud,
        }) catch {};
        self.frame_count += 1;
    }

    pub fn writeJson(self: *const Timeline, writer: anytype) !void {
        try writer.writeAll("{");
        try writer.print("\"fps\":{d},\"width\":{d},\"height\":{d},\"zoom\":{d}", .{
            self.fps, self.width, self.height, self.zoom,
        });

        try writer.writeAll(",\"frames\":[");
        for (self.frames.items, 0..) |frame, i| {
            if (i > 0) try writer.writeAll(",");
            try writer.print("{{\"cursor\":{{\"x\":{d},\"y\":{d},\"scale\":{d}}}", .{
                frame.cursor.x, frame.cursor.y, frame.cursor.scale,
            });
            if (frame.hud) |hud| {
                try writer.writeAll(",\"hud\":{\"labels\":[");
                for (hud.labels, 0..) |label, j| {
                    if (j > 0) try writer.writeAll(",");
                    try writeJsonString(writer, label);
                }
                try writer.writeAll("]}");
            } else {
                try writer.writeAll(",\"hud\":null");
            }
            try writer.writeAll("}");
        }
        try writer.writeAll("]");

        try writer.writeAll(",\"events\":[");
        for (self.events.items, 0..) |event, i| {
            if (i > 0) try writer.writeAll(",");
            const type_str: []const u8 = switch (event.event_type) {
                .click => "click",
                .key => "key",
            };
            try writer.print("{{\"type\":\"{s}\",\"timeMs\":{d}}}", .{ type_str, event.time_ms });
        }
        try writer.writeAll("]");

        try writer.writeAll("}");
    }
};

fn writeJsonString(writer: anytype, s: []const u8) !void {
    try writer.writeByte('"');
    for (s) |c| {
        switch (c) {
            '"' => try writer.writeAll("\\\""),
            '\\' => try writer.writeAll("\\\\"),
            '\n' => try writer.writeAll("\\n"),
            '\r' => try writer.writeAll("\\r"),
            '\t' => try writer.writeAll("\\t"),
            else => try writer.writeByte(c),
        }
    }
    try writer.writeByte('"');
}
