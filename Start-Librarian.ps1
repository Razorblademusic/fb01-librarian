$ErrorActionPreference = 'Stop'
$listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 0)
$listener.Start()
try {
    $url = "http://127.0.0.1:$($listener.LocalEndpoint.Port)/"
    Write-Host "FB-01 Librarian: $url"
    Write-Host 'Leave this window open. Copy the address into Edge or Chrome if needed.'
    Start-Process $url
    $files = @{
        '/' = @('index.html', 'text/html; charset=utf-8')
        '/bank.js' = @('bank.js', 'text/javascript; charset=utf-8')
        '/app.js' = @('app.js', 'text/javascript; charset=utf-8')
    }
    while ($true) {
        $client = $listener.AcceptTcpClient()
        try {
            $client.ReceiveTimeout = 2500
            $stream = $client.GetStream()
            $reader = [IO.StreamReader]::new($stream)
            $request = $reader.ReadLine()
            if ($request -match '^GET (/[^ ]*) HTTP/1\.[01]$' -and $files.ContainsKey($Matches[1])) {
                $file = $files[$Matches[1]]
                $bytes = [IO.File]::ReadAllBytes((Join-Path $PSScriptRoot $file[0]))
                $header = "HTTP/1.1 200 OK`r`nContent-Type: $($file[1])`r`nContent-Length: $($bytes.Length)`r`nConnection: close`r`n`r`n"
            } else {
                $bytes = [byte[]]@()
                $header = "HTTP/1.1 404 Not Found`r`nContent-Length: 0`r`nConnection: close`r`n`r`n"
            }
            $response = [Text.Encoding]::ASCII.GetBytes($header)
            $stream.Write($response, 0, $response.Length)
            $stream.Write($bytes, 0, $bytes.Length)
        } catch [IO.IOException] {
            # The browser may close idle or speculative connections.
        } finally {
            $client.Dispose()
        }
    }
} finally {
    $listener.Stop()
}
