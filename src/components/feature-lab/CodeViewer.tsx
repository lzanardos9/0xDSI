import { useState } from 'react';
import { Copy, Check, Download, FileCode, Terminal, Layers } from 'lucide-react';

interface CodeViewerProps {
  code: string;
  language: string;
  title: string;
}

export default function CodeViewer({ code, language, title }: CodeViewerProps) {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const download = () => {
    const ext = language === 'python' ? 'py' : language === 'sql' ? 'sql' : 'txt';
    const blob = new Blob([code], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title.replace(/\s+/g, '_').toLowerCase()}.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const lines = code.split('\n');

  return (
    <div className="bg-[#060912] border border-slate-800 rounded-xl overflow-hidden flex flex-col" style={{ maxHeight: '70vh' }}>
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-800 bg-[#0a0e1a]">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500/70" />
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500/70" />
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/70" />
          </div>
          <div className="flex items-center gap-2">
            {language === 'python' ? <FileCode size={13} className="text-cyan-400" /> : <Terminal size={13} className="text-emerald-400" />}
            <span className="text-[11px] font-mono text-slate-300">{title}.{language === 'python' ? 'py' : language}</span>
            <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-orange-500/10 border border-orange-500/30 text-orange-300 flex items-center gap-1">
              <Layers size={8} />Databricks
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[10px] font-mono text-slate-500 mr-2">{lines.length} lines</span>
          <button onClick={copy} className="p-1.5 rounded hover:bg-slate-800 transition-colors" title="Copy">
            {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} className="text-slate-400" />}
          </button>
          <button onClick={download} className="p-1.5 rounded hover:bg-slate-800 transition-colors" title="Download">
            <Download size={12} className="text-slate-400" />
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-auto font-mono text-[11px] leading-[1.55]">
        <table className="w-full border-collapse">
          <tbody>
            {lines.map((line, i) => (
              <tr key={i} className="hover:bg-slate-800/30">
                <td className="text-right pr-3 pl-3 text-slate-600 select-none w-12 border-r border-slate-800/50 align-top">{i + 1}</td>
                <td className="pl-3 pr-4 text-slate-300 whitespace-pre align-top">{highlightLine(line, language)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function highlightLine(line: string, language: string): React.ReactNode {
  if (!line.trim()) return <span>&nbsp;</span>;

  const pythonKw = /\b(def|class|return|import|from|as|if|elif|else|for|while|try|except|finally|with|async|await|lambda|yield|in|not|and|or|is|None|True|False|pass|break|continue|raise|global|nonlocal)\b/g;
  const sqlKw = /\b(SELECT|FROM|WHERE|JOIN|LEFT|RIGHT|INNER|OUTER|GROUP BY|ORDER BY|HAVING|LIMIT|INSERT|UPDATE|DELETE|CREATE|TABLE|VIEW|AS|ON|AND|OR|NOT|NULL|IS|IN|BETWEEN|LIKE|CASE|WHEN|THEN|END|WITH|UNION|DISTINCT)\b/gi;

  const kw = language === 'sql' ? sqlKw : pythonKw;

  const parts: Array<{ text: string; cls: string }> = [];
  let rest = line;

  const commentIdx = language === 'sql' ? rest.indexOf('--') : rest.indexOf('#');
  if (commentIdx >= 0) {
    const before = rest.slice(0, commentIdx);
    const comment = rest.slice(commentIdx);
    return <><span>{tokenize(before, kw)}</span><span className="text-slate-600 italic">{comment}</span></>;
  }
  return tokenize(rest, kw);
}

function tokenize(text: string, kw: RegExp): React.ReactNode {
  const out: React.ReactNode[] = [];
  let lastIdx = 0;
  const regex = new RegExp(`(".*?"|'.*?'|\\b\\d+\\b|${kw.source})`, kw.flags.replace('g', 'g'));
  let m: RegExpExecArray | null;
  while ((m = regex.exec(text)) !== null) {
    if (m.index > lastIdx) out.push(<span key={lastIdx}>{text.slice(lastIdx, m.index)}</span>);
    const token = m[0];
    let cls = 'text-slate-300';
    if (/^["']/.test(token)) cls = 'text-emerald-300';
    else if (/^\d+$/.test(token)) cls = 'text-amber-300';
    else if (kw.test(token)) cls = 'text-cyan-400 font-semibold';
    kw.lastIndex = 0;
    out.push(<span key={m.index} className={cls}>{token}</span>);
    lastIdx = m.index + token.length;
  }
  if (lastIdx < text.length) out.push(<span key={lastIdx + 1}>{text.slice(lastIdx)}</span>);
  return <>{out}</>;
}
