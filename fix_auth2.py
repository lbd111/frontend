import os

work = r"C:\Users\清穆\Documents\Codex\2026-07-15\pc-visual-studio-sublime-text-3\work\frontend\pages"
fp = os.path.join(work, "auth.html")

with open(fp, "r", encoding="utf-8") as f:
    text = f.read()

# Exact string to remove:
# <div class="form-divider">其他登录方式</div>\n<div class="social-logins">\n...\n</div>
old_section = '''<div class="form-divider">其他登录方式</div>
<div class="social-logins">
<button type="button" class="btn-social btn-qq"><i class="fab fa-qq"></i> QQ登录</button>
<button type="button" class="btn-social btn-wechat"><i class="fab fa-weixin"></i> 微信登录</button>
</div>'''

if old_section in text:
    text = text.replace(old_section, '')
    print("Section found and removed!")
else:
    print("Section NOT found exactly, searching...")
    # Find partial matches
    idx1 = text.find('其他登录方式')
    idx2 = text.find('微信登录')
    print(f"其他登录方式 at: {idx1}")
    print(f"微信登录 at: {idx2}")
    if idx1 >= 0 and idx2 >= 0:
        # Extract the exact text between them
        extracted = text[idx1:idx2+20]
        print(f"Extracted: [{extracted}]")

with open(fp, "w", encoding="utf-8") as f:
    f.write(text)

# Verify
with open(fp, "r", encoding="utf-8") as f:
    final = f.read()
print(f"Has QQ登录: {'QQ登录' in final}")
print(f"Has 微信登录: {'微信登录' in final}")
