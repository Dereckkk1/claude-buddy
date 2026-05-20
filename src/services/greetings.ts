// Pool de saudações contextuais. Função pura: dado um Date, devolve uma frase.

const morning = [
  'Bom dia! No que posso ajudar?',
  'Bora começar o dia?',
  'Manhã chegou, partiu produzir?',
  'Tô acordado, manda',
];

const afternoon = [
  'E aí, no que ajudo?',
  'Pausa pra um café? Manda',
  'Como tá indo? Posso ajudar?',
  'Tô aqui, fala',
];

const evening = [
  'Boa noite! Manda a real',
  'Fim do dia chegando, no que ajudo?',
  'Me usa antes de fechar o trampo',
  'Tô disponível, fala',
];

const latenight = [
  'Sem sono também? Manda',
  'Madrugada produtiva, hein?',
  'Tô aqui, manda ver',
  'Noite virou, no que ajudo?',
];

const monday = [
  'Segundou, bora?',
  'Começo de semana — no que posso ajudar?',
  'Segunda chegou, partiu',
];

const friday = [
  'Sextou! O que rola?',
  'Última do dia, manda',
  'Sextouuu, no que ajudo?',
];

const weekend = [
  'Fim de semana e ainda tá trampando? F',
  'Sábadão/domingão, no que ajudo?',
  'Mesmo no fim de semana, tô aqui',
];

const generic = [
  'Como posso ajudar?',
  'Manda a real, no que ajudo?',
  'Tô aqui, fala',
  'Qual a vibe?',
  'No que ajudo agora?',
];

function bucketFromHour(hour: number): string[] {
  if (hour >= 5 && hour < 12) return morning;
  if (hour >= 12 && hour < 18) return afternoon;
  if (hour >= 18 && hour < 23) return evening;
  return latenight; // 23-04
}

function bonusFromDay(day: number, hour: number): string[] {
  // 0=Sun, 1=Mon, ..., 5=Fri, 6=Sat
  if (day === 0 || day === 6) return weekend;
  if (day === 1 && hour < 13) return monday;
  if (day === 5 && hour >= 14) return friday;
  return [];
}

export function pickGreeting(now: Date = new Date()): string {
  const hour = now.getHours();
  const day = now.getDay();
  const pool = [...bucketFromHour(hour), ...bonusFromDay(day, hour), ...generic];
  return pool[Math.floor(Math.random() * pool.length)];
}
