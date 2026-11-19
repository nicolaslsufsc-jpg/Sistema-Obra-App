"""Prova que os galhos de sistema oficial saem sem quebrar nada (docs/modulos/integracoes.md).

Copia o repositório para uma pasta temporária, apaga todos os galhos (app/src/integracoes/*/ e
pipeline/integracoes/*/) e roda na cópia:
  1. o build do app (npm run build: typecheck, testes de tipos e vite build);
  2. os testes do app sem servidor (vitest run src);
  3. os testes do pipeline (python -m unittest discover -s pipeline/testes);
  4. uma varredura: o nome de nenhum galho pode aparecer fora da pasta dele, em app/src, app/dev e
     pipeline. Ficam de fora só os nomes das colunas do banco (as migrações não se reescrevem; trocar
     esses nomes é uma migração do núcleo, decisão do Nicolas).
  5. uma varredura do site compilado (app/dist da cópia): nem o nome de um galho (fora as colunas do
     banco), nem endereço do sistema oficial, nem segredo (chave secret/service_role, chave privada).

Uso (na raiz do repositório, com o npm install do app já feito):
    python supabase/testes/sem_integracoes.py
Sai com 0 se tudo passou. Não mexe em nada do repositório: só na cópia, que é apagada no fim.
"""

from __future__ import annotations

import os
import pathlib
import re
import shutil
import subprocess
import sys
import tempfile

RAIZ = pathlib.Path(__file__).resolve().parents[2]
PASTAS_DE_GALHOS = ("app/src/integracoes", "pipeline/integracoes")
VARRER = ("app/src", "app/dev", "pipeline")
EXTENSOES = {".ts", ".tsx", ".css", ".html", ".py", ".txt", ".md", ".json", ".ps1", ".bat"}
# Colunas do banco que têm o nome de um sistema (supabase/migrations). Só o nome; o dado é genérico.
COLUNAS_DO_BANCO = re.compile(r"\b(codigo|local|nome)_construpoint\b|\bconstrupoint_id\b|'construpoint'")


def galhos() -> list[str]:
    nomes = set()
    for base in PASTAS_DE_GALHOS:
        pasta = RAIZ / base
        if pasta.is_dir():
            nomes |= {p.name for p in pasta.iterdir() if p.is_dir() and not p.name.startswith(("_", "."))}
    return sorted(nomes)


def copiar(destino: pathlib.Path) -> None:
    """Os arquivos do git (os que estão na pasta agora, inclusive os novos ainda sem commit)."""
    saida = subprocess.run(["git", "ls-files", "-z", "--cached", "--others", "--exclude-standard"], cwd=RAIZ,
                           check=True, capture_output=True).stdout.decode("utf-8")
    for rel in filter(None, saida.split("\0")):
        origem = RAIZ / rel
        if origem.is_file():
            alvo = destino / rel
            alvo.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(origem, alvo)
    lista = RAIZ / "nomes_proibidos.txt"
    if lista.is_file():
        shutil.copy2(lista, destino / lista.name)


def ligar_node_modules(destino: pathlib.Path) -> None:
    """Usa o node_modules do app original (instalar de novo levaria minutos)."""
    origem = RAIZ / "app" / "node_modules"
    if not origem.is_dir():
        raise SystemExit("Falta o node_modules do app: rode antes  cd app && npm install")
    alvo = destino / "app" / "node_modules"
    if os.name == "nt":
        subprocess.run(["cmd", "/c", "mklink", "/J", str(alvo), str(origem)], check=True, capture_output=True)
    else:
        alvo.symlink_to(origem, target_is_directory=True)


def apagar_galhos(destino: pathlib.Path) -> list[str]:
    apagados = []
    for base in PASTAS_DE_GALHOS:
        pasta = destino / base
        if not pasta.is_dir():
            continue
        for p in sorted(pasta.iterdir()):
            if p.is_dir() and not p.name.startswith(("_", ".")):
                shutil.rmtree(p)
                apagados.append(f"{base}/{p.name}/")
    return apagados


def varrer(destino: pathlib.Path, nomes: list[str]) -> list[str]:
    if not nomes:
        return []
    padrao = re.compile("|".join(re.escape(n) for n in nomes), re.I)
    achados = []
    for base in VARRER:
        for arq in sorted((destino / base).rglob("*")):
            if not arq.is_file() or arq.suffix.lower() not in EXTENSOES or "node_modules" in arq.parts or "dist" in arq.parts:
                continue
            for n, linha in enumerate(arq.read_text(encoding="utf-8", errors="replace").splitlines(), 1):
                if padrao.search(COLUNAS_DO_BANCO.sub("", linha)):
                    achados.append(f"{arq.relative_to(destino).as_posix()}:{n}: {linha.strip()[:120]}")
    return achados


# Segredos que nunca podem ir no site (a publishable key do Supabase é pública e pode).
SEGREDOS = re.compile(r"sb_secret_[A-Za-z0-9_-]{8,}|service_role|-----BEGIN [A-Z ]*PRIVATE KEY-----", re.I)
EXTENSOES_DO_SITE = {".js", ".mjs", ".html", ".css", ".json", ".webmanifest", ".txt", ".map"}


def varrer_site(dist: pathlib.Path, nomes: list[str]) -> list[str]:
    """O site compilado sem os galhos: nada de nome de galho, endereço dele ou segredo."""
    galho = re.compile("|".join(re.escape(n) for n in nomes), re.I) if nomes else None
    achados = []
    for arq in sorted(dist.rglob("*")):
        if not arq.is_file() or arq.suffix.lower() not in EXTENSOES_DO_SITE:
            continue
        texto = arq.read_text(encoding="utf-8", errors="replace")
        for m in SEGREDOS.finditer(texto):
            achados.append(f"{arq.relative_to(dist).as_posix()}: segredo ({m.group(0)[:20]}...)")
        if galho:
            for m in galho.finditer(COLUNAS_DO_BANCO.sub("", texto)):
                achados.append(f"{arq.relative_to(dist).as_posix()}: nome de galho ({m.group(0)})")
    return achados


def rodar(titulo: str, comando: list[str], pasta: pathlib.Path) -> bool:
    print(f"\n== {titulo}: {' '.join(comando)}", flush=True)
    r = subprocess.run(comando, cwd=pasta, shell=(os.name == "nt" and comando[0] in ("npm", "npx")))
    print(f"== {titulo}: {'ok' if r.returncode == 0 else 'FALHOU'}", flush=True)
    return r.returncode == 0


def main() -> int:
    nomes = galhos()
    print(f"Galhos neste repositório: {', '.join(nomes) or 'nenhum'}")
    tmp = pathlib.Path(tempfile.mkdtemp(prefix="sem_integracoes_"))
    destino = tmp / "repo"
    try:
        copiar(destino)
        # a cópia também é um repositório: os scripts que recusam gravar dado de obra dentro de um
        # repositório são testados assim
        subprocess.run(["git", "init", "-q", str(destino)], check=True)
        ligar_node_modules(destino)
        print("Apagados na cópia:", ", ".join(apagar_galhos(destino)) or "nada")
        resultados = {
            "build do app": rodar("build do app", ["npm", "run", "build"], destino / "app"),
            "testes do app": rodar("testes do app", ["npx", "vitest", "run", "src"], destino / "app"),
            "testes do pipeline": rodar("testes do pipeline", [sys.executable, "-m", "unittest", "discover", "-s", "pipeline/testes"], destino),
        }
        achados = varrer(destino, nomes)
        print(f"\n== varredura ({', '.join(VARRER)}): {'ok' if not achados else f'{len(achados)} linha(s) com nome de galho'}")
        for a in achados[:40]:
            print("   ", a)
        resultados["varredura"] = not achados
        dist = destino / "app" / "dist"
        no_site = varrer_site(dist, nomes) if dist.is_dir() else ["app/dist não foi gerado"]
        print(f"\n== site compilado (app/dist): {'ok' if not no_site else f'{len(no_site)} achado(s)'}")
        for a in no_site[:40]:
            print("   ", a)
        resultados["site compilado"] = not no_site
    finally:
        # a junção do node_modules sai primeiro, para o rmtree não entrar no node_modules original
        alvo = destino / "app" / "node_modules"
        if alvo.exists() or alvo.is_symlink():
            if os.name == "nt":
                subprocess.run(["cmd", "/c", "rmdir", str(alvo)], capture_output=True)
            else:
                alvo.unlink()
        shutil.rmtree(tmp, ignore_errors=True)
    print("\nResumo:")
    for nome, ok in resultados.items():
        print(f"  {'ok    ' if ok else 'FALHOU'} {nome}")
    return 0 if all(resultados.values()) else 1


if __name__ == "__main__":
    sys.exit(main())
