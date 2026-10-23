#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
NarciPHBrowser Media & AI Tools Suite
Integrates Edge-TTS, Video Remix/Deduplication (FFmpeg), and LLM Copywriting.
"""

import sys
import os
import json
import argparse
import subprocess
import asyncio
import time
import re
import urllib.parse
import urllib.request

if sys.stdout.encoding.lower() != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8')
if sys.stderr.encoding.lower() != 'utf-8':
    sys.stderr.reconfigure(encoding='utf-8')

# Locate FFmpeg binary from extracted Fabuya or system PATH
def get_ffmpeg_path():
    candidate = r"c:\Tools2\fingerBrowsers2\NarciPHBrowser\发布鸭.exe_extracted\ffmpeg-bin\ffmpeg.exe"
    if os.path.exists(candidate):
        return candidate
    return "ffmpeg"

def get_ffprobe_path():
    candidate = r"c:\Tools2\fingerBrowsers2\NarciPHBrowser\发布鸭.exe_extracted\ffmpeg-bin\ffprobe.exe"
    if os.path.exists(candidate):
        return candidate
    return "ffprobe"

# =========================================================================
# 1. Edge-TTS Audio & Subtitle Generation
# =========================================================================
async def run_edge_tts(text, voice, rate, pitch, output_dir):
    import edge_tts

    if not output_dir:
        output_dir = os.path.join(os.getcwd(), "duck_data", "tts_output")
    os.makedirs(output_dir, exist_ok=True)

    timestamp = int(time.time() * 1000)
    audio_path = os.path.abspath(os.path.join(output_dir, f"voice_{timestamp}.mp3"))
    vtt_path = os.path.abspath(os.path.join(output_dir, f"sub_{timestamp}.vtt"))
    srt_path = os.path.abspath(os.path.join(output_dir, f"sub_{timestamp}.srt"))

    rate_str = rate if rate else "+0%"
    pitch_str = pitch if pitch else "+0Hz"
    voice_name = voice if voice else "zh-CN-YunxiNeural"

    communicate = edge_tts.Communicate(text, voice_name, rate=rate_str, pitch=pitch_str)
    submaker = edge_tts.SubMaker()

    with open(audio_path, "wb") as f_audio:
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                f_audio.write(chunk["data"])
            elif chunk["type"] == "WordBoundary":
                submaker.feed(chunk)

    # Write SRT
    srt_content = submaker.get_srt()
    if not srt_content.strip():
        srt_content = f"1\n00:00:00,000 --> 00:00:10,000\n{text}\n"

    with open(srt_path, "w", encoding="utf-8") as f_srt:
        f_srt.write(srt_content)

    # Compute duration from SRT timestamps or fallback estimation
    duration_secs = 0.0
    time_matches = re.findall(r"(\d{2}):(\d{2}):(\d{2})[,.](\d{3})", srt_content)
    if time_matches:
        last = time_matches[-1]
        duration_secs = round(int(last[0]) * 3600 + int(last[1]) * 60 + int(last[2]) + int(last[3]) / 1000.0, 1)

    size_bytes = os.path.getsize(audio_path) if os.path.exists(audio_path) else 0
    file_size_kb = round(size_bytes / 1024.0, 1)

    return {
        "success": True,
        "audio_path": audio_path,
        "srt_path": srt_path,
        "voice": voice_name,
        "size_bytes": size_bytes,
        "file_size_kb": file_size_kb,
        "duration_secs": duration_secs,
    }

# =========================================================================
# 2. Video Remix & Deduplication (FFmpeg)
# =========================================================================
def probe_video_info(video_path):
    """Probes video metadata, stream info, resolution, duration and audio presence."""
    ffprobe = get_ffprobe_path()
    info = {"has_audio": False, "duration": 0.0, "width": 0, "height": 0, "fps": 30.0}
    try:
        cmd = [
            ffprobe, "-v", "error",
            "-show_entries", "stream=codec_type,width,height,r_frame_rate,duration:format=duration",
            "-of", "json",
            video_path
        ]
        res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, errors="replace")
        if res.returncode == 0:
            data = json.loads(res.stdout)
            for s in data.get("streams", []):
                if s.get("codec_type") == "audio":
                    info["has_audio"] = True
                elif s.get("codec_type") == "video":
                    info["width"] = int(s.get("width", 0))
                    info["height"] = int(s.get("height", 0))
                    r_fps = s.get("r_frame_rate", "30/1")
                    if "/" in r_fps:
                        num, den = r_fps.split("/")
                        if float(den) > 0:
                            info["fps"] = round(float(num) / float(den), 2)
            fmt_dur = data.get("format", {}).get("duration")
            if fmt_dur:
                info["duration"] = round(float(fmt_dur), 2)
    except Exception:
        pass
    return info

def run_video_remix(
    input_path,
    speed=1.02,
    zoom=1.02,
    flip_h=False,
    color_tweak=True,
    vignette=False,
    noise=False,
    audio_volume=1.0,
    strip_blind_watermark=True,
    trim_end_secs=0.0,
    trim_start_secs=0.0,
    delogo_mode="none",
    dynamic_pan_zoom=False,
    dynamic_lighting=False,
    ambient_blurred_bg=False,
    split_canvas=False,
    audio_scramble=False,
    mute_audio=False,
    frame_jitter=False,
    curved_speed=False,
    film_grain=False,
    micro_rotate=False,
    chromashift=False,
    unsharp=False,
    fake_camera_exif=True,
    output_path=None,
    output_dir=None
):
    if not os.path.exists(input_path):
        raise FileNotFoundError(f"Input video not found: {input_path}")

    start_time = time.time()
    ffmpeg = get_ffmpeg_path()
    info = probe_video_info(input_path)
    w = info.get("width", 1080) or 1080
    h = info.get("height", 1920) or 1920
    orig_dur = info.get("duration", 0.0)

    if not output_path:
        base_name = os.path.splitext(os.path.basename(input_path))[0]
        ext = os.path.splitext(input_path)[1] or ".mp4"
        timestamp = int(time.time())
        if not output_dir:
            out_dir = os.path.join(os.path.dirname(os.path.abspath(input_path)), "cleaned_videos")
        else:
            out_dir = output_dir
        os.makedirs(out_dir, exist_ok=True)
        output_path = os.path.join(out_dir, f"{base_name}_dedup_{timestamp}{ext}")

    output_path = os.path.abspath(output_path)
    pts_factor = round(1.0 / speed, 4)
    zoom_val = round(zoom, 4)

    # 1. 视频滤镜流水线
    vf_list = []

    # 明水印角标虚化消除 (FFmpeg delogo) - 必须置于最前，基于原始视频未裁剪像素基准定位，并严格限制边界防止越界溢出
    def _make_delogo_box(bx, by, bw, bh):
        bw = max(10, min(bw, w - 4))
        bh = max(10, min(bh, h - 4))
        bx = max(1, min(bx, w - bw - 2))
        by = max(1, min(by, h - bh - 2))
        return f"delogo=x={bx}:y={by}:w={bw}:h={bh}:show=0"

    lw = max(40, int(w * 0.22))
    lh = max(30, int(h * 0.055))
    if delogo_mode in ("douyin", "tiktok"):
        vf_list.append(_make_delogo_box(int(w * 0.02), int(h * 0.02), lw, lh))
        vf_list.append(_make_delogo_box(int(w * 0.76), int(h * 0.92), lw, lh))
    elif delogo_mode == "top_left":
        vf_list.append(_make_delogo_box(int(w * 0.02), int(h * 0.02), lw, lh))
    elif delogo_mode == "bottom_right":
        vf_list.append(_make_delogo_box(int(w * 0.76), int(h * 0.92), lw, lh))
    elif delogo_mode == "all_corners":
        vf_list.append(_make_delogo_box(int(w * 0.02), int(h * 0.02), lw, lh))
        vf_list.append(_make_delogo_box(int(w * 0.76), int(h * 0.02), lw, lh))
        vf_list.append(_make_delogo_box(int(w * 0.02), int(h * 0.92), lw, lh))
        vf_list.append(_make_delogo_box(int(w * 0.76), int(h * 0.92), lw, lh))

    # 智能微抽帧与时间重构 (每 45 帧丢弃 1 帧，打乱固定帧指纹匹配)
    if curved_speed:
        # 非线性动态波浪变速 (0.99x ~ 1.07x 动态正弦振荡，打碎时间注意力对齐与连续光流)
        vf_list.append(r"setpts='(PTS-STARTPTS)/(1.03+0.04*sin(2*PI*T/3.0))'")
    elif frame_jitter:
        vf_list.append(r"select='not(eq(mod(n\,45)\,0))'")
        vf_list.append(f"setpts={pts_factor}*(N/FRAME_RATE/TB)")
    else:
        vf_list.append(f"setpts={pts_factor}*PTS")

    # 运镜处理：呼吸式动态位移微运镜 (打破 ViT 图像特征与 CNN 局部模板比对，严格保证偶数宽高)
    if dynamic_pan_zoom:
        vf_list.append("crop=w='floor(in_w*0.93/2)*2':h='floor(in_h*0.93/2)*2':x='(in_w-out_w)/2+sin(t*0.5)*(in_w*0.02)':y='(in_h-out_h)/2+cos(t*0.4)*(in_h*0.02)'")
    elif zoom_val > 1.001:
        vf_list.append(f"scale=trunc(iw*{zoom_val}/2)*2:-2,crop=trunc(iw/{zoom_val}/2)*2:trunc(ih/{zoom_val}/2)*2")

    # 水平镜像翻转
    if flip_h:
        vf_list.append("hflip")

    # 色彩光影微调：动态光影呼吸 (每秒微调伽马与对比度，让 pHash 散列值全周期跳动)
    if dynamic_lighting:
        vf_list.append("eq=gamma='1.0+0.035*sin(2*PI*t/3.5)':contrast='1.03+0.02*cos(2*PI*t/4)':saturation=1.04")
    elif color_tweak:
        vf_list.append("eq=contrast=1.02:brightness=0.01:saturation=1.03")

    # 暗角衰减
    if vignette:
        vf_list.append("vignette=PI/5")

    # 微量时域噪声 (破坏 DCT 频域残差暗水印)
    if noise or strip_blind_watermark:
        vf_list.append("noise=alls=1:allf=t+u")

    # 空间微旋转 (±1.2° 动态正弦摆动，彻底破坏笛卡尔正交网格，仅在全屏模式下生效)
    if micro_rotate and not ambient_blurred_bg and not split_canvas:
        vf_list.append(f"scale=iw*1.04:ih*1.04,rotate=0.018*sin(2*PI*t/5.0):ow={w}:oh={h}:c=none")

    # RGB/色度通道空间微移 (破坏 YUV 颜色矩阵与直方图)
    if chromashift:
        vf_list.append("chromashift=cbh=2:crh=-2:cbv=1:crv=-1")

    # 边缘智能锐化重构 (改变高频梯度边缘)
    if unsharp:
        vf_list.append("unsharp=5:5:0.8:5:5:0.0")

    # 胶片微粒与动态光漏透镜滤镜 (全画幅微扰，打散全像素特征哈希与 SSIM)
    if film_grain:
        vf_list.append("noise=alls=3:allf=t+u,colorchannelmixer=rr=0.98:rg=0.01:rb=0.01:gg=0.99:gb=0.01:br=0.02:bb=0.97")

    # 保证最终送入 libx264 编码器的帧宽高恒为偶数，彻底消除 -22 错误
    vf_list.append("scale=trunc(iw/2)*2:trunc(ih/2)*2")

    cmd = [ffmpeg, "-y", "-i", input_path]

    # 头部微剪 (避开平台前 3 秒黄金首帧特征对齐)
    if trim_start_secs and trim_start_secs > 0:
        cmd.extend(["-ss", str(trim_start_secs)])

    # 画布构图排版处理：三段分屏 vs 画中画毛玻璃 vs 全屏满铺
    if split_canvas:
        vf_chain = ",".join(vf_list) if vf_list else "null"
        filter_complex = (
            f"[0:v]{vf_chain}[v_processed];"
            f"[v_processed]split=2[fg_in][bg_in];"
            f"[bg_in]scale={w}:{h}:force_original_aspect_ratio=increase,crop={w}:{h},boxblur=35:15,eq=brightness=-0.15[bg_blur];"
            f"[fg_in]scale={w}:trunc({int(h*0.68)}/2)*2[fg_mid];"
            f"[bg_blur][fg_mid]overlay=0:(H-h)/2[vout]"
        )
        cmd.extend(["-filter_complex", filter_complex, "-map", "[vout]", "-map", "0:a?"])
    elif ambient_blurred_bg:
        vf_chain = ",".join(vf_list) if vf_list else "null"
        filter_complex = (
            f"[0:v]{vf_chain}[v_processed];"
            f"[v_processed]split=2[fg_in][bg_in];"
            f"[bg_in]scale={w}:{h}:force_original_aspect_ratio=increase,crop={w}:{h},boxblur=30:15,eq=brightness=-0.12[bg_blur];"
            f"[fg_in]scale=trunc({int(w*0.84)}/2)*2:-2[fg_scaled];"
            f"[bg_blur][fg_scaled]overlay=(W-w)/2:(H-h)/2[vout]"
        )
        cmd.extend(["-filter_complex", filter_complex, "-map", "[vout]", "-map", "0:a?"])
    else:
        vf_str = ",".join(vf_list)
        cmd.extend(["-filter:v", vf_str])

    # 自动切除平台片尾
    if trim_end_secs and trim_end_secs > 0 and orig_dur > (trim_end_secs + 1.0):
        keep_duration = round(orig_dur - trim_end_secs, 2)
        cmd.extend(["-t", str(keep_duration)])

    # 音频处理与声学指纹深度打散
    if mute_audio:
        # 纯净静音出海模式 (彻底移除原声，发布时直接使用 TikTok Trending 官方音乐)
        cmd.extend(["-an"])
    elif info.get("has_audio", True):
        af_list = []
        if audio_scramble:
            # 变调微移 3.5% + 结合变速倍率精准补偿 + 3D 立体声拓宽 (绕过 Chromaprint / Shazam 声学指纹检索)
            speed_val = speed or 1.0
            tempo_comp = round(speed_val / 1.035, 4)
            af_list.append(f"asetrate=44100*1.035,atempo={tempo_comp}")
            af_list.append("extrastereo=m=1.25,aecho=0.8:0.88:12:0.18")
        elif speed and abs(speed - 1.0) > 0.005:
            af_list.append(f"atempo={speed}")
        if audio_volume and abs(audio_volume - 1.0) > 0.005:
            af_list.append(f"volume={audio_volume}")
        # 超声波暗水印切除
        if strip_blind_watermark:
            af_list.append("lowpass=f=17500")
        af_list.append("aresample=44100")
        cmd.extend(["-filter:a", ",".join(af_list)])
        cmd.extend(["-c:a", "aac", "-b:a", "192k"])
    else:
        cmd.extend(["-an"])

    # 彻底清除所有上游元数据 (关键：清除字节跳动/TikTok 植入的 comment: vid:v10044g... 视频全局唯一追踪指纹、vid_md5 与 aigc_info)
    cmd.extend([
        "-map_metadata", "-1",
        "-fflags", "+bitexact",
        "-flags:v", "+bitexact",
        "-flags:a", "+bitexact",
        "-brand", "mp42",
    ])

    # 元数据注入：伪装真实 Apple iPhone 15 Pro 纯净原生拍摄，抹除转码痕迹
    if fake_camera_exif:
        cmd.extend([
            "-metadata", "make=Apple",
            "-metadata", "model=iPhone 15 Pro",
            "-metadata", f"creation_time={time.strftime('%Y-%m-%dT%H:%M:%S.000000Z', time.gmtime(time.time() - 7200))}",
            "-metadata:s:v:0", "handler_name=Core Media Video",
            "-metadata:s:a:0", "handler_name=Core Media Audio",
        ])

    cmd.extend([
        "-c:v", "libx264",
        "-preset", "veryfast",
        "-crf", "20",
        "-pix_fmt", "yuv420p",
        "-movflags", "+faststart",
        output_path
    ])

    res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, errors="replace")
    if res.returncode != 0:
        raise RuntimeError(f"FFmpeg failed with code {res.returncode}: {res.stderr[-400:]}")

    elapsed = round(time.time() - start_time, 2)
    orig_size = round(os.path.getsize(input_path) / (1024 * 1024), 2)
    new_size = round(os.path.getsize(output_path) / (1024 * 1024), 2)
    new_info = probe_video_info(output_path)

    return {
        "success": True,
        "input_path": input_path,
        "output_path": output_path,
        "original_size_mb": orig_size,
        "new_size_mb": new_size,
        "original_duration_secs": orig_dur,
        "new_duration_secs": new_info.get("duration", 0.0),
        "resolution": f"{w}x{h}",
        "speed": speed,
        "zoom": zoom,
        "flip_h": flip_h,
        "color_tweak": color_tweak,
        "vignette": vignette,
        "noise": noise,
        "strip_blind_watermark": strip_blind_watermark,
        "trim_end_secs": trim_end_secs,
        "trim_start_secs": trim_start_secs,
        "delogo_mode": delogo_mode,
        "dynamic_pan_zoom": dynamic_pan_zoom,
        "dynamic_lighting": dynamic_lighting,
        "ambient_blurred_bg": ambient_blurred_bg,
        "split_canvas": split_canvas,
        "audio_scramble": audio_scramble,
        "mute_audio": mute_audio,
        "frame_jitter": frame_jitter,
        "curved_speed": curved_speed,
        "film_grain": film_grain,
        "micro_rotate": micro_rotate,
        "chromashift": chromashift,
        "unsharp": unsharp,
        "fake_camera_exif": fake_camera_exif,
        "duration_secs": elapsed,
    }

def run_batch_dedup_and_merge(
    input_paths,
    transition="random",
    transition_duration=0.8,
    target_resolution="auto",
    speed=1.02,
    zoom=1.02,
    flip_h=False,
    color_tweak=True,
    vignette=False,
    noise=False,
    audio_volume=1.0,
    strip_blind_watermark=True,
    trim_end_secs=0.0,
    trim_start_secs=0.0,
    delogo_mode="none",
    dynamic_pan_zoom=False,
    dynamic_lighting=False,
    ambient_blurred_bg=False,
    split_canvas=False,
    audio_scramble=False,
    mute_audio=False,
    frame_jitter=False,
    curved_speed=False,
    film_grain=False,
    micro_rotate=False,
    chromashift=False,
    unsharp=False,
    fake_camera_exif=True,
    output_path=None,
    output_dir=None
):
    valid_inputs = [p for p in input_paths if p and os.path.exists(p)]
    if not valid_inputs:
        raise FileNotFoundError("未提供有效的待处理视频文件路径")

    start_time = time.time()
    ffmpeg = get_ffmpeg_path()

    if not output_dir:
        output_dir = os.path.join(os.path.dirname(os.path.abspath(valid_inputs[0])), "cleaned_videos")
    os.makedirs(output_dir, exist_ok=True)

    # 1. 如果仅选择 1 个视频：直接执行单视频去重清洗
    if len(valid_inputs) == 1:
        single_res = run_video_remix(
            input_path=valid_inputs[0],
            speed=speed,
            zoom=zoom,
            flip_h=flip_h,
            color_tweak=color_tweak,
            vignette=vignette,
            noise=noise,
            audio_volume=audio_volume,
            strip_blind_watermark=strip_blind_watermark,
            trim_end_secs=trim_end_secs,
            trim_start_secs=trim_start_secs,
            delogo_mode=delogo_mode,
            dynamic_pan_zoom=dynamic_pan_zoom,
            dynamic_lighting=dynamic_lighting,
            ambient_blurred_bg=ambient_blurred_bg,
            split_canvas=split_canvas,
            audio_scramble=audio_scramble,
            mute_audio=mute_audio,
            frame_jitter=frame_jitter,
            curved_speed=curved_speed,
            film_grain=film_grain,
            micro_rotate=micro_rotate,
            chromashift=chromashift,
            unsharp=unsharp,
            fake_camera_exif=fake_camera_exif,
            output_path=output_path,
            output_dir=output_dir
        )
        return {
            "success": True,
            "output_path": single_res.get("output_path"),
            "clip_count": 1,
            "original_clips": valid_inputs,
            "original_total_duration": single_res.get("original_duration_secs", 0.0),
            "final_duration": single_res.get("new_duration_secs", 0.0),
            "final_size_mb": single_res.get("new_size_mb", 0.0),
            "resolution": single_res.get("resolution", "1080x1920"),
            "transitions": [],
            "duration_secs": round(time.time() - start_time, 2),
        }

    # 2. 多视频：先逐个执行高阶去重，存入中间临时暂存目录
    timestamp = int(time.time())
    tmp_dir = os.path.join(output_dir, f"_tmp_merge_{timestamp}_{os.getpid()}")
    os.makedirs(tmp_dir, exist_ok=True)

    deduped_clips = []
    original_total_dur = 0.0

    try:
        for idx, in_path in enumerate(valid_inputs):
            p_info = probe_video_info(in_path)
            original_total_dur += p_info.get("duration", 0.0)
            clip_target = os.path.join(tmp_dir, f"dedup_clip_{idx:03d}.mp4")

            run_video_remix(
                input_path=in_path,
                speed=speed,
                zoom=zoom,
                flip_h=flip_h,
                color_tweak=color_tweak,
                vignette=vignette,
                noise=noise,
                audio_volume=audio_volume,
                strip_blind_watermark=strip_blind_watermark,
                trim_end_secs=trim_end_secs,
                trim_start_secs=trim_start_secs,
                delogo_mode=delogo_mode,
                dynamic_pan_zoom=dynamic_pan_zoom,
                dynamic_lighting=dynamic_lighting,
                ambient_blurred_bg=ambient_blurred_bg,
                split_canvas=split_canvas,
                audio_scramble=audio_scramble,
                mute_audio=mute_audio,
                frame_jitter=frame_jitter,
                curved_speed=curved_speed,
                film_grain=film_grain,
                micro_rotate=micro_rotate,
                chromashift=chromashift,
                unsharp=unsharp,
                fake_camera_exif=fake_camera_exif,
                output_path=clip_target
            )
            if not os.path.isfile(clip_target) or os.path.getsize(clip_target) < 1024:
                raise RuntimeError(f"分段视频去重失败: {in_path}")
            deduped_clips.append(clip_target)

        # 3. 探测所有已去重视频片段的物理尺寸与时长
        clip_infos = []
        for c in deduped_clips:
            info = probe_video_info(c)
            clip_infos.append(info)

        # 确定目标统一分辨率
        target_res_str = (target_resolution or "auto").strip().lower()
        if target_res_str in ("1080x1920", "9:16", "vertical"):
            tw, th = 1080, 1920
        elif target_res_str in ("1920x1080", "16:9", "horizontal"):
            tw, th = 1920, 1080
        elif target_res_str in ("1080x1080", "1:1", "square"):
            tw, th = 1080, 1080
        elif "x" in target_res_str:
            parts = target_res_str.split("x")
            tw, th = int(parts[0]), int(parts[1])
        else:
            # 自动跟随第 1 段视频的宽高
            tw = clip_infos[0].get("width", 1080) or 1080
            th = clip_infos[0].get("height", 1920) or 1920

        tw = (tw // 2) * 2
        th = (th // 2) * 2

        # 4. 动态转场参数校验
        trans_d = float(transition_duration or 0.8)
        min_clip_dur = min(max(0.5, c.get("duration", 2.0)) for c in clip_infos)
        if trans_d >= min_clip_dur * 0.5:
            trans_d = max(0.2, round(min_clip_dur * 0.4, 2))

        # 5. 构建 FFmpeg 滤镜图
        cmd = [ffmpeg, "-y"]
        for c in deduped_clips:
            cmd.extend(["-i", c])

        filter_lines = []
        for i, c_info in enumerate(clip_infos):
            # 视频标准化：缩放垫黑边 + SAR 归一化 + 恒定 30fps + yuv420p
            filter_lines.append(
                f"[{i}:v]scale={tw}:{th}:force_original_aspect_ratio=decrease,pad={tw}:{th}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30,format=yuv420p[v_norm_{i}]"
            )
            # 音频标准化：如果静音或缺失音频，自适应补充静音频道，防止 acrossfade 崩溃
            has_a = c_info.get("has_audio", True) and not mute_audio
            dur = c_info.get("duration", 1.0)
            if has_a:
                filter_lines.append(
                    f"[{i}:a]aformat=sample_rates=44100:channel_layouts=stereo,aresample=44100[a_norm_{i}]"
                )
            elif not mute_audio:
                filter_lines.append(
                    f"anullsrc=r=44100:cl=stereo,atrim=0:{dur}[a_norm_{i}]"
                )

        # 6. 转场衔接链路
        transitions_used = []
        num_clips = len(clip_infos)
        trans_candidates = [
            "fade", "wipeleft", "wiperight", "slideleft", "slideright",
            "slideup", "slidedown", "smoothleft", "smoothright",
            "circlecrop", "dissolve", "pixelize", "hblur", "radial", "zoomin"
        ]

        if transition in ("none", "cut") or trans_d <= 0.05:
            # 无缝直切模式
            v_in_str = "".join(f"[v_norm_{i}]" for i in range(num_clips))
            if not mute_audio:
                a_in_str = "".join(f"[a_norm_{i}]" for i in range(num_clips))
                filter_lines.append(f"{v_in_str}{a_in_str}concat=n={num_clips}:v=1:a=1[vout][aout]")
            else:
                filter_lines.append(f"{v_in_str}concat=n={num_clips}:v=1:a=0[vout]")
        else:
            # 动态转场 (xfade + acrossfade)
            import random
            cur_v = "[v_norm_0]"
            cur_a = "[a_norm_0]"
            accum_dur = clip_infos[0].get("duration", 0.0)

            for i in range(1, num_clips):
                next_v = f"[v_norm_{i}]"
                next_a = f"[a_norm_{i}]"
                next_dur = clip_infos[i].get("duration", 0.0)

                offset = round(max(0.01, accum_dur - trans_d), 3)

                if transition == "random":
                    chosen_t = random.choice(trans_candidates)
                elif transition in trans_candidates:
                    chosen_t = transition
                else:
                    chosen_t = "fade"
                transitions_used.append(chosen_t)

                out_v = f"[v_trans_{i}]" if i < num_clips - 1 else "[vout]"
                filter_lines.append(
                    f"{cur_v}{next_v}xfade=transition={chosen_t}:duration={trans_d}:offset={offset}{out_v}"
                )
                cur_v = out_v

                if not mute_audio:
                    out_a = f"[a_trans_{i}]" if i < num_clips - 1 else "[aout]"
                    filter_lines.append(
                        f"{cur_a}{next_a}acrossfade=d={trans_d}:c1=tri:c2=tri{out_a}"
                    )
                    cur_a = out_a

                accum_dur = accum_dur + next_dur - trans_d

        if not output_path:
            output_path = os.path.join(output_dir, f"merged_remix_{num_clips}clips_{timestamp}.mp4")
        output_path = os.path.abspath(output_path)

        filter_complex_str = ";\n".join(filter_lines)
        cmd.extend(["-filter_complex", filter_complex_str, "-map", "[vout]"])

        if not mute_audio:
            cmd.extend(["-map", "[aout]", "-c:a", "aac", "-b:a", "192k"])
        else:
            cmd.extend(["-an"])

        cmd.extend([
            "-c:v", "libx264",
            "-crf", "20",
            "-preset", "veryfast",
            "-pix_fmt", "yuv420p",
            "-map_metadata", "-1",
            "-fflags", "+bitexact",
            "-flags:v", "+bitexact",
            "-flags:a", "+bitexact",
            "-brand", "mp42",
        ])

        if fake_camera_exif:
            cmd.extend([
                "-metadata", "make=Apple",
                "-metadata", "model=iPhone 15 Pro",
                "-metadata", f"creation_time={time.strftime('%Y-%m-%dT%H:%M:%S.000000Z', time.gmtime(time.time() - 7200))}",
                "-metadata:s:v:0", "handler_name=Core Media Video",
                "-metadata:s:a:0", "handler_name=Core Media Audio",
            ])

        cmd.extend(["-movflags", "+faststart", output_path])

        res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, errors="replace")
        if res.returncode != 0:
            raise RuntimeError(f"FFmpeg 转场合并渲染失败 (code {res.returncode}): {res.stderr[-500:]}")

        final_info = probe_video_info(output_path)
        final_size_mb = round(os.path.getsize(output_path) / (1024 * 1024), 2)
        elapsed = round(time.time() - start_time, 2)

        return {
            "success": True,
            "output_path": output_path,
            "clip_count": num_clips,
            "original_clips": valid_inputs,
            "original_total_duration": round(original_total_dur, 2),
            "final_duration": round(final_info.get("duration", 0.0), 2),
            "final_size_mb": final_size_mb,
            "resolution": f"{tw}x{th}",
            "transitions": transitions_used,
            "duration_secs": elapsed,
        }
    finally:
        # 清理临时中间分段
        import shutil
        try:
            if os.path.isdir(tmp_dir):
                shutil.rmtree(tmp_dir, ignore_errors=True)
        except Exception:
            pass

def find_system_browser():
    candidates = [
        r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
        r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
        r"C:\Program Files\Google\Chrome\Application\chrome.exe",
        r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
        os.path.expandvars(r"%LOCALAPPDATA%\Microsoft\Edge\Application\msedge.exe"),
        os.path.expandvars(r"%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"),
    ]
    for c in candidates:
        if os.path.isfile(c):
            return c
    return None

def extract_media_via_browser(target_url, platform="general"):
    browser_exe = find_system_browser()
    if not browser_exe:
        return None, None
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        return None, None

    vod_urls = []
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(executable_path=browser_exe, headless=True)
            page = browser.new_page(
                user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
            )

            def on_res(r):
                u = r.url
                # 过滤静态占位与图标
                if "uuu_265" in u or "douyinstatic" in u or ".png" in u or ".jpg" in u:
                    return
                # 抖音流
                if "douyinvod.com" in u or ("/video/tos/" in u and "byteimg" not in u):
                    vod_urls.append(u)
                # 快手流
                elif "yximgs.com" in u or "kwcdn.com" in u or ("kuaishou.com" in u and ".mp4" in u):
                    vod_urls.append(u)
                # 小红书流
                elif "xhscdn.com" in u or "sns-video" in u:
                    vod_urls.append(u)
                # 通用 mp4/m3u8 流
                elif ".mp4" in u and ("video" in u or "media" in u or "cdn" in u):
                    vod_urls.append(u)

            page.on("response", on_res)
            try:
                page.goto(target_url, wait_until="domcontentloaded", timeout=18000)
                time.sleep(4.5)
            except Exception:
                pass
            finally:
                try:
                    browser.close()
                except Exception:
                    pass
    except Exception:
        pass

    video_url = None
    audio_url = None
    for u in vod_urls:
        if "tos-cn-vd" in u and not video_url:
            video_url = u
        elif "tos-cn-ve" in u and not audio_url:
            audio_url = u

    if not video_url and vod_urls:
        video_url = vod_urls[0]

    return video_url, audio_url

# =========================================================================
# 2.5 Multi-Platform No-Watermark Video Link Resolver & Downloader
# =========================================================================
def parse_and_download_no_watermark(share_text, output_dir=None):
    if not share_text or not share_text.strip():
        raise ValueError("输入文案或链接为空")

    url_match = re.search(r'https?://[a-zA-Z0-9\-\.]+(?::\d+)?/[^\s]+', share_text.strip())
    if not url_match:
        raise ValueError("未在输入内容中匹配到有效的 HTTP/HTTPS 视频分享链接")
    raw_url = url_match.group(0).rstrip('。，；,;!！?？')

    if not output_dir:
        output_dir = os.path.join(os.getcwd(), "duck_data", "no_watermark_downloads")
    os.makedirs(output_dir, exist_ok=True)

    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Referer": "https://www.douyin.com/",
        "Accept": "*/*",
    }

    import urllib.request
    import urllib.parse
    import ssl

    ssl_ctx = ssl.create_default_context()
    ssl_ctx.check_hostname = False
    ssl_ctx.verify_mode = ssl.CERT_NONE

    title = "短视频素材"
    author = "平台创作者"
    video_url = None
    audio_url = None
    platform = "general"

    # 从文案中清洗出视频标题
    clean_text = re.sub(r'https?://[^\s]+', '', share_text)
    clean_text = re.sub(r'^[0-9\.\s:@/a-zA-Z]+:/?\s*', '', clean_text)
    clean_text = re.sub(r'复制此链接.*', '', clean_text).strip()
    if clean_text:
        title = clean_text[:30]

    # 支持直接输入 .mp4 / .mov / .webm 视频直链
    if re.search(r'\.(mp4|mov|mkv|webm|m4v)(\?.*)?$', raw_url, re.IGNORECASE):
        video_url = raw_url
        title = os.path.splitext(os.path.basename(urllib.parse.urlparse(raw_url).path))[0] or title

    if "youtube.com" in raw_url or "youtu.be" in raw_url:
        platform = "youtube"
    elif "bilibili.com" in raw_url or "b23.tv" in raw_url:
        platform = "bilibili"
    elif "twitter.com" in raw_url or "x.com" in raw_url:
        platform = "twitter"
    elif "instagram.com" in raw_url:
        platform = "instagram"
    elif "tiktok.com" in raw_url or "tikwm.com" in raw_url:
        platform = "tiktok"
    elif "douyin.com" in raw_url or "iesdouyin.com" in raw_url:
        platform = "douyin"
    elif "kuaishou.com" in raw_url:
        platform = "kuaishou"
    elif "xiaohongshu.com" in raw_url or "xhslink.com" in raw_url:
        platform = "xiaohongshu"

    # =====================================================================
    # A. 针对 YouTube, Bilibili, Twitter, Instagram 等国际/主流平台：直接调用 yt-dlp 原生提取
    # =====================================================================
    if platform in ("youtube", "bilibili", "twitter", "instagram"):
        try:
            import subprocess
            cmd_meta = ["yt-dlp", "--no-warnings", "-j", raw_url]
            res_meta = subprocess.run(cmd_meta, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=15)
            if res_meta.returncode == 0 and res_meta.stdout.strip():
                m_data = json.loads(res_meta.stdout.strip())
                if m_data.get("title"):
                    title = m_data.get("title")
                if m_data.get("uploader") or m_data.get("channel"):
                    author = m_data.get("uploader") or m_data.get("channel")
        except Exception:
            pass

        clean_title = re.sub(r'[\/:*?"<>|\r\n\t]+', '_', title)[:30].strip() or "video"
        timestamp = int(time.time())
        dest_path = os.path.abspath(os.path.join(output_dir, f"{platform}_{clean_title}_{timestamp}.mp4"))

        import subprocess
        cmd_dl = [
            "yt-dlp",
            "--no-warnings",
            "-f", "bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]/bv*+ba/b",
            "--merge-output-format", "mp4",
            "-o", dest_path,
            raw_url
        ]
        res_dl = subprocess.run(cmd_dl, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=180)
        if res_dl.returncode == 0 and os.path.isfile(dest_path) and os.path.getsize(dest_path) > 1024:
            file_size_mb = round(os.path.getsize(dest_path) / (1024.0 * 1024.0), 2)
            return {
                "success": True,
                "platform": platform,
                "title": title,
                "author": author,
                "video_url": raw_url,
                "local_path": dest_path,
                "file_name": os.path.basename(dest_path),
                "size_mb": file_size_mb,
            }
        else:
            raise RuntimeError(f"yt-dlp 下载 {platform} 视频失败: {res_dl.stderr[-300:]}")

    # =====================================================================
    # B. 针对 TikTok: 优先 TikWM 免水印解析，失败则兜底无头嗅探 / yt-dlp
    # =====================================================================
    normalized_url = re.sub(r'/\d+/?$', '/', raw_url)

    if not video_url and platform == "tiktok":
        for try_url in [raw_url, normalized_url]:
            try:
                tikwm_url = f"https://www.tikwm.com/api/?url={urllib.parse.quote(try_url)}"
                req = urllib.request.Request(tikwm_url, headers=headers)
                with urllib.request.urlopen(req, timeout=8, context=ssl_ctx) as resp:
                    data = json.loads(resp.read().decode("utf-8"))
                    if data.get("code") == 0 and data.get("data"):
                        d = data["data"]
                        video_url = d.get("play") or d.get("wmplay")
                        if d.get("title"):
                            title = d.get("title")
                        if d.get("author", {}).get("nickname"):
                            author = d["author"]["nickname"]
                        if video_url:
                            break
            except Exception:
                pass

    # =====================================================================
    # C. 针对抖音、快手、小红书等国内短视频平台：原生无头浏览器嗅探真实高质流
    # =====================================================================
    douyin_expired = False
    douyin_captcha = False

    if not video_url and platform in ("douyin", "kuaishou", "xiaohongshu"):
        v_stream, a_stream = extract_media_via_browser(raw_url, platform=platform)
        if v_stream:
            video_url = v_stream
            audio_url = a_stream

    # 4. yt-dlp 工业级兜底解析器
    if not video_url:
        try:
            import subprocess
            cmd_ytdl = ["yt-dlp", "--no-warnings", "-j", raw_url]
            res_ytdl = subprocess.run(cmd_ytdl, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=15)
            if res_ytdl.returncode == 0 and res_ytdl.stdout.strip():
                ytdl_data = json.loads(res_ytdl.stdout.strip())
                video_url = ytdl_data.get("url")
                if ytdl_data.get("title"):
                    title = ytdl_data.get("title")
                if ytdl_data.get("uploader"):
                    author = ytdl_data.get("uploader")
        except Exception:
            pass

    if not video_url:
        if douyin_captcha:
            raise RuntimeError(f"该视频短链触发了抖音官方安全风控（滑块验证码拦截）。请在电脑浏览器中打开该视频，复制地址栏的完整长链接（包含 video/数字编号）粘贴尝试。")
        if douyin_expired:
            raise RuntimeError(f"该分享短链未解析到视频或原视频已被作者删除/设为私密 (重定向至抖音首页): {raw_url}")
        raise RuntimeError(f"未能成功提取该链接的无水印视频流，请检查链接是否有效、原视频是否公开或网络是否正常: {raw_url}")

    # 清洗标题作为文件名
    clean_title = re.sub(r'[\/:*?"<>|\r\n\t]+', '_', title)[:30].strip() or "video"
    timestamp = int(time.time())
    dest_path = os.path.abspath(os.path.join(output_dir, f"{platform}_{clean_title}_{timestamp}.mp4"))

    # 如果抓取到了分离的视频流和音频流（Douyin DASH 格式），分别下载后无损混流为完整 MP4
    if audio_url:
        tmp_v = os.path.abspath(os.path.join(output_dir, f"_tmp_v_{timestamp}.mp4"))
        tmp_a = os.path.abspath(os.path.join(output_dir, f"_tmp_a_{timestamp}.mp4"))

        # 下载视轨
        req_v = urllib.request.Request(video_url, headers=headers)
        with urllib.request.urlopen(req_v, timeout=30, context=ssl_ctx) as resp_v, open(tmp_v, "wb") as f_v:
            while True:
                chunk = resp_v.read(1024 * 64)
                if not chunk:
                    break
                f_v.write(chunk)

        # 下载音轨
        req_a = urllib.request.Request(audio_url, headers=headers)
        with urllib.request.urlopen(req_a, timeout=30, context=ssl_ctx) as resp_a, open(tmp_a, "wb") as f_a:
            while True:
                chunk = resp_a.read(1024 * 64)
                if not chunk:
                    break
                f_a.write(chunk)

        # FFmpeg 无损毫秒混流
        import subprocess
        cmd_mux = [
            "ffmpeg", "-y",
            "-i", tmp_v,
            "-i", tmp_a,
            "-c", "copy",
            "-movflags", "+faststart",
            dest_path
        ]
        res_mux = subprocess.run(cmd_mux, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        # 清理临时切片
        try:
            if os.path.isfile(tmp_v):
                os.remove(tmp_v)
            if os.path.isfile(tmp_a):
                os.remove(tmp_a)
        except Exception:
            pass

        if res_mux.returncode != 0 or not os.path.isfile(dest_path):
            raise RuntimeError(f"音视频流无损混流失败: {res_mux.stderr.decode('utf-8', errors='ignore')[-300:]}")
    else:
        # 单流直接下载
        req_dl = urllib.request.Request(video_url, headers=headers)
        with urllib.request.urlopen(req_dl, timeout=30, context=ssl_ctx) as resp_dl, open(dest_path, "wb") as f_out:
            while True:
                chunk = resp_dl.read(1024 * 64)
                if not chunk:
                    break
                f_out.write(chunk)

    file_size_mb = round(os.path.getsize(dest_path) / (1024.0 * 1024.0), 2)

    return {
        "success": True,
        "platform": platform,
        "title": title,
        "author": author,
        "video_url": video_url,
        "local_path": dest_path,
        "file_name": os.path.basename(dest_path),
        "size_mb": file_size_mb,
    }

# =========================================================================
# 3. LLM Copywriting Generator (OpenAI-compatible)
# =========================================================================
def extract_message_text(msg):
    if not msg:
        return ""
    content = getattr(msg, "content", None)
    if not content and hasattr(msg, "reasoning_content"):
        content = getattr(msg, "reasoning_content", None)
    if not content and hasattr(msg, "model_extra") and msg.model_extra:
        content = msg.model_extra.get("reasoning_content") or msg.model_extra.get("content")
    if content is None:
        return ""
    return str(content).strip()

def run_llm_copywriting(platform, topic, api_key=None, base_url=None, model=None):
    platform = (platform or "douyin").lower()
    topic = (topic or "").strip()

    # Platform rules constraints
    limits = {
        "xiaohongshu": {"title_limit": 20, "style": "小红书种草风：多用emoji表情、感叹号、口语化种草，标题不超过20个字"},
        "douyin": {"title_limit": 30, "style": "抖音短视频爆款风：悬念反转、好奇心钩子，标题不超过30个字"},
        "kuaishou": {"title_limit": 30, "style": "快手老铁风：真实接地气、生活化、情感共鸣，标题不超过30个字"},
        "tiktok": {"title_limit": 60, "style": "TikTok 国际化短视频：英语或中英双语、Catchy Hook、Call-to-Action，标题精炼"},
        "bilibili": {"title_limit": 80, "style": "B站UP主投稿风：有梗有料、知识性/趣味性，包含推荐分区建议，标题不超过80字"},
        "weixin": {"title_limit": 16, "style": "微信视频号风：正能量、实用价值、严禁特殊符号，短标题严格控制在6-16个字"},
        "weibo": {"title_limit": 30, "style": "微博超话风格：热搜体、提问互动，标题不超过30字"},
        "toutiao": {"title_limit": 30, "style": "今日头条/西瓜风格：新闻感、干货盘点，标题不超过30字"},
        "baijiahao": {"title_limit": 40, "style": "百家号图文视频：深度看点、条理清晰，标题不超过40字"},
    }
    cfg = limits.get(platform, limits["douyin"])

    # If API key is provided, query the OpenAI-compatible endpoint
    if api_key and (api_key or "").strip():
        from openai import OpenAI
        clean_url = (base_url or "").strip().rstrip('/') if (base_url or "").strip() else "https://api.openai.com/v1"
        key_str = (api_key or "").strip()
        model_name = (model or "").strip() if (model or "").strip() else "gpt-4o-mini"

        system_prompt = (
            f"你是一名拥有千万粉丝的自媒体矩阵运营操盘手。针对【{platform}】平台生成专属爆款发布素材。\n"
            f"风格与限制要求：{cfg['style']}。\n"
            f"严格以如下 JSON 格式输出，不要输出任何非 JSON 的 markdown 解释：\n"
            f'{{"title": "符合字数限制的爆款标题", "summary": "吸引人的正文描述", "tags": ["标签1", "标签2", "标签3", "标签4"]}}'
        )

        user_content = f"视频主题/文案核心意图：{topic}"

        def call_openai(url, use_json_format=True):
            client = OpenAI(api_key=key_str, base_url=url)
            kwargs = {
                "model": model_name,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_content}
                ],
                "temperature": 0.7,
            }
            if use_json_format:
                kwargs["response_format"] = {"type": "json_object"}
            return client.chat.completions.create(**kwargs)

        try:
            resp = call_openai(clean_url, use_json_format=True)
        except Exception as e:
            if ("404" in str(e) or "Not Found" in str(e)) and not clean_url.endswith("/v1"):
                clean_url = f"{clean_url}/v1"
            try:
                resp = call_openai(clean_url, use_json_format=True)
            except Exception:
                # Retry without response_format for custom/third-party providers like LongCat/OneAPI
                resp = call_openai(clean_url, use_json_format=False)

        msg = resp.choices[0].message if resp.choices else None
        raw_res = extract_message_text(msg)

        # Clean markdown code blocks if returned
        if "```" in raw_res:
            m = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", raw_res)
            if m:
                raw_res = m.group(1).strip()

        try:
            data = json.loads(raw_res)
        except Exception:
            # Fallback if raw text returned
            lines = [l.strip() for l in raw_res.split('\n') if l.strip()]
            data = {
                "title": lines[0][:cfg["title_limit"]] if lines else topic[:cfg["title_limit"]],
                "summary": "\n".join(lines[1:]) if len(lines) > 1 else raw_res,
                "tags": ["生活记录", "爆款推荐", "涨知识"]
            }

        # Ensure title limit
        if len(data.get("title", "")) > cfg["title_limit"]:
            data["title"] = data["title"][:cfg["title_limit"]]
        return {
            "success": True,
            "platform": platform,
            "title": data.get("title", ""),
            "summary": data.get("summary", ""),
            "tags": data.get("tags", []),
            "source": f"llm ({model_name})"
        }

    # Offline high-converting fallback generator if no API key is set
    t_clean = topic if topic else "精选优质作品分享"
    if platform == "xiaohongshu":
        title = f"绝了家人们！{t_clean}"[:20]
        summary = f"✨ 亲测有效！今天一定要给大家安利这个：\n\n📌 {t_clean}\n\n真的太好用了，建议姐妹们赶紧收藏起来，以备不时之需！你们平时都是怎么做的呢？欢迎在评论区交流讨论~ 💬"
        tags = ["干货分享", "实用技能", "生活小妙招", "宝藏发现"]
    elif platform == "tiktok":
        title = f"You won't believe this! {t_clean}"[:60]
        summary = f"Watch till the end! 😱\n\n{t_clean}\n\nLike and follow for more daily updates! 🔥 #fyp"
        tags = ["fyp", "viral", "trending", "tiktokmademebuyit", "explore"]
    elif platform == "weixin":
        # Video Channels short title: 6-16 chars, no special symbols
        raw_t = re.sub(r"[#@_\-\s\.\,\!\?，。！？]", "", t_clean)
        title = raw_t[:16] if len(raw_t) >= 6 else (raw_t + "实用技巧盘点")[:16]
        summary = f"{t_clean}\n\n建议转发给身边有需要的朋友，实用干货常备无患。"
        tags = ["生活实用技巧", "生活日常", "精选分享"]
    elif platform == "bilibili":
        title = f"【硬核干货】带你深度解析：{t_clean}"[:80]
        summary = f"大家期待已久的深度解析终于来啦！\n本期视频全面拆解：{t_clean}。\n觉得有帮助的小伙伴记得一键三连（点赞+投币+收藏）支持一下UP主哦！"
        tags = ["知识分享", "日常记录", "生活", "科普", "教程"]
    else: # Douyin / Kuaishou / Toutiao
        title = f"建议收藏！{t_clean}到底有多牛？"[:30]
        summary = f"很多人还不知道这个隐藏技巧：{t_clean}。\n花30秒看完，能帮你省下不少时间和精力！赶紧点赞转发给朋友看看吧！"
        tags = ["热点", "涨知识", "生活技巧", "干货", "分享"]

    return {
        "success": True,
        "platform": platform,
        "title": title,
        "summary": summary,
        "tags": tags,
        "source": "offline_template"
    }

def run_test_llm(api_key, base_url=None, model=None):
    from openai import OpenAI
    clean_url = (base_url or "").strip().rstrip('/') if (base_url or "").strip() else "https://api.openai.com/v1"
    model_name = (model or "").strip() if (model or "").strip() else "gpt-4o-mini"
    key_str = (api_key or "").strip()

    def try_call(url):
        client = OpenAI(api_key=key_str, base_url=url)
        resp = client.chat.completions.create(
            model=model_name,
            messages=[{"role": "user", "content": "请只回复两个字：收到"}],
            max_tokens=200
        )
        msg = resp.choices[0].message if resp.choices else None
        return extract_message_text(msg)

    try:
        ans = try_call(clean_url)
    except Exception as e:
        # If 404/Not Found and url doesn't end with /v1, try appending /v1
        if ("404" in str(e) or "Not Found" in str(e)) and not clean_url.endswith("/v1"):
            clean_url_v1 = f"{clean_url}/v1"
            ans = try_call(clean_url_v1)
        else:
            raise e

    if not ans:
        ans = "收到 (模型响应正常)"

    return {"success": True, "model": model_name, "reply": ans}

# =========================================================================
# 2.8 Author/Creator Posts Sniffer & Crawler
# =========================================================================
def _format_ytdlp_entry(e, author_name):
    if not isinstance(e, dict):
        return None
    url = e.get("url") or e.get("webpage_url")
    if not url:
        if e.get("id"):
            url = f"https://www.youtube.com/watch?v={e['id']}"
        else:
            return None
    title = e.get("title") or "短视频作品"
    cover = None
    thumbs = e.get("thumbnails")
    if thumbs and isinstance(thumbs, list):
        cover = thumbs[-1].get("url")
    elif e.get("thumbnail"):
        cover = e.get("thumbnail")

    view_count = e.get("view_count")
    views_str = f"{view_count:,} 次播放" if view_count else ""

    dur = e.get("duration") or 0.0
    raw_date = str(e.get("upload_date") or "").strip()
    pub_date = ""
    if e.get("timestamp"):
        try:
            pub_date = time.strftime("%Y-%m-%d %H:%M", time.localtime(e.get("timestamp")))
        except Exception:
            pub_date = ""
    if not pub_date and len(raw_date) == 8 and raw_date.isdigit():
        pub_date = f"{raw_date[0:4]}-{raw_date[4:6]}-{raw_date[6:8]}"
    elif not pub_date:
        pub_date = raw_date

    return {
        "id": f"post_{e.get('id', int(time.time()))}",
        "title": title,
        "url": url,
        "cover_url": cover,
        "author": e.get("uploader") or author_name,
        "publish_time": pub_date,
        "like_count": views_str,
        "duration_secs": float(dur),
        "video_stream_url": None
    }

def fetch_author_posts(author_url, platform="douyin", count=20):
    posts = []
    author_name = "对标博主"
    avatar_url = None

    if not author_url or not str(author_url).strip():
        return {
            "success": True,
            "platform": platform,
            "author_name": author_name,
            "avatar_url": None,
            "posts": [],
            "count": 0,
            "note": "博主链接为空"
        }

    clean_url = str(author_url).strip()
    m = re.search(r'https?://[^\s]+', clean_url)
    if m:
        clean_url = m.group(0).rstrip('。，；,;!！?？')
    elif platform == "douyin":
        clean_url = f"https://www.douyin.com/search/{urllib.parse.quote(clean_url)}"
    elif platform == "tiktok":
        clean_url = f"https://www.tiktok.com/@{clean_url.lstrip('@')}"
    elif platform == "bilibili":
        clean_url = f"https://space.bilibili.com/{clean_url}"
    elif platform == "youtube":
        clean_url = f"https://www.youtube.com/@{clean_url.lstrip('@')}"

    # 跟随短链重定向获取真实主页长链 (如 v.douyin.com, vt.tiktok.com, b23.tv)
    if any(k in clean_url for k in ["v.douyin.com", "vt.tiktok.com", "b23.tv", "xhslink.com"]):
        try:
            req = urllib.request.Request(clean_url, headers={
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
            })
            with urllib.request.urlopen(req, timeout=5) as resp:
                clean_url = resp.geturl()
        except Exception:
            pass

    # 1. 尝试 yt-dlp 嗅探（适用于 YouTube, Bilibili, TikTok 等国际与主流视频站）
    try:
        cmd = ["yt-dlp", "--no-warnings", "--dump-single-json", "--flat-playlist", "--playlist-end", str(count), clean_url]
        res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=20)
        if res.returncode == 0 and res.stdout.strip():
            data = json.loads(res.stdout.strip())
            author_name = data.get("uploader") or data.get("channel") or data.get("title") or author_name
            thumbnails = data.get("thumbnails", [])
            for t in thumbnails:
                if "avatar" in t.get("id", "") or t.get("preference", 0) > 0:
                    avatar_url = t.get("url")
                    break
            entries = data.get("entries", [])
            for e in entries:
                if not e:
                    continue
                if e.get("_type") == "playlist" and e.get("entries"):
                    for se in e.get("entries"):
                        p_item = _format_ytdlp_entry(se, author_name)
                        if p_item:
                            posts.append(p_item)
                else:
                    p_item = _format_ytdlp_entry(e, author_name)
                    if p_item:
                        posts.append(p_item)
    except Exception:
        pass

    # 2. 如果是抖音平台，或者 yt-dlp 抓取为空：
    # 尝试使用 Playwright 无头嗅探抓取 DOM / 网络请求中的作品卡片
    if not posts and ("douyin.com" in clean_url or platform == "douyin"):
        browser_exe = find_system_browser()
        if browser_exe:
            try:
                from playwright.sync_api import sync_playwright
                with sync_playwright() as p:
                    browser = p.chromium.launch(executable_path=browser_exe, headless=True)
                    page = browser.new_page(
                        user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
                    )
                    api_posts = []
                    def on_res(r):
                        if "/aweme/v1/web/aweme/post/" in r.url:
                            try:
                                json_body = r.json()
                                aweme_list = json_body.get("aweme_list", [])
                                for item in aweme_list:
                                    vid_id = item.get("aweme_id")
                                    desc = item.get("desc") or "无标题视频"
                                    cover = item.get("video", {}).get("cover", {}).get("url_list", [None])[0]
                                    play_addr = item.get("video", {}).get("play_addr", {}).get("url_list", [None])[0]
                                    author_nick = item.get("author", {}).get("nickname")
                                    dur = item.get("video", {}).get("duration", 0) / 1000.0
                                    likes = item.get("statistics", {}).get("digg_count", 0)
                                    create_t = item.get("create_time")
                                    api_posts.append({
                                        "id": f"douyin_{vid_id}",
                                        "title": desc,
                                        "url": f"https://www.douyin.com/video/{vid_id}",
                                        "cover_url": cover,
                                        "author": author_nick or author_name,
                                        "publish_time": time.strftime("%Y-%m-%d %H:%M", time.localtime(create_t)) if create_t else "",
                                        "like_count": f"{likes} 赞" if likes else "爆款热度",
                                        "duration_secs": round(dur, 1),
                                        "video_stream_url": play_addr
                                    })
                            except Exception:
                                pass
                    page.on("response", on_res)
                    try:
                        page.goto(clean_url, wait_until="domcontentloaded", timeout=12000)
                        time.sleep(3.5)
                        if api_posts:
                            posts.extend(api_posts[:count])
                        else:
                            card_elements = page.query_selector_all("li.E3hk8HEB, a[href*='/video/'], [data-e2e='user-post-list'] li")
                            for card in card_elements[:count]:
                                href = card.get_attribute("href") or (card.query_selector("a") and card.query_selector("a").get_attribute("href"))
                                img = card.query_selector("img")
                                img_src = img.get_attribute("src") if img else None
                                title_text = card.inner_text().strip() if card else ""
                                if href and "/video/" in href:
                                    if not href.startswith("http"):
                                        href = "https://www.douyin.com" + href
                                    vid_id = href.split("/video/")[-1].split("?")[0]
                                    posts.append({
                                        "id": f"douyin_{vid_id}",
                                        "title": title_text[:40] or f"视频作品 {vid_id}",
                                        "url": href,
                                        "cover_url": img_src,
                                        "author": author_name,
                                        "publish_time": "近期发布",
                                        "like_count": "热度作品",
                                        "duration_secs": 0.0,
                                        "video_stream_url": None
                                    })
                    except Exception:
                        pass
                    finally:
                        try:
                            browser.close()
                        except Exception:
                            pass
            except Exception:
                pass

    return {
        "success": True,
        "platform": platform,
        "author_name": author_name,
        "avatar_url": avatar_url,
        "posts": posts,
        "count": len(posts)
    }

# =========================================================================
# CLI Entrypoint
# =========================================================================
def main():
    parser = argparse.ArgumentParser(description="NarciPH Media & AI Suite")
    subparsers = parser.add_subparsers(dest="action", required=True)

    # Edge TTS
    p_tts = subparsers.add_parser("tts")
    p_tts.add_argument("--text", required=True)
    p_tts.add_argument("--voice", default="zh-CN-YunxiNeural")
    p_tts.add_argument("--rate", default="+0%")
    p_tts.add_argument("--pitch", default="+0Hz")
    p_tts.add_argument("--outdir", default="")

    # Video Remix & Deduplication
    p_remix = subparsers.add_parser("remix")
    p_remix.add_argument("--input", required=True)
    p_remix.add_argument("--speed", type=float, default=1.03)
    p_remix.add_argument("--zoom", type=float, default=1.02)
    p_remix.add_argument("--flip-h", action="store_true", default=False)
    p_remix.add_argument("--no-color-tweak", action="store_true", default=False)
    p_remix.add_argument("--vignette", action="store_true", default=False)
    p_remix.add_argument("--noise", action="store_true", default=False)
    p_remix.add_argument("--audio-volume", type=float, default=1.02)
    p_remix.add_argument("--no-strip-blind-watermark", action="store_true", default=False)
    p_remix.add_argument("--trim-end-secs", type=float, default=0.0)
    p_remix.add_argument("--trim-start-secs", type=float, default=0.0)
    p_remix.add_argument("--delogo-mode", default="none")
    p_remix.add_argument("--dynamic-pan-zoom", action="store_true", default=False)
    p_remix.add_argument("--dynamic-lighting", action="store_true", default=False)
    p_remix.add_argument("--ambient-blurred-bg", action="store_true", default=False)
    p_remix.add_argument("--split-canvas", action="store_true", default=False)
    p_remix.add_argument("--micro-rotate", action="store_true", default=False)
    p_remix.add_argument("--chromashift", action="store_true", default=False)
    p_remix.add_argument("--unsharp", action="store_true", default=False)
    p_remix.add_argument("--audio-scramble", action="store_true", default=False)
    p_remix.add_argument("--mute-audio", action="store_true", default=False)
    p_remix.add_argument("--frame-jitter", action="store_true", default=False)
    p_remix.add_argument("--curved-speed", action="store_true", default=False)
    p_remix.add_argument("--film-grain", action="store_true", default=False)
    p_remix.add_argument("--no-fake-camera-exif", action="store_true", default=False)
    p_remix.add_argument("--output", default=None)
    p_remix.add_argument("--outdir", default=None)

    # Video Batch Dedup & Transition Merge
    p_merge = subparsers.add_parser("dedup-merge")
    p_merge.add_argument("--inputs", nargs="*", default=[])
    p_merge.add_argument("--inputs-json", default=None)
    p_merge.add_argument("--transition", default="random")
    p_merge.add_argument("--transition-duration", type=float, default=0.8)
    p_merge.add_argument("--target-resolution", default="auto")
    p_merge.add_argument("--speed", type=float, default=1.03)
    p_merge.add_argument("--zoom", type=float, default=1.02)
    p_merge.add_argument("--flip-h", action="store_true", default=False)
    p_merge.add_argument("--no-color-tweak", action="store_true", default=False)
    p_merge.add_argument("--vignette", action="store_true", default=False)
    p_merge.add_argument("--noise", action="store_true", default=False)
    p_merge.add_argument("--audio-volume", type=float, default=1.02)
    p_merge.add_argument("--no-strip-blind-watermark", action="store_true", default=False)
    p_merge.add_argument("--trim-end-secs", type=float, default=0.0)
    p_merge.add_argument("--trim-start-secs", type=float, default=0.0)
    p_merge.add_argument("--delogo-mode", default="none")
    p_merge.add_argument("--dynamic-pan-zoom", action="store_true", default=False)
    p_merge.add_argument("--dynamic-lighting", action="store_true", default=False)
    p_merge.add_argument("--ambient-blurred-bg", action="store_true", default=False)
    p_merge.add_argument("--split-canvas", action="store_true", default=False)
    p_merge.add_argument("--micro-rotate", action="store_true", default=False)
    p_merge.add_argument("--chromashift", action="store_true", default=False)
    p_merge.add_argument("--unsharp", action="store_true", default=False)
    p_merge.add_argument("--audio-scramble", action="store_true", default=False)
    p_merge.add_argument("--mute-audio", action="store_true", default=False)
    p_merge.add_argument("--frame-jitter", action="store_true", default=False)
    p_merge.add_argument("--curved-speed", action="store_true", default=False)
    p_merge.add_argument("--film-grain", action="store_true", default=False)
    p_merge.add_argument("--no-fake-camera-exif", action="store_true", default=False)
    p_merge.add_argument("--output", default=None)
    p_merge.add_argument("--outdir", default=None)

    # Multi-platform No-watermark Resolver & Downloader
    p_nowm = subparsers.add_parser("parse-download")
    p_nowm.add_argument("--text", required=True)
    p_nowm.add_argument("--outdir", default=None)

    # Multi-platform Author/Blogger Posts Sniffer & Crawler
    p_author = subparsers.add_parser("fetch-author-posts")
    p_author.add_argument("--url", required=True)
    p_author.add_argument("--platform", default="douyin")
    p_author.add_argument("--count", type=int, default=20)

    # LLM Copywriting
    p_llm = subparsers.add_parser("llm")
    p_llm.add_argument("--platform", default="douyin")
    p_llm.add_argument("--topic", required=True)
    p_llm.add_argument("--api-key", default=None)
    p_llm.add_argument("--base-url", default=None)
    p_llm.add_argument("--model", default=None)

    # Test LLM Connection
    p_test = subparsers.add_parser("test-llm")
    p_test.add_argument("--api-key", required=True)
    p_test.add_argument("--base-url", default=None)
    p_test.add_argument("--model", default=None)

    args = parser.parse_args()

    try:
        if args.action == "tts":
            res = asyncio.run(run_edge_tts(args.text, args.voice, args.rate, args.pitch, args.outdir))
            print(json.dumps(res, ensure_ascii=False))
        elif args.action == "remix":
            res = run_video_remix(
                input_path=args.input,
                speed=args.speed,
                zoom=args.zoom,
                flip_h=args.flip_h,
                color_tweak=not args.no_color_tweak,
                vignette=args.vignette,
                noise=args.noise,
                audio_volume=args.audio_volume,
                strip_blind_watermark=not args.no_strip_blind_watermark,
                trim_end_secs=args.trim_end_secs,
                trim_start_secs=args.trim_start_secs,
                delogo_mode=args.delogo_mode,
                dynamic_pan_zoom=args.dynamic_pan_zoom,
                dynamic_lighting=args.dynamic_lighting,
                ambient_blurred_bg=args.ambient_blurred_bg,
                split_canvas=args.split_canvas,
                audio_scramble=args.audio_scramble,
                mute_audio=args.mute_audio,
                frame_jitter=args.frame_jitter,
                curved_speed=args.curved_speed,
                film_grain=args.film_grain,
                micro_rotate=args.micro_rotate,
                chromashift=args.chromashift,
                unsharp=args.unsharp,
                fake_camera_exif=not args.no_fake_camera_exif,
                output_path=args.output,
                output_dir=args.outdir
            )
            print(json.dumps(res, ensure_ascii=False))
        elif args.action == "dedup-merge":
            input_list = []
            if args.inputs_json:
                try:
                    input_list = json.loads(args.inputs_json)
                except Exception:
                    pass
            if not input_list and args.inputs:
                input_list = args.inputs
            res = run_batch_dedup_and_merge(
                input_paths=input_list,
                transition=args.transition,
                transition_duration=args.transition_duration,
                target_resolution=args.target_resolution,
                speed=args.speed,
                zoom=args.zoom,
                flip_h=args.flip_h,
                color_tweak=not args.no_color_tweak,
                vignette=args.vignette,
                noise=args.noise,
                audio_volume=args.audio_volume,
                strip_blind_watermark=not args.no_strip_blind_watermark,
                trim_end_secs=args.trim_end_secs,
                trim_start_secs=args.trim_start_secs,
                delogo_mode=args.delogo_mode,
                dynamic_pan_zoom=args.dynamic_pan_zoom,
                dynamic_lighting=args.dynamic_lighting,
                ambient_blurred_bg=args.ambient_blurred_bg,
                split_canvas=args.split_canvas,
                audio_scramble=args.audio_scramble,
                mute_audio=args.mute_audio,
                frame_jitter=args.frame_jitter,
                curved_speed=args.curved_speed,
                film_grain=args.film_grain,
                micro_rotate=args.micro_rotate,
                chromashift=args.chromashift,
                unsharp=args.unsharp,
                fake_camera_exif=not args.no_fake_camera_exif,
                output_path=args.output,
                output_dir=args.outdir
            )
            print(json.dumps(res, ensure_ascii=False))
        elif args.action == "parse-download":
            res = parse_and_download_no_watermark(args.text, args.outdir)
            print(json.dumps(res, ensure_ascii=False))
        elif args.action == "fetch-author-posts":
            res = fetch_author_posts(args.url, args.platform, args.count)
            print(json.dumps(res, ensure_ascii=False))
        elif args.action == "llm":
            res = run_llm_copywriting(args.platform, args.topic, args.api_key, args.base_url, args.model)
            print(json.dumps(res, ensure_ascii=False))
        elif args.action == "test-llm":
            res = run_test_llm(args.api_key, args.base_url, args.model)
            print(json.dumps(res, ensure_ascii=False))
    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}, ensure_ascii=False), file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
