import re
import os

FILES_TO_UPGRADE = [
    r"C:\Users\User\Desktop\VibeEdit AI\frontend\src\components\ExportModal.tsx"
]

def upgrade_text_size(match):
    size_str = match.group(1)
    try:
        size = int(size_str)
        if size <= 12:
            return "text-[15px]"
        elif size <= 14:
            return "text-[16px]"
        else:
            return f"text-[{size}px]"
    except:
        return match.group(0)

for file_path in FILES_TO_UPGRADE:
    if not os.path.exists(file_path):
        continue
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()

    # Upgrade text-[Xpx]
    content = re.sub(r"text-\[(\d+)px\]", upgrade_text_size, content)
    
    # Update rounded-none to rounded-[18px]
    content = content.replace('rounded-none', 'rounded-[18px]')
    
    # Update bg colors
    content = content.replace('bg-[#08080a]', 'bg-neutral-900')
    content = content.replace('bg-[#09090b]', 'bg-neutral-950')
    content = content.replace('bg-[#0c0c0e]', 'bg-neutral-800')
    
    # font-mono to font-sans
    content = content.replace('font-mono', 'font-sans')
        
    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(content)

print("ExportModal upgraded successfully.")
