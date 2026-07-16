param([string]$file)
$text = [System.IO.File]::ReadAllText($file, [System.Text.Encoding]::UTF8)
$idx = $text.IndexOf('btn-login')
if ($idx -ge 0) {
    $onclickStart = $text.IndexOf('onclick=', $idx)
    $rest = $text.Substring($onclickStart)
    $lastQuote = $rest.LastIndexOf('">')
    if ($lastQuote -gt 0) {
        $onclickEnd = $onclickStart + $lastQuote + 2
        $before = $text.Substring(0, $onclickStart)
        $after = $text.Substring($onclickEnd)
        # Build the onclick attribute character by character to avoid any escaping
        $onclick = [char[]]@(
            'o','n','c','l','i','c','k','=','"',
            'w','i','n','d','o','w','.','l','o','c','a','t','i','o','n','.','h','r','e','f','=','"',
            '.', '.','/','p','a','g','e','s','/','a','u','t','h','.','h','t','m','l',
            '"', '>'
        ) -join ''
        $text = $before + $onclick + $after
        [System.IO.File]::WriteAllText($file, $text, [System.Text.Encoding]::UTF8)
        Write-Host "Fixed: $file"
    }
}
