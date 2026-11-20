// Fim da baixa das plantas (menu com conta, PlantasSemInternet.tsx). A tela mostra "Baixando: 8 de 9" enquanto
// baixa e, ao terminar, a contagem do aparelho. Se a faixa "baixando" some antes de reler o aparelho, aparece
// por um instante a contagem lida ANTES da baixa ("0 de 9. Faltam 95,8 MB"; rodada com a obra piloto, 20/11).
// Então: primeiro relê, depois tira o "baixando".

export async function terminarBaixa(reler: () => Promise<unknown>, tirarBaixando: () => void): Promise<void> {
  try {
    await reler()
  } finally {
    tirarBaixando()
  }
}
