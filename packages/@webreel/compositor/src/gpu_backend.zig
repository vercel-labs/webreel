const std = @import("std");
const types = @import("types.zig");

const wgpu = @cImport({
    @cInclude("webgpu/webgpu.h");
    @cInclude("webgpu/wgpu.h");
});

const shader_source = @embedFile("shaders/composite.wgsl");

const Params = extern struct {
    screen_size: [2]f32,
    content_offset: [2]f32,
    content_size: [2]f32,
    cursor_pos: [2]f32,
    cursor_size: [2]f32,
    bg_color: [4]f32,
    _padding: [2]f32 = .{ 0, 0 },
};

fn make_string_view(s: [*]const u8, len: usize) wgpu.WGPUStringView {
    return .{ .data = s, .length = len };
}

pub const GpuCompositor = struct {
    instance: wgpu.WGPUInstance,
    adapter: wgpu.WGPUAdapter,
    device: wgpu.WGPUDevice,
    queue: wgpu.WGPUQueue,
    pipeline: wgpu.WGPURenderPipeline,
    bind_group_layout: wgpu.WGPUBindGroupLayout,
    sampler_obj: wgpu.WGPUSampler,
    param_buffer: wgpu.WGPUBuffer,
    readback_buffer: wgpu.WGPUBuffer,
    render_texture: wgpu.WGPUTexture,
    render_view: wgpu.WGPUTextureView,
    content_texture: wgpu.WGPUTexture,
    content_view: wgpu.WGPUTextureView,
    cursor_texture: wgpu.WGPUTexture,
    cursor_view: wgpu.WGPUTextureView,
    width: u32,
    height: u32,
    content_w: u32,
    content_h: u32,
    cursor_w: u32,
    cursor_h: u32,
    allocator: std.mem.Allocator,

    pub fn init(
        allocator: std.mem.Allocator,
        screen_w: u32,
        screen_h: u32,
        content_w: u32,
        content_h: u32,
        cursor_w: u32,
        cursor_h: u32,
    ) !GpuCompositor {
        const instance = wgpu.wgpuCreateInstance(&std.mem.zeroes(wgpu.WGPUInstanceDescriptor)) orelse return error.GpuInstanceFailed;

        // Request adapter
        var adapter_result: AdapterResult = .{};
        _ = wgpu.wgpuInstanceRequestAdapter(instance, &wgpu.WGPURequestAdapterOptions{
            .nextInChain = null,
            .featureLevel = wgpu.WGPUFeatureLevel_Core,
            .powerPreference = wgpu.WGPUPowerPreference_HighPerformance,
            .forceFallbackAdapter = @intFromBool(false),
            .backendType = wgpu.WGPUBackendType_Undefined,
            .compatibleSurface = null,
        }, .{
            .nextInChain = null,
            .mode = wgpu.WGPUCallbackMode_AllowSpontaneous,
            .callback = &adapter_callback,
            .userdata1 = @ptrCast(&adapter_result),
            .userdata2 = null,
        });

        // Poll until adapter is ready
        var polls: u32 = 0;
        while (!adapter_result.ready and polls < 1000) : (polls += 1) {
            _ = wgpu.wgpuInstanceWaitAny(instance, 0, null, 1_000_000);
        }

        const adapter = adapter_result.adapter orelse return error.GpuAdapterFailed;

        // Request device
        var device_result: DeviceResult = .{};
        _ = wgpu.wgpuAdapterRequestDevice(adapter, &wgpu.WGPUDeviceDescriptor{
            .nextInChain = null,
            .label = make_string_view("compositor", 10),
            .requiredFeatureCount = 0,
            .requiredFeatures = null,
            .requiredLimits = null,
            .defaultQueue = .{
                .nextInChain = null,
                .label = make_string_view("", 0),
            },
            .deviceLostCallbackInfo = std.mem.zeroes(wgpu.WGPUDeviceLostCallbackInfo),
            .uncapturedErrorCallbackInfo = std.mem.zeroes(wgpu.WGPUUncapturedErrorCallbackInfo),
        }, .{
            .nextInChain = null,
            .mode = wgpu.WGPUCallbackMode_AllowSpontaneous,
            .callback = &device_callback,
            .userdata1 = @ptrCast(&device_result),
            .userdata2 = null,
        });

        polls = 0;
        while (!device_result.ready and polls < 1000) : (polls += 1) {
            _ = wgpu.wgpuInstanceWaitAny(instance, 0, null, 1_000_000);
        }

        const device = device_result.device orelse return error.GpuDeviceFailed;
        const queue = wgpu.wgpuDeviceGetQueue(device) orelse return error.GpuQueueFailed;

        // Create shader module
        var wgsl_source: wgpu.WGPUShaderSourceWGSL = .{
            .chain = .{ .sType = wgpu.WGPUSType_ShaderSourceWGSL, .next = null },
            .code = make_string_view(shader_source.ptr, shader_source.len),
        };
        const shader_module = wgpu.wgpuDeviceCreateShaderModule(device, &wgpu.WGPUShaderModuleDescriptor{
            .nextInChain = @ptrCast(&wgsl_source),
            .label = make_string_view("composite", 9),
        }) orelse return error.GpuShaderFailed;
        defer wgpu.wgpuShaderModuleRelease(shader_module);

        const bgl = create_bind_group_layout(device) orelse return error.GpuLayoutFailed;

        var bgl_ref = bgl;
        const pipeline_layout = wgpu.wgpuDeviceCreatePipelineLayout(device, &wgpu.WGPUPipelineLayoutDescriptor{
            .nextInChain = null,
            .label = make_string_view("", 0),
            .bindGroupLayoutCount = 1,
            .bindGroupLayouts = &bgl_ref,
        }) orelse return error.GpuPipelineFailed;
        defer wgpu.wgpuPipelineLayoutRelease(pipeline_layout);

        const pipeline = create_render_pipeline(device, pipeline_layout, shader_module) orelse return error.GpuPipelineFailed;

        const sampler_obj = wgpu.wgpuDeviceCreateSampler(device, &wgpu.WGPUSamplerDescriptor{
            .nextInChain = null,
            .label = make_string_view("", 0),
            .addressModeU = wgpu.WGPUAddressMode_ClampToEdge,
            .addressModeV = wgpu.WGPUAddressMode_ClampToEdge,
            .addressModeW = wgpu.WGPUAddressMode_ClampToEdge,
            .magFilter = wgpu.WGPUFilterMode_Linear,
            .minFilter = wgpu.WGPUFilterMode_Linear,
            .mipmapFilter = wgpu.WGPUMipmapFilterMode_Nearest,
            .lodMinClamp = 0,
            .lodMaxClamp = 1,
            .compare = wgpu.WGPUCompareFunction_Undefined,
            .maxAnisotropy = 1,
        }) orelse return error.GpuSamplerFailed;

        const param_buffer = create_uniform_buffer(device, @sizeOf(Params)) orelse return error.GpuBufferFailed;

        const row_bytes = screen_w * 4;
        const aligned_row = (row_bytes + 255) & ~@as(u32, 255);
        const readback_size = @as(u64, aligned_row) * @as(u64, screen_h);
        const readback_buffer = create_readback_buffer(device, readback_size) orelse return error.GpuBufferFailed;

        const render_texture = create_texture(device, screen_w, screen_h, true) orelse return error.GpuTextureFailed;
        const render_view = wgpu.wgpuTextureCreateView(render_texture, null) orelse return error.GpuTextureFailed;

        const content_texture = create_texture(device, content_w, content_h, false) orelse return error.GpuTextureFailed;
        const content_view = wgpu.wgpuTextureCreateView(content_texture, null) orelse return error.GpuTextureFailed;

        const cw = @max(cursor_w, 1);
        const ch = @max(cursor_h, 1);
        const cursor_texture = create_texture(device, cw, ch, false) orelse return error.GpuTextureFailed;
        const cursor_view = wgpu.wgpuTextureCreateView(cursor_texture, null) orelse return error.GpuTextureFailed;

        return .{
            .instance = instance,
            .adapter = adapter,
            .device = device,
            .queue = queue,
            .pipeline = pipeline,
            .bind_group_layout = bgl,
            .sampler_obj = sampler_obj,
            .param_buffer = param_buffer,
            .readback_buffer = readback_buffer,
            .render_texture = render_texture,
            .render_view = render_view,
            .content_texture = content_texture,
            .content_view = content_view,
            .cursor_texture = cursor_texture,
            .cursor_view = cursor_view,
            .width = screen_w,
            .height = screen_h,
            .content_w = content_w,
            .content_h = content_h,
            .cursor_w = cw,
            .cursor_h = ch,
            .allocator = allocator,
        };
    }

    pub fn deinit(self: *GpuCompositor) void {
        wgpu.wgpuBufferRelease(self.readback_buffer);
        wgpu.wgpuBufferRelease(self.param_buffer);
        wgpu.wgpuTextureViewRelease(self.cursor_view);
        wgpu.wgpuTextureRelease(self.cursor_texture);
        wgpu.wgpuTextureViewRelease(self.content_view);
        wgpu.wgpuTextureRelease(self.content_texture);
        wgpu.wgpuTextureViewRelease(self.render_view);
        wgpu.wgpuTextureRelease(self.render_texture);
        wgpu.wgpuSamplerRelease(self.sampler_obj);
        wgpu.wgpuRenderPipelineRelease(self.pipeline);
        wgpu.wgpuBindGroupLayoutRelease(self.bind_group_layout);
        wgpu.wgpuQueueRelease(self.queue);
        wgpu.wgpuDeviceRelease(self.device);
        wgpu.wgpuAdapterRelease(self.adapter);
        wgpu.wgpuInstanceRelease(self.instance);
    }

    pub fn upload_content(self: *GpuCompositor, rgba_data: []const u8) void {
        write_texture(self.queue, self.content_texture, self.content_w, self.content_h, rgba_data);
    }

    pub fn upload_cursor(self: *GpuCompositor, rgba_data: []const u8) void {
        write_texture(self.queue, self.cursor_texture, self.cursor_w, self.cursor_h, rgba_data);
    }

    pub fn compose_frame(
        self: *GpuCompositor,
        content_x: f32,
        content_y: f32,
        cursor_x: f32,
        cursor_y: f32,
        bg_color: types.RGBA,
        output_buf: []u8,
    ) !void {
        const params = Params{
            .screen_size = .{ @floatFromInt(self.width), @floatFromInt(self.height) },
            .content_offset = .{ content_x, content_y },
            .content_size = .{ @floatFromInt(self.content_w), @floatFromInt(self.content_h) },
            .cursor_pos = .{ cursor_x, cursor_y },
            .cursor_size = .{ @floatFromInt(self.cursor_w), @floatFromInt(self.cursor_h) },
            .bg_color = .{
                @as(f32, @floatFromInt(bg_color.r)) / 255.0,
                @as(f32, @floatFromInt(bg_color.g)) / 255.0,
                @as(f32, @floatFromInt(bg_color.b)) / 255.0,
                @as(f32, @floatFromInt(bg_color.a)) / 255.0,
            },
        };

        wgpu.wgpuQueueWriteBuffer(self.queue, self.param_buffer, 0, @ptrCast(&params), @sizeOf(Params));

        const bind_group = create_bind_group(
            self.device,
            self.bind_group_layout,
            self.param_buffer,
            self.content_view,
            self.cursor_view,
            self.sampler_obj,
        ) orelse return error.GpuBindGroupFailed;
        defer wgpu.wgpuBindGroupRelease(bind_group);

        const encoder = wgpu.wgpuDeviceCreateCommandEncoder(self.device, &wgpu.WGPUCommandEncoderDescriptor{
            .nextInChain = null,
            .label = make_string_view("", 0),
        }) orelse return error.GpuEncoderFailed;

        const color_attachment = wgpu.WGPURenderPassColorAttachment{
            .view = self.render_view,
            .depthSlice = wgpu.WGPU_DEPTH_SLICE_UNDEFINED,
            .resolveTarget = null,
            .loadOp = wgpu.WGPULoadOp_Clear,
            .storeOp = wgpu.WGPUStoreOp_Store,
            .clearValue = .{ .r = 0, .g = 0, .b = 0, .a = 1 },
        };

        const render_pass = wgpu.wgpuCommandEncoderBeginRenderPass(encoder, &wgpu.WGPURenderPassDescriptor{
            .nextInChain = null,
            .label = make_string_view("", 0),
            .colorAttachmentCount = 1,
            .colorAttachments = &color_attachment,
            .depthStencilAttachment = null,
            .occlusionQuerySet = null,
            .timestampWrites = null,
        }) orelse return error.GpuRenderPassFailed;

        wgpu.wgpuRenderPassEncoderSetPipeline(render_pass, self.pipeline);
        wgpu.wgpuRenderPassEncoderSetBindGroup(render_pass, 0, bind_group, 0, null);
        wgpu.wgpuRenderPassEncoderDraw(render_pass, 6, 1, 0, 0);
        wgpu.wgpuRenderPassEncoderEnd(render_pass);
        wgpu.wgpuRenderPassEncoderRelease(render_pass);

        const row_bytes = self.width * 4;
        const aligned_row = (row_bytes + 255) & ~@as(u32, 255);

        wgpu.wgpuCommandEncoderCopyTextureToBuffer(
            encoder,
            &wgpu.WGPUTexelCopyTextureInfo{
                .texture = self.render_texture,
                .mipLevel = 0,
                .origin = .{ .x = 0, .y = 0, .z = 0 },
                .aspect = wgpu.WGPUTextureAspect_All,
            },
            &wgpu.WGPUTexelCopyBufferInfo{
                .layout = .{
                    .offset = 0,
                    .bytesPerRow = aligned_row,
                    .rowsPerImage = self.height,
                },
                .buffer = self.readback_buffer,
            },
            &wgpu.WGPUExtent3D{ .width = self.width, .height = self.height, .depthOrArrayLayers = 1 },
        );

        const command = wgpu.wgpuCommandEncoderFinish(encoder, &wgpu.WGPUCommandBufferDescriptor{
            .nextInChain = null,
            .label = make_string_view("", 0),
        }) orelse return error.GpuCommandFailed;
        defer wgpu.wgpuCommandBufferRelease(command);
        wgpu.wgpuCommandEncoderRelease(encoder);

        wgpu.wgpuQueueSubmit(self.queue, 1, &command);

        // Map readback buffer
        var map_done = false;
        _ = wgpu.wgpuBufferMapAsync(
            self.readback_buffer,
            wgpu.WGPUMapMode_Read,
            0,
            @as(usize, aligned_row) * @as(usize, self.height),
            .{
                .nextInChain = null,
                .mode = wgpu.WGPUCallbackMode_AllowSpontaneous,
                .callback = &map_callback,
                .userdata1 = @ptrCast(&map_done),
                .userdata2 = null,
            },
        );

        while (!map_done) {
            _ = wgpu.wgpuDevicePoll(self.device, @intFromBool(true), null);
        }

        const mapped_ptr: [*]const u8 = @ptrCast(wgpu.wgpuBufferGetConstMappedRange(
            self.readback_buffer,
            0,
            @as(usize, aligned_row) * @as(usize, self.height),
        ) orelse return error.GpuReadbackFailed);

        var y: u32 = 0;
        while (y < self.height) : (y += 1) {
            const src_off = @as(usize, y) * @as(usize, aligned_row);
            const dst_off = @as(usize, y) * @as(usize, row_bytes);
            @memcpy(output_buf[dst_off..][0..row_bytes], mapped_ptr[src_off..][0..row_bytes]);
        }

        wgpu.wgpuBufferUnmap(self.readback_buffer);
    }
};

const AdapterResult = struct { adapter: ?wgpu.WGPUAdapter = null, ready: bool = false };
const DeviceResult = struct { device: ?wgpu.WGPUDevice = null, ready: bool = false };

fn adapter_callback(
    status: wgpu.WGPURequestAdapterStatus,
    adapter: wgpu.WGPUAdapter,
    _message: wgpu.WGPUStringView,
    userdata1: ?*anyopaque,
    _userdata2: ?*anyopaque,
) callconv(.c) void {
    _ = _message;
    _ = _userdata2;
    if (userdata1) |ud| {
        const result: *AdapterResult = @alignCast(@ptrCast(ud));
        if (status == wgpu.WGPURequestAdapterStatus_Success) {
            result.adapter = adapter;
        }
        result.ready = true;
    }
}

fn device_callback(
    status: wgpu.WGPURequestDeviceStatus,
    device: wgpu.WGPUDevice,
    _message: wgpu.WGPUStringView,
    userdata1: ?*anyopaque,
    _userdata2: ?*anyopaque,
) callconv(.c) void {
    _ = _message;
    _ = _userdata2;
    if (userdata1) |ud| {
        const result: *DeviceResult = @alignCast(@ptrCast(ud));
        if (status == wgpu.WGPURequestDeviceStatus_Success) {
            result.device = device;
        }
        result.ready = true;
    }
}

fn map_callback(
    _status: wgpu.WGPUMapAsyncStatus,
    _message: wgpu.WGPUStringView,
    userdata1: ?*anyopaque,
    _userdata2: ?*anyopaque,
) callconv(.c) void {
    _ = _status;
    _ = _message;
    _ = _userdata2;
    if (userdata1) |ud| {
        const done: *bool = @alignCast(@ptrCast(ud));
        done.* = true;
    }
}

fn create_bind_group_layout(device: wgpu.WGPUDevice) ?wgpu.WGPUBindGroupLayout {
    const entries = [_]wgpu.WGPUBindGroupLayoutEntry{
        bgl_entry(0, wgpu.WGPUShaderStage_Fragment, .{ .buffer = .{
            .nextInChain = null,
            .type = wgpu.WGPUBufferBindingType_Uniform,
            .hasDynamicOffset = @intFromBool(false),
            .minBindingSize = @sizeOf(Params),
        } }),
        bgl_entry(1, wgpu.WGPUShaderStage_Fragment, .{ .texture = .{
            .nextInChain = null,
            .sampleType = wgpu.WGPUTextureSampleType_Float,
            .viewDimension = wgpu.WGPUTextureViewDimension_2D,
            .multisampled = @intFromBool(false),
        } }),
        bgl_entry(2, wgpu.WGPUShaderStage_Fragment, .{ .texture = .{
            .nextInChain = null,
            .sampleType = wgpu.WGPUTextureSampleType_Float,
            .viewDimension = wgpu.WGPUTextureViewDimension_2D,
            .multisampled = @intFromBool(false),
        } }),
        bgl_entry(3, wgpu.WGPUShaderStage_Fragment, .{ .sampler = .{
            .nextInChain = null,
            .type = wgpu.WGPUSamplerBindingType_Filtering,
        } }),
    };

    return wgpu.wgpuDeviceCreateBindGroupLayout(device, &wgpu.WGPUBindGroupLayoutDescriptor{
        .nextInChain = null,
        .label = make_string_view("", 0),
        .entryCount = entries.len,
        .entries = &entries,
    });
}

const BindingKind = union(enum) {
    buffer: wgpu.WGPUBufferBindingLayout,
    texture: wgpu.WGPUTextureBindingLayout,
    sampler: wgpu.WGPUSamplerBindingLayout,
};

fn bgl_entry(binding: u32, visibility: u32, kind: BindingKind) wgpu.WGPUBindGroupLayoutEntry {
    var entry = std.mem.zeroes(wgpu.WGPUBindGroupLayoutEntry);
    entry.binding = binding;
    entry.visibility = visibility;
    switch (kind) {
        .buffer => |b| entry.buffer = b,
        .texture => |t| entry.texture = t,
        .sampler => |s| entry.sampler = s,
    }
    return entry;
}

fn create_render_pipeline(
    device: wgpu.WGPUDevice,
    layout: wgpu.WGPUPipelineLayout,
    shader: wgpu.WGPUShaderModule,
) ?wgpu.WGPURenderPipeline {
    const color_target = wgpu.WGPUColorTargetState{
        .nextInChain = null,
        .format = wgpu.WGPUTextureFormat_RGBA8Unorm,
        .blend = &wgpu.WGPUBlendState{
            .color = .{
                .srcFactor = wgpu.WGPUBlendFactor_SrcAlpha,
                .dstFactor = wgpu.WGPUBlendFactor_OneMinusSrcAlpha,
                .operation = wgpu.WGPUBlendOperation_Add,
            },
            .alpha = .{
                .srcFactor = wgpu.WGPUBlendFactor_One,
                .dstFactor = wgpu.WGPUBlendFactor_OneMinusSrcAlpha,
                .operation = wgpu.WGPUBlendOperation_Add,
            },
        },
        .writeMask = wgpu.WGPUColorWriteMask_All,
    };

    const frag_state = wgpu.WGPUFragmentState{
        .nextInChain = null,
        .module = shader,
        .entryPoint = make_string_view("fs_main", 7),
        .constantCount = 0,
        .constants = null,
        .targetCount = 1,
        .targets = &color_target,
    };

    return wgpu.wgpuDeviceCreateRenderPipeline(device, &wgpu.WGPURenderPipelineDescriptor{
        .nextInChain = null,
        .label = make_string_view("", 0),
        .layout = layout,
        .vertex = .{
            .nextInChain = null,
            .module = shader,
            .entryPoint = make_string_view("vs_main", 7),
            .constantCount = 0,
            .constants = null,
            .bufferCount = 0,
            .buffers = null,
        },
        .primitive = .{
            .nextInChain = null,
            .topology = wgpu.WGPUPrimitiveTopology_TriangleList,
            .stripIndexFormat = wgpu.WGPUIndexFormat_Undefined,
            .frontFace = wgpu.WGPUFrontFace_CCW,
            .cullMode = wgpu.WGPUCullMode_None,
            .unclippedDepth = @intFromBool(false),
        },
        .depthStencil = null,
        .multisample = .{
            .nextInChain = null,
            .count = 1,
            .mask = 0xFFFFFFFF,
            .alphaToCoverageEnabled = @intFromBool(false),
        },
        .fragment = &frag_state,
    });
}

fn create_texture(device: wgpu.WGPUDevice, width: u32, height: u32, render_target: bool) ?wgpu.WGPUTexture {
    const usage: u32 = if (render_target)
        wgpu.WGPUTextureUsage_RenderAttachment | wgpu.WGPUTextureUsage_CopySrc
    else
        wgpu.WGPUTextureUsage_TextureBinding | wgpu.WGPUTextureUsage_CopyDst;

    return wgpu.wgpuDeviceCreateTexture(device, &wgpu.WGPUTextureDescriptor{
        .nextInChain = null,
        .label = make_string_view("", 0),
        .usage = usage,
        .dimension = wgpu.WGPUTextureDimension_2D,
        .size = .{ .width = width, .height = height, .depthOrArrayLayers = 1 },
        .format = wgpu.WGPUTextureFormat_RGBA8Unorm,
        .mipLevelCount = 1,
        .sampleCount = 1,
        .viewFormatCount = 0,
        .viewFormats = null,
    });
}

fn create_uniform_buffer(device: wgpu.WGPUDevice, size: u64) ?wgpu.WGPUBuffer {
    return wgpu.wgpuDeviceCreateBuffer(device, &wgpu.WGPUBufferDescriptor{
        .nextInChain = null,
        .label = make_string_view("", 0),
        .usage = wgpu.WGPUBufferUsage_Uniform | wgpu.WGPUBufferUsage_CopyDst,
        .size = size,
        .mappedAtCreation = @intFromBool(false),
    });
}

fn create_readback_buffer(device: wgpu.WGPUDevice, size: u64) ?wgpu.WGPUBuffer {
    return wgpu.wgpuDeviceCreateBuffer(device, &wgpu.WGPUBufferDescriptor{
        .nextInChain = null,
        .label = make_string_view("", 0),
        .usage = wgpu.WGPUBufferUsage_MapRead | wgpu.WGPUBufferUsage_CopyDst,
        .size = size,
        .mappedAtCreation = @intFromBool(false),
    });
}

fn create_bind_group(
    device: wgpu.WGPUDevice,
    layout: wgpu.WGPUBindGroupLayout,
    param_buffer: wgpu.WGPUBuffer,
    content_view: wgpu.WGPUTextureView,
    cursor_view: wgpu.WGPUTextureView,
    sampler_obj: wgpu.WGPUSampler,
) ?wgpu.WGPUBindGroup {
    const entries = [_]wgpu.WGPUBindGroupEntry{
        .{ .nextInChain = null, .binding = 0, .buffer = param_buffer, .offset = 0, .size = @sizeOf(Params), .sampler = null, .textureView = null },
        .{ .nextInChain = null, .binding = 1, .buffer = null, .offset = 0, .size = 0, .sampler = null, .textureView = content_view },
        .{ .nextInChain = null, .binding = 2, .buffer = null, .offset = 0, .size = 0, .sampler = null, .textureView = cursor_view },
        .{ .nextInChain = null, .binding = 3, .buffer = null, .offset = 0, .size = 0, .sampler = sampler_obj, .textureView = null },
    };

    return wgpu.wgpuDeviceCreateBindGroup(device, &wgpu.WGPUBindGroupDescriptor{
        .nextInChain = null,
        .label = make_string_view("", 0),
        .layout = layout,
        .entryCount = entries.len,
        .entries = &entries,
    });
}

fn write_texture(queue: wgpu.WGPUQueue, texture: wgpu.WGPUTexture, width: u32, height: u32, data: []const u8) void {
    wgpu.wgpuQueueWriteTexture(
        queue,
        &wgpu.WGPUTexelCopyTextureInfo{
            .texture = texture,
            .mipLevel = 0,
            .origin = .{ .x = 0, .y = 0, .z = 0 },
            .aspect = wgpu.WGPUTextureAspect_All,
        },
        data.ptr,
        data.len,
        &wgpu.WGPUTexelCopyBufferLayout{
            .offset = 0,
            .bytesPerRow = width * 4,
            .rowsPerImage = height,
        },
        &wgpu.WGPUExtent3D{ .width = width, .height = height, .depthOrArrayLayers = 1 },
    );
}

pub fn is_available() bool {
    const instance = wgpu.wgpuCreateInstance(&std.mem.zeroes(wgpu.WGPUInstanceDescriptor));
    if (instance == null) return false;
    wgpu.wgpuInstanceRelease(instance.?);
    return true;
}
