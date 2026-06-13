import re
import os

FILES_TO_UPGRADE = [
    r"C:\Users\User\Desktop\VibeEdit AI\frontend\src\components\ChatSidebar.tsx",
    r"C:\Users\User\Desktop\VibeEdit AI\frontend\src\components\TimelineEditor.tsx",
    r"C:\Users\User\Desktop\VibeEdit AI\frontend\src\components\ReferencesSidebar.tsx",
    r"C:\Users\User\Desktop\VibeEdit AI\frontend\src\components\ExportModal.tsx",
    r"C:\Users\User\Desktop\VibeEdit AI\frontend\src\components\VideoTimeline.tsx"
]

def upgrade_text_size(match):
    size_str = match.group(1)
    try:
        size = int(size_str)
        if size == 13:
            return "text-[15px]"
        elif size == 14:
            return "text-[16px]"
        elif size == 15:
            return "text-[17px]"
        elif size == 16:
            return "text-[18px]"
        return match.group(0)
    except:
        return match.group(0)

for file_path in FILES_TO_UPGRADE:
    if not os.path.exists(file_path):
        print(f"Skipping {file_path}")
        continue
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()

    # Upgrade fonts
    content = re.sub(r"text-\[(\d+)px\]", upgrade_text_size, content)
    
    # Remove hard borders and replace with soft borders / glassmorphism
    # E.g., border-neutral-200 dark:border-neutral-800 -> border-white/20 dark:border-white/10
    content = content.replace('border-neutral-200 dark:border-neutral-800', 'border-black/5 dark:border-white/5')
    content = content.replace('border-neutral-300 dark:border-neutral-700', 'border-black/10 dark:border-white/10')
    
    # Increase some padding to add "air"
    content = content.replace('p-4', 'p-6')
    content = content.replace('px-3', 'px-4')
    content = content.replace('py-2', 'py-3')

    # Apply glassmorphism backgrounds where appropriate
    content = content.replace('bg-white dark:bg-neutral-900', 'bg-white/80 dark:bg-neutral-900/80 backdrop-blur-xl')
    content = content.replace('bg-neutral-50 dark:bg-neutral-950', 'bg-neutral-50/50 dark:bg-neutral-950/50')

    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(content)

print("Files upgraded to Pro Editor Layout successfully.")
