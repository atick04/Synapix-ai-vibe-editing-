import re
import os

FILES_TO_UPGRADE = [
    r"C:\Users\User\Desktop\VibeEdit AI\frontend\src\app\editor\[id]\page.tsx",
    r"C:\Users\User\Desktop\VibeEdit AI\frontend\src\components\ChatSidebar.tsx",
    r"C:\Users\User\Desktop\VibeEdit AI\frontend\src\components\TimelineEditor.tsx",
    r"C:\Users\User\Desktop\VibeEdit AI\frontend\src\components\ReferencesSidebar.tsx",
    r"C:\Users\User\Desktop\VibeEdit AI\frontend\src\components\ExportModal.tsx"
]

def revert_text_size(match):
    size_str = match.group(1)
    try:
        size = int(size_str)
        # Revert large typography
        if size >= 18:
            return "text-[16px]"
        elif size >= 16:
            return "text-[14px]"
        elif size == 15:
            return "text-[13px]"
        return match.group(0)
    except:
        return match.group(0)

for file_path in FILES_TO_UPGRADE:
    if not os.path.exists(file_path):
        continue
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()

    # Revert large fonts
    content = re.sub(r"text-\[(\d+)px\]", revert_text_size, content)
    
    # Common theme adjustments (adding dark mode fallbacks)
    # Backgrounds
    content = content.replace('bg-neutral-900', 'bg-white dark:bg-neutral-900')
    content = content.replace('bg-neutral-950', 'bg-neutral-50 dark:bg-neutral-950')
    content = content.replace('bg-neutral-800', 'bg-neutral-100 dark:bg-neutral-800')
    
    # Texts
    content = content.replace('text-neutral-200', 'text-neutral-800 dark:text-neutral-200')
    content = content.replace('text-neutral-300', 'text-neutral-700 dark:text-neutral-300')
    content = content.replace('text-neutral-400', 'text-neutral-600 dark:text-neutral-400')
    
    # Borders
    content = content.replace('border-neutral-800', 'border-neutral-200 dark:border-neutral-800')
    content = content.replace('border-neutral-700', 'border-neutral-300 dark:border-neutral-700')

    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(content)

print("Files normalized successfully.")
