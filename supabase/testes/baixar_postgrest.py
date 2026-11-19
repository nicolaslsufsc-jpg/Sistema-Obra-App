"""Baixa o executável do PostgREST (o servidor de API que o Supabase usa) da imagem do
Supabase no registro público da Amazon (public.ecr.aws/supabase/postgrest), sem Docker.
Usado só nos testes locais. O GitHub (releases) é bloqueado nas sessões do Claude.

Uso: python3 -I supabase/testes/baixar_postgrest.py [versão]   (padrão v13.0.7)
Imprime o caminho do executável (fica em ~/.cache/sistema-obra/postgrest-<versão>/postgrest).
"""
import io
import json
import os
import subprocess
import sys
import tarfile

VERSAO = sys.argv[1] if len(sys.argv) > 1 else "v13.0.7"
REPO = "supabase/postgrest"
DESTINO = os.path.expanduser(f"~/.cache/sistema-obra/postgrest-{VERSAO}")
BIN = os.path.join(DESTINO, "postgrest")
ACEITA = ",".join([
    "application/vnd.oci.image.index.v1+json",
    "application/vnd.docker.distribution.manifest.list.v2+json",
    "application/vnd.oci.image.manifest.v1+json",
    "application/vnd.docker.distribution.manifest.v2+json",
])


def baixar(url, cabecalhos=()):
    # curl respeita o proxy e os certificados do ambiente. O registro às vezes recusa
    # pedidos seguidos (limite de taxa): tenta de novo algumas vezes.
    cmd = ["curl", "-fsSL", "--retry", "4", "--retry-delay", "3", "--retry-all-errors"]
    for c in cabecalhos:
        cmd += ["-H", c]
    return subprocess.run(cmd + [url], check=True, capture_output=True).stdout


def main():
    if os.access(BIN, os.X_OK):
        print(BIN)
        return
    os.makedirs(DESTINO, exist_ok=True)
    token = json.loads(baixar(f"https://public.ecr.aws/token/?scope=repository:{REPO}:pull"))["token"]
    base = f"https://public.ecr.aws/v2/{REPO}"
    auth = f"Authorization: Bearer {token}"
    indice = json.loads(baixar(f"{base}/manifests/{VERSAO}", [auth, f"Accept: {ACEITA}"]))
    if "manifests" in indice:
        digest = next(
            m["digest"] for m in indice["manifests"]
            if m.get("platform", {}).get("os") == "linux" and m.get("platform", {}).get("architecture") == "amd64"
        )
        manifesto = json.loads(baixar(f"{base}/manifests/{digest}", [auth, f"Accept: {ACEITA}"]))
    else:
        manifesto = indice
    for camada in manifesto["layers"]:
        with tarfile.open(fileobj=io.BytesIO(baixar(f"{base}/blobs/{camada['digest']}", [auth]))) as t:
            for membro in t.getmembers():
                if membro.isfile() and membro.name.lstrip("./") == "bin/postgrest":
                    with open(BIN, "wb") as f:
                        f.write(t.extractfile(membro).read())
                    os.chmod(BIN, 0o755)
                    print(BIN)
                    return
    sys.exit(f"Não achei bin/postgrest na imagem {REPO}:{VERSAO}")


main()
