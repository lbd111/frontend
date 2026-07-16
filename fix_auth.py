import os

work = r"C:\Users\清穆\Documents\Codex\2026-07-15\pc-visual-studio-sublime-text-3\work\frontend\pages"
fp = os.path.join(work, "auth.html")

with open(fp, "r", encoding="utf-8") as f:
    text = f.read()

# Remove the entire "其他登录方式" section:
# from "其他登录方式</div>" to the closing "</div>" of social-logins
# Pattern: <div class="form-divider">其他登录方式</div>\n<div class="social-logins">...</div>
import re

# Remove "其他登录方式" divider and social-logins div block
pattern = r'<div class="form-divider">其他登录方式</div>\s*<div class="social-logins">\s*<button[^>]*>QQ登录</button>\s*<button[^>]*>微信登录</button>\s*</div>'
text = re.sub(pattern, '', text)

with open(fp, "w", encoding="utf-8") as f:
    f.write(text)

print("Removed social login section from auth.html")
