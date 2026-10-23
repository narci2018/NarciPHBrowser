import re

with open(r'apps\desktop\src\lib\matrix-publisher.ts', 'r', encoding='utf-8') as f:
    text = f.read()

# Remove from Xiaohongshu
pat_xhs = r'(\s+action: "click",\s+name: "切换至小红书【上传视频】标签页",[\s\S]*?optional: true,\s+\}\);\s+\}) else if \(payload\.platformId === "tiktok"\) \{[\s\S]*?\}\s+\} else \{'
rep_xhs = r'\1 else {'
text, n1 = re.subn(pat_xhs, rep_xhs, text)
print(f"XHS replaced: {n1}")

# Remove from Kuaishou
pat_ks = r'(\s+action: "click",\s+name: "切换至快手【上传视频】标签页",[\s\S]*?optional: true,\s+\}\);\s+\}) else if \(payload\.platformId === "tiktok"\) \{[\s\S]*?\}\s+\} else \{'
rep_ks = r'\1 else {'
text, n2 = re.subn(pat_ks, rep_ks, text)
print(f"KS replaced: {n2}")

# Remove from Weixin
pat_wx = r'(\s+action: "click",\s+name: "视频号发表兜底确认 \(直接发表\)",[\s\S]*?optional: true,\s+\}\);\s+\}) else if \(payload\.platformId === "tiktok"\) \{[\s\S]*?\}\s+\} else \{'
rep_wx = r'\1 else {'
text, n3 = re.subn(pat_wx, rep_wx, text)
print(f"WX replaced: {n3}")

with open(r'apps\desktop\src\lib\matrix-publisher.ts', 'w', encoding='utf-8') as f:
    f.write(text)

print("matrix-publisher.ts cleaned up successfully!")
