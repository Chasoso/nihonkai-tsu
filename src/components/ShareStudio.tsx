import { useMemo, useState } from "react";
import type { Fish } from "../types";

interface ShareStudioProps {
  fish: Fish | null;
  onOpenXIntent: (finalText: string) => void;
  onComplete: () => void;
}

export function ShareStudio({ fish, onOpenXIntent, onComplete }: ShareStudioProps) {
  const [userComment, setUserComment] = useState("");

  const fixedTemplate = fish?.share.text ?? "";
  const finalText = useMemo(() => {
    if (!fish) return "";
    if (!userComment.trim()) return fixedTemplate;
    return `${userComment.trim()}\n\n${fixedTemplate}`;
  }, [fish, userComment, fixedTemplate]);

  return (
    <section id="share-studio" className="section">
      <h2>Share Studio</h2>
      <p>投稿対象: {fish ? fish.name : "未選択"}</p>

      <label>
        コメント（任意）
        <textarea
          value={userComment}
          onChange={(event) => setUserComment(event.target.value)}
          placeholder="旅の感想や味わいを自由に書く"
          disabled={!fish}
        />
      </label>

      <div className="fixed-template">
        <p>固定テンプレ（編集不可）</p>
        <pre>{fixedTemplate || "魚を選ぶと表示されます"}</pre>
      </div>

      <div className="actions">
        <button onClick={() => onOpenXIntent(finalText)} disabled={!fish}>
          Xに投稿する
        </button>
        <button onClick={onComplete} disabled={!fish}>
          投稿完了（通を獲得）
        </button>
      </div>
    </section>
  );
}
