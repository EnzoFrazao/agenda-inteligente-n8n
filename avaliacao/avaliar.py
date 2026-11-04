import argparse
import base64
import json
import os
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

from .gerar_cartazes import CASOS, gerar_cartazes

RAIZ = Path(__file__).resolve().parents[1]
CAMPOS = ["titulo", "data_inicio", "hora_inicio", "data_fim", "hora_fim", "local", "descricao", "organizacao", "link_inscricao"]
OBRIGATORIOS = ["titulo", "data_inicio", "hora_inicio", "data_fim", "hora_fim", "local"]


def _schema_gemini(valor):
    """Remove palavras de JSON Schema não aceitas por responseJsonSchema."""
    if isinstance(valor, list):
        return [_schema_gemini(item) for item in valor]
    if isinstance(valor, dict):
        return {chave: _schema_gemini(conteudo) for chave, conteudo in valor.items()
                if chave not in {"$schema", "pattern"}}
    return valor


def _sobrepoe(a, b):
    inicio_a = datetime.fromisoformat(f"{a['data_inicio']}T{a['hora_inicio']}:00-03:00")
    fim_a = datetime.fromisoformat(f"{a['data_fim']}T{a['hora_fim']}:00-03:00")
    inicio_b = datetime.fromisoformat(f"{b['data_inicio']}T{b['hora_inicio']}:00-03:00")
    fim_b = datetime.fromisoformat(f"{b['data_fim']}T{b['hora_fim']}:00-03:00")
    return inicio_a < fim_b and inicio_b < fim_a


def _desfechos(saidas):
    aceitos = []
    desfechos = []
    for evento in saidas:
        if any(evento.get(campo) in (None, "") for campo in OBRIGATORIOS):
            desfechos.append("incompleto")
            continue
        if any(_sobrepoe(evento, existente) for existente in aceitos):
            desfechos.append("conflito")
        else:
            desfechos.append("aprovado")
        aceitos.append(evento)
    return desfechos


MODOS_REAIS = {"gemini", "n8n"}


def carregar_execucoes(caminho, casos):
    """Lê o que o workflow realmente produziu: evento extraído e status gravado na planilha."""
    registros = {item["id"]: item for item in json.loads(Path(caminho).read_text(encoding="utf-8"))}
    faltando = [caso["id"] for caso in casos if caso["id"] not in registros]
    if faltando:
        raise SystemExit(f"Execuções ausentes para: {', '.join(faltando)}")
    saidas = [registros[caso["id"]]["evento"] for caso in casos]
    status = [registros[caso["id"]]["status"] for caso in casos]
    return saidas, status


def avaliar_casos(casos, saidas, modo, status_observados=None):
    desfechos = status_observados or _desfechos(saidas)
    detalhes = []
    for caso, saida, desfecho in zip(casos, saidas, desfechos, strict=True):
        campos = {campo: saida.get(campo) == caso["evento_esperado"].get(campo) for campo in CAMPOS}
        divergencias = {
            campo: {"esperado": caso["evento_esperado"].get(campo), "obtido": saida.get(campo)}
            for campo, igual in campos.items() if not igual
        }
        detalhes.append({
            "id": caso["id"], "campos": campos, "divergencias": divergencias, "campos_corretos": sum(campos.values()),
            "campos_total": len(CAMPOS), "desfecho_obtido": desfecho,
            "desfecho_esperado": caso["desfecho_esperado"], "desfecho_correto": desfecho == caso["desfecho_esperado"]
        })
    return {
        "modo": modo, "evidencia_real": modo in MODOS_REAIS, "casos_executados": len(detalhes),
        "aviso": "Amostra sintética pequena; os resultados valem somente para estes três casos.",
        "detalhes": detalhes, "gerado_em": datetime.now(timezone.utc).isoformat()
    }


def _extrair_gemini(caso, api_key, modelo, schema, prompt, pasta_cartazes):
    imagem = base64.b64encode((pasta_cartazes / f"{caso['id']}.png").read_bytes()).decode("ascii")
    corpo = {
        "contents": [{"parts": [{"text": prompt}, {"inlineData": {"mimeType": "image/png", "data": imagem}}]}],
        "generationConfig": {"responseMimeType": "application/json", "responseJsonSchema": _schema_gemini(schema)}
    }
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{modelo}:generateContent"
    requisicao = urllib.request.Request(
        url,
        data=json.dumps(corpo).encode("utf-8"),
        headers={"Content-Type": "application/json", "x-goog-api-key": api_key},
    )
    with urllib.request.urlopen(requisicao, timeout=60) as resposta:
        payload = json.load(resposta)
    texto = payload["candidates"][0]["content"]["parts"][0]["text"]
    return json.loads(texto)


def escrever_relatorio(resultado, destino):
    destino = Path(destino)
    destino.mkdir(parents=True, exist_ok=True)
    sufixo = datetime.now().strftime("%Y%m%d-%H%M%S")
    json_path = destino / f"resultado-{resultado['modo']}-{sufixo}.json"
    md_path = destino / f"resultado-{resultado['modo']}-{sufixo}.md"
    json_path.write_text(json.dumps(resultado, ensure_ascii=False, indent=2), encoding="utf-8")
    if not resultado["evidencia_real"]:
        aviso = "**NÃO É EVIDÊNCIA REAL — saída de fixture.**"
    elif resultado["modo"] == "n8n":
        aviso = "**Execução real no n8n: extração do Gemini, Planilha e Calendar da conta de teste.**"
    else:
        aviso = "**Execução real da API Gemini.**"
    linhas = ["# Relatório dos três casos sintéticos", "", aviso, "", resultado["aviso"], ""]
    for item in resultado["detalhes"]:
        linhas.extend([
            f"## {item['id']}", "",
            f"- Campos: {item['campos_corretos']} de {item['campos_total']} iguais ao gabarito.",
            f"- Desfecho: `{item['desfecho_obtido']}` (esperado: `{item['desfecho_esperado']}`)."
        ])
        for campo, valores in item["divergencias"].items():
            linhas.append(f"- Divergência em `{campo}`: esperado `{valores['esperado']}`, obtido `{valores['obtido']}`.")
        linhas.append("")
    md_path.write_text("\n".join(linhas), encoding="utf-8")
    return md_path


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--modo", choices=["fixture", "gemini", "n8n"], default="fixture")
    parser.add_argument("--entrada", help="JSON com o evento e o status de cada caso (modo n8n)")
    args = parser.parse_args()
    pasta = gerar_cartazes()
    status_observados = None
    if args.modo == "fixture":
        saidas = [caso["evento_extraido_fixture"] for caso in CASOS]
    elif args.modo == "n8n":
        if not args.entrada:
            raise SystemExit("Informe --entrada com o JSON das execuções do n8n.")
        saidas, status_observados = carregar_execucoes(args.entrada, CASOS)
    else:
        api_key = os.environ.get("GEMINI_API_KEY")
        if not api_key:
            raise SystemExit("GEMINI_API_KEY ausente; nenhuma chamada foi feita.")
        modelo = os.environ.get("GEMINI_MODEL", "gemini-3.5-flash-lite")
        schema = json.loads((RAIZ / "schema/evento.schema.json").read_text(encoding="utf-8"))
        prompt = (RAIZ / "prompts/extracao.md").read_text(encoding="utf-8")
        saidas = [_extrair_gemini(caso, api_key, modelo, schema, prompt, pasta) for caso in CASOS]
    relatorio = avaliar_casos(CASOS, saidas, args.modo, status_observados)
    print(escrever_relatorio(relatorio, Path(__file__).parent / "resultados"))


if __name__ == "__main__":
    main()

