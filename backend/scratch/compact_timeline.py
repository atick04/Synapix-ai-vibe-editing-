import re
import os

filepath = r"C:\Users\User\Desktop\VibeEdit AI\frontend\src\components\VideoTimeline.tsx"

with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Update track headers to be h-10 (40px) or h-11 (44px). Let's use h-11 for comfortable click targets.
# Replace `h-16 border-b border-[color] bg-[#0d0e12] flex flex-col justify-between p-2.5 uppercase`
# With `h-11 border-b border-black/5 dark:border-white/5 bg-transparent flex flex-row items-center justify-between px-3 py-0 uppercase`

def update_track_header(match):
    color_border = match.group(1)
    return f"h-11 border-b border-black/5 dark:border-white/5 bg-transparent flex flex-row items-center justify-between px-3 uppercase"

content = re.sub(r"h-16 border-b border-([a-z0-9/-]+) bg-\[#0d0e12\] flex flex-col justify-between p-2\.5 uppercase", update_track_header, content)

# 2. Update font sizes in tracks from text-[17px] to text-[13px]
# E.g. text-[17px] inside track headers
# Let's target specifically the span tags inside track headers
# Actually, a global replace of text-[17px] to text-[13px] in the specific section (lines 1300-1450) is safer.
# We'll just replace text-[17px] with text-[13px] globally in the timeline UI area for labels.
content = content.replace('text-[17px]', 'text-[13px]')

# 3. Fix the layout of the track headers (they are flex-col, changed to flex-row in regex, but we need to remove the internal flex wrapper)
# We had:
# <div className="flex items-center justify-between">
#     <span className="px-1.5 py-0.5 bg-blue-950/80 text-blue-400 border border-blue-900/60 rounded font-bold text-[13px]">T1</span>
#     <span className="text-[13px] text-zinc-400 font-semibold tracking-wider">text t1</span>
# </div>
# <div className="flex items-center justify-between mt-1 opacity-50 group-hover/track:opacity-100 transition-opacity">
#
# Let's refine the script to use a more precise string replacement.

# Let's revert and do precise multi-line replacements.
with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

tracks = [
    ('T1', 'text t1', 'blue', 't1', 'Add Custom Subtitle/Text'),
    ('V2', 'b-roll v2', 'cyan', 'v2', 'Add Stock B-Roll Video'),
    ('M1', 'music m1', 'emerald', 'm1', 'Add Background Music'),
    ('SFX', 'sfx', 'amber', 'sfx', 'Add Sound Effect'),
    ('G1', 'graphics g1', 'fuchsia', 'g1', 'Add Motion Graphic'),
    ('V1', 'video v1', 'zinc', None, None),
    ('A1', 'audio a1', 'teal', None, None),
]

for t_id, t_label, t_color, t_add_track, t_add_title in tracks:
    # Find the block for this track header
    # It starts with: {/* T1 Track Header */}
    
    if t_add_track:
        old_block_pattern = re.compile(rf"\{{/\* {t_id} Track Header \*/\}}\s*<div className=\"h-16 border-b border-[a-z0-9/.-]+ bg-\[#0d0e12\] flex flex-col justify-between p-2\.5 uppercase hover:bg-[a-z0-9/.-]+ select-none group/track transition-all\">\s*<div className=\"flex items-center justify-between\">\s*<span className=\"px-1\.5 py-0\.5 bg-[a-z0-9/.-]+ text-[a-z0-9/-]+ border border-[a-z0-9/.-]+ rounded font-bold text-\[\d+px\]\">{t_id}</span>\s*<span className=\"text-\[\d+px\] text-[a-z0-9/-]+ font-semibold tracking-wider\">{t_label}</span>\s*</div>\s*<div className=\"flex items-center justify-between mt-1 opacity-50 group-hover/track:opacity-100 transition-opacity\">\s*<div className=\"flex items-center gap-1\.5\">\s*<button className=\"text-\[\d+px\] hover:text-white cursor-pointer\" title=\"Toggle visibility\">👁</button>\s*<button className=\"text-\[\d+px\] hover:text-white cursor-pointer\" title=\"Mute track\">🔊</button>\s*</div>\s*<button\s*onClick={{[\s\S]*?}}\s*className=\"[\s\S]*?\"\s*title=\"{t_add_title}\"\s*>\s*\+\s*</button>\s*</div>\s*</div>", re.MULTILINE)
        
        new_block = f"""{{/* {t_id} Track Header */}}
                    <div className="h-10 border-b border-black/5 dark:border-white/5 bg-transparent flex flex-row items-center justify-between px-3 uppercase hover:bg-black/5 dark:hover:bg-white/5 select-none group/track transition-all">
                        <div className="flex items-center gap-2">
                            <span className="px-1.5 py-0.5 bg-{t_color}-500/10 text-{t_color}-500 rounded font-bold text-[11px]">{t_id}</span>
                            <span className="text-[12px] text-neutral-500 dark:text-neutral-400 font-medium tracking-wider">{t_label}</span>
                        </div>
                        <div className="flex items-center gap-2 opacity-0 group-hover/track:opacity-100 transition-opacity">
                            <button className="text-[12px] text-neutral-400 hover:text-neutral-800 dark:hover:text-neutral-200 cursor-pointer" title="Toggle visibility">👁</button>
                            <button className="text-[12px] text-neutral-400 hover:text-neutral-800 dark:hover:text-neutral-200 cursor-pointer" title="Mute track">🔊</button>
                            <button 
                                onClick={{(ev) => {{ ev.stopPropagation(); handleAddClip('{t_add_track}'); }}}}
                                className="w-5 h-5 bg-white dark:bg-neutral-800 border border-black/10 dark:border-white/10 hover:border-black/20 dark:hover:border-white/20 hover:text-{t_color}-500 flex items-center justify-center cursor-pointer transition-all rounded-md font-bold text-[14px]"
                                title="{t_add_title}"
                            >
                                +
                            </button>
                        </div>
                    </div>"""
    else:
        old_block_pattern = re.compile(rf"\{{/\* {t_id} Track Header \*/\}}\s*<div className=\"h-16 border-b border-[a-z0-9/.-]+ bg-\[#0d0e12\] flex flex-col justify-between p-2\.5 uppercase hover:bg-[a-z0-9/.-]+ select-none group/track transition-all\">\s*<div className=\"flex items-center justify-between\">\s*<span className=\"px-1\.5 py-0\.5 bg-[a-z0-9/.-]+ text-[a-z0-9/-]+ border border-[a-z0-9/.-]+ rounded font-bold text-\[\d+px\]\">{t_id}</span>\s*<span className=\"text-\[\d+px\] text-[a-z0-9/-]+ font-semibold tracking-wider\">{t_label}</span>\s*</div>\s*<div className=\"flex items-center gap-1\.5 mt-1 opacity-50 group-hover/track:opacity-100 transition-opacity\">\s*<button className=\"text-\[\d+px\] hover:text-white cursor-pointer\" title=\"Toggle visibility\">👁</button>\s*<button className=\"text-\[\d+px\] hover:text-white cursor-pointer\" title=\"Mute track\">🔊</button>\s*</div>\s*</div>", re.MULTILINE)

        new_block = f"""{{/* {t_id} Track Header */}}
                    <div className="h-10 border-b border-black/5 dark:border-white/5 bg-transparent flex flex-row items-center justify-between px-3 uppercase hover:bg-black/5 dark:hover:bg-white/5 select-none group/track transition-all">
                        <div className="flex items-center gap-2">
                            <span className="px-1.5 py-0.5 bg-{t_color}-500/10 text-{t_color}-500 rounded font-bold text-[11px]">{t_id}</span>
                            <span className="text-[12px] text-neutral-500 dark:text-neutral-400 font-medium tracking-wider">{t_label}</span>
                        </div>
                        <div className="flex items-center gap-2 opacity-0 group-hover/track:opacity-100 transition-opacity">
                            <button className="text-[12px] text-neutral-400 hover:text-neutral-800 dark:hover:text-neutral-200 cursor-pointer" title="Toggle visibility">👁</button>
                            <button className="text-[12px] text-neutral-400 hover:text-neutral-800 dark:hover:text-neutral-200 cursor-pointer" title="Mute track">🔊</button>
                        </div>
                    </div>"""
    
    content = old_block_pattern.sub(new_block, content)

# 4. Now update the track rows (the right side)
# We need to change the height of the right side rows to match h-10 (40px)
content = content.replace('className="h-16 relative border-b border-blue-950/20 group/track"', 'className="h-10 relative border-b border-black/5 dark:border-white/5 group/track"')
content = content.replace('className="h-16 relative border-b border-cyan-950/20 group/track"', 'className="h-10 relative border-b border-black/5 dark:border-white/5 group/track"')
content = content.replace('className="h-16 relative border-b border-emerald-950/20 group/track"', 'className="h-10 relative border-b border-black/5 dark:border-white/5 group/track"')
content = content.replace('className="h-16 relative border-b border-amber-950/20 group/track"', 'className="h-10 relative border-b border-black/5 dark:border-white/5 group/track"')
content = content.replace('className="h-16 relative border-b border-fuchsia-950/20 group/track"', 'className="h-10 relative border-b border-black/5 dark:border-white/5 group/track"')
content = content.replace('className="h-16 relative border-b border-zinc-800/20"', 'className="h-10 relative border-b border-black/5 dark:border-white/5 group/track"')
content = content.replace('className="h-16 relative border-b border-teal-950/20 group/track"', 'className="h-10 relative border-b border-black/5 dark:border-white/5 group/track"')

# 5. Make the overall timeline layout soft and rounded
# In VideoTimeline.tsx root div
# `border-blue-500/40 shadow-[0_0_20px_rgba(59,130,246,0.15)] ring-1 ring-blue-500/25' : 'border-border'` -> change to softer
content = content.replace("border rounded-none select-none font-mono transition-all duration-300", "rounded-2xl select-none font-mono transition-all duration-300 shadow-sm border border-black/5 dark:border-white/10 bg-white/40 dark:bg-neutral-900/40 backdrop-blur-xl")
content = content.replace("'border-border'", "''")

# 6. Change top toolbar of timeline
content = content.replace('bg-background border-b border-border h-10', 'border-b border-black/5 dark:border-white/10 h-10')

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)

print("Timeline tracks compacted successfully.")
