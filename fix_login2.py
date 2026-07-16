import os

work = r"C:\Users\??\Documents\Codex\2026-07-15\pc-visual-studio-sublime-text-3\work\frontend"

# The broken pattern in bytes:
# onclick="window.location.href="../pages/auth.html">"
# We need to replace with:
# onclick="window.location.href='../pages/auth.html'>"

broken = b'onclick="window.location.href="../pages/auth.html">">'
# Note: the >"> at the end means the onclick value ends at the first ">
# and there's an extra "> after

# Actually let's find and replace the whole button
# The pattern is: <button class="btn-login" onclick="window.location.href="../pages/auth.html">">?? / ??</button>
# Should be: <button class="btn-login" onclick="window.location.href='../pages/auth.html'">?? / ??</button>

target = b'onclick="window.location.href="../pages/auth.html">">'
correct = b"onclick=\"window.location.href='../pages/auth.html'\">"

for root, dirs, files in os.walk(work):
    for f in files:
        if f.endswith(".html"):
            fp = os.path.join(root, f)
            with open(fp, "rb") as fh:
                data = fh.read()
            
            if target in data:
                data = data.replace(target, correct)
                with open(fp, "wb") as fh:
                    fh.write(data)
                print(f"Fixed: {f}")
            else:
                # Check what's actually there
                idx = data.find(b'btn-login')
                if idx >= 0:
                    snap = data[idx:idx+80]
                    print(f"{f}: {snap}")
                else:
                    print(f"Skipped (no btn-login): {f}")

print("Done")
