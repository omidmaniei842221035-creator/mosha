param(
  [ValidateRange(1024, 65535)]
  [int]$Port = 8766
)

$ErrorActionPreference = 'Stop'
$root = [System.IO.Path]::GetFullPath($PSScriptRoot).TrimEnd([System.IO.Path]::DirectorySeparatorChar)
$rootPrefix = $root + [System.IO.Path]::DirectorySeparatorChar
$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $Port)
$mimeTypes = @{
  '.html' = 'text/html; charset=utf-8'
  '.htm' = 'text/html; charset=utf-8'
  '.css' = 'text/css; charset=utf-8'
  '.js' = 'text/javascript; charset=utf-8'
  '.mjs' = 'text/javascript; charset=utf-8'
  '.json' = 'application/json; charset=utf-8'
  '.webmanifest' = 'application/manifest+json; charset=utf-8'
  '.wasm' = 'application/wasm'
  '.svg' = 'image/svg+xml'
  '.png' = 'image/png'
  '.jpg' = 'image/jpeg'
  '.jpeg' = 'image/jpeg'
  '.pdf' = 'application/pdf'
  '.txt' = 'text/plain; charset=utf-8'
  '.woff2' = 'font/woff2'
  '.wav' = 'audio/wav'
  '.mp3' = 'audio/mpeg'
  '.ogg' = 'audio/ogg'
  '.opus' = 'audio/ogg'
  '.m4a' = 'audio/mp4'
  '.aac' = 'audio/aac'
  '.webp' = 'image/webp'
}

function Send-HttpResponse($Stream, [int]$Status, [string]$Reason, [string]$ContentType, [byte[]]$Body, [bool]$IncludeBody) {
  $header = "HTTP/1.1 $Status $Reason`r`nContent-Type: $ContentType`r`nContent-Length: $($Body.Length)`r`nCache-Control: no-cache`r`nX-Content-Type-Options: nosniff`r`nConnection: close`r`n`r`n"
  $headerBytes = [System.Text.Encoding]::ASCII.GetBytes($header)
  $Stream.Write($headerBytes, 0, $headerBytes.Length)
  if ($IncludeBody -and $Body.Length -gt 0) {
    $Stream.Write($Body, 0, $Body.Length)
  }
  $Stream.Flush()
}

try {
  $listener.Start()
  Write-Host "Local offline app server listening on http://127.0.0.1:$Port/"
  while ($true) {
    $client = $listener.AcceptTcpClient()
    try {
      $client.NoDelay = $true
      $stream = $client.GetStream()
      $reader = [System.IO.StreamReader]::new($stream, [System.Text.Encoding]::ASCII, $false, 4096, $true)
      $requestLine = $reader.ReadLine()
      if ([string]::IsNullOrWhiteSpace($requestLine)) { continue }

      $parts = @($requestLine -split '\s+', 3)
      while ($true) {
        $headerLine = $reader.ReadLine()
        if ($null -eq $headerLine -or $headerLine.Length -eq 0) { break }
      }
      if ($parts.Length -lt 2) {
        $body = [System.Text.Encoding]::UTF8.GetBytes('Bad Request')
        Send-HttpResponse $stream 400 'Bad Request' 'text/plain; charset=utf-8' $body ($parts[0] -ne 'HEAD')
        continue
      }

      $method = $parts[0].ToUpperInvariant()
      if ($method -ne 'GET' -and $method -ne 'HEAD') {
        $body = [System.Text.Encoding]::UTF8.GetBytes('Method Not Allowed')
        Send-HttpResponse $stream 405 'Method Not Allowed' 'text/plain; charset=utf-8' $body $false
        continue
      }

      $pathPart = ($parts[1] -split '\?', 2)[0]
      try { $relative = [System.Uri]::UnescapeDataString($pathPart).Replace('/', [System.IO.Path]::DirectorySeparatorChar) }
      catch { $relative = '' }
      $relative = $relative.TrimStart([System.IO.Path]::DirectorySeparatorChar)
      if ([string]::IsNullOrWhiteSpace($relative)) { $relative = 'index.html' }
      if ($relative.Contains(':') -or $relative -match '(^|[\\/])\.') {
        $relative = '__not_found__'
      }

      try { $filePath = [System.IO.Path]::GetFullPath((Join-Path $root $relative)) }
      catch { $filePath = '' }
      if (-not $filePath.StartsWith($rootPrefix, [System.StringComparison]::OrdinalIgnoreCase) -or -not [System.IO.File]::Exists($filePath)) {
        $body = [System.Text.Encoding]::UTF8.GetBytes('Not Found')
        Send-HttpResponse $stream 404 'Not Found' 'text/plain; charset=utf-8' $body ($method -eq 'GET')
        continue
      }

      $contentType = $mimeTypes[[System.IO.Path]::GetExtension($filePath).ToLowerInvariant()]
      if ([string]::IsNullOrWhiteSpace($contentType)) { $contentType = 'application/octet-stream' }
      $body = [System.IO.File]::ReadAllBytes($filePath)
      Send-HttpResponse $stream 200 'OK' $contentType $body ($method -eq 'GET')
    } catch {
      # A client may close the connection while a large local asset is being sent.
    } finally {
      $client.Close()
    }
  }
} finally {
  $listener.Stop()
}
