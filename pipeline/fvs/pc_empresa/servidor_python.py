"""Reserva do servidor.ps1, para PC em que o PowerShell está bloqueado e o Python existe.
Faz o mesmo: entrega os arquivos desta pasta ao navegador do próprio PC. Só biblioteca padrão.

    py servidor_python.py bancada
    py servidor_python.py app
    py servidor_python.py rede     o app também para celulares e tablets no mesmo Wi-Fi (ABRIR_NA_REDE.bat)
"""

from __future__ import annotations

import functools
import html
import os
import socket
import http.server
import pathlib
import sys
import urllib.parse
import webbrowser
import zipfile

AQUI = pathlib.Path(__file__).resolve().parent
PORTAS = {"bancada": 8771, "app": 8770, "rede": 8770}
TIPOS = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".webmanifest": "application/manifest+json",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".webp": "image/webp",
    ".ico": "image/x-icon",
    ".bin": "application/octet-stream",
    ".txt": "text/plain; charset=utf-8",
    ".wasm": "application/wasm",
    ".ifc": "application/octet-stream",
}


def achar_dados(pasta: pathlib.Path) -> pathlib.Path | None:
    """A pasta com indice.json (os dados da obra), onde quer que o zip tenha sido extraído aqui dentro."""
    for arq in sorted(pasta.rglob("indice.json")):
        if not any(p.startswith("site_") for p in arq.relative_to(pasta).parts):
            return arq.parent
    return None


def preparar_dados(pasta: pathlib.Path) -> pathlib.Path | None:
    dados = achar_dados(pasta)
    if dados:
        return dados
    for z in sorted(pasta.glob("dados_*.zip")):
        print(f"Extraindo {z.name} (só na primeira vez)...")
        with zipfile.ZipFile(z) as arq:
            arq.extractall(pasta)
        return achar_dados(pasta)
    return None


def resolver(caminho: str, raiz: pathlib.Path, dados: pathlib.Path | None) -> pathlib.Path | None:
    """O arquivo pedido, ou None se estiver fora da pasta do site e da pasta dos dados."""
    caminho = urllib.parse.unquote(caminho.split("?", 1)[0])
    if dados and caminho.startswith("/dados_obra/"):
        base, rel = dados, caminho[len("/dados_obra/"):]
    else:
        base, rel = raiz, caminho.lstrip("/")
    alvo = (base / rel).resolve()
    return alvo if alvo.is_relative_to(base.resolve()) else None


def enderecos_da_rede() -> list[str]:
    """Os IPs deste PC na rede local (Wi-Fi da obra ou hotspot do Windows), o mais provável primeiro."""
    ips: list[str] = []
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(("10.255.255.255", 1))  # não manda nada: só descobre qual placa de rede sai
            ips.append(s.getsockname()[0])
    except OSError:
        pass
    try:
        for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
            ips.append(info[4][0])
    except OSError:
        pass
    vistos: list[str] = []
    for ip in ips:
        if ip not in vistos and not ip.startswith("127.") and not ip.startswith("169.254."):
            vistos.append(ip)
    privado = lambda ip: ip.startswith(("192.168.", "10.")) or any(ip.startswith(f"172.{n}.") for n in range(16, 32))
    return sorted(vistos, key=lambda ip: (not privado(ip), not ip.startswith("192.168.137.")))


def pagina_celular(enderecos: list[str], porta: int) -> bytes:
    """A página que o PC mostra: QR code grande com o endereço para o celular."""
    qr_js = (AQUI / "qrcode.js").read_text(encoding="utf-8") if (AQUI / "qrcode.js").exists() else ""
    urls = [f"http://{ip}:{porta}/" for ip in enderecos]
    principal = urls[0] if urls else ""
    outros = "".join(f"<li>{html.escape(u)}</li>" for u in urls[1:])
    return f"""<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Abrir no celular</title>
<style>body{{font-family:system-ui,sans-serif;background:#16181c;color:#eee;margin:0;padding:24px;text-align:center}}
h1{{font-size:28px;margin:8px 0}} #qr{{background:#fff;display:inline-block;padding:18px;border-radius:12px;margin:16px 0}}
.url{{font-size:30px;font-weight:700;color:#8cc4ff;word-break:break-all}} ol{{text-align:left;max-width:640px;margin:16px auto;font-size:18px;line-height:1.6}}
a.botao{{display:inline-block;margin-top:18px;padding:14px 28px;background:#2563a8;color:#fff;border-radius:10px;font-size:20px;text-decoration:none}}
.aviso{{color:#f2c46d;max-width:640px;margin:16px auto;font-size:16px}}</style></head><body>
<h1>Abrir o Sistema Obra no celular ou tablet</h1>
{'<div id="qr"></div><div class="url">' + html.escape(principal) + '</div>' if principal else '<p class="aviso">Este PC não está em nenhuma rede. Ligue o Wi-Fi ou o Hotspot móvel do Windows e abra de novo.</p>'}
<ol><li>O celular precisa estar <b>no mesmo Wi-Fi</b> que este PC.</li>
<li>Aponte a câmera para o QR code (ou digite o endereço no Chrome).</li>
<li>No Chrome do celular: menu ⋮ → <b>Adicionar à tela inicial</b>. Vira um ícone.</li>
<li>Deixe a janela preta aberta neste PC enquanto usam.</li></ol>
<p class="aviso">Cada aparelho guarda os próprios registros. Se não abrir no celular: o Windows pode ter pedido para
liberar o acesso (clique em Permitir) ou o Wi-Fi isola os aparelhos. Aí ligue o Hotspot móvel do Windows,
conecte o celular nele e abra esta página de novo.</p>
{('<p>Outros endereços deste PC:</p><ul style="list-style:none;padding:0">' + outros + '</ul>') if outros else ''}
<a class="botao" href="http://localhost:{porta}/">Abrir o app neste PC</a>
<script>{qr_js}
(function(){{var el=document.getElementById('qr');if(!el||typeof qrcode!=='function')return;
var q=qrcode(0,'M');q.addData({principal!r});q.make();el.innerHTML=q.createSvgTag({{cellSize:10,margin:0}});}})();</script>
</body></html>""".encode("utf-8")


def criar_handler(site: str, raiz: pathlib.Path, dados: pathlib.Path | None, inicio: str, celular: bytes | None = None):
    class Handler(http.server.SimpleHTTPRequestHandler):
        extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map, **TIPOS}

        def translate_path(self, path):
            alvo = resolver(path, raiz, dados)
            return str(alvo) if alvo else str(raiz / "__fora_da_pasta__")

        def end_headers(self):
            self.send_header("Cache-Control", "no-store")
            super().end_headers()

        def do_GET(self):
            # a página do QR só para quem está neste PC: no celular ela não serve para nada
            if celular is not None and self.path.split("?", 1)[0] == "/__celular__" and self.client_address[0].startswith("127."):
                self.send_response(200)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.send_header("Content-Length", str(len(celular)))
                self.end_headers()
                self.wfile.write(celular)
                return
            if self.path == "/" and site == "bancada":
                self.send_response(302)
                self.send_header("Location", inicio)
                self.end_headers()
                return
            super().do_GET()

        def log_message(self, *a):
            pass

    return Handler


def main(argv: list[str]) -> int:
    pedido = argv[0] if argv and argv[0] in PORTAS else "bancada"
    rede = pedido == "rede"
    site = "app" if rede else pedido
    raiz = AQUI / f"site_{site}"
    if not raiz.is_dir():
        print(f"Não achei a pasta site_{site} ao lado deste arquivo. Extraia o zip inteiro antes de abrir.")
        return 1
    dados = preparar_dados(AQUI)
    inicio = "/" if site == "app" else "/dev/fvs.html?pasta=/dados_obra/" if dados else "/dev/fvs.html?abrir=0"
    porta = PORTAS[pedido]
    enderecos = enderecos_da_rede() if rede else []
    celular = pagina_celular(enderecos, porta) if rede else None
    handler = functools.partial(criar_handler(site, raiz, dados, inicio, celular), directory=str(raiz))
    # na rede: atende o Wi-Fi inteiro (só leitura dos arquivos do app e da obra); sem rede: só este PC
    try:
        servidor = http.server.ThreadingHTTPServer((os.environ.get("SO_HOST") or ("0.0.0.0" if rede else "127.0.0.1"), porta), handler)  # SO_HOST: só para teste
    except OSError:
        # a porta já está com outra janela do Sistema Obra (o ABRIR_SISTEMA_OBRA, por exemplo)
        print(f"\n  A porta {porta} já está em uso: provavelmente outra janela preta do Sistema Obra está aberta.")
        print("  Feche a outra janela (ABRIR_SISTEMA_OBRA ou ABRIR_NA_REDE) e abra este de novo.\n")
        return 1
    url = f"http://localhost:{porta}/__celular__" if rede else f"http://localhost:{porta}{inicio}"
    if rede:
        print("\n  Endereço para o celular (mesmo Wi-Fi): " + (", ".join(f"http://{ip}:{porta}/" for ip in enderecos) or "nenhuma rede achada"))
    print(f"\n  Sistema Obra aberto no navegador. DEIXE ESTA JANELA ABERTA enquanto usa.\n  Se o navegador não abrir, cole: {url}\n")
    webbrowser.open(url)
    try:
        servidor.serve_forever()
    except KeyboardInterrupt:
        pass
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
