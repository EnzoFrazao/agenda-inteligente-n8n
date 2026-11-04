import json
import tempfile
import unittest
from pathlib import Path

from avaliacao.avaliar import _schema_gemini, avaliar_casos, carregar_execucoes, escrever_relatorio
from avaliacao.gerar_cartazes import CASOS, gerar_cartazes


class AvaliacaoTest(unittest.TestCase):
    def test_schema_enviado_ao_gemini_remove_palavras_nao_suportadas(self):
        schema = {"$schema": "x", "type": "object", "properties": {"data": {"type": "string", "pattern": "x"}}}
        limpo = _schema_gemini(schema)
        self.assertNotIn("$schema", limpo)
        self.assertNotIn("pattern", limpo["properties"]["data"])

    def test_gera_exatamente_tres_cartazes_e_gabarito(self):
        with tempfile.TemporaryDirectory() as tmp:
            destino = Path(tmp)
            gerar_cartazes(destino)
            self.assertEqual(len(list(destino.glob('*.png'))), 3)
            gabarito = json.loads((destino / 'gabarito.json').read_text(encoding='utf-8'))
            self.assertEqual(len(gabarito['casos']), 3)
            self.assertEqual([c['id'] for c in gabarito['casos']], [c['id'] for c in CASOS])

    def test_relatorio_fixture_nao_se_apresenta_como_avaliacao_real(self):
        saidas = [caso['evento_extraido_fixture'] for caso in CASOS]
        resultado = avaliar_casos(CASOS, saidas, modo='fixture')
        self.assertEqual(resultado['modo'], 'fixture')
        self.assertFalse(resultado['evidencia_real'])
        with tempfile.TemporaryDirectory() as tmp:
            caminho = escrever_relatorio(resultado, Path(tmp))
            texto = caminho.read_text(encoding='utf-8')
            self.assertIn('NÃO É EVIDÊNCIA REAL', texto)
            self.assertNotIn('acurácia geral', texto.lower())

    def test_desfechos_da_fixture_usam_os_status_do_fluxo(self):
        saidas = [caso['evento_extraido_fixture'] for caso in CASOS]
        resultado = avaliar_casos(CASOS, saidas, modo='fixture')
        self.assertEqual([d['desfecho_obtido'] for d in resultado['detalhes']], ['aprovado', 'incompleto', 'conflito'])
        self.assertTrue(all(d['desfecho_correto'] for d in resultado['detalhes']))

    def test_modo_n8n_usa_status_gravado_e_e_evidencia_real(self):
        with tempfile.TemporaryDirectory() as tmp:
            entrada = Path(tmp) / 'execucoes.json'
            entrada.write_text(json.dumps([
                {'id': c['id'], 'evento': c['evento_esperado'], 'status': c['desfecho_esperado']} for c in CASOS
            ]), encoding='utf-8')
            saidas, status = carregar_execucoes(entrada, CASOS)
            resultado = avaliar_casos(CASOS, saidas, modo='n8n', status_observados=status)
            self.assertTrue(resultado['evidencia_real'])
            caminho = escrever_relatorio(resultado, Path(tmp))
            texto = caminho.read_text(encoding='utf-8')
            self.assertIn('Execução real no n8n', texto)
            self.assertNotIn('NÃO É EVIDÊNCIA REAL', texto)

    def test_modo_n8n_exige_os_tres_casos(self):
        with tempfile.TemporaryDirectory() as tmp:
            entrada = Path(tmp) / 'execucoes.json'
            entrada.write_text(json.dumps([{'id': CASOS[0]['id'], 'evento': {}, 'status': 'aprovado'}]), encoding='utf-8')
            with self.assertRaises(SystemExit):
                carregar_execucoes(entrada, CASOS)

    def test_relatorio_lista_campos_divergentes(self):
        saidas = [dict(caso['evento_extraido_fixture']) for caso in CASOS]
        saidas[0]['titulo'] = 'ENCONTRO HORIZONTE'
        resultado = avaliar_casos(CASOS, saidas, modo='fixture')
        self.assertEqual(resultado['detalhes'][0]['campos_corretos'], 8)
        self.assertEqual(list(resultado['detalhes'][0]['divergencias']), ['titulo'])
        with tempfile.TemporaryDirectory() as tmp:
            texto = escrever_relatorio(resultado, Path(tmp)).read_text(encoding='utf-8')
            self.assertIn("Divergência em `titulo`", texto)


if __name__ == '__main__':
    unittest.main()

