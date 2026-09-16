struct Params {
    screen_size: vec2<f32>,
    content_offset: vec2<f32>,
    content_size: vec2<f32>,
    cursor_pos: vec2<f32>,
    cursor_size: vec2<f32>,
    bg_color: vec4<f32>,
};

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var t_content: texture_2d<f32>;
@group(0) @binding(2) var t_cursor: texture_2d<f32>;
@group(0) @binding(3) var tex_sampler: sampler;

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv: vec2<f32>,
};

@vertex
fn vs_main(@builtin(vertex_index) idx: u32) -> VertexOutput {
    var pos = array<vec2<f32>, 6>(
        vec2(-1.0, -1.0),
        vec2( 1.0, -1.0),
        vec2(-1.0,  1.0),
        vec2(-1.0,  1.0),
        vec2( 1.0, -1.0),
        vec2( 1.0,  1.0),
    );
    var uvs = array<vec2<f32>, 6>(
        vec2(0.0, 1.0),
        vec2(1.0, 1.0),
        vec2(0.0, 0.0),
        vec2(0.0, 0.0),
        vec2(1.0, 1.0),
        vec2(1.0, 0.0),
    );
    var out: VertexOutput;
    out.position = vec4(pos[idx], 0.0, 1.0);
    out.uv = uvs[idx];
    return out;
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    let pixel = in.uv * params.screen_size;
    var color = params.bg_color;

    let content_uv = (pixel - params.content_offset) / params.content_size;
    if (all(content_uv >= vec2(0.0)) && all(content_uv < vec2(1.0))) {
        color = textureSample(t_content, tex_sampler, content_uv);
    }

    let cursor_uv = (pixel - params.cursor_pos) / params.cursor_size;
    if (all(cursor_uv >= vec2(0.0)) && all(cursor_uv < vec2(1.0))) {
        let c = textureSample(t_cursor, tex_sampler, cursor_uv);
        color = vec4(
            mix(color.rgb, c.rgb, c.a),
            max(color.a, c.a),
        );
    }

    return color;
}
