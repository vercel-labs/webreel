const std = @import("std");
const builtin = @import("builtin");

const WEBREEL_DIR = ".webreel";
const BIN_DIR = "bin";

pub fn getCacheDir(allocator: std.mem.Allocator) ![]u8 {
    const home = std.posix.getenv("HOME") orelse std.posix.getenv("USERPROFILE") orelse return error.NoHomeDir;
    return std.fs.path.join(allocator, &.{ home, WEBREEL_DIR });
}

pub fn getBinDir(allocator: std.mem.Allocator) ![]u8 {
    const cache = try getCacheDir(allocator);
    defer allocator.free(cache);
    return std.fs.path.join(allocator, &.{ cache, BIN_DIR });
}

pub fn ensureFfmpeg(allocator: std.mem.Allocator) ![]u8 {
    if (std.posix.getenv("FFMPEG_PATH")) |p| {
        return allocator.dupe(u8, p);
    }

    const bin_dir = try getBinDir(allocator);
    defer allocator.free(bin_dir);
    const ffmpeg_path = try std.fs.path.join(allocator, &.{ bin_dir, "ffmpeg" });

    if (std.fs.cwd().statFile(ffmpeg_path)) |_| {
        return ffmpeg_path;
    } else |_| {}
    allocator.free(ffmpeg_path);

    const result = std.process.Child.run(.{
        .allocator = allocator,
        .argv = &.{ "ffmpeg", "-version" },
    }) catch return error.FfmpegNotFound;
    allocator.free(result.stdout);
    allocator.free(result.stderr);

    if (result.term.Exited == 0) {
        return allocator.dupe(u8, "ffmpeg");
    }

    return error.FfmpegNotFound;
}

pub fn ensureChrome(allocator: std.mem.Allocator) ![]u8 {
    if (std.posix.getenv("CHROME_PATH")) |p| {
        return allocator.dupe(u8, p);
    }

    if (builtin.os.tag == .macos) {
        const mac_paths = [_][]const u8{
            "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
            "/Applications/Chromium.app/Contents/MacOS/Chromium",
            "/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary",
        };
        for (&mac_paths) |p| {
            if (std.fs.cwd().statFile(p)) |_| {
                return allocator.dupe(u8, p);
            } else |_| {}
        }
    } else if (builtin.os.tag == .linux) {
        const linux_paths = [_][]const u8{
            "/usr/bin/google-chrome",
            "/usr/bin/google-chrome-stable",
            "/usr/bin/chromium-browser",
            "/usr/bin/chromium",
        };
        for (&linux_paths) |p| {
            if (std.fs.cwd().statFile(p)) |_| {
                return allocator.dupe(u8, p);
            } else |_| {}
        }
    }

    const bin_dir = try getBinDir(allocator);
    defer allocator.free(bin_dir);

    const cached = try std.fs.path.join(allocator, &.{ bin_dir, "chrome", "chrome" });
    if (std.fs.cwd().statFile(cached)) |_| {
        return cached;
    } else |_| {}
    allocator.free(cached);

    return error.ChromeNotFound;
}

pub fn findFreePort() !u16 {
    const address = std.net.Address.initIp4(.{ 127, 0, 0, 1 }, 0);
    var server = try address.listen(.{});
    defer server.deinit();
    return server.listen_address.getPort();
}

pub fn launchChrome(allocator: std.mem.Allocator, headless: bool) !struct {
    process: std.process.Child,
    port: u16,
    profile_dir: []u8,
} {
    const chrome_path = try ensureChrome(allocator);
    defer allocator.free(chrome_path);

    const port = try findFreePort();
    var port_buf: [32]u8 = undefined;
    const port_arg = std.fmt.bufPrint(&port_buf, "--remote-debugging-port={d}", .{port}) catch unreachable;

    const cache_dir = try getCacheDir(allocator);
    defer allocator.free(cache_dir);

    var ts_buf: [32]u8 = undefined;
    const ts = @as(u64, @intCast(std.time.milliTimestamp()));
    const ts_str = std.fmt.bufPrint(&ts_buf, "{d}", .{ts}) catch "0";

    const profile_dir = try std.fmt.allocPrint(allocator, "{s}/chrome-profile-{s}", .{ cache_dir, ts_str });

    std.fs.cwd().makePath(profile_dir) catch {};

    var user_data_arg_buf: [512]u8 = undefined;
    const user_data_arg = std.fmt.bufPrint(&user_data_arg_buf, "--user-data-dir={s}", .{profile_dir}) catch return error.PathTooLong;

    const base_args = [_][]const u8{
        chrome_path,
        port_arg,
        user_data_arg,
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-background-networking",
        "--disable-sync",
        "--disable-translate",
        "--metrics-recording-only",
        "--disable-default-apps",
        "--mute-audio",
        "--no-sandbox",
    };

    const headless_args = [_][]const u8{
        "--headless=new",
    };

    var full_args: [base_args.len + headless_args.len][]const u8 = undefined;
    var arg_count: usize = 0;
    for (&base_args) |arg| {
        full_args[arg_count] = arg;
        arg_count += 1;
    }
    if (headless) {
        for (&headless_args) |arg| {
            full_args[arg_count] = arg;
            arg_count += 1;
        }
    }

    var child = std.process.Child.init(full_args[0..arg_count], allocator);
    child.stderr_behavior = .Pipe;
    child.stdout_behavior = .Pipe;
    try child.spawn();

    // Wait for "DevTools listening on" message
    const stderr = child.stderr.?;
    var buf: [4096]u8 = undefined;
    var total: usize = 0;
    const start = std.time.milliTimestamp();
    const timeout_ms: i64 = 10000;

    while (std.time.milliTimestamp() - start < timeout_ms) {
        const n = stderr.read(buf[total..]) catch break;
        if (n == 0) {
            std.Thread.sleep(50 * std.time.ns_per_ms);
            continue;
        }
        total += n;
        if (std.mem.indexOf(u8, buf[0..total], "DevTools listening on")) |_| {
            break;
        }
    }

    return .{
        .process = child,
        .port = port,
        .profile_dir = profile_dir,
    };
}
