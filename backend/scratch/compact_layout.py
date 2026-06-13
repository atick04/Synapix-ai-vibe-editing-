import re
import os

# Base paths
FRONTEND_DIR = r"c:\Users\User\Desktop\VibeEdit AI\frontend\src"

def modify_file(filepath, replacements):
    if not os.path.exists(filepath):
        print(f"Skipping: {filepath} (does not exist)")
        return
    
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    original_content = content
    for target, replacement in replacements:
        content = content.replace(target, replacement)
    
    if content != original_content:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"Successfully modified: {filepath}")
    else:
        print(f"No changes made to: {filepath}")

# 1. page.tsx changes
page_replacements = [
    # Header Height & Layout
    ('h-[56px] flex items-center px-6 justify-between', 'h-[44px] flex items-center px-4 justify-between'),
    # Header Icon Size
    ('w-7 h-7 rounded-xl', 'w-6 h-6 rounded-lg'),
    ('<svg viewBox="0 0 24 24" fill="none" className="w-4 h-4">', '<svg viewBox="0 0 24 24" fill="none" className="w-3.5 h-3.5">'),
    # Header Title
    ('text-[13px] font-medium" style={{ color: "#9AA4B2" }}>Synapix Studio', 'text-[11px] font-medium" style={{ color: "#9AA4B2" }}>Synapix Studio'),
    ('text-[13px] font-mono ml-1 truncate max-w-[200px]', 'text-[11px] font-mono ml-1 truncate max-w-[200px]'),
    # Live Indicator
    ('px-2.5 py-1 rounded-full', 'px-1.5 py-0.5 rounded-full'),
    ('text-[13px] font-mono text-neutral-500', 'text-[11px] font-mono text-neutral-500'),
    # Header Tabs / Buttons
    ('gap-2 px-3 py-1.5 rounded-xl text-[14px]', 'gap-1 px-2.5 py-1 rounded-lg text-[12px]'),
    ('px-2.5 py-1 text-[13px]', 'px-2 py-0.5 text-[11px]'),
    # Export Button
    ('px-3.5 py-1.5 rounded-xl text-[13px]', 'px-2.5 py-1 rounded-lg text-[11px]'),
    
    # Grid Spacings & Layout Gaps
    ('p-6 gap-6', 'p-3 gap-3'),
    ('gap-6', 'gap-3'),
    # Sidebars Width
    ('w-[340px] flex-shrink-0 rounded-3xl', 'w-[290px] flex-shrink-0 rounded-2xl'),
    ('w-[340px] flex-shrink-0', 'w-[290px] flex-shrink-0'),
    ('rounded-3xl', 'rounded-2xl'),
    ('borderRadius: "1.5rem"', 'borderRadius: "1rem"'),
    # resizable default height
    ('useState(250)', 'useState(200)'),
    # Timeline Toolbar
    ('h-11 flex items-center px-4 justify-between', 'h-9 flex items-center px-3 justify-between'),
    ('px-3 py-1 rounded-lg text-[13px] font-mono', 'px-2 py-0.5 rounded-md text-[11px] font-mono'),
    ('px-3 py-1.5 rounded-xl text-[13px] font-medium transition-all cursor-pointer', 'px-2 py-1 rounded-lg text-[11px] font-medium transition-all cursor-pointer'),
]

# 2. ChatSidebar.tsx changes
chat_replacements = [
    # Resizing variables
    ('useState(340)', 'useState(290)'),
    ('Math.max(280, Math.min(520, e.clientX))', 'Math.max(240, Math.min(520, e.clientX))'),
    # Header
    ('px-5 py-3.5 shrink-0', 'px-4 py-2 shrink-0'),
    ('text-[15px] font-medium" style={{ color: "#9AA4B2"', 'text-[12px] font-medium" style={{ color: "#9AA4B2"'),
    ('text-[15px] font-mono px-2 py-0.5 rounded-lg border', 'text-[11px] font-mono px-1.5 py-0.5 rounded-md border'),
    ('w-5 h-5 rounded-md flex items-center justify-center', 'w-4 h-4 rounded-md flex items-center justify-center'),
    ('w-2.5 h-2.5', 'w-2 h-2'),
    # Messages Padding
    ('px-5 py-5 space-y-5', 'px-4 py-3 space-y-3'),
    # Empty State
    ('w-8 h-8 rounded-xl flex items-center justify-center mb-1', 'w-6 h-6 rounded-lg flex items-center justify-center mb-1'),
    ('w-4 h-4', 'w-3 h-3'),
    ('text-[16px] font-medium mb-1', 'text-[13px] font-medium mb-1'),
    ('text-[15px] leading-relaxed" style={{ color: "#5A6478"', 'text-[11px] leading-relaxed" style={{ color: "#5A6478"'),
    # User message card
    ('px-4.5 py-3.5 rounded-[24px] rounded-tr-sm text-[16px]', 'px-3 py-2 rounded-[16px] rounded-tr-sm text-[13px]'),
    ('text-[15px] font-mono uppercase tracking-widest mb-1.5 px-2 py-0.5 rounded-full', 'text-[11px] font-mono uppercase tracking-widest mb-1 px-1.5 py-0.5 rounded-full'),
    # AI Text
    ('text-[16px] leading-relaxed pr-2', 'text-[13px] leading-relaxed pr-2'),
    ('className="text-[16px] text-[#C4CCD8] font-sans leading-[1.7]', 'className="text-[13px] text-[#C4CCD8] font-sans leading-[1.6]'),
    # reasoning pipelines
    ('rounded-xl px-4.5 py-3 animate-fade-blur', 'rounded-lg px-3 py-2 animate-fade-blur'),
    ('mb-2.5', 'mb-1.5'),
    ('text-[15px] font-mono uppercase tracking-widest" style={{ color: "rgba(59,130,246,0.6)" }}', 'text-[11px] font-mono uppercase tracking-widest" style={{ color: "rgba(59,130,246,0.6)" }}'),
    ('text-zinc-550 hover:text-zinc-300 border-zinc-700 hover:border-zinc-500 border-b border-dotted text-[15px]', 'text-zinc-550 hover:text-zinc-300 border-zinc-700 hover:border-zinc-500 border-b border-dotted text-[11px]'),
    ('text-[15px] font-mono" style={{ color: "#4A5568" }}', 'text-[11px] font-mono" style={{ color: "#4A5568" }}'),
    ('text-[15px] px-1.5 py-0.5 rounded-full font-mono', 'text-[11px] px-1 py-0.5 rounded-full font-mono'),
    # Live Activity Feed styles
    ('text-[15px] font-mono font-medium text-white', 'text-[11px] font-mono font-medium text-white'),
    ('text-[15px] px-1 py-0.2 rounded bg-zinc-900', 'text-[11px] px-1 py-0.2 rounded bg-zinc-900'),
    ('text-[15px] font-mono text-zinc-300', 'text-[11px] font-mono text-zinc-300'),
    ('text-[15px] font-mono text-zinc-400', 'text-[11px] font-mono text-zinc-400'),
    ('text-[15px] font-mono text-zinc-500', 'text-[11px] font-mono text-zinc-500'),
    ('text-[15px] font-mono tracking-wide uppercase', 'text-[11px] font-mono tracking-wide uppercase'),
    # Interactive checklist style
    ('text-[15px] leading-relaxed', 'text-[12px] leading-relaxed'),
    ('text-[16px] leading-relaxed whitespace-pre-wrap', 'text-[12px] leading-relaxed whitespace-pre-wrap'),
    ('text-[16px] whitespace-pre-wrap', 'text-[12px] whitespace-pre-wrap'),
    ('text-[16px] focus:outline-none border-none', 'text-[13px] focus:outline-none border-none'),
    ('py-3 px-4 rounded-xl text-[15px]', 'py-2 px-3 rounded-lg text-[12px]'),
    ('px-4 py-3 rounded-xl', 'px-3 py-2 rounded-lg'),
    # Focus Badge style
    ('p-3 rounded-[24px]', 'p-2 rounded-[16px]'),
    ('text-[15px] font-mono font-semibold uppercase tracking-wider text-zinc-550', 'text-[11px] font-mono font-semibold uppercase tracking-wider text-zinc-550'),
    ('text-[15px] font-sans font-bold text-white', 'text-[12px] font-sans font-bold text-white'),
    ('text-[15px] font-mono font-bold bg-white/5 border border-white/5 rounded px-1.5 text-zinc-400', 'text-[11px] font-mono font-bold bg-white/5 border border-white/5 rounded px-1 text-zinc-400'),
    ('text-[15px] font-sans text-zinc-500 mt-1 pl-3', 'text-[11px] font-sans text-zinc-500 mt-1 pl-3'),
    ('text-zinc-500 hover:text-white text-[15px] font-bold h-5 w-5', 'text-zinc-500 hover:text-white text-[11px] font-bold h-4 w-4'),
    # Input Area container
    ('shrink-0 p-6', 'shrink-0 p-3'),
    ('rounded-[24px]', 'rounded-[16px]'),
    ('px-4 pt-3.5 text-[16px] leading-relaxed resize-none focus:outline-none', 'px-3 pt-2.5 text-[13px] leading-relaxed resize-none focus:outline-none'),
    ('px-4 pb-3 pt-1', 'px-3 pb-2 pt-1'),
    ('text-[15px] font-mono text-zinc-650', 'text-[11px] font-mono text-zinc-650'),
    ('px-4 py-1.5 rounded-xl text-[15px] font-medium transition-all cursor-pointer', 'px-3 py-1 rounded-lg text-[12px] font-medium transition-all cursor-pointer'),
]

# 3. ReferencesSidebar.tsx changes
references_replacements = [
    # Header
    ('px-5 pt-4 pb-3', 'px-4 pt-2.5 pb-2'),
    ('text-[15px] font-bold tracking-widest text-zinc-400 uppercase', 'text-[12px] font-bold tracking-widest text-zinc-400 uppercase'),
    ('w-6 h-6 rounded-full flex items-center justify-center text-[16px]', 'w-5 h-5 rounded-full flex items-center justify-center text-[12px]'),
    ('p-1.5 rounded-2xl border', 'p-1 rounded-xl border'),
    ('py-1.5 rounded-xl text-[15px]', 'py-1 rounded-lg text-[11px]'),
    # Content Area
    ('px-5 py-5 scrollbar-hide space-y-7', 'px-4 py-3 scrollbar-hide space-y-4'),
    # Instruction boxes
    ('rounded-2xl p-6 border', 'rounded-xl p-3 border'),
    ('text-[16px] font-bold text-amber-500', 'text-[12px] font-bold text-amber-500'),
    ('text-[16px] leading-relaxed text-zinc-300', 'text-[12px] leading-relaxed text-zinc-300'),
    # Library sub-titles
    ('text-[15px] font-bold text-zinc-400 uppercase tracking-widest', 'text-[11px] font-bold text-zinc-400 uppercase tracking-widest'),
    # Upload zone
    ('rounded-2xl p-5 flex flex-col items-center justify-center', 'rounded-xl p-3 flex flex-col items-center justify-center'),
    ('text-[15px] font-sans text-zinc-400 font-bold', 'text-[12px] font-sans text-zinc-400 font-bold'),
    ('text-[13px] font-mono text-zinc-600', 'text-[10px] font-mono text-zinc-600'),
    ('h-1.5 w-full bg-zinc-950/80 rounded-full', 'h-1 w-full bg-zinc-950/80 rounded-full'),
    # upload error / progress sizes
    ('text-[15px] font-mono text-red-500', 'text-[11px] font-mono text-red-500'),
    ('text-[15px] font-mono text-zinc-400', 'text-[11px] font-mono text-zinc-400'),
    # list cards text
    ('p-4 rounded-2xl bg-zinc-950/40 border border-white/5 hover:border-white/10 flex flex-col gap-2.5 transition-all relative overflow-hidden', 'p-3 rounded-xl bg-zinc-950/40 border border-white/5 hover:border-white/10 flex flex-col gap-2 transition-all relative overflow-hidden'),
    ('text-[16px] font-sans font-bold text-white', 'text-[13px] font-sans font-bold text-white'),
    ('text-[15px] leading-relaxed text-zinc-400 font-medium', 'text-[11px] leading-relaxed text-zinc-400 font-medium'),
    ('px-3.5 py-1 rounded-xl text-[13px]', 'px-2.5 py-0.5 rounded-lg text-[11px]'),
    ('text-[15px] font-mono text-zinc-500 font-semibold', 'text-[11px] font-mono text-zinc-500 font-semibold'),
    ('px-3 py-1 rounded-xl border border-white/10 bg-white/5 text-zinc-350 hover:bg-white/10 text-[14px]', 'px-2 py-0.5 rounded-lg border border-white/10 bg-white/5 text-zinc-350 hover:bg-white/10 text-[11px]'),
    # music category title
    ('text-[15px] font-mono uppercase tracking-widest text-amber-500/80 mb-3', 'text-[11px] font-mono uppercase tracking-widest text-amber-500/80 mb-2'),
    ('p-3.5 rounded-2xl bg-zinc-950/40 border border-white/5 flex flex-col gap-2 transition-all', 'p-2.5 rounded-xl bg-zinc-950/40 border border-white/5 flex flex-col gap-1.5 transition-all'),
    ('text-[15px] font-sans font-bold text-zinc-200', 'text-[12px] font-sans font-bold text-zinc-200'),
    ('text-[13px] font-mono text-zinc-500', 'text-[10px] font-mono text-zinc-500'),
    ('w-7 h-7 rounded-xl bg-zinc-900 border border-white/10 flex items-center justify-center text-zinc-400 hover:text-white transition-colors cursor-pointer shrink-0', 'w-6 h-6 rounded-lg bg-zinc-900 border border-white/10 flex items-center justify-center text-zinc-400 hover:text-white transition-colors cursor-pointer shrink-0'),
    ('w-3 h-3', 'w-2.5 h-2.5'),
    ('px-3.5 py-1 rounded-xl bg-white/5 border border-white/10 text-zinc-350 text-[13px] font-semibold hover:bg-white/10 transition-all cursor-pointer', 'px-2.5 py-0.5 rounded-lg bg-white/5 border border-white/10 text-zinc-350 text-[11px] font-semibold hover:bg-white/10 transition-all cursor-pointer'),
    # inspect card styles
    ('p-4.5 rounded-2xl bg-zinc-950/40 border border-white/5 flex flex-col gap-3.5', 'p-3 rounded-xl bg-zinc-950/40 border border-white/5 flex flex-col gap-2.5'),
    ('w-7 h-7 rounded-xl flex items-center justify-center text-[17px] font-bold font-mono', 'w-6 h-6 rounded-lg flex items-center justify-center text-[12px] font-bold font-mono'),
    ('text-[18px] text-zinc-200 font-bold', 'text-[13px] text-zinc-200 font-bold'),
    ('text-[15px] text-zinc-500 font-mono uppercase', 'text-[11px] text-zinc-500 font-mono uppercase'),
    ('text-[15px] text-zinc-400', 'text-[11px] text-zinc-400'),
    ('px-3 py-1.5 bg-zinc-950 border border-white/10 rounded-xl text-[15px] font-mono text-zinc-100', 'px-2 py-0.5 bg-zinc-950 border border-white/10 rounded-lg text-[11px] font-mono text-zinc-100'),
    ('text-[15px] text-zinc-450 font-bold', 'text-[11px] text-zinc-450 font-bold'),
    ('text-[15px] text-zinc-300 font-mono bg-white/5 border border-white/5 rounded-xl px-2.5 py-1', 'text-[11px] text-zinc-300 font-mono bg-white/5 border border-white/5 rounded-lg px-2 py-0.5'),
    ('text-[15px] font-mono text-zinc-200 bg-zinc-950 px-2 py-0.5 border border-white/10 rounded-xl min-w-[50px]', 'text-[11px] font-mono text-zinc-200 bg-zinc-950 px-1.5 py-0.5 border border-white/10 rounded-lg min-w-[40px]'),
    ('px-4.5 py-1.5 bg-red-950/20 hover:bg-red-900/40 border border-red-900/30 hover:border-red-500/50 text-red-400 rounded-xl text-[15px] font-semibold', 'px-3 py-1 bg-red-950/20 hover:bg-red-900/40 border border-red-900/30 hover:border-red-500/50 text-red-400 rounded-lg text-[11px] font-semibold'),
    ('text-[15px] text-zinc-500 mt-0.5', 'text-[11px] text-zinc-500 mt-0.5'),
    # sticker list grid
    ('grid grid-cols-2 gap-4.5', 'grid grid-cols-2 gap-3'),
    ('p-3 rounded-2xl bg-zinc-950/40 border border-white/5 hover:border-white/10 flex flex-col items-center gap-2.5 relative group/sticker', 'p-2 rounded-xl bg-zinc-950/40 border border-white/5 hover:border-white/10 flex flex-col items-center gap-2 relative group/sticker'),
    ('w-16 h-16', 'w-12 h-12'),
]

# 4. VideoTimeline.tsx changes
timeline_replacements = [
    # stretch / zoom bar
    ('text-[17px] text-zinc-500 lowercase', 'text-[11px] text-zinc-500 lowercase'),
    ('text-[17px] font-mono text-zinc-400 min-w-[28px]', 'text-[11px] font-mono text-zinc-400 min-w-[20px]'),
    ('text-[17px] text-zinc-500 lowercase">animation:</span>', 'text-[11px] text-zinc-500 lowercase">animation:</span>'),
    ('px-1.5 py-0.5 border text-[17px]', 'px-1 py-0.2 border text-[11px]'),
    # ticks
    ('text-[17px] font-mono text-zinc-650 ml-1 mt-0.5', 'text-[11px] font-mono text-zinc-650 ml-1 mt-0.5'),
    # toolbar height
    ('h-10 flex items-center px-4 justify-between shrink-0 z-30 relative shadow-none', 'h-8 flex items-center px-3 justify-between shrink-0 z-30 relative shadow-none'),
    ('w-3.5 h-3.5', 'w-3 h-3'),
    # track headers left panel width
    ('w-32 bg-[#08080a]', 'w-24 bg-[#08080a]'),
    
    # S1 Header Block Replacement
    ('''                    {/* S1 Track Header */}
                    <div className="h-16 border-b border-purple-950/30 bg-[#0d0e12] flex flex-col justify-between p-2.5 uppercase hover:bg-zinc-950/40 select-none group/track transition-all">
                        <div className="flex items-center justify-between">
                            <span className="px-1.5 py-0.5 bg-purple-950/80 text-purple-400 border border-purple-900/60 rounded font-bold text-[17px]">S1</span>
                            <span className="text-[17px] text-zinc-400 font-semibold tracking-wider">scenes</span>
                        </div>
                        <div className="flex items-center justify-between mt-1 opacity-50 group-hover/track:opacity-100 transition-opacity">
                            <div className="flex items-center gap-1.5">
                                <button className="text-[17px] hover:text-white cursor-pointer" title="Toggle visibility">👁</button>
                                <button className="text-[17px] hover:text-white cursor-pointer" title="Mute track">🔊</button>
                            </div>
                            <button 
                                onClick={(ev) => { ev.stopPropagation(); handleAddClip('s1'); }}
                                className="w-4 h-4 bg-zinc-900 border border-border hover:border-white hover:text-purple-400 flex items-center justify-center cursor-pointer transition-all rounded font-bold text-[17px]"
                                title="Add Scene Override"
                            >
                                +
                            </button>
                        </div>
                    </div>''',
     '''                    {/* S1 Track Header */}
                    <div className="h-10 border-b border-black/5 dark:border-white/5 bg-transparent flex flex-row items-center justify-between px-3 uppercase hover:bg-black/5 dark:hover:bg-white/5 select-none group/track transition-all">
                        <div className="flex items-center gap-2">
                            <span className="px-1.5 py-0.5 bg-purple-500/10 text-purple-500 rounded font-bold text-[11px]">S1</span>
                            <span className="text-[12px] text-neutral-500 dark:text-neutral-400 font-medium tracking-wider">scenes s1</span>
                        </div>
                        <div className="flex items-center gap-2 opacity-0 group-hover/track:opacity-100 transition-opacity">
                            <button className="text-[12px] text-neutral-400 hover:text-neutral-800 dark:hover:text-neutral-200 cursor-pointer" title="Toggle visibility">👁</button>
                            <button className="text-[12px] text-neutral-400 hover:text-neutral-800 dark:hover:text-neutral-200 cursor-pointer" title="Mute track">🔊</button>
                            <button 
                                onClick={(ev) => { ev.stopPropagation(); handleAddClip('s1'); }}
                                className="w-5 h-5 bg-white dark:bg-neutral-800 border border-black/10 dark:border-white/10 hover:border-black/20 dark:hover:border-white/20 hover:text-purple-500 flex items-center justify-center cursor-pointer transition-all rounded-md font-bold text-[14px]"
                                title="Add Scene Override"
                            >
                                +
                            </button>
                        </div>
                    </div>'''),
    
    # V1 Header Block Replacement
    ('''                    {/* V1 Track Header */}
                    <div className="h-16 border-b border-zinc-800/40 bg-[#0d0e12] flex flex-col justify-between p-2.5 uppercase hover:bg-[#121319]/85 select-none group/track transition-all">
                        <div className="flex items-center justify-between">
                            <span className="px-1.5 py-0.5 bg-zinc-800 text-zinc-300 border border-zinc-700 rounded font-bold text-[17px]">V1</span>
                            <span className="text-[17px] text-zinc-400 font-semibold tracking-wider">video v1</span>
                        </div>
                        <div className="flex items-center gap-1.5 mt-1 opacity-50 group-hover/track:opacity-100 transition-opacity">
                            <button className="text-[17px] hover:text-white cursor-pointer" title="Toggle visibility">👁</button>
                            <button className="text-[17px] hover:text-white cursor-pointer" title="Mute track">🔊</button>
                        </div>
                    </div>''',
     '''                    {/* V1 Track Header */}
                    <div className="h-10 border-b border-black/5 dark:border-white/5 bg-transparent flex flex-row items-center justify-between px-3 uppercase hover:bg-black/5 dark:hover:bg-white/5 select-none group/track transition-all">
                        <div className="flex items-center gap-2">
                            <span className="px-1.5 py-0.5 bg-neutral-500/10 text-neutral-500 rounded font-bold text-[11px]">V1</span>
                            <span className="text-[12px] text-neutral-500 dark:text-neutral-400 font-medium tracking-wider">video v1</span>
                        </div>
                        <div className="flex items-center gap-2 opacity-0 group-hover/track:opacity-100 transition-opacity">
                            <button className="text-[12px] text-neutral-400 hover:text-neutral-800 dark:hover:text-neutral-200 cursor-pointer" title="Toggle visibility">👁</button>
                            <button className="text-[12px] text-neutral-400 hover:text-neutral-800 dark:hover:text-neutral-200 cursor-pointer" title="Mute track">🔊</button>
                        </div>
                    </div>'''),
    
    # A1 Header Block Replacement
    ('''                    {/* A1 Track Header */}
                    <div className="h-16 border-b border-teal-950/30 bg-[#0d0e12] flex flex-col justify-between p-2.5 uppercase hover:bg-[#121319]/85 select-none group/track transition-all">
                        <div className="flex items-center justify-between">
                            <span className="px-1.5 py-0.5 bg-teal-950/80 text-teal-400 border border-teal-900/60 rounded font-bold text-[17px]">A1</span>
                            <span className="text-[17px] text-zinc-400 font-semibold tracking-wider">audio a1</span>
                        </div>
                        <div className="flex items-center gap-1.5 mt-1 opacity-50 group-hover/track:opacity-100 transition-opacity">
                            <button className="text-[17px] hover:text-white cursor-pointer" title="Toggle visibility">👁</button>
                            <button className="text-[17px] hover:text-white cursor-pointer" title="Mute track">🔊</button>
                        </div>
                    </div>''',
     '''                    {/* A1 Track Header */}
                    <div className="h-10 border-b border-black/5 dark:border-white/5 bg-transparent flex flex-row items-center justify-between px-3 uppercase hover:bg-black/5 dark:hover:bg-white/5 select-none group/track transition-all">
                        <div className="flex items-center gap-2">
                            <span className="px-1.5 py-0.5 bg-teal-500/10 text-teal-500 rounded font-bold text-[11px]">A1</span>
                            <span className="text-[12px] text-neutral-500 dark:text-neutral-400 font-medium tracking-wider">audio a1</span>
                        </div>
                        <div className="flex items-center gap-2 opacity-0 group-hover/track:opacity-100 transition-opacity">
                            <button className="text-[12px] text-neutral-400 hover:text-neutral-800 dark:hover:text-neutral-200 cursor-pointer" title="Toggle visibility">👁</button>
                            <button className="text-[12px] text-neutral-400 hover:text-neutral-800 dark:hover:text-neutral-200 cursor-pointer" title="Mute track">🔊</button>
                        </div>
                    </div>'''),

    # track channel height replacements
    ('h-16 border-b border-purple-950/20 bg-purple-950/5', 'h-10 border-b border-purple-950/10 bg-purple-950/5'),
    ('h-[50px] border rounded-md overflow-hidden flex items-center cursor-pointer transition-all', 'h-[32px] border rounded-md overflow-hidden flex items-center cursor-pointer transition-all'),
    ('text-[9.5px] absolute left-2 font-mono truncate right-2 font-medium">🎬 Scene:', 'text-[9px] absolute left-2 font-mono truncate right-2 font-medium">🎬 Scene:'),
    
    ('h-16 border-b border-blue-950/20 bg-blue-950/5', 'h-10 border-b border-blue-950/10 bg-blue-950/5'),
    ('text-[9.5px] font-mono ml-2 pointer-events-none truncate right-4 left-4 font-medium', 'text-[9px] font-mono ml-1.5 pointer-events-none truncate right-3 left-3 font-medium'),
    ('text-[17px] font-mono px-2 outline-none border border-white rounded-none z-30', 'text-[11px] font-mono px-1.5 outline-none border border-white rounded-none z-30'),
    
    ('h-16 border-b border-cyan-950/20 bg-cyan-950/5', 'h-10 border-b border-cyan-950/10 bg-cyan-950/5'),
    ('text-[9.5px] absolute left-3 font-mono pointer-events-none truncate right-3 font-medium">📹 B-Roll:', 'text-[9px] absolute left-2 font-mono pointer-events-none truncate right-2 font-medium">📹 B-Roll:'),
    
    ('h-16 border-b border-emerald-950/20 bg-emerald-950/5', 'h-10 border-b border-emerald-950/10 bg-emerald-950/5'),
    ('text-[9.5px] absolute left-3 font-mono pointer-events-none truncate right-20 font-medium">🎵 Music:', 'text-[9px] absolute left-2 font-mono pointer-events-none truncate right-16 font-medium">🎵 Music:'),
    ('text-[17px] font-mono text-white bg-zinc-900 px-2 py-0.5 rounded-none border border-border absolute right-2 pointer-events-none', 'text-[9px] font-mono text-white bg-zinc-900 px-1 py-0.2 rounded-none border border-border absolute right-1 pointer-events-none'),
    
    ('h-16 border-b border-amber-950/20 bg-amber-950/5', 'h-10 border-b border-amber-950/10 bg-amber-950/5'),
    ('text-[9.5px] absolute left-3 font-mono pointer-events-none truncate right-3 font-medium">🔊 SFX:', 'text-[9px] absolute left-2 font-mono pointer-events-none truncate right-2 font-medium">🔊 SFX:'),
    
    ('h-16 border-b border-fuchsia-950/20 bg-fuchsia-950/5', 'h-10 border-b border-fuchsia-950/10 bg-fuchsia-950/5'),
    ('text-[9.5px] absolute left-3 font-mono pointer-events-none truncate right-3 font-medium">✨ Graphic:', 'text-[9px] absolute left-2 font-mono pointer-events-none truncate right-2 font-medium">✨ Graphic:'),
    
    ('h-16 border-b border-zinc-800/20 bg-zinc-950/10', 'h-10 border-b border-zinc-800/10 bg-zinc-950/5'),
    ('text-[9.5px] text-zinc-300 absolute left-3 font-mono pointer-events-none tracking-tight font-medium z-10 drop-shadow', 'text-[9px] text-zinc-300 absolute left-2 font-mono pointer-events-none tracking-tight font-medium z-10 drop-shadow'),
    
    ('h-16 border-b border-teal-950/20 bg-teal-950/5', 'h-10 border-b border-teal-950/10 bg-teal-950/5'),
    ('text-[9.5px] text-zinc-300 font-mono tracking-tight pointer-events-none font-medium z-10 drop-shadow', 'text-[9px] text-zinc-300 font-mono tracking-tight pointer-events-none font-medium z-10 drop-shadow'),
    
    # settings inspector
    ('bg-[#0b0b0f] border-b border-white/5 px-4 py-3.5 flex flex-wrap md:flex-nowrap items-center justify-between gap-6 z-30 shrink-0 select-none font-sans', 'bg-[#0b0b0f] border-b border-white/5 px-3 py-2 flex flex-wrap md:flex-nowrap items-center justify-between gap-3 z-30 shrink-0 select-none font-sans'),
    ('h-6 px-2.5 rounded-lg border flex items-center justify-center text-[17px] font-bold uppercase font-mono', 'h-5 px-1.5 rounded-md border flex items-center justify-center text-[11px] font-bold uppercase font-mono'),
    ('text-[18px] text-zinc-100 font-bold truncate max-w-[155px] md:max-w-[280px]', 'text-[13px] text-zinc-100 font-bold truncate max-w-[155px] md:max-w-[280px]'),
    ('text-zinc-550 hover:text-zinc-300 border-zinc-700 hover:border-zinc-500 border-b border-dotted text-[15px]', 'text-zinc-550 hover:text-zinc-300 border-zinc-700 hover:border-zinc-500 border-b border-dotted text-[11px]'),
    ('text-zinc-500 font-mono text-[17px] uppercase', 'text-zinc-500 font-mono text-[11px] uppercase'),
    ('text-zinc-650 font-mono text-[17px]', 'text-zinc-650 font-mono text-[11px]'),
    ('w-14 bg-zinc-950/80 border border-white/10 rounded-xl px-2 py-1 text-[17px] font-mono text-zinc-100 focus:outline-none focus:border-amber-500/40 text-center shadow-sm', 'w-10 bg-zinc-950/80 border border-white/10 rounded-lg px-1 py-0.5 text-[11px] font-mono text-zinc-100 focus:outline-none focus:border-amber-500/40 text-center shadow-sm'),
    ('text-zinc-300 font-mono font-bold bg-white/5 border border-white/5 rounded-xl px-2 py-1 select-none', 'text-zinc-300 font-mono font-bold bg-white/5 border border-white/5 rounded-lg px-1.5 py-0.5 select-none'),
    ('text-[17px] font-mono text-zinc-100 bg-zinc-950/80 px-2 py-0.5 border border-white/10 rounded-xl min-w-[45px] text-center shadow-sm', 'text-[11px] font-mono text-zinc-100 bg-zinc-950/80 px-1.5 py-0.5 border border-white/10 rounded-lg min-w-[35px] text-center shadow-sm'),
    ('text-[17px] text-zinc-100 focus:outline-none focus:border-amber-500/40 shadow-sm', 'text-[11px] text-zinc-100 focus:outline-none focus:border-amber-500/40 shadow-sm'),
    ('px-4 py-1 text-[17px] text-zinc-100', 'px-2 py-0.5 text-[11px] text-zinc-100'),
    ('h-8 px-4 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 hover:border-amber-500/40 text-amber-400 rounded-xl text-[17px] font-semibold transition-all cursor-pointer flex items-center justify-center gap-1.5 active:scale-95 shadow-sm', 'h-6 px-2.5 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 hover:border-amber-500/40 text-amber-400 rounded-lg text-[11px] font-semibold transition-all cursor-pointer flex items-center justify-center gap-1 active:scale-95 shadow-sm'),
    ('h-8 px-4.5 bg-red-950/20 hover:bg-red-900/40 border border-red-900/30 hover:border-red-500/50 text-red-400 rounded-xl text-[17px] font-semibold transition-all cursor-pointer flex items-center justify-center gap-1.5 active:scale-95 shadow-sm', 'h-6 px-2.5 bg-red-950/20 hover:bg-red-900/40 border border-red-900/30 hover:border-red-500/50 text-red-400 rounded-lg text-[11px] font-semibold transition-all cursor-pointer flex items-center justify-center gap-1 active:scale-95 shadow-sm'),
    ('h-8 w-8 bg-zinc-900 hover:bg-zinc-800 border border-white/5 text-zinc-400 hover:text-white rounded-xl flex items-center justify-center text-[18px] font-bold cursor-pointer transition-all active:scale-90', 'h-6 w-6 bg-zinc-900 hover:bg-zinc-800 border border-white/5 text-zinc-400 hover:text-white rounded-lg flex items-center justify-center text-[13px] font-bold cursor-pointer transition-all active:scale-90'),
    
    # footer scale display zoom
    ('bottom-4 right-6 bg-zinc-950/80 border border-white/10 rounded-xl px-4 py-1.5 flex items-center gap-2 z-[100] shadow-lg backdrop-blur-md', 'bottom-2 right-4 bg-zinc-950/80 border border-white/10 rounded-lg px-2 py-1 flex items-center gap-1.5 z-[100] shadow-lg backdrop-blur-md'),
    ('text-[17px] text-zinc-400 font-mono', 'text-[11px] text-zinc-400 font-mono'),
]

# 5. TimelineEditor.tsx changes
timeline_editor_replacements = [
    ('text-[15px]', 'text-[12px]'),
    ('gap-6', 'gap-3'),
    ('py-3', 'py-1.5'),
]

# 6. Sidebar.tsx changes
sidebar_replacements = [
    # Sidebar width and margin
    ('w-[80px] hover:w-[260px] m-4 p-5 rounded-[24px]', 'w-[64px] hover:w-[200px] m-2 p-3.5 rounded-[16px]'),
    ('mb-10 px-1 mt-2', 'mb-6 px-1 mt-1'),
    ('w-10 h-10 shrink-0', 'w-8 h-8 shrink-0'),
    ('w-5 h-5 text-white', 'w-4 h-4 text-white'),
    ('text-[18px]', 'text-[14px]'),
    ('px-2.5 py-3 rounded-[16px] text-[16px]', 'px-2.5 py-2.5 rounded-[12px] text-[13px]'),
    ('w-6 h-6 shrink-0', 'w-4.5 h-4.5 shrink-0'),
    ('px-2.5 py-3 w-full rounded-[16px] text-[16px]', 'px-2.5 py-2.5 w-full rounded-[12px] text-[13px]'),
]

# 7. ExportModal.tsx changes
export_replacements = [
    ('text-[15px]', 'text-[12px]'),
    ('text-[16px]', 'text-[13px]'),
    ('rounded-[18px]', 'rounded-xl'),
    ('py-3 px-4', 'py-2 px-3'),
    ('py-3 border', 'py-2 border'),
    ('px-5 py-3 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-black text-[15px]', 'px-4 py-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-black text-[12px]'),
    ('px-6 py-4 border-b', 'px-4 py-3 border-b'),
    ('px-6 py-5 space-y-5', 'px-4 py-3.5 space-y-3.5'),
    ('px-6 py-4 border-t', 'px-4 py-3 border-t'),
]

def main():
    modify_file(os.path.join(FRONTEND_DIR, "app", "editor", "[id]", "page.tsx"), page_replacements)
    modify_file(os.path.join(FRONTEND_DIR, "components", "ChatSidebar.tsx"), chat_replacements)
    modify_file(os.path.join(FRONTEND_DIR, "components", "ReferencesSidebar.tsx"), references_replacements)
    modify_file(os.path.join(FRONTEND_DIR, "components", "VideoTimeline.tsx"), timeline_replacements)
    modify_file(os.path.join(FRONTEND_DIR, "components", "TimelineEditor.tsx"), timeline_editor_replacements)
    modify_file(os.path.join(FRONTEND_DIR, "components", "Sidebar.tsx"), sidebar_replacements)
    modify_file(os.path.join(FRONTEND_DIR, "components", "ExportModal.tsx"), export_replacements)

if __name__ == '__main__':
    main()
