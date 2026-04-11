const std = @import("std");

pub fn build(b: *std.Build) void {
    const target = b.standardTargetOptions(.{});
    const optimize = b.standardOptimizeOption(.{});
    const enable_gpu = b.option(bool, "gpu", "Enable wgpu-native GPU backend") orelse false;
    const exe_name = b.option([]const u8, "exe-name", "Override executable name") orelse "compositor";

    const exe = b.addExecutable(.{
        .name = exe_name,
        .root_module = b.createModule(.{
            .root_source_file = b.path("src/main.zig"),
            .target = target,
            .optimize = optimize,
            .link_libc = true,
        }),
    });

    exe.root_module.addIncludePath(b.path("deps/stb"));
    exe.root_module.addCSourceFile(.{
        .file = b.path("deps/stb/stb_impl.c"),
        .flags = &.{"-DSTBI_NO_STDIO"},
    });

    exe.root_module.addIncludePath(b.path("deps/nanosvg"));
    exe.root_module.addCSourceFile(.{
        .file = b.path("deps/nanosvg/nanosvg_impl.c"),
        .flags = &.{"-DNANOSVG_ALL_COLOR_KEYWORDS"},
    });

    const gpu_options = b.addOptions();
    gpu_options.addOption(bool, "enable_gpu", enable_gpu);
    exe.root_module.addOptions("build_options", gpu_options);

    if (enable_gpu) {
        exe.root_module.addIncludePath(b.path("deps/wgpu-native/include"));
        exe.root_module.addLibraryPath(b.path("deps/wgpu-native/lib"));
        exe.root_module.linkSystemLibrary("wgpu_native", .{});

        exe.root_module.linkFramework("Metal", .{});
        exe.root_module.linkFramework("QuartzCore", .{});
        exe.root_module.linkFramework("Foundation", .{});
    }

    b.installArtifact(exe);

    const run_cmd = b.addRunArtifact(exe);
    run_cmd.step.dependOn(b.getInstallStep());

    if (b.args) |args| {
        run_cmd.addArgs(args);
    }

    const run_step = b.step("run", "Run the compositor");
    run_step.dependOn(&run_cmd.step);

    const unit_tests = b.addTest(.{
        .root_module = b.createModule(.{
            .root_source_file = b.path("src/main.zig"),
            .target = target,
            .optimize = optimize,
            .link_libc = true,
        }),
    });
    unit_tests.root_module.addIncludePath(b.path("deps/stb"));
    unit_tests.root_module.addCSourceFile(.{
        .file = b.path("deps/stb/stb_impl.c"),
        .flags = &.{"-DSTBI_NO_STDIO"},
    });

    unit_tests.root_module.addIncludePath(b.path("deps/nanosvg"));
    unit_tests.root_module.addCSourceFile(.{
        .file = b.path("deps/nanosvg/nanosvg_impl.c"),
        .flags = &.{"-DNANOSVG_ALL_COLOR_KEYWORDS"},
    });

    const test_gpu_options = b.addOptions();
    test_gpu_options.addOption(bool, "enable_gpu", enable_gpu);
    unit_tests.root_module.addOptions("build_options", test_gpu_options);

    if (enable_gpu) {
        unit_tests.root_module.addIncludePath(b.path("deps/wgpu-native/include"));
        unit_tests.root_module.addLibraryPath(b.path("deps/wgpu-native/lib"));
        unit_tests.root_module.linkSystemLibrary("wgpu_native", .{});
        unit_tests.root_module.linkFramework("Metal", .{});
        unit_tests.root_module.linkFramework("QuartzCore", .{});
        unit_tests.root_module.linkFramework("Foundation", .{});
    }

    const run_tests = b.addRunArtifact(unit_tests);
    const test_step = b.step("test", "Run unit tests");
    test_step.dependOn(&run_tests.step);
}
