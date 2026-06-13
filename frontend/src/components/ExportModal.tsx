import { useState } from "react";

interface ExportModalProps {
    id: string;
    API_URL: string;
    activeEdits: any[];
    multiTrackEdl: any;
    fontStyle: string;
    fontSize: number;
    fontColor: string;
    useOutline: boolean;
    selectedTemplate: string | null;
    onClose: () => void;
    onStatusChange: (isRendering: boolean) => void;
}

export default function ExportModal({
    id, API_URL, activeEdits, multiTrackEdl, fontStyle, fontSize, fontColor, useOutline, selectedTemplate, onClose, onStatusChange
}: ExportModalProps) {
    const [exportResolution, setExportResolution] = useState('1080p');
    const [exportFps, setExportFps] = useState(30);
    const [exportQuality, setExportQuality] = useState('high');
    const [exportFormat, setExportFormat] = useState('mp4_h264');
    const [exportAudioBitrate, setExportAudioBitrate] = useState('192k');
    const [isExporting, setIsExporting] = useState(false);
    const [exportDone, setExportDone] = useState(false);

    const handleExport = async () => {
        try {
            setIsExporting(true);
            setExportDone(false);
            onStatusChange(true);
            await fetch(`${API_URL}/api/video/export`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    file_id: id,
                    resolution: exportResolution,
                    fps: exportFps,
                    quality: exportQuality,
                    format: exportFormat,
                    audio_bitrate: exportAudioBitrate,
                    edits: activeEdits.length > 0 ? activeEdits : null,
                    edl: multiTrackEdl,
                    font: fontStyle,
                    font_size: fontSize,
                    font_color: fontColor,
                    use_outline: useOutline,
                    template_id: selectedTemplate || null,
                })
            });
            
            const poll = setInterval(async () => {
                const st = await fetch(`${API_URL}/api/video/${id}/status`).then(r => r.json());
                if (st.status === 'ready') {
                    clearInterval(poll);
                    setIsExporting(false);
                    onStatusChange(false);
                    setExportDone(true);
                }
            }, 2000);
        } catch (error) {
            console.error(error);
            setIsExporting(false);
            onStatusChange(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6" style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(4px)' }}>
            <div className="w-full max-w-lg rounded-xl border border-zinc-900 overflow-hidden font-sans" style={{ background: '#09090b' }}>
                <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-900 bg-white/80 dark:bg-neutral-900/80 backdrop-blur-xl">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-xl border border-zinc-800 bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center text-amber-500">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                        </div>
                        <div>
                            <h2 className="text-[12px] font-bold uppercase tracking-widest text-zinc-200">export settings</h2>
                            <p className="text-[12px] text-zinc-550 lowercase">ffmpeg render preset controls</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="text-zinc-650 hover:text-zinc-400 transition-colors cursor-pointer">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>

                <div className="px-4 py-3.5 space-y-3.5">
                    <div className="grid grid-cols-2 gap-6">
                        <div>
                            <label className="block text-[12px] font-bold text-zinc-550 mb-2 uppercase tracking-widest">resolution</label>
                            <div className="flex gap-2">
                                {['720p','1080p','4k'].map(r => (
                                    <button key={r} onClick={() => setExportResolution(r)}
                                        className={`flex-1 py-1.5 border text-[12px] font-bold transition-all rounded-xl cursor-pointer ${
                                            exportResolution === r ? 'border-amber-500/30 bg-amber-500/10 text-amber-500' : 'border-zinc-900 bg-zinc-950/20 text-zinc-500 hover:border-zinc-800'
                                        }`}>{r}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div>
                            <label className="block text-[12px] font-bold text-zinc-550 mb-2 uppercase tracking-widest">framerate</label>
                            <div className="flex gap-2">
                                {[24,30,60].map(f => (
                                    <button key={f} onClick={() => setExportFps(f)}
                                        className={`flex-1 py-1.5 border text-[12px] font-bold transition-all rounded-xl cursor-pointer ${
                                            exportFps === f ? 'border-amber-500/30 bg-amber-500/10 text-amber-500' : 'border-zinc-900 bg-zinc-950/20 text-zinc-500 hover:border-zinc-800'
                                        }`}>{f}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div>
                        <label className="block text-[12px] font-bold text-zinc-550 mb-2 uppercase tracking-widest">quality profile</label>
                        <div className="grid grid-cols-3 gap-2">
                            {[{v:'high',l:'high',s:'crf 18'},{v:'medium',l:'medium',s:'crf 23'},{v:'fast',l:'fast',s:'crf 28'}].map(q => (
                                <button key={q.v} onClick={() => setExportQuality(q.v)}
                                    className={`py-2 px-3 text-left border transition-all rounded-xl cursor-pointer ${
                                        exportQuality === q.v ? 'border-amber-500/30 bg-amber-500/10' : 'border-zinc-900 bg-zinc-950/20 hover:border-zinc-800'
                                    }`}>
                                    <div className={`text-[12px] font-bold lowercase ${exportQuality === q.v ? 'text-amber-500' : 'text-zinc-400'}`}>{q.l}</div>
                                    <div className="text-[12px] text-zinc-600 mt-0.5">{q.s}</div>
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-6">
                        <div>
                            <label className="block text-[12px] font-bold text-zinc-550 mb-2 uppercase tracking-widest">format & codec</label>
                            <div className="space-y-1.5">
                                {[{v:'mp4_h264',l:'mp4 / h.264'},{v:'mp4_h265',l:'mp4 / h.265'},{v:'webm',l:'webm / vp9'}].map(fmt => (
                                    <button key={fmt.v} onClick={() => setExportFormat(fmt.v)}
                                        className={`w-full py-1.5 px-4 text-left text-[12px] font-bold border transition-all rounded-xl cursor-pointer ${
                                            exportFormat === fmt.v ? 'border-amber-500/30 bg-amber-500/10 text-amber-500' : 'border-zinc-900 bg-zinc-950/20 text-zinc-500 hover:border-zinc-800'
                                        }`}>{fmt.l}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div>
                            <label className="block text-[12px] font-bold text-zinc-550 mb-2 uppercase tracking-widest">audio bitrate</label>
                            <div className="space-y-1.5">
                                {['128k','192k','320k'].map(ab => (
                                    <button key={ab} onClick={() => setExportAudioBitrate(ab)}
                                        className={`w-full py-1.5 px-4 text-left text-[12px] font-bold border transition-all rounded-xl cursor-pointer ${
                                            exportAudioBitrate === ab ? 'border-amber-500/30 bg-amber-500/10 text-amber-500' : 'border-zinc-900 bg-zinc-950/20 text-zinc-500 hover:border-zinc-800'
                                        }`}>{ab} {ab === '128k' ? '(standard)' : ab === '192k' ? '(high)' : '(studio)'}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className="px-4 py-3 text-[12px] text-zinc-500 flex items-center gap-2 border border-zinc-900 bg-zinc-950/40">
                        <svg className="w-3.5 h-3.5 text-amber-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        <span>summary: <span className="text-zinc-300">{exportResolution} &bull; {exportFps}fps &bull; {exportQuality} &bull; {exportFormat.replace('_','/')} &bull; {exportAudioBitrate}</span></span>
                    </div>

                    {exportDone && (
                        <div className="px-4 py-3.5 flex items-center gap-3 border border-amber-500/20 bg-amber-500/5 text-amber-500">
                            <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                            <span className="text-[12px] font-sans lowercase">export complete! ready to download.</span>
                            <a href={`${API_URL}/uploads/${id}_rendered.mp4`} download
                                className="ml-auto px-4 py-1 bg-amber-500 hover:bg-amber-600 text-black font-bold text-[12px] transition-colors rounded-xl"
                            >
                                download
                            </a>
                        </div>
                    )}
                </div>

                <div className="px-4 py-3 border-t border-zinc-900 flex justify-end gap-3 bg-white/80 dark:bg-neutral-900/80 backdrop-blur-xl">
                    <button onClick={onClose} className="px-4 py-2 border border-zinc-900 hover:border-zinc-800 text-[12px] text-zinc-500 hover:text-zinc-300 transition-all rounded-xl cursor-pointer">
                        cancel
                    </button>
                    <button
                        disabled={isExporting}
                        onClick={handleExport}
                        className="flex items-center gap-2 px-5 py-3 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-black text-[12px] font-bold transition-all rounded-xl cursor-pointer"
                    >
                        {isExporting ? (
                            <>
                                <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>
                                <span>rendering...</span>
                            </>
                        ) : 'start export'}
                    </button>
                </div>
            </div>
        </div>
    );
}
