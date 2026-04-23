interface TranslationPanelProps {
  translation: string;
  isActive: boolean;
  onToggle: () => void;
}

export function TranslationPanel({
  translation,
  isActive,
  onToggle,
}: TranslationPanelProps) {
  return (
    <div
      className="ml-2 pl-3 border-l-2 border-scaffold/30 cursor-pointer"
      onClick={onToggle}
    >
      <p
        className={`text-sm text-scaffold transition-opacity ${
          isActive ? "opacity-100" : "opacity-50"
        }`}
      >
        {translation}
      </p>
    </div>
  );
}
