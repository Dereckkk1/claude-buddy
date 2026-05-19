# Claude Buddy — Design Spec

**Data:** 2026-05-19
**Status:** Aprovado pra implementação

## 1. Visão Geral

Claude Buddy é um mascote desktop em pixel art que vive no canto da tela do Windows, dorme até ser acionado, e responde perguntas usando Claude Haiku 4.5 via API. Suporta input por texto ou voz e aceita contexto visual (print de tela) ou textual (clipboard / texto selecionado).

**Stack:** Electron + TypeScript + React, empacotado em `.exe` standalone via electron-builder.

**Modelo de IA:** Claude Haiku 4.5 (`claude-haiku-4-5-20251001`) via API oficial Anthropic, com suporte a visão.

**Escopo:** uso single-user, máquina local. Não há multi-usuário, sincronização nuvem, ou backend próprio.

## 2. Decisões de Produto

| Tema | Decisão |
|---|---|
| Modelo IA | Claude Haiku 4.5 via API (cloud) |
| Input | Texto digitado por padrão + botão 🎤 mic com Web Speech API |
| Triggers | Clique no mascote **OU** hotkey global `Ctrl+Shift+Espaço` |
| Captura de contexto | Botões na UI: 📷 Print (com seleção de região), ✂️ Texto selecionado (clipboard), 📋 Clipboard |
| Memória | Efêmera total. Conversa multi-turn enquanto acordado; quando dorme, zera. |
| Sleep | Botão [OK] ou timeout de 30s sem interação |
| Posição | Arrastável, persistida em `electron-store`, detecta monitor ativo |
| Confirmação | Botões explícitos [OK] / [Continuar] após cada resposta |
| API key | Telinha de config na primeira execução, salva criptografada via `electron-store` |
| Estilo visual | Pixel art 16-bit, sprite 128×128, paleta limitada |
| Estratégia de assets | Fase 1: placeholders (emoji 🦀 ou sprite CC0). Fase 2: produção final via PixelLab.ai |

## 3. Arquitetura

Padrão Electron clássico: **main process** (Node) + **renderer process** (Chromium).

### Estrutura de pastas

```
claude-buddy/
├── electron/                  # MAIN process
│   ├── main.ts                # bootstrap, cria janelas, gerencia tray do Windows
│   ├── window-manager.ts      # janela do mascote (transparent, frameless, alwaysOnTop)
│   ├── hotkeys.ts             # globalShortcut Ctrl+Shift+Espaço
│   ├── capture.ts             # desktopCapturer + overlay de seleção de região
│   ├── clipboard-watcher.ts   # lê clipboard sob demanda
│   ├── store.ts               # electron-store (posição, api key cripto)
│   └── ipc.ts                 # handlers IPC tipados
│
├── src/                       # RENDERER process — UI do mascote
│   ├── main.tsx               # entry React
│   ├── components/
│   │   ├── Mascot.tsx         # canvas sprite (delega pro SpriteAnimator)
│   │   ├── SpeechBubble.tsx   # balão com tail apontando pro mascote
│   │   ├── InputPanel.tsx     # textarea + mic + botões de contexto
│   │   ├── AttachmentChip.tsx # mostra print/texto anexado, removível
│   │   └── ResponseView.tsx   # texto streaming + botões [OK]/[Continuar]
│   ├── hooks/
│   │   ├── useSpriteAnimation.ts  # state machine de animação
│   │   ├── useSpeechToText.ts     # wrapper Web Speech API
│   │   └── useDrag.ts             # drag pra mover a janela
│   ├── services/
│   │   ├── claude.ts          # cliente @anthropic-ai/sdk, prompt builder, streaming
│   │   └── ipc.ts             # bridge tipado pro main
│   └── state/
│       └── conversation.ts    # zustand store (efêmero)
│
├── config-window/             # janela separada de config
│   ├── index.html
│   └── ConfigApp.tsx          # form de API key (primeira execução)
│
├── assets/sprites/            # PNGs dos spritesheets
│
└── package.json
```

### Separação de responsabilidades

- **Main process** — tudo que toca SO: hotkey global, print de tela, clipboard, janelas, electron-store, autostart no boot do Windows.
- **Renderer process** — UI, sprite animation, chamada da Claude API (a key é injetada via IPC no boot), state da conversa.
- **IPC tipado** — interface compartilhada em `shared/ipc-types.ts` define todos os canais main↔renderer.

### Sprite engine

Classe `SpriteAnimator` em `src/services/sprite-animator.ts`:
- Carrega um spritesheet PNG e um descritor JSON (`{state: {frames, fps, loop}}`).
- Recebe comandos `setState('thinking')` e gerencia transições (ex: `waking` → ao terminar → `idle` automaticamente).
- Desenha o frame atual num `<canvas>` a cada `requestAnimationFrame` com `imageSmoothingEnabled = false` (pixel-perfect).

### Estados de animação

| Estado | Frames | FPS | Loop | Trigger |
|---|---|---|---|---|
| `sleeping` | 4 | 2 | sim | inicial / após [OK] / após timeout 30s |
| `waking` | 8 | ~13 | não (one-shot ~600ms) | clique no mascote OU hotkey enquanto dormindo |
| `idle` | 6 | 4 | sim | após `waking` terminar OU após resposta enquanto aguarda input |
| `thinking` | 4 | 6 | sim | após submeter pergunta, durante chamada à API |
| `talking` | 3 | 8 | sim | enquanto resposta tá em streaming |

## 4. Fluxos de Uso

### Fluxo 0 — Primeira execução
1. `claude-buddy.exe` inicia, main detecta `store.get('apiKey')` vazio.
2. Abre janela de config centralizada (400×300) pedindo a API key (com link "console.anthropic.com").
3. Salva via `electron-store` com `encryptionKey` derivada do machine-id.
4. Fecha config, abre janela do mascote no canto inferior direito do monitor principal.

### Fluxo 1 — Pedido com print (caso "receita do prato")
1. Usuário aperta `Ctrl+Shift+Espaço` (ou clica no mascote dormindo).
2. Estado `waking` → animação de ~600ms, balão `zZz` some.
3. Estado `idle` → balão aparece com input panel.
4. Usuário clica **📷 Print** → main abre overlay fullscreen translúcido pra selecionar região → main retorna PNG base64.
5. Renderer mostra `AttachmentChip` com thumbnail e "✕" pra remover.
6. Usuário digita "passa a receita" e dá Enter (ou clica ➤).
7. Estado `thinking` → sprite de carangueijo coçando cabeça.
8. Renderer chama `claude.messages.create({ model: 'claude-haiku-4-5-20251001', messages: [{role:'user', content:[{type:'image', source:{...}}, {type:'text', text:'passa a receita'}]}], stream: true })`.
9. Estado `talking` → texto aparece em streaming no balão.
10. Stream termina → aparecem botões **[OK]** e **[Continuar]**.

### Fluxo 2 — Correção de ortografia
1. Usuário seleciona texto em qualquer app e copia (Ctrl+C).
2. Aperta hotkey → mascote acorda → detecta clipboard com texto → mostra `AttachmentChip` automaticamente (removível).
3. Resto idêntico ao fluxo 1, sem imagem no content.

### Fluxo 3 — Multi-turn "Continuar"
1. Após resposta, usuário clica **[Continuar]**.
2. Volta pra `idle` mantendo histórico em memória.
3. Próxima request envia `messages: [prevUser, prevAssistant, newUser]`.
4. Continua até [OK] ou timeout 30s.

### Fluxo 4 — Sleep
- **[OK]** OU **30s sem interação** → conversa do zustand é limpa → estado `sleeping`.
- Janela continua viva (não destrói), só anima.

### Fluxo 5 — Erros

| Erro | Comportamento |
|---|---|
| Sem internet (network error) | Balão: "tô offline 😴 confere a internet aí" + botão **Tentar de novo** |
| API key inválida (401) | Balão: "API key não tá rolando" + botão **Reconfigurar** (reabre janela de config) |
| Rate limit (429) | Balão: "calma aí, muita pergunta junta" + botão **Tentar de novo** com cooldown 5s |
| Resposta vazia / 500 | Balão: "deu ruim aqui, tenta de novo?" + **Tentar de novo** |
| Print cancelado (Esc) | Volta pro idle, sem anexar nada |
| Mic negado pelo usuário | Botão 🎤 fica desabilitado com tooltip "permissão de mic negada" |

## 5. UI / Visual

- **Janela do mascote:** 400px largura × 300px altura, transparente, frameless, alwaysOnTop.
- **Mascote:** 64×64px renderizado, sprite original 128×128px com `image-rendering: pixelated`.
- **Balão:** 320px largura fixa, altura cresce com conteúdo, posicionado acima e à esquerda do mascote, com "tail" apontando pra ele.
- **Fonte do balão:** Segoe UI (sistema), NÃO pixel font — legibilidade primeiro.
- **Paleta:** accent laranja `#ff6b35`, balão branco, texto `#1a1a2e`.
- **Drag:** clica e segura no mascote (não no balão) pra arrastar a janela; posição salva ao soltar.
- **Persistência de fechar:** balão NÃO some quando clica fora — só fecha via [OK] ou timeout. Permite consultar print/outra janela enquanto pensa.

## 6. Bibliotecas / Dependências

### Main process
- `electron` — runtime
- `electron-store` — persistência criptografada de config
- `electron-builder` — empacotamento `.exe`
- `node-machine-id` — derivar key de encryption

### Renderer process
- `react` + `react-dom` — UI
- `zustand` — state da conversa efêmera
- `@anthropic-ai/sdk` — cliente Claude API
- (Web Speech API é nativa, sem dep)

### Dev
- `typescript`, `vite`, `vite-plugin-electron`
- `eslint`, `prettier`

## 7. Empacotamento e Distribuição

- `electron-builder` gera `.exe` autocontido pra Windows x64.
- Instalador com NSIS, opção "iniciar com o Windows" marcada por padrão.
- Atalho no menu iniciar e ícone na bandeja do sistema (tray).
- Tray menu: "Acordar", "Configurar API key", "Sair".

## 8. Testing

- **Unit:** lógica de `SpriteAnimator` (transições de estado), `claude.ts` (prompt builder), parsing de eventos IPC.
- **E2E manual:** roteiro de teste com os 5 fluxos (incluindo erros). Não há E2E automatizado — single-user, complexidade não justifica Playwright/Spectron.
- **Smoke:** ao buildar, rodar `.exe` em VM limpa, confirmar primeira execução pede API key e mascote aparece.

## 9. Fora de Escopo (não fazer)

- Multi-usuário, sync nuvem, backend próprio.
- Memória persistente entre conversas (efêmero apenas).
- macOS / Linux (foco Windows; código é cross-platform mas só validamos Windows).
- TTS (Text-to-Speech) — só STT no input.
- Modelo local / Ollama — fica pra fase 2 futura, fora deste spec.
- Histórico salvo de conversas — pode entrar depois se demandado.
- Plugins ou extensibilidade.

## 10. Roadmap de Implementação (alto nível)

1. Setup Electron + Vite + React + TS.
2. Janela do mascote (transparente, frameless, always-on-top) com sprite placeholder estático.
3. SpriteAnimator + state machine de animação com placeholders.
4. UI do balão + input panel + zustand state.
5. IPC + integração Claude API (texto puro primeiro).
6. Captura de print + AttachmentChip + vision API.
7. Clipboard auto-detect + texto selecionado.
8. Hotkey global.
9. Web Speech API (mic).
10. Janela de config + electron-store.
11. Tratamento de erros.
12. Drag + persistência de posição.
13. Tray + autostart.
14. Empacotamento via electron-builder.
15. Substituir placeholders pelos sprites finais (PixelLab.ai).
