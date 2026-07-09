Add-Type -AssemblyName System.Windows.Forms

[Console]::Out.WriteLine("READY")
[Console]::Out.Flush()

while ($line = [Console]::ReadLine()) {
    if ($null -eq $line) { break }
    try {
        if ($line.StartsWith("MOVE ")) {
            $parts = $line.Substring(5).Split(" ")
            $x = [int]$parts[0]
            $y = [int]$parts[1]
            [Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point($x, $y)
        }
    } catch {
        # Silently ignore to avoid clogging logs
    }
}
