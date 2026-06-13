import re
import os

FILES_TO_UPGRADE = [
    r"C:\Users\User\Desktop\VibeEdit AI\frontend\src\app\editor\[id]\page.tsx",
    r"C:\Users\User\Desktop\VibeEdit AI\frontend\src\components\ChatSidebar.tsx",
    r"C:\Users\User\Desktop\VibeEdit AI\frontend\src\components\ReferencesSidebar.tsx",
    r"C:\Users\User\Desktop\VibeEdit AI\frontend\src\components\VideoTimeline.tsx",
    r"C:\Users\User\Desktop\VibeEdit AI\frontend\src\components\TimelineEditor.tsx",
]

def upgrade_text_size(match):
    size_str = match.group(1)
    try:
        size = int(size_str)
        if size <= 11:
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
    
    # Also fix some specific bg colors in ChatSidebar
    if "ChatSidebar" in file_path:
        content = content.replace('background: "#0D0D12"', 'background: "rgba(20,20,20,0.65)", backdropFilter: "blur(20px)"')
        content = content.replace('rounded-2xl', 'rounded-[24px]')
        
    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(content)

print("Typography and panels upgraded successfully.")
