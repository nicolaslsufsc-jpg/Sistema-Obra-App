# Abre o Sistema Obra num PC sem nada instalado: entrega os arquivos desta pasta ao navegador do
# próprio PC (localhost). Ninguém de fora alcança. Não instala nada e não altera o Windows.
#   -Site app       o Sistema Obra. Com a pasta dados_obra (ou o dados_*.zip) ao lado, abre direto na
#                   obra, sem login (modo sem conta); sem ela, pede o login por e-mail.
#   -Site bancada   só a bancada da FVS (o pacote antigo), com os mesmos dados.
param(
  [ValidateSet('bancada', 'app')][string]$Site = 'bancada',
  [int]$Porta = 0,
  [switch]$SemAbrir
)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
try { [Console]::OutputEncoding = [Text.Encoding]::UTF8 } catch { }

# sempre caminho literal: nome de pasta com colchete não pode virar curinga
$aqui = $PSScriptRoot
$raiz = [IO.Path]::GetFullPath([IO.Path]::Combine($aqui, "site_$Site"))
$tipos = @{
  '.html' = 'text/html; charset=utf-8'; '.js' = 'text/javascript; charset=utf-8'; '.mjs' = 'text/javascript; charset=utf-8'
  '.css' = 'text/css; charset=utf-8'; '.json' = 'application/json; charset=utf-8'; '.webmanifest' = 'application/manifest+json'
  '.svg' = 'image/svg+xml'; '.png' = 'image/png'; '.webp' = 'image/webp'; '.ico' = 'image/x-icon'
  '.bin' = 'application/octet-stream'; '.txt' = 'text/plain; charset=utf-8'
  # o leitor de IFC: sem o tipo certo o navegador compila o WebAssembly pelo caminho lento
  '.wasm' = 'application/wasm'; '.ifc' = 'application/octet-stream'
}

function Achar-Dados {
  $achado = Get-ChildItem -LiteralPath $aqui -Filter 'indice.json' -Recurse -Depth 3 -File -ErrorAction SilentlyContinue |
    Where-Object { $_.FullName.Substring($aqui.Length) -notlike '*\site_*' } | Select-Object -First 1
  if ($achado) { return $achado.DirectoryName }
  return $null
}

function Extrair-Zip([string]$arquivo) {
  # não usa Expand-Archive: ele recusa pasta com colchete no nome
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $z = [IO.Compression.ZipFile]::OpenRead($arquivo)
  try {
    foreach ($e in $z.Entries) {
      if (-not $e.Name) { continue }
      $destino = [IO.Path]::GetFullPath([IO.Path]::Combine($aqui, $e.FullName.Replace('/', '\')))
      if (-not $destino.StartsWith($aqui.TrimEnd('\') + '\', [StringComparison]::OrdinalIgnoreCase)) { throw "Caminho fora da pasta dentro do zip: $($e.FullName)" }
      [void][IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($destino))
      [IO.Compression.ZipFileExtensions]::ExtractToFile($e, $destino, $true)
    }
  } finally {
    $z.Dispose()
  }
}

function Preparar-Dados {
  $dados = Achar-Dados
  if ($dados) { return $dados }
  $zip = Get-ChildItem -LiteralPath $aqui -Filter 'dados_*.zip' -File -ErrorAction SilentlyContinue | Select-Object -First 1
  if (-not $zip) { return $null }
  Write-Host "Extraindo $($zip.Name) (só na primeira vez, leva até um minuto). Não feche esta janela..."
  Extrair-Zip $zip.FullName
  return Achar-Dados
}

function Abrir-Listener([int]$p) {
  $l = New-Object System.Net.HttpListener
  # só localhost: fora deste PC ninguém alcança, e não precisa de administrador
  $l.Prefixes.Add("http://localhost:$p/")
  $l.Start()
  return $l
}

function Ja-Aberto([int]$p) {
  try {
    $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 -Uri "http://localhost:$p/__sistema_obra__"
    return ($r.Content -eq $Site)
  } catch { return $false }
}

function Texto($res, [int]$codigo, [string]$corpo) {
  $bytes = [Text.Encoding]::UTF8.GetBytes($corpo)
  $res.StatusCode = $codigo
  $res.ContentType = 'text/plain; charset=utf-8'
  $res.ContentLength64 = $bytes.Length
  $res.OutputStream.Write($bytes, 0, $bytes.Length)
  $res.Close()
}

function Responder($ctx, [string]$dados, [string]$inicio) {
  $req = $ctx.Request
  $res = $ctx.Response
  $res.Headers['Cache-Control'] = 'no-store'
  if ($req.HttpMethod -ne 'GET' -and $req.HttpMethod -ne 'HEAD') { Texto $res 405 'Só leitura.'; return }
  $caminho = [Uri]::UnescapeDataString($req.Url.AbsolutePath)
  if ($caminho -eq '/__sistema_obra__') { Texto $res 200 $Site; return }
  if ($caminho -eq '/') {
    if ($Site -eq 'bancada') { $res.Redirect($inicio); $res.Close(); return }
    $caminho = '/index.html'
  }
  if ($dados -and $caminho.StartsWith('/dados_obra/')) {
    $base = $dados
    $rel = $caminho.Substring('/dados_obra/'.Length)
  } else {
    $base = $raiz
    $rel = $caminho.TrimStart('/')
  }
  $arquivo = [IO.Path]::GetFullPath([IO.Path]::Combine($base, $rel.Replace('/', '\')))
  # nada fora da pasta do site e da pasta dos dados
  if (-not $arquivo.StartsWith($base.TrimEnd('\') + '\', [StringComparison]::OrdinalIgnoreCase)) { Texto $res 403 'Fora da pasta.'; return }
  if (-not [IO.File]::Exists($arquivo)) { Texto $res 404 'Não encontrado.'; return }
  $tipo = $tipos[[IO.Path]::GetExtension($arquivo).ToLowerInvariant()]
  if (-not $tipo) { $tipo = 'application/octet-stream' }
  $res.ContentType = $tipo
  $fs = [IO.File]::OpenRead($arquivo)
  try {
    $res.ContentLength64 = $fs.Length
    if ($req.HttpMethod -eq 'GET') { $fs.CopyTo($res.OutputStream) }
  } finally {
    $fs.Dispose()
  }
  $res.Close()
}

try {
  if (-not (Test-Path -LiteralPath $raiz)) { throw "Não achei a pasta site_$Site ao lado deste arquivo. Extraia o zip inteiro antes de abrir." }
  # porta fixa: o que você marca fica guardado no navegador por endereço, e o endereço não pode mudar
  if ($Porta -eq 0) { if ($Site -eq 'bancada') { $Porta = 8771 } else { $Porta = 8770 } }

  # os dois sites leem a mesma pasta de dados (/dados_obra/ no navegador)
  $dados = Preparar-Dados
  if ($Site -eq 'app') { $caminhoInicial = '/' }
  elseif ($dados) { $caminhoInicial = '/dev/fvs.html?pasta=/dados_obra/' }
  else { $caminhoInicial = '/dev/fvs.html?abrir=0' }

  $listener = $null
  try {
    $listener = Abrir-Listener $Porta
  } catch {
    if (Ja-Aberto $Porta) {
      Write-Host 'Já estava aberto em outra janela. Abrindo no navegador.'
      if (-not $SemAbrir) { Start-Process "http://localhost:$Porta$caminhoInicial" }
      exit 0
    }
    # a porta está com outro programa
    foreach ($p in ($Porta + 10), ($Porta + 20), ($Porta + 30)) {
      try { $listener = Abrir-Listener $p; $Porta = $p; break } catch { }
    }
    if (-not $listener) { throw }
  }

  $url = "http://localhost:$Porta$caminhoInicial"
  Write-Host ''
  Write-Host '  Sistema Obra aberto no navegador. DEIXE ESTA JANELA ABERTA enquanto usa.'
  Write-Host "  Se o navegador não abrir, cole este endereço: $url"
  Write-Host ''
  if ($dados) { Write-Host "  Dados da obra: $dados" }
  elseif ($Site -eq 'app') { Write-Host '  Sem a pasta dados_obra nesta pasta: o app pede login. Veja o LEIA-ME.txt.' }
  else { Write-Host '  Sem os dados da obra nesta pasta: abre só a planta de teste. Veja o LEIA-ME.txt.' }
  Write-Host '  O que você registra fica só neste navegador deste PC: não vai para o servidor.'
  Write-Host '  Para guardar fora do navegador, use "Salvar arquivo" no menu da obra.'
  Write-Host ''
  if (-not $SemAbrir) { Start-Process $url }

  while ($listener.IsListening) {
    $ctx = $listener.GetContext()
    try {
      Responder $ctx $dados $caminhoInicial
    } catch {
      # o navegador desistiu no meio de uma resposta: segue atendendo os outros pedidos
      try { $ctx.Response.Abort() } catch { }
    }
  }
} catch {
  Write-Host ''
  Write-Host "Não consegui abrir: $($_.Exception.Message)"
  exit 1
}
