content = open('backend/app/workflows/nodes.py', 'r', encoding='utf-8').read()
lines = content.split('\n')

# Find the last occurrence of 'return {"messages": [response]}' in director_agent_node
target = 'return {"messages": [response]}'
cut_line = None
for i, line in enumerate(lines):
    if target in line:
        cut_line = i  # keep updating, we want the FIRST one (director_agent_node)
        break  # stop at first match

if cut_line is not None:
    new_lines = lines[:cut_line + 1]
    open('backend/app/workflows/nodes.py', 'w', encoding='utf-8').write('\n'.join(new_lines) + '\n')
    print(f'Done. File trimmed to {cut_line + 1} lines.')
else:
    print('Target line not found!')
