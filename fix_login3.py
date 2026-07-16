import os

work = r"C:\Users\清穆\Documents\Codex\2026-07-15\pc-visual-studio-sublime-text-3\work\frontend"

# The exact broken bytes we see:
# onclick="window.location.href="../pages/auth.html">"
# Which is: onclick="window.location.href= "../pages/auth.html">">
# The onclick value is: window.location.href="../pages/auth.html">
# And then there's an extra ">

# What we want:
# onclick="window.location.href='../pages/auth.html'>"

# Let's find the button tag and replace the whole thing
broken = 'onclick="window.location.href="../pages/auth.html">">'
correct = "onclick=\"window.location.href='../pages/auth.html'\">"

for root, dirs, files in os.walk(work):
    for f in files:
        if f.endswith(".html"):
            fp = os.path.join(root, f)
            with open(fp, "r", encoding="utf-8") as fh:
                text = fh.read()
            
            if broken in text:
                text = text.replace(broken, correct)
                with open(fp, "w", encoding="utf-8") as fh:
                    fh.write(text)
                print(f"Fixed: {f}")
            elif "btn-login" in text:
                # Show what's actually there
                idx = text.index("btn-login")
                print(f"{f}: [{text[idx:idx+80]}]")
            else:
                print(f"Skip: {f} (no btn-login)")

print("Done")
