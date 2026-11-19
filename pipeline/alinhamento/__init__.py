"""Alinhamento entre pranchas e plantas (desde 18/11/2026, aprovado pelo Nicolas no plano A das barras de laje).

Leva o desenho de uma prancha (armação de laje, e depois furação, arquitetura...) para a folha de forma do
pavimento, pelos pontos que aparecem nas duas (pilares). O que não alinha com segurança não entra: vira
CONFLITO num relatório (conflitos_de_alinhamento.json e .csv). Nada de encaixe silencioso.

    alinhar.py    funções puras: ajuste, tolerâncias e motivo do conflito
    relatorio.py  grava o relatório de conflitos
"""
