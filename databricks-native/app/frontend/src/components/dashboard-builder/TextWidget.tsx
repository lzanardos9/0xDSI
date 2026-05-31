interface TextWidgetProps {
  content: string;
}

export default function TextWidget({ content }: TextWidgetProps) {
  return (
    <div className="h-full overflow-auto custom-scrollbar p-3">
      <div className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">
        {content || 'Empty text widget'}
      </div>
    </div>
  );
}
