# -*- coding: utf-8 -*-
"""
narrations.json → スライドごとの mp3 + durations.json を生成（edge-tts）。
使い方: python -X utf8 scripts/gen-narration.py [deckKey ...]（無指定で全デッキ）
出力: videos/audio/<deck>/s<idx>.mp3, videos/audio/<deck>/durations.json
"""
import asyncio, json, os, sys, io

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
import edge_tts
from mutagen.mp3 import MP3

VOICE = "ja-JP-NanamiNeural"
RATE = "+8%"  # 講義はやや速めが聞きやすい

narr = json.load(open("scripts/narrations.json", encoding="utf-8"))
targets = sys.argv[1:] or [k for k in narr if not k.startswith("_")]

async def synth(text, path):
    await edge_tts.Communicate(text, VOICE, rate=RATE).save(path)

async def main():
    for deck in targets:
        conf = narr[deck]
        outdir = f"videos/audio/{deck}"
        os.makedirs(outdir, exist_ok=True)
        durations = {}
        for idx, text in conf["slides"].items():
            mp3 = f"{outdir}/s{idx}.mp3"
            if not os.path.exists(mp3):
                await synth(text, mp3)
            durations[idx] = round(MP3(mp3).info.length, 1)
        json.dump(durations, open(f"{outdir}/durations.json", "w", encoding="utf-8"))
        total = round(sum(durations.values()) / 60, 1)
        print(f"{deck}: {len(durations)}枚 計{total}分")

asyncio.run(main())
