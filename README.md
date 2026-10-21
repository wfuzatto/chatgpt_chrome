# ChatGPT Voice Bridge — Google Meet e Microsoft Teams

Extensão experimental do Chrome (Windows) para levar o áudio da aba de reunião à API Realtime da OpenAI e devolver a fala do assistente ao microfone virtual VB-CABLE. Também pode misturar seu microfone físico para que você continue participando da reunião.

**Status:** implementação inicial. Testes automatizados verificam serviço local e sintaxe dos scripts, mas ainda não validam comunicação real com Meet/Teams, driver VB-CABLE e API OpenAI paga. Não é um produto oficial do Google, Microsoft ou OpenAI. Não é a interface da assinatura ChatGPT Plus — a API é faturada separadamente.

## Requisitos
- Google Chrome 116 ou superior; Windows 10/11; Google Meet ou Microsoft Teams Web aberto em aba do Chrome.
- Node.js versão 22 ou superior: https://nodejs.org/
- Driver VB-CABLE: https://vb-audio.com/Cable/ (instale com administrador e reinicie se solicitado).
- Chave da API e créditos da plataforma OpenAI: https://platform.openai.com/api-keys
- Fones de ouvido são recomendados para evitar eco/microfonia.
- Consentimento informado de quem participa da reunião.

## Instalação

1. Baixe e extraia o repositório (GitHub > Code > Download ZIP) para pasta permanente.
2. Instale Node.js 22+ e VB-CABLE dos sites oficiais.
3. Execute **start-windows.bat**. Na primeira vez ele cria e abre o arquivo **server/.env**. Substitua o valor de OPENAI_API_KEY pela sua chave oficial, salve, feche e execute start-windows.bat novamente. Mantenha o terminal aberto.
4. Copie a **chave de pareamento** mostrada no terminal. É diferente da chave API.
5. No Chrome abra **chrome://extensions** > ative Modo do desenvolvedor > Carregar sem compactação > selecione somente a pasta **extension**.
6. Clique em Detalhes > Opções. Cole a chave de pareamento. Clique em **Detectar dispositivos / autorizar microfone**, selecione a saída **CABLE Input** e selecione seu microfone físico, caso queira participar. Clique em Salvar.
7. Entre numa reunião no **Google Meet ou Teams Web**. Nas configurações da reunião, selecione **CABLE Output (VB-Audio Virtual Cable)** como microfone e seus fones de ouvido como alto-falantes.
8. Avise os participantes. Na extensão confirme o consentimento e salve.
9. Com a **aba da reunião ativa**, clique no ícone da extensão na barra do Chrome. O painel abrirá e exibirá a conexão. No modo manual, clique **Pedir resposta da IA** para ela falar. Também é possível enviar instrução textual.
10. Para encerrar, clique **Encerrar sessão** ou clique no ícone da extensão novamente.

## Como o som chega à reunião

Participantes Meet/Teams → captura da aba Chrome → WebRTC → OpenAI Realtime → voz gerada → mixer local → saída **CABLE Input** → entrada **CABLE Output** escolhida como microfone na reunião.

O microfone físico (opcional) também é encaminhado para o mixer (voz humana + IA) e para a API. A captura de aba também é restaurada para os fones/alto-falantes.

**Atenção:** não selecione CABLE Output como microfone físico DENTRO da extensão; isso criaria um laço de áudio. Se usa a opção de microfone humano, selecione o microfone real no painel. Utilize fones para impedir que som dos participantes entre novamente no microfone.

## Modos

- Manual (padrão): modelo recebe áudio e contexto, mas só responde quando você pede pelo painel. A fala capturada ainda é enviada à API OpenAI.
- Automático: tenta responder após pausas na fala. Pode interromper pessoas, não é recomendado para reuniões formais.
- Testar cabo virtual: produz um tom curto na saída virtual; confira o indicador de volume do CABLE Output nas opções da reunião.

## Diagnóstico

| Sintoma | Solução |
| --- | --- |
| Servidor offline | Execute start-windows.bat e deixe a janela aberta. |
| Erro de credencial | Confirme a chave de pareamento da extensão, a chave da API em server/.env e créditos API disponíveis. |
| Saída CABLE Input não aparece | Reinicie o Windows e o Chrome após instalar VB-CABLE. |
| Participantes não ouvem a IA | Use CABLE Output no campo MICROFONE do Meet/Teams. Teste tom pelo painel. |
| Sua voz não é transmitida | Marque Misturar microfone físico e permita acesso ao microfone. |
| IA não responde no manual | Clique em Pedir resposta; verifique se o painel indica Conectado. |
| Echo/microfonia | Utilize fones; não faça loop entre CABLE Output e microfone físico; desligue monitoramento local da IA. |
| Teams desktop | Use Teams Web no Chrome; app nativo não é capturado via tabCapture. |

## Segurança
- A chave de API fica exclusivamente em server/.env, ignorado pelo Git.
- Broker local usa somente endereço 127.0.0.1:8787, verifica Host, Origin e chave de pareamento antes de criar um token temporário.
- Este programa não gera gravações de áudio, transcrições permanentes nem coleta vídeo. O serviço da OpenAI recebe o áudio enquanto conectado.
- Não abra reuniões privadas sem concordância dos participantes. Empresas podem proibir este fluxo por suas políticas de segurança.
- Não publique server/.env ou o terminal contendo a chave de pareamento.

## Testes e pacote

Com Node 22 ou superior:

    cd server
    npm test
    npm run check

A GitHub Action executa testes do broker, valida a sintaxe da extensão e publica um arquivo ChatGPT-Voice-Bridge-Chrome.zip no artefato do workflow. **O ZIP deve ser extraído** para instalar em chrome://extensions; Chrome não instala ZIP diretamente.

## Limites conhecidos

1. É necessário Windows com driver VB-CABLE, permissões de microfone, acesso de internet e uma chave válida da API Realtime.
2. Sem um computador real conectado não se pode confirmar funcionamento do caminho completo em reunião; faça um teste na sua máquina antes de usar em produção.
3. A extensão participa pela entrada de áudio do usuário; não entra como participante independente com nome e avatar próprios.
4. Restrições de uso, duração, contas e custos da API OpenAI se aplicam.
5. Se fechar a aba da reunião, a sessão deve ser encerrada.
6. O serviço não integra diretamente a conversa de voz da conta ChatGPT Plus; utiliza API Realtime.

## Componentes

- extension/worker.js — captura da aba e controle de sessão;
- extension/offscreen.js — WebRTC e mixagem de áudio da reunião, IA e microfone;
- extension/options.html, options.js, styles.css — painel de controle;
- server/index.js e lib.js — servidor local sem dependências externas;
- .github/workflows/ci.yml — testes e geração de ZIP.

Documentação de referência:
- https://developers.openai.com/api/docs/guides/realtime
- https://developers.openai.com/api/docs/guides/realtime-webrtc
- https://developer.chrome.com/docs/extensions/reference/api/tabCapture
- https://developer.chrome.com/docs/extensions/reference/api/offscreen
- https://vb-audio.com/Cable/
