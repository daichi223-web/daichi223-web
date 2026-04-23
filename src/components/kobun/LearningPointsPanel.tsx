import { useState } from "react";
import type { LearningPoints, LayerId, SectionPriority } from "@/lib/kobun/types";

interface LearningPointsPanelProps {
  learningPoints: LearningPoints;
  currentLayer: LayerId;
}

const priorityLabel: Record<SectionPriority, string> = {
  essential: "必須",
  important: "重要",
  supplementary: "補足",
};

const priorityStyle: Record<SectionPriority, string> = {
  essential: "bg-shu/10 text-shu border-shu/30",
  important: "bg-kin/10 text-kin border-kin/30",
  supplementary: "bg-sumi/5 text-sumi/50 border-sumi/10",
};

export function LearningPointsPanel({
  learningPoints,
  currentLayer,
}: LearningPointsPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [showSteps, setShowSteps] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  const layerPoints = learningPoints.byLayer.find(
    (lp) => lp.layer === currentLayer
  );

  const sortedPoints = layerPoints
    ? [...layerPoints.points].sort((a, b) => {
        const order: Record<SectionPriority, number> = {
          essential: 0,
          important: 1,
          supplementary: 2,
        };
        return order[a.priority] - order[b.priority];
      })
    : [];

  return (
    <div className="border border-sumi/15 rounded-lg bg-washi/80 overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-4 py-2.5 flex items-center justify-between text-sm font-bold hover:bg-sumi/5 transition-colors"
      >
        <span>
          学習のポイント
          {layerPoints && (
            <span className="ml-2 text-xs font-normal text-scaffold">
              — {layerPoints.label}
            </span>
          )}
        </span>
        <span
          className={`text-scaffold transition-transform ${isOpen ? "rotate-180" : ""}`}
        >
          ▼
        </span>
      </button>

      {isOpen && layerPoints && (
        <div className="px-4 pb-3 space-y-2 border-t border-sumi/10">
          {/* 要点（1行サマリー） — 常に表示 */}
          <p className="pt-3 text-xs font-bold text-shu leading-relaxed">
            {layerPoints.keyPoint}
          </p>

          {/* 覚える手順（折りたたみ） */}
          {layerPoints.studySteps && layerPoints.studySteps.length > 0 && (
            <div>
              <button
                onClick={() => setShowSteps(!showSteps)}
                className="w-full flex items-center justify-between text-xs text-scaffold hover:text-sumi transition-colors py-1"
              >
                <span className="font-bold">覚える手順</span>
                <span
                  className={`transition-transform ${showSteps ? "rotate-180" : ""}`}
                >
                  ▼
                </span>
              </button>
              {showSteps && (
                <ol className="space-y-1 mt-1 px-2 py-2 bg-kin/5 border border-kin/20 rounded">
                  {layerPoints.studySteps.map((step, i) => (
                    <li key={i} className="text-xs leading-relaxed flex gap-1.5">
                      <span className="shrink-0 w-4 h-4 rounded-full bg-kin text-white text-[10px] font-bold flex items-center justify-center mt-0.5">
                        {i + 1}
                      </span>
                      <span>{step}</span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          )}

          {/* 詳細ポイント（折りたたみ） */}
          {sortedPoints.length > 0 && (
            <div>
              <button
                onClick={() => setShowDetails(!showDetails)}
                className="w-full flex items-center justify-between text-xs text-scaffold hover:text-sumi transition-colors py-1"
              >
                <span className="font-bold">詳細ポイント</span>
                <span
                  className={`transition-transform ${showDetails ? "rotate-180" : ""}`}
                >
                  ▼
                </span>
              </button>
              {showDetails && (
                <div className="space-y-1.5 mt-1">
                  {sortedPoints.map((point, i) => (
                    <div
                      key={i}
                      className="flex gap-2 items-start text-xs leading-relaxed"
                    >
                      <span
                        className={`shrink-0 mt-0.5 px-1 py-0.5 text-[9px] font-bold rounded border ${priorityStyle[point.priority]}`}
                      >
                        {priorityLabel[point.priority]}
                      </span>
                      <span>{point.text}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
