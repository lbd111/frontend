import os, re

work = r"C:\Users\清穆\Documents\Codex\2026-07-15\pc-visual-studio-sublime-text-3\work\frontend"

# Pattern: find <button class="btn-login" ...> and replace the onclick
# The broken pattern is: onclick="window.location.href="../pages/auth.html">"
# We need to replace the entire button's onclick attribute

pattern = r'(class="btn-login")[^>]*(>)'
replacement = r'\1 onclick="window.location.href=\'../pages/auth.html\'"\2'

for root, dirs, files in os.walk(os.path.join(work, "pages")):
    for f in files:
        if f.endswith(".html"):
            fp = os.path.join(root, f)
            with open(fp, "r", encoding="utf-8") as fh:
                text = fh.read()
            
            # Replace the broken onclick
            text = re.sub(
                r'onclick="window\.location\.href\.\./pages/auth\.html[^"]*"',
                "onclick=\"window.location.href='../pages/auth.html'\"",
                text
            )
            
            with open(fp, "w", encoding="utf-8") as fh:
                fh.write(text)
            
            print(f"Fixed: {f}")

# Also fix index.html
fp = os.path.join(work, "index.html")
with open(fp, "r", encoding="utf-8") as fh:
    text = fh.read()

text = re.sub(
    r'onclick="window\.location\.href\.\./pages/auth\.html[^"]*"',
    "onclick=\"window.location.href='../pages/auth.html'\"",
    text
)

with open(fp, "w", encoding="utf-8") as fh:
    fh.write(text)
print("Fixed: index.html")
