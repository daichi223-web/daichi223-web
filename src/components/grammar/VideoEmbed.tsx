import { useState } from "react";
import type { GrammarMedia } from "@/lib/kobun/types";
import { videoUrl } from "@/lib/kobun/dojoData";

/**
 * 文法道場の講義動画埋め込み。
 * mp4 を Supabase Storage（公開バケット grammar-videos）から `<video>` で再生。
 * Range リクエスト対応なのでシークも可能。
 */
export function VideoEmbed({ media, onPlay }: { media: GrammarMedia; onPlay?: () => void }) {
  const [failed, setFailed] = useState(false);
  const src = videoUrl(media.storagePath);
  const poster = media.posterPath ? videoUrl(media.posterPath) : undefined;

  if (failed) {
    return (
      <div className="w-full rounded-2xl border-2 border-rw-rule bg-rw-paper p-6 text-center">
        <div className="text-3xl mb-2">🎬</div>
        <p className="text-sm font-black text-rw-ink">動画を読み込めませんでした</p>
        <p className="text-xs text-rw-ink-soft mt-1">{media.title}</p>
      </div>
    );
  }

  return (
    <figure className="w-full">
      <video
        src={src}
        poster={poster}
        controls
        preload="metadata"
        playsInline
        onPlay={onPlay}
        onError={() => setFailed(true)}
        className="w-full rounded-2xl bg-black aspect-video"
      />
      <figcaption className="mt-2 text-xs font-bold text-rw-ink-soft">
        {media.title}
        {media.sec
          ? `（${Math.floor(media.sec / 60)}分${String(media.sec % 60).padStart(2, "0")}秒）`
          : ""}
      </figcaption>
    </figure>
  );
}
