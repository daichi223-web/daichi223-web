import type { LayerDefinition, LayerId } from "@/lib/kobun/types";

interface LayerSelectorProps {
  layers: LayerDefinition[];
  currentLayer: LayerId;
  onChange: (layer: LayerId) => void;
}

const layerBgColors: Record<number, string> = {
  1: "bg-layer-1",
  2: "bg-layer-2",
  3: "bg-layer-3",
  4: "bg-layer-4",
  5: "bg-layer-5",
};

export function LayerSelector({ layers, currentLayer, onChange }: LayerSelectorProps) {
  return (
    <div className="flex items-center gap-1">
      <span className="text-xs text-scaffold mr-1">Layer</span>
      {layers.map((layer) => {
        const isActive = layer.id === currentLayer;
        const isLocked = layer.prerequisite ? layer.prerequisite > currentLayer : false;

        return (
          <button
            key={layer.id}
            onClick={() => !isLocked && onChange(layer.id)}
            disabled={isLocked}
            className={`shrink-0 h-7 rounded-full text-xs font-bold transition-all
              ${layer.id === 5 ? "px-2" : "w-7"}
              ${
                isActive
                  ? `${layerBgColors[layer.id]} text-white shadow-sm`
                  : isLocked
                  ? "bg-sumi/5 text-sumi/20 cursor-not-allowed"
                  : "bg-sumi/5 text-sumi/60 hover:bg-sumi/10"
              }`}
            title={layer.label}
          >
            {layer.id === 5 ? "読" : layer.id}
          </button>
        );
      })}
    </div>
  );
}
