// Centralized i18n dictionary. Used by both renderer (UI strings) and main
// (built-in agent names/prompts, error messages). Keep keys stable; add new
// languages by extending each section.
//
// Convention: simple `{var}` placeholders, no plurals/genders. Keep strings
// short and natural in each language — don't translate word-for-word.

import type { Locale } from './ipc-types';

export type StringDict = typeof EN;

export const EN = {
  // Mascot greetings, picked by time of day / weekday
  greeting: {
    morning: ['Good morning! Let’s go?', 'Ready to start?', 'Morning! I’m up.', 'Hey, fresh start.'],
    afternoon: ['Hey, how can I help?', 'Coffee yet?', 'How’s it going?', 'I’m here, talk to me.'],
    evening: ['Evening!', 'Day winding down.', 'Wrapping up soon?', 'Available — fire away.'],
    latenight: ['Can’t sleep either? Shoot.', 'Late-night work?', 'I’m here, go ahead.', 'Owl mode — what’s up?'],
    monday: ['Monday — let’s go.', 'Good start to the week!', 'Monday, here we are.'],
    friday: ['Friday! What’s up?', 'Last one of the day.', 'Friyay — bring it.'],
    weekend: ['Weekend grind? Respect.', 'Saturday/Sunday — how can I help?', 'Weekend, I’m here.'],
    generic: ['How can I help?', 'Go ahead.', 'I’m listening.', 'What’s the idea?', 'What can I do?'],
  },

  // Input panel
  input: {
    placeholder: 'ask me anything…',
    placeholderAgent: 'what’s the goal? (e.g. open calculator)',
    send: 'send',
    attach: 'Attach',
    attachTitle: 'attach an image, file, or clipboard item',
    agentMode: 'Agent Mode',
    agentModeTitle: 'agent mode — the mascot drives your computer',
  },

  // Attach picker
  attach: {
    screenshot: 'Screenshot',
    screenshotSub: 'select a region',
    clipboard: 'Clipboard',
    clipboardSub: 'what’s copied right now',
    file: 'File',
    fileSub: 'PDF, MD, TXT, DOCX, image',
    empty: 'clipboard empty',
    back: 'back',
    imageItem: 'Image',
    textItem: 'Text',
    imageSize: 'image ({kb}KB)',
    imageAttached: 'image attached',
    removeChip: 'remove',
    folder: 'Folder',
    folderSub: 'attach a whole folder for the agent to read',
    dropHere: 'Drop to attach',
    folderItemSuffix: '(folder)',
  },

  // Response view
  response: {
    ok: 'OK',
    continue: 'Continue',
    explainMore: 'explain more',
    giveExample: 'give an example',
    summarize: 'summarize',
    quickReplyExplain: 'explain more',
    quickReplyExample: 'give me a practical example',
    quickReplySummarize: 'summarize in one sentence',
  },

  // Tool/step labels
  steps: {
    read_selection: 'read your selection',
    edit_in_place: 'edited in your window',
    save_memory: 'saved to memory',
    web_search: '🔍 searching the web',
    screenshot: 'took a screenshot',
    attached_image: 'read the image',
    attached_file: 'read the file',
    list_folder: 'listed folder',
    read_file: 'read file',
    run_command: 'ran command',
  },

  // Shell command approval card
  shell: {
    wantsToRun: 'wants to run a command',
    cwdLabel: 'cwd',
    homeDir: 'home directory',
    cancel: 'Cancel',
    edit: 'Edit',
    run: 'Run',
    running: 'running…',
    ran: 'ran',
    exitCode: 'exit',
    timedOut: 'timed out',
    showOutput: 'show output',
    hideOutput: 'hide output',
    noOutput: '(no output)',
  },

  // Status / inline UI
  bubble: {
    thinking: 'thinking',
    play: '▶ play',
    stop: '◼ stop',
    close: 'close',
    manageAgents: '＋ Manage agents…',
    customTag: 'custom',
  },

  // Agent overlay
  agent: {
    starting: 'starting',
    done: 'done',
    error: 'error',
    stopped: 'stopped',
    stop: 'stop',
  },

  // Error messages (keys map to claude.ts error codes)
  errors: {
    NETWORK: 'I’m offline — check your internet.',
    INVALID_API_KEY: 'API key isn’t working — open settings from the tray.',
    RATE_LIMITED: 'Easy there — too many requests at once.',
    API_KEY_MISSING: 'API key not configured.',
    UNKNOWN: 'Something went wrong — try again?',
    unknownAgent: 'unknown error',
  },

  // First-run config window (API key)
  config: {
    heading: 'Configure your Claude API key',
    help: 'Get a key at',
    helpLinkText: 'console.anthropic.com',
    helpAfter: '(settings → API keys).',
    placeholder: 'sk-ant-…',
    save: 'Save',
    saving: 'Saving…',
    invalid: 'That key doesn’t look valid (should start with sk-ant-)',
  },

  // Tray context menu (right-click the tray icon)
  tray: {
    wake: 'Wake up',
    settings: 'Settings…',
    configKey: 'Configure API key',
    quit: 'Quit',
  },

  // TTS voice picker labels
  voice: {
    female: 'female',
    male: 'male',
  },

  // Settings window
  settings: {
    titleBar: 'Claude Buddy — Settings',
    sidebar: {
      general: 'General',
      agents: 'Agents',
      memories: 'Memories',
      about: 'About',
    },
    general: {
      heading: 'General',
      language: 'Language',
      languageHelp: 'UI language. The agent will also respond in this language by default.',
      theme: 'Theme',
      themeHelp: 'Light, dark, or follow Windows.',
      themeLight: 'Light',
      themeDark: 'Dark',
      themeAuto: 'Auto',
      autostart: 'Start with Windows',
      autostartHelp: 'Opens the mascot whenever you boot, hidden in the tray.',
      idleTimeout: 'Time until sleep',
      idleTimeoutHelp: 'Seconds without interaction before the mascot goes back to sleep.',
      hotkey: 'Keyboard shortcut',
      hotkeyHelp: 'Combo that wakes the mascot from anywhere.',
      tts: 'Read responses aloud',
      ttsHelp: 'The mascot speaks the response using neural Edge voices.',
      voice: 'Voice',
      voiceHelp: 'Which neural voice to use.',
      sounds: 'Sounds',
      soundsHelp: '8-bit beeps when waking, sending, finishing, etc.',
      volume: 'Sound volume',
      volumeHelp: '{percent}% — drag to adjust.',
      speed: 'Speech speed',
      speedHelp: '{rate}× — drag to adjust.',
      seconds15: '15 seconds',
      seconds30: '30 seconds',
      minute1: '1 minute',
      minutes2: '2 minutes',
      minutes5: '5 minutes',
    },
    agents: {
      heading: 'Agents',
      new: '＋ New agent',
      help: 'Each agent has its own system prompt, memories, and model. Switching agents is like switching personalities.',
      memoriesCount: '{n} memories · model: {model}',
      edit: 'edit',
      builtInTag: 'built-in',
      back: '← back',
      editAgent: 'Edit agent',
      newAgent: 'New agent',
      emoji: 'Emoji',
      name: 'Name',
      namePlaceholder: 'e.g. SQL Helper',
      model: 'Model',
      modelAuto: 'Auto (picks by question)',
      modelHaiku: 'Haiku — fast and cheap',
      modelSonnet: 'Sonnet — smarter',
      sharedMemories: 'Shared memories',
      sharedMemoriesHelp: 'This agent also reads memories from the others.',
      systemPrompt: 'System prompt',
      systemPromptPlaceholder: 'You are an assistant specialized in…',
      builtInNotice: 'Built-in agent — your changes stay saved. To revert to the original, uninstall and reinstall.',
      delete: 'Delete agent',
      cancel: 'Cancel',
      save: 'Save',
      saving: 'Saving…',
      needName: 'Give the agent a name',
      needPrompt: 'System prompt is empty',
      confirmDelete: 'Delete "{name}"?',
    },
    memories: {
      heading: 'Memories',
      help: 'Everything the mascot knows about you across conversations. It learns on its own via the save_memory tool.',
      empty: 'No memories yet. The mascot will learn over time.',
      clearAll: 'Clear all',
      confirmClear: 'Clear all memories?',
    },
    about: {
      heading: 'About',
      version: 'Claude Buddy v0.2.0',
      tagline: 'Desktop pixel-art mascot powered by Claude.',
      built: 'Built with Electron, React, TypeScript, and a lot of coffee.',
    },
  },

  // System prompt instructions (locale-aware response language)
  systemPrompt: {
    respondInLanguage: 'Always respond in English (informal but professional, short and direct). Markdown OK for the chat (bold, lists, code blocks).',
  },

  // Built-in agent names and prompts
  builtInAgents: {
    buddy: {
      name: 'Buddy',
      prompt: 'You are Claude Buddy, a pixel-art mascot living on the user’s screen. Be friendly, casual, and concise.',
    },
    codeHelper: {
      name: 'Code Helper',
      prompt: 'You are a programming assistant. Focus on:\n- Explaining code clearly with practical examples\n- Spotting bugs and suggesting fixes\n- Trade-offs between solutions\n- Best practices and patterns\n\nUse code blocks for any code snippet (markdown).',
    },
    tutor: {
      name: 'Language Tutor',
      prompt: 'You are an English language tutor. Focus on:\n- Correcting spelling, grammar, agreement\n- Suggesting style and clarity improvements\n- Explaining rules with short examples\n- Friendly didactic tone',
    },
    writer: {
      name: 'Writer',
      prompt: 'You are a professional copywriter / editor. Focus on:\n- Writing emails, short copy, posts\n- Rewriting for clarity, persuasion, or conciseness\n- Adapting tone (formal, casual, technical)',
    },
  },

  // TOOL_INSTRUCTIONS — the big system block that drives proactive tool use
  toolInstructions: {
    intro: 'You have 4 tools. Use them PROACTIVELY — the user won’t explicitly instruct you, they expect you to figure it out.',
    goldenRuleHeader: '## GOLDEN RULE',
    goldenRuleBody: 'The user very likely has something SELECTED in another app before calling you. You DO NOT SEE their screen — you have to GO FETCH IT.\n\n**Every time the user asks something WITHOUT explicit attached context, your FIRST ACTION is to call `read_selection`.** This includes:\n\n- EDIT requests: "fix", "improve", "rewrite", "translate", "shorten", "formalize", "adjust"\n- Questions ABOUT something: "what do you think?", "which one?", "is this good?", "what’s the best option?", "which should I pick?", "am I right?"\n- Explanation requests: "explain this", "what is this?", "how does this work?"\n- Decisions: "which to choose", "which option", "what do you recommend"\n- ANY vague or demonstrative question with "this", "that", "here", "which"\n\nOnly answer directly WITHOUT calling read_selection if:\n- The user explicitly attached something (file/image) — use the attachment\n- The question is general and self-contained ("what’s the capital of Japan?", "teach me React")\n- The user ALREADY stated the content in chat\n\nIf read_selection returns EMPTY, THEN ask the user what they want.\n\nNEVER REPLY "you didn’t send anything" without first having called read_selection — that’s the worst mistake you can make.\n\n→ If it’s an edit, then call `edit_in_place` with the result.',
    toolsHeader: '## TOOLS',
    tool1: '1. `read_selection`: simulates Ctrl+C on the active window and gives you the selected text. ALWAYS call when the request is about "this", "this text", "this part", "this code", "this snippet", or ANY edit/comment about content the user didn’t attach.',
    tool2: '2. `edit_in_place`: replaces the selection with the new text (pastes directly into the app). USE for ANY edit (fix, rewrite, translate, etc). Don’t return the edited text in chat — call this tool and in the comment say in 1 informal sentence what you did ("fixed 3 typos", "made it more formal", etc).',
    tool3: '3. `save_memory`: stores 1 short fact about the user. Use SPARINGLY — only for relevant things ("uses Cursor", "works with Python", "lives in Manaus"). Never save trivialities.',
    tool4: '4. `web_search`: searches the internet (up to 3 times per turn). USE when:\n   - The user asks about CURRENT info (news, prices, exchange rates, software versions, recent events).\n   - You need specific docs/references that may have changed (recent APIs, new libs).\n   - Questions about facts you may not have (postal codes, public data, game results, etc).\n   - DO NOT use for things you already know or that are timeless ("what is recursion?", "explain Promises"). Web search costs money and time — only when STATIC knowledge isn’t enough.',
    antiHeader: '## ANTI-PATTERNS (NEVER DO THIS)',
    antiBody: '- ❌ "You didn’t send anything. What’s the situation?" → WRONG. Call read_selection FIRST.\n- ❌ "To fix it, paste the text here." → WRONG. Call read_selection.\n- ❌ "Which text do you want?" → WRONG. Call read_selection.\n- ❌ "Be real with me, what’s the context?" → WRONG. Call read_selection.\n- ❌ Returning edited text in a code block in chat. → WRONG. Use edit_in_place.',
    closing: 'The ONLY acceptable response to "which one should I pick?" without an attachment is: call read_selection, see what’s there, and ANSWER based on that.\n\nMarkdown OK in chat (comments, explanations). Text edits ALWAYS via edit_in_place.',
    memoriesLabel: '\n\nMEMORIES about the user (use when relevant):',
  },
};

export const PT: StringDict = {
  greeting: {
    morning: ['Bom dia! Vamos lá?', 'Bora começar o dia?', 'Feliz novo dia!', 'Bom dia! Tô acordado'],
    afternoon: ['E aí, no que ajudo?', 'Café já ta pronto?', 'Como tá indo?', 'Tô aqui, fala'],
    evening: ['Boa noite!', 'Fim do dia chegando.', 'Quase acabando o expediente...', 'Tô disponível, manda!'],
    latenight: ['Sem sono também? Manda', 'Madrugada produtiva?', 'Tô aqui, manda ver', 'Noite virou, no que ajudo?'],
    monday: ['Segundou, bora?', 'Bom começo de semana!', 'Segunda chegou, partiu'],
    friday: ['Sextou! O que rola?', 'Última do dia, manda', 'Sextouuu, manda bala?'],
    weekend: ['Folga e tu tá trampando? F', 'Sábadão/domingão, no que ajudo?', 'Fim de semana, tô aqui'],
    generic: ['Como posso ajudar?', 'Pode mandar', 'Tô aqui, fala comigo', 'Qual a idéia?', 'No que ajudo agora?'],
  },

  input: {
    placeholder: 'pergunta qualquer coisa...',
    placeholderAgent: 'qual o objetivo? (ex: abre a calculadora)',
    send: 'enviar',
    attach: 'Anexar',
    attachTitle: 'anexar imagem, arquivo ou item do clipboard',
    agentMode: 'Modo Agente',
    agentModeTitle: 'modo agente — o mascote pilota o computador',
  },

  attach: {
    screenshot: 'Print de tela',
    screenshotSub: 'selecione uma região',
    clipboard: 'Clipboard',
    clipboardSub: 'o que está copiado agora',
    file: 'Arquivo',
    fileSub: 'PDF, MD, TXT, DOCX, imagem',
    empty: 'clipboard vazio',
    back: 'voltar',
    imageItem: 'Imagem',
    textItem: 'Texto',
    imageSize: 'imagem ({kb}KB)',
    imageAttached: 'imagem anexada',
    removeChip: 'remover',
    folder: 'Pasta',
    folderSub: 'anexa uma pasta inteira pro agente ler',
    dropHere: 'Solte aqui',
    folderItemSuffix: '(pasta)',
  },

  response: {
    ok: 'OK',
    continue: 'Continuar',
    explainMore: 'explica melhor',
    giveExample: 'dá um exemplo',
    summarize: 'resume',
    quickReplyExplain: 'explica melhor isso',
    quickReplyExample: 'me dá um exemplo prático',
    quickReplySummarize: 'resume em 1 frase',
  },

  steps: {
    read_selection: 'leu o que você selecionou',
    edit_in_place: 'editou na sua janela',
    save_memory: 'salvou na memória',
    web_search: '🔍 buscando na web',
    screenshot: 'tirou print da tela',
    attached_image: 'leu a imagem',
    attached_file: 'leu o arquivo',
    list_folder: 'listou a pasta',
    read_file: 'leu o arquivo',
    run_command: 'rodou comando',
  },

  shell: {
    wantsToRun: 'quer rodar um comando',
    cwdLabel: 'pasta',
    homeDir: 'home do usuário',
    cancel: 'Cancelar',
    edit: 'Editar',
    run: 'Rodar',
    running: 'rodando…',
    ran: 'rodou',
    exitCode: 'exit',
    timedOut: 'travou no timeout',
    showOutput: 'ver output',
    hideOutput: 'esconder output',
    noOutput: '(sem output)',
  },

  bubble: {
    thinking: 'pensando',
    play: '▶ reproduzir',
    stop: '◼ parar',
    close: 'fechar',
    manageAgents: '＋ Gerenciar agentes…',
    customTag: 'custom',
  },

  agent: {
    starting: 'iniciando',
    done: 'feito',
    error: 'erro',
    stopped: 'parado',
    stop: 'parar',
  },

  errors: {
    NETWORK: 'tô offline, confere a internet aí',
    INVALID_API_KEY: 'API key não tá rolando — reabre a config pelo tray',
    RATE_LIMITED: 'calma aí, muita pergunta junta',
    API_KEY_MISSING: 'API key não configurada',
    UNKNOWN: 'deu ruim aqui, tenta de novo?',
    unknownAgent: 'erro desconhecido',
  },

  config: {
    heading: 'Configura a API key do Claude',
    help: 'Pega uma key em',
    helpLinkText: 'console.anthropic.com',
    helpAfter: '(settings → API keys).',
    placeholder: 'sk-ant-…',
    save: 'Salvar',
    saving: 'Salvando…',
    invalid: 'Essa key não parece válida (deve começar com sk-ant-)',
  },

  tray: {
    wake: 'Acordar',
    settings: 'Configurações…',
    configKey: 'Configurar API key',
    quit: 'Sair',
  },

  voice: {
    female: 'feminina',
    male: 'masculina',
  },

  settings: {
    titleBar: 'Claude Buddy — Configurações',
    sidebar: {
      general: 'Geral',
      agents: 'Agentes',
      memories: 'Memórias',
      about: 'Sobre',
    },
    general: {
      heading: 'Geral',
      language: 'Idioma',
      languageHelp: 'Idioma da interface. O agente também vai responder nesse idioma por padrão.',
      theme: 'Tema',
      themeHelp: 'Claro, escuro, ou segue o tema do Windows.',
      themeLight: 'Claro',
      themeDark: 'Escuro',
      themeAuto: 'Auto',
      autostart: 'Iniciar com o Windows',
      autostartHelp: 'Abre o mascote sempre que ligar o PC, escondido na bandeja.',
      idleTimeout: 'Tempo até dormir',
      idleTimeoutHelp: 'Quantos segundos sem interação até o mascote voltar a dormir.',
      hotkey: 'Atalho de teclado',
      hotkeyHelp: 'Combinação que acorda o mascote de qualquer lugar.',
      tts: 'Ler resposta em voz alta',
      ttsHelp: 'O mascote fala a resposta usando vozes neurais do Edge (qualidade alta).',
      voice: 'Voz',
      voiceHelp: 'Qual voz neural usar pra falar.',
      sounds: 'Sons',
      soundsHelp: 'Bipinhos 8-bit ao acordar, mandar, terminar, etc.',
      volume: 'Volume dos sons',
      volumeHelp: '{percent}% — arraste pra ajustar.',
      speed: 'Velocidade da fala',
      speedHelp: '{rate}× — arraste pra ajustar.',
      seconds15: '15 segundos',
      seconds30: '30 segundos',
      minute1: '1 minuto',
      minutes2: '2 minutos',
      minutes5: '5 minutos',
    },
    agents: {
      heading: 'Agentes',
      new: '＋ Novo agente',
      help: 'Cada agente tem seu próprio system prompt, memórias e modelo. Trocar de agente é como trocar de "personalidade".',
      memoriesCount: '{n} memórias · modelo: {model}',
      edit: 'editar',
      builtInTag: 'built-in',
      back: '← voltar',
      editAgent: 'Editar agente',
      newAgent: 'Novo agente',
      emoji: 'Emoji',
      name: 'Nome',
      namePlaceholder: 'ex: SQL Helper',
      model: 'Modelo',
      modelAuto: 'Auto (escolhe pela pergunta)',
      modelHaiku: 'Haiku — rápido e barato',
      modelSonnet: 'Sonnet — mais inteligente',
      sharedMemories: 'Memórias compartilhadas',
      sharedMemoriesHelp: 'Esse agente também acessa as memórias dos outros.',
      systemPrompt: 'System prompt',
      systemPromptPlaceholder: 'Você é um assistente especialista em...',
      builtInNotice: 'Agente built-in — mudanças ficam salvas. Pra reverter ao original, apague o app e reinstale.',
      delete: 'Apagar agente',
      cancel: 'Cancelar',
      save: 'Salvar',
      saving: 'Salvando...',
      needName: 'Dá um nome pro agente',
      needPrompt: 'System prompt vazio',
      confirmDelete: 'Apagar "{name}"?',
    },
    memories: {
      heading: 'Memórias',
      help: 'Tudo que o mascote sabe sobre você entre conversas. Ele aprende sozinho usando a tool save_memory.',
      empty: 'Sem memórias ainda. O mascote vai aprender com o tempo.',
      clearAll: 'Apagar todas',
      confirmClear: 'Apagar todas as memórias?',
    },
    about: {
      heading: 'Sobre',
      version: 'Claude Buddy v0.2.0',
      tagline: 'Mascote desktop com pixel art e Claude API.',
      built: 'Construído com Electron, React, TypeScript e muita cafeína.',
    },
  },

  systemPrompt: {
    respondInLanguage: 'Sempre responda em português do Brasil, informal, curto e direto. Markdown OK no chat (negrito, listas, code blocks).',
  },

  builtInAgents: {
    buddy: {
      name: 'Buddy',
      prompt: 'Você é o Claude Buddy, um mascote pixel-art que vive na tela do usuário. Seja amigável, casual e direto.',
    },
    codeHelper: {
      name: 'Code Helper',
      prompt: 'Você é um assistente de programação. Foco em:\n- Explicar código com clareza, exemplos práticos\n- Apontar bugs e sugerir fixes\n- Trade-offs entre soluções\n- Padrões e boas práticas\n\nUse code blocks pra qualquer trecho de código (markdown).',
    },
    tutor: {
      name: 'Tutor PT-BR',
      prompt: 'Você é um tutor de português brasileiro. Foco em:\n- Corrigir ortografia, gramática, concordância\n- Sugerir melhorias de estilo e clareza\n- Explicar regras com exemplos curtos\n- Tom didático mas leve',
    },
    writer: {
      name: 'Escritor',
      prompt: 'Você é um copywriter / editor profissional. Foco em:\n- Escrever emails, textos curtos, posts, copy\n- Reescrever pra ficar mais claro, persuasivo ou conciso\n- Adaptar tom (formal, casual, técnico)',
    },
  },

  toolInstructions: {
    intro: 'Você tem 4 tools. Use-as PROATIVAMENTE — o usuário não vai instruir explicitamente, ele espera que você descubra sozinho.',
    goldenRuleHeader: '## REGRA DE OURO',
    goldenRuleBody: 'O usuário muito provavelmente tem algo SELECIONADO em outro app antes de te chamar. Você NÃO VÊ a tela dele — tem que ir BUSCAR.\n\n**Toda vez que o usuário pergunta algo SEM ter anexado contexto explícito, sua PRIMEIRA AÇÃO é chamar `read_selection`.** Isso inclui:\n\n- Pedidos de EDIÇÃO: "corrige", "arruma", "melhora", "reescreve", "traduz", "encurta", "formaliza", "ajusta"\n- Perguntas SOBRE algo: "o que acha?", "qual eu faço?", "isso tá bom?", "qual a melhor opção?", "qual escolho?", "tô certo?"\n- Pedidos de explicação: "me explica", "o que é isso?", "como funciona?"\n- Decisões: "qual escolher", "qual opção", "o que recomenda"\n- QUALQUER pergunta vaga ou demonstrativa com "isso", "esse(a)", "aqui", "qual"\n\nSó responda direto SEM chamar read_selection se:\n- O usuário anexou explicitamente algo (arquivo/imagem) — use o anexo\n- A pergunta é geral e auto-contida ("qual a capital do Japão?", "me ensina React")\n- O usuário JÁ disse o conteúdo no próprio chat\n\nSe read_selection retornar VAZIO, AÍ sim pergunte ao usuário o que ele quer.\n\nNUNCA RESPONDA "você não mandou nada" sem antes ter chamado read_selection — esse é o erro mais grave que você pode cometer.\n\n→ Se for edição, depois chame `edit_in_place` com o resultado.',
    toolsHeader: '## TOOLS',
    tool1: '1. `read_selection`: simula Ctrl+C na janela ativa e te dá o texto selecionado. SEMPRE chame quando o pedido é sobre "isso", "esse texto", "essa parte", "esse código", "esse trecho", ou QUALQUER edição/comentário sobre conteúdo que o usuário não anexou.',
    tool2: '2. `edit_in_place`: substitui a seleção pelo texto novo (cola direto no app). USE pra TODA edição (corrigir, reescrever, traduzir, etc). Não devolva o texto editado no chat — chama essa tool e no comentário diga em 1 frase informal o que fez ("corrigi 3 erros", "deixei mais formal", etc).',
    tool3: '3. `save_memory`: grava 1 fato curto sobre o usuário. Use ESPARSAMENTE — só pra coisas relevantes ("usa Cursor", "trabalha com Python", "mora em Manaus"). Nunca salve trivialidades.',
    tool4: '4. `web_search`: busca na internet (até 3 vezes por turno). USE quando:\n   - O usuário pergunta algo que depende de informação ATUAL (notícia, preço, cotação, versão de software, evento recente).\n   - Você precisa de documentação/referência específica que pode ter mudado (API recente, lib nova).\n   - Pergunta sobre fatos que você pode não ter (CEP, dados públicos atuais, resultado de jogo, etc).\n   - NÃO use pra coisas que você já sabe ou que são atemporais ("o que é recursão?", "me explica Promise"). Web search custa dinheiro e tempo — só pra quando o conhecimento ESTÁTICO não basta.',
    antiHeader: '## ANTI-PATTERNS (NUNCA FAÇA ISSO)',
    antiBody: '- ❌ "Você não mandou nada aí. Qual a situação?" → ERRADO. Chame read_selection PRIMEIRO.\n- ❌ "Pra eu corrigir, preciso que cole o texto aqui." → ERRADO. Chame read_selection.\n- ❌ "Qual texto você quer?" → ERRADO. Chame read_selection.\n- ❌ "Manda a real, qual o contexto?" → ERRADO. Chame read_selection.\n- ❌ Devolver texto editado em code block no chat. → ERRADO. Use edit_in_place.',
    closing: 'A ÚNICA resposta aceitável pra "qual eu faço?" sem anexo é: chamar read_selection, ver o que tem, e RESPONDER baseado nisso.\n\nMarkdown OK pro chat (comentários, explicações). Edição de texto SEMPRE via edit_in_place.',
    memoriesLabel: '\n\nMEMÓRIAS sobre o usuário (use quando relevante):',
  },
};

export const ES: StringDict = {
  greeting: {
    morning: ['¡Buenos días! ¿Vamos?', '¿Listos para empezar?', '¡Buen día! Despierto.', 'Hola, fresco como una lechuga.'],
    afternoon: ['¿En qué te ayudo?', '¿Ya hay café?', '¿Cómo vas?', 'Aquí estoy, dime.'],
    evening: ['¡Buenas tardes!', 'El día se acaba.', 'A punto de cerrar el día...', 'Disponible — dispara.'],
    latenight: ['¿Sin sueño también? Dispara', '¿Madrugada productiva?', 'Aquí estoy, dale', '¿Modo búho? ¿En qué ayudo?'],
    monday: ['Lunes — vamos.', '¡Buen comienzo de semana!', 'Lunes, aquí estamos.'],
    friday: ['¡Viernes! ¿Qué hay?', 'La última del día, dale', '¡Viernes! Manda'],
    weekend: ['¿Trabajando en finde? Respect.', 'Sábado/domingo — ¿en qué ayudo?', 'Finde, aquí estoy'],
    generic: ['¿En qué te ayudo?', 'Dale, manda', 'Aquí estoy, habla', '¿Cuál es la idea?', '¿Qué hacemos?'],
  },

  input: {
    placeholder: 'pregúntame lo que sea...',
    placeholderAgent: '¿cuál es el objetivo? (ej: abrir la calculadora)',
    send: 'enviar',
    attach: 'Adjuntar',
    attachTitle: 'adjuntar imagen, archivo o ítem del portapapeles',
    agentMode: 'Modo Agente',
    agentModeTitle: 'modo agente — la mascota maneja tu computadora',
  },

  attach: {
    screenshot: 'Captura de pantalla',
    screenshotSub: 'selecciona una región',
    clipboard: 'Portapapeles',
    clipboardSub: 'lo que está copiado ahora',
    file: 'Archivo',
    fileSub: 'PDF, MD, TXT, DOCX, imagen',
    empty: 'portapapeles vacío',
    back: 'volver',
    imageItem: 'Imagen',
    textItem: 'Texto',
    imageSize: 'imagen ({kb}KB)',
    imageAttached: 'imagen adjuntada',
    removeChip: 'quitar',
    folder: 'Carpeta',
    folderSub: 'adjunta una carpeta entera para que el agente lea',
    dropHere: 'Suelta aquí',
    folderItemSuffix: '(carpeta)',
  },

  response: {
    ok: 'OK',
    continue: 'Continuar',
    explainMore: 'explica mejor',
    giveExample: 'dame un ejemplo',
    summarize: 'resume',
    quickReplyExplain: 'explícame mejor eso',
    quickReplyExample: 'dame un ejemplo práctico',
    quickReplySummarize: 'resume en una frase',
  },

  steps: {
    read_selection: 'leyó tu selección',
    edit_in_place: 'editó en tu ventana',
    save_memory: 'guardó en la memoria',
    web_search: '🔍 buscando en la web',
    screenshot: 'sacó una captura',
    attached_image: 'leyó la imagen',
    attached_file: 'leyó el archivo',
    list_folder: 'listó la carpeta',
    read_file: 'leyó el archivo',
    run_command: 'ejecutó comando',
  },

  shell: {
    wantsToRun: 'quiere ejecutar un comando',
    cwdLabel: 'carpeta',
    homeDir: 'directorio home',
    cancel: 'Cancelar',
    edit: 'Editar',
    run: 'Ejecutar',
    running: 'ejecutando…',
    ran: 'ejecutó',
    exitCode: 'exit',
    timedOut: 'timeout alcanzado',
    showOutput: 'ver output',
    hideOutput: 'ocultar output',
    noOutput: '(sin output)',
  },

  bubble: {
    thinking: 'pensando',
    play: '▶ reproducir',
    stop: '◼ parar',
    close: 'cerrar',
    manageAgents: '＋ Gestionar agentes…',
    customTag: 'custom',
  },

  agent: {
    starting: 'iniciando',
    done: 'hecho',
    error: 'error',
    stopped: 'parado',
    stop: 'parar',
  },

  errors: {
    NETWORK: 'estoy offline, revisa tu internet',
    INVALID_API_KEY: 'la API key no funciona — abre los ajustes desde la bandeja',
    RATE_LIMITED: 'calma, demasiadas preguntas a la vez',
    API_KEY_MISSING: 'API key no configurada',
    UNKNOWN: 'algo salió mal — ¿intentamos de nuevo?',
    unknownAgent: 'error desconocido',
  },

  config: {
    heading: 'Configura tu API key de Claude',
    help: 'Obtén una key en',
    helpLinkText: 'console.anthropic.com',
    helpAfter: '(settings → API keys).',
    placeholder: 'sk-ant-…',
    save: 'Guardar',
    saving: 'Guardando…',
    invalid: 'Esa key no parece válida (debe empezar con sk-ant-)',
  },

  tray: {
    wake: 'Despertar',
    settings: 'Ajustes…',
    configKey: 'Configurar API key',
    quit: 'Salir',
  },

  voice: {
    female: 'femenina',
    male: 'masculino',
  },

  settings: {
    titleBar: 'Claude Buddy — Ajustes',
    sidebar: {
      general: 'General',
      agents: 'Agentes',
      memories: 'Memorias',
      about: 'Acerca de',
    },
    general: {
      heading: 'General',
      language: 'Idioma',
      languageHelp: 'Idioma de la interfaz. El agente también responderá en este idioma por defecto.',
      theme: 'Tema',
      themeHelp: 'Claro, oscuro, o seguir Windows.',
      themeLight: 'Claro',
      themeDark: 'Oscuro',
      themeAuto: 'Auto',
      autostart: 'Iniciar con Windows',
      autostartHelp: 'Abre la mascota cuando inicies el PC, oculta en la bandeja.',
      idleTimeout: 'Tiempo hasta dormir',
      idleTimeoutHelp: 'Cuántos segundos sin interacción antes de que la mascota vuelva a dormir.',
      hotkey: 'Atajo de teclado',
      hotkeyHelp: 'Combinación que despierta a la mascota desde cualquier lugar.',
      tts: 'Leer respuesta en voz alta',
      ttsHelp: 'La mascota habla la respuesta usando voces neuronales de Edge.',
      voice: 'Voz',
      voiceHelp: 'Qué voz neuronal usar.',
      sounds: 'Sonidos',
      soundsHelp: 'Bipidos 8-bit al despertar, enviar, terminar, etc.',
      volume: 'Volumen de sonidos',
      volumeHelp: '{percent}% — arrastra para ajustar.',
      speed: 'Velocidad del habla',
      speedHelp: '{rate}× — arrastra para ajustar.',
      seconds15: '15 segundos',
      seconds30: '30 segundos',
      minute1: '1 minuto',
      minutes2: '2 minutos',
      minutes5: '5 minutos',
    },
    agents: {
      heading: 'Agentes',
      new: '＋ Nuevo agente',
      help: 'Cada agente tiene su propio system prompt, memorias y modelo. Cambiar de agente es como cambiar de "personalidad".',
      memoriesCount: '{n} memorias · modelo: {model}',
      edit: 'editar',
      builtInTag: 'built-in',
      back: '← volver',
      editAgent: 'Editar agente',
      newAgent: 'Nuevo agente',
      emoji: 'Emoji',
      name: 'Nombre',
      namePlaceholder: 'ej: SQL Helper',
      model: 'Modelo',
      modelAuto: 'Auto (elige según la pregunta)',
      modelHaiku: 'Haiku — rápido y barato',
      modelSonnet: 'Sonnet — más inteligente',
      sharedMemories: 'Memorias compartidas',
      sharedMemoriesHelp: 'Este agente también accede a las memorias de los demás.',
      systemPrompt: 'System prompt',
      systemPromptPlaceholder: 'Eres un asistente especializado en...',
      builtInNotice: 'Agente built-in — tus cambios se guardan. Para revertir al original, desinstala y reinstala.',
      delete: 'Eliminar agente',
      cancel: 'Cancelar',
      save: 'Guardar',
      saving: 'Guardando...',
      needName: 'Dale un nombre al agente',
      needPrompt: 'System prompt vacío',
      confirmDelete: '¿Eliminar "{name}"?',
    },
    memories: {
      heading: 'Memorias',
      help: 'Todo lo que la mascota sabe sobre ti entre conversaciones. Aprende sola usando la tool save_memory.',
      empty: 'Aún sin memorias. La mascota va a aprender con el tiempo.',
      clearAll: 'Borrar todas',
      confirmClear: '¿Borrar todas las memorias?',
    },
    about: {
      heading: 'Acerca de',
      version: 'Claude Buddy v0.2.0',
      tagline: 'Mascota desktop pixel-art con la API de Claude.',
      built: 'Construido con Electron, React, TypeScript y mucha cafeína.',
    },
  },

  systemPrompt: {
    respondInLanguage: 'Responde siempre en español (informal pero profesional, corto y directo). Markdown OK para el chat (negrita, listas, code blocks).',
  },

  builtInAgents: {
    buddy: {
      name: 'Buddy',
      prompt: 'Eres Claude Buddy, una mascota pixel-art que vive en la pantalla del usuario. Sé amistoso, casual y directo.',
    },
    codeHelper: {
      name: 'Code Helper',
      prompt: 'Eres un asistente de programación. Foco en:\n- Explicar código con claridad, ejemplos prácticos\n- Detectar bugs y sugerir fixes\n- Trade-offs entre soluciones\n- Patrones y buenas prácticas\n\nUsa code blocks para cualquier snippet (markdown).',
    },
    tutor: {
      name: 'Tutor de Español',
      prompt: 'Eres un tutor de español. Foco en:\n- Corregir ortografía, gramática, concordancia\n- Sugerir mejoras de estilo y claridad\n- Explicar reglas con ejemplos cortos\n- Tono didáctico pero ligero',
    },
    writer: {
      name: 'Escritor',
      prompt: 'Eres un copywriter / editor profesional. Foco en:\n- Escribir emails, textos cortos, posts, copy\n- Reescribir para más claridad, persuasión o concisión\n- Adaptar tono (formal, casual, técnico)',
    },
  },

  toolInstructions: {
    intro: 'Tienes 4 tools. Úsalas PROACTIVAMENTE — el usuario no te dará instrucciones explícitas, espera que descubras solo.',
    goldenRuleHeader: '## REGLA DE ORO',
    goldenRuleBody: 'El usuario muy probablemente tiene algo SELECCIONADO en otra app antes de llamarte. NO VES su pantalla — tienes que IR A BUSCARLO.\n\n**Cada vez que el usuario pregunta algo SIN haber adjuntado contexto explícito, tu PRIMERA ACCIÓN es llamar a `read_selection`.** Esto incluye:\n\n- Pedidos de EDICIÓN: "corrige", "arregla", "mejora", "reescribe", "traduce", "acorta", "formaliza", "ajusta"\n- Preguntas SOBRE algo: "¿qué piensas?", "¿cuál escojo?", "¿está bien esto?", "¿cuál es la mejor opción?", "¿estoy en lo correcto?"\n- Pedidos de explicación: "explícame", "¿qué es esto?", "¿cómo funciona?"\n- Decisiones: "cuál elegir", "qué opción", "qué recomiendas"\n- CUALQUIER pregunta vaga o demostrativa con "esto", "eso", "aquí", "cuál"\n\nSolo responde directo SIN llamar a read_selection si:\n- El usuario adjuntó algo explícitamente (archivo/imagen) — usa el adjunto\n- La pregunta es general y auto-contenida ("¿cuál es la capital de Japón?", "enséñame React")\n- El usuario YA dijo el contenido en el chat\n\nSi read_selection devuelve VACÍO, AHÍ pregunta al usuario qué quiere.\n\nNUNCA RESPONDAS "no enviaste nada" sin antes haber llamado a read_selection — ese es el peor error que puedes cometer.\n\n→ Si es edición, después llama a `edit_in_place` con el resultado.',
    toolsHeader: '## TOOLS',
    tool1: '1. `read_selection`: simula Ctrl+C en la ventana activa y te da el texto seleccionado. SIEMPRE llama cuando el pedido es sobre "esto", "este texto", "esta parte", "este código", "este fragmento", o CUALQUIER edición/comentario sobre contenido que el usuario no adjuntó.',
    tool2: '2. `edit_in_place`: reemplaza la selección por el nuevo texto (pega directo en la app). USA para TODA edición (corregir, reescribir, traducir, etc). No devuelvas el texto editado en el chat — llama a esta tool y en el comentario di en 1 frase informal lo que hiciste ("corregí 3 errores", "lo hice más formal", etc).',
    tool3: '3. `save_memory`: guarda 1 dato corto sobre el usuario. Usa con MESURA — solo para cosas relevantes ("usa Cursor", "trabaja con Python", "vive en Manaus"). Nunca guardes trivialidades.',
    tool4: '4. `web_search`: busca en internet (hasta 3 veces por turno). USA cuando:\n   - El usuario pregunta algo que depende de información ACTUAL (noticia, precio, cotización, versión de software, evento reciente).\n   - Necesitas documentación/referencia específica que puede haber cambiado (API reciente, lib nueva).\n   - Pregunta sobre hechos que puedes no tener (códigos postales, datos públicos actuales, resultado de partido, etc).\n   - NO uses para cosas que ya sabes o que son atemporales ("¿qué es la recursión?", "explícame Promises"). Web search cuesta dinero y tiempo — solo cuando el conocimiento ESTÁTICO no alcanza.',
    antiHeader: '## ANTI-PATTERNS (NUNCA HAGAS ESTO)',
    antiBody: '- ❌ "No enviaste nada. ¿Cuál es la situación?" → MAL. Llama a read_selection PRIMERO.\n- ❌ "Para corregir necesito que pegues el texto aquí." → MAL. Llama a read_selection.\n- ❌ "¿Qué texto quieres?" → MAL. Llama a read_selection.\n- ❌ "Dime de verdad, ¿cuál es el contexto?" → MAL. Llama a read_selection.\n- ❌ Devolver texto editado en code block en el chat. → MAL. Usa edit_in_place.',
    closing: 'La ÚNICA respuesta aceptable a "¿cuál escojo?" sin adjunto es: llamar a read_selection, ver lo que hay, y RESPONDER basado en eso.\n\nMarkdown OK para el chat (comentarios, explicaciones). Edición de texto SIEMPRE via edit_in_place.',
    memoriesLabel: '\n\nMEMORIAS sobre el usuario (usa cuando sea relevante):',
  },
};

const DICTS: Record<Locale, StringDict> = { en: EN, pt: PT, es: ES };

// Generic recursive accessor: t('settings.general.theme', 'en') etc.
// Variables in braces are replaced: t('attach.imageSize', 'en', { kb: 42 })
export function translate(locale: Locale, key: string, vars?: Record<string, string | number>): string {
  const dict = DICTS[locale] ?? EN;
  const segs = key.split('.');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let cur: any = dict;
  for (const seg of segs) {
    if (cur && typeof cur === 'object' && seg in cur) cur = cur[seg];
    else return key; // missing key → return the key itself (helps debug)
  }
  if (typeof cur !== 'string') return key;
  if (!vars) return cur;
  return cur.replace(/\{(\w+)\}/g, (_, name) => String(vars[name] ?? `{${name}}`));
}

// Direct dict accessor — useful when you need a structured value (like the
// greetings arrays) instead of a flat string.
export function dict(locale: Locale): StringDict {
  return DICTS[locale] ?? EN;
}
