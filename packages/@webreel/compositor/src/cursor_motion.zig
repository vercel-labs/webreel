const std = @import("std");

pub const Point = struct {
    x: f64,
    y: f64,
};

const FRAME_MS: f64 = 1000.0 / 60.0;

pub fn moveDuration(distance: f64) f64 {
    const jitter = (prng() - 0.5) * 30.0;
    return 180.0 + 16.0 * @sqrt(distance) + jitter;
}

fn humanEase(t: f64) f64 {
    const mid = 0.4;
    if (t <= mid) {
        const s = t / mid;
        return 0.5 * s * s;
    }
    const s = (t - mid) / (1.0 - mid);
    return 0.5 + 0.5 * (1.0 - (1.0 - s) * (1.0 - s) * (1.0 - s));
}

fn bezierControl(x0: f64, y0: f64, x1: f64, y1: f64, dist: f64) Point {
    const mx = (x0 + x1) / 2.0;
    const my = (y0 + y1) / 2.0;

    if (dist < 80.0) return .{ .x = mx, .y = my };

    const px = -(y1 - y0) / dist;
    const py = (x1 - x0) / dist;
    const side: f64 = if (prng() < 0.5) -1.0 else 1.0;
    const offset = dist * (0.03 + prng() * 0.07) * side;

    return .{ .x = mx + px * offset, .y = my + py * offset };
}

fn evalBezier(t: f64, p0: Point, p1: Point, p2: Point) Point {
    const m = 1.0 - t;
    return .{
        .x = m * m * p0.x + 2.0 * m * t * p1.x + t * t * p2.x,
        .y = m * m * p0.y + 2.0 * m * t * p1.y + t * t * p2.y,
    };
}

fn microJitter(t: f64, dist: f64) Point {
    const bell = @exp(-8.0 * (t - 0.5) * (t - 0.5));
    const mag = @min(@as(f64, 0.4), dist * 0.0004) * bell;
    return .{
        .x = (prng() - 0.5) * 2.0 * mag,
        .y = (prng() - 0.5) * 2.0 * mag,
    };
}

pub fn computeMovePath(
    allocator: std.mem.Allocator,
    from_x: f64,
    from_y: f64,
    to_x: f64,
    to_y: f64,
) !struct { positions: []Point, duration: f64 } {
    const dx = to_x - from_x;
    const dy = to_y - from_y;
    const dist = @sqrt(dx * dx + dy * dy);

    if (dist < 1.0) {
        const positions = try allocator.alloc(Point, 1);
        positions[0] = .{ .x = to_x, .y = to_y };
        return .{ .positions = positions, .duration = 0 };
    }

    const duration = moveDuration(dist);
    const ctrl = bezierControl(from_x, from_y, to_x, to_y, dist);
    const p0 = Point{ .x = from_x, .y = from_y };
    const p2 = Point{ .x = to_x, .y = to_y };

    const num_steps = @max(@as(usize, 6), @as(usize, @intFromFloat(@round(duration / FRAME_MS))));

    const positions = try allocator.alloc(Point, num_steps + 1);
    positions[0] = .{ .x = from_x, .y = from_y };

    for (1..num_steps + 1) |i| {
        const raw_t = @as(f64, @floatFromInt(i)) / @as(f64, @floatFromInt(num_steps));
        const t = humanEase(raw_t);
        const pos = evalBezier(t, p0, ctrl, p2);
        const jitter = if (dist > 60.0) microJitter(raw_t, dist) else Point{ .x = 0, .y = 0 };
        positions[i] = .{
            .x = @round((pos.x + jitter.x) * 10.0) / 10.0,
            .y = @round((pos.y + jitter.y) * 10.0) / 10.0,
        };
    }
    positions[num_steps] = .{ .x = to_x, .y = to_y };

    return .{ .positions = positions, .duration = duration };
}

pub fn computeEasedPath(
    allocator: std.mem.Allocator,
    from_x: f64,
    from_y: f64,
    to_x: f64,
    to_y: f64,
    steps: usize,
) ![]Point {
    const dx = to_x - from_x;
    const dy = to_y - from_y;
    const dist = @sqrt(dx * dx + dy * dy);

    if (dist < 1.0) {
        const pts = try allocator.alloc(Point, 1);
        pts[0] = .{ .x = to_x, .y = to_y };
        return pts;
    }

    const ctrl = bezierControl(from_x, from_y, to_x, to_y, dist);
    const p0 = Point{ .x = from_x, .y = from_y };
    const p2 = Point{ .x = to_x, .y = to_y };

    const pts = try allocator.alloc(Point, steps);
    for (0..steps) |i| {
        const raw_t = @as(f64, @floatFromInt(i + 1)) / @as(f64, @floatFromInt(steps));
        const t = humanEase(raw_t);
        pts[i] = evalBezier(t, p0, ctrl, p2);
    }
    pts[steps - 1] = .{ .x = to_x, .y = to_y };
    return pts;
}

pub fn computeDragTiming(distance: f64) struct { steps: usize, delay_ms: f64 } {
    const duration = 300.0 + 20.0 * @sqrt(distance) + (prng() - 0.5) * 40.0;
    const steps = @max(@as(usize, 12), @as(usize, @intFromFloat(@round(duration / 30.0))));
    return .{ .steps = steps, .delay_ms = duration / @as(f64, @floatFromInt(steps)) };
}

var rng_state: u64 = 0;
var rng_initialized: bool = false;

fn prng() f64 {
    if (!rng_initialized) {
        rng_state = @truncate(@as(u128, @bitCast(std.time.nanoTimestamp())) ^ 0x6a09e667f3bcc908);
        rng_initialized = true;
    }
    rng_state ^= rng_state << 13;
    rng_state ^= rng_state >> 7;
    rng_state ^= rng_state << 17;
    const float_bits = (rng_state >> 12) | (0x3FF << 52);
    return @as(f64, @bitCast(float_bits)) - 1.0;
}
