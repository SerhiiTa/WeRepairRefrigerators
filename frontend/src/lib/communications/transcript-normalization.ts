const DIGIT_WORDS: Record<string, string> = {
  eight: "8",
  five: "5",
  four: "4",
  nine: "9",
  oh: "0",
  one: "1",
  seven: "7",
  six: "6",
  three: "3",
  two: "2",
  zero: "0",
};

const SMALL_NUMBERS: Record<string, number> = {
  eight: 8,
  eighteen: 18,
  eleven: 11,
  fifteen: 15,
  five: 5,
  fourteen: 14,
  four: 4,
  nine: 9,
  nineteen: 19,
  one: 1,
  seven: 7,
  seventeen: 17,
  six: 6,
  sixteen: 16,
  ten: 10,
  thirteen: 13,
  three: 3,
  twelve: 12,
  two: 2,
};

const TENS: Record<string, number> = {
  eighty: 80,
  fifty: 50,
  forty: 40,
  ninety: 90,
  seventy: 70,
  sixty: 60,
  thirty: 30,
  twenty: 20,
};

const ORDINALS: Record<string, string> = {
  eighth: "8",
  eighteenth: "18",
  eleventh: "11",
  fifteenth: "15",
  fifth: "5",
  first: "1",
  fourteenth: "14",
  fourth: "4",
  nineteenth: "19",
  ninth: "9",
  second: "2",
  seventeenth: "17",
  seventh: "7",
  sixteenth: "16",
  sixth: "6",
  tenth: "10",
  third: "3",
  thirteenth: "13",
  thirtieth: "30",
  thirty: "30",
  twelfth: "12",
  twentieth: "20",
  twenty: "20",
};

const MONTHS =
  "January|February|March|April|May|June|July|August|September|October|November|December";
const WORD = String.raw`(?:zero|oh|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred)`;
const WORD_SEQUENCE = String.raw`${WORD}(?:[\s-]+${WORD}){0,10}`;
const DIGIT_SEQUENCE = String.raw`(?:zero|oh|one|two|three|four|five|six|seven|eight|nine)(?:[\s-]+(?:zero|oh|one|two|three|four|five|six|seven|eight|nine)){0,14}`;

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[\s-]+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

function digitWordsToString(value: string): string | null {
  const tokens = tokenize(value);
  if (tokens.length === 0 || tokens.some((token) => !(token in DIGIT_WORDS))) {
    return null;
  }
  return tokens.map((token) => DIGIT_WORDS[token]).join("");
}

function spokenNumberToInteger(value: string): number | null {
  const digitString = digitWordsToString(value);
  if (digitString && digitString.length > 1) {
    return Number.parseInt(digitString, 10);
  }

  let current = 0;
  let total = 0;
  for (const token of tokenize(value)) {
    if (token in SMALL_NUMBERS) {
      current += SMALL_NUMBERS[token];
      continue;
    }
    if (token in TENS) {
      current += TENS[token];
      continue;
    }
    if (token === "hundred") {
      current = Math.max(current, 1) * 100;
      continue;
    }
    return null;
  }

  total += current;
  return total > 0 ? total : null;
}

function formatUsPhone(digits: string): string | null {
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 11 && digits.startsWith("1")) {
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  return null;
}

function parseTimePhrase(value: string): { hour: number; minute: number } | null {
  const tokens = tokenize(value);
  if (tokens.length === 0 || tokens.length > 3) {
    return null;
  }

  const hour = spokenNumberToInteger(tokens[0]);
  if (!hour || hour < 1 || hour > 12) {
    return null;
  }

  if (tokens.length === 1) {
    return { hour, minute: 0 };
  }

  const minutePhrase = tokens.slice(1).join(" ");
  const minute = spokenNumberToInteger(minutePhrase);
  if (minute === null || minute < 0 || minute > 59) {
    return null;
  }

  return { hour, minute };
}

function formatTime(value: string, period?: string): string {
  const parsed = parseTimePhrase(value);
  if (!parsed) {
    return value;
  }

  const suffix = period
    ? period.toLowerCase() === "morning"
      ? " AM"
      : " PM"
    : "";
  return `${parsed.hour}:${parsed.minute.toString().padStart(2, "0")}${suffix}`;
}

function normalizeZipCodes(text: string): string {
  const pattern = new RegExp(
    String.raw`\b((?:my\s+)?zip(?:\s+code)?(?:\s+is)?|postal\s+code(?:\s+is)?)\s+(${DIGIT_SEQUENCE})\b`,
    "gi",
  );
  return text.replace(pattern, (match, label, digitsPhrase) => {
    const digits = digitWordsToString(digitsPhrase);
    return digits?.length === 5 ? `${label} ${digits}` : match;
  });
}

function normalizePhoneNumbers(text: string): string {
  const pattern = new RegExp(
    String.raw`\b((?:my\s+)?phone(?:\s+number)?(?:\s+is)?|mobile(?:\s+number)?(?:\s+is)?|cell(?:\s+number)?(?:\s+is)?|call\s+me\s+at|my\s+number\s+is|best\s+number\s+is)\s+(${DIGIT_SEQUENCE})\b`,
    "gi",
  );
  return text.replace(pattern, (match, label, digitsPhrase) => {
    const digits = digitWordsToString(digitsPhrase);
    const formatted = digits ? formatUsPhone(digits) : null;
    return formatted ? `${label} ${formatted}` : match;
  });
}

function normalizeUnitIdentifiers(text: string): string {
  const pattern = new RegExp(
    String.raw`\b(apartment|apt|unit|suite|building|gate\s+code)\s+(${DIGIT_SEQUENCE})\b`,
    "gi",
  );
  return text.replace(pattern, (match, label, digitsPhrase) => {
    const digits = digitWordsToString(digitsPhrase);
    return digits ? `${label} ${digits}` : match;
  });
}

function normalizeStreetNumbers(text: string): string {
  const pattern = new RegExp(
    String.raw`\b(my\s+address\s+is|service\s+address|i\s+live\s+at|come\s+to|the\s+address\s+is)\s+(${WORD_SEQUENCE})(?=\s+[A-Za-z0-9])`,
    "gi",
  );
  return text.replace(pattern, (match, label, numberPhrase) => {
    const number = spokenNumberToInteger(numberPhrase);
    return number ? `${label} ${number}` : match;
  });
}

function normalizeTimes(text: string): string {
  const rangePattern = new RegExp(
    String.raw`\b(from)\s+(${WORD}(?:[\s-]+${WORD}){0,2})\s+to\s+(${WORD}(?:[\s-]+${WORD}){0,2})\s+in\s+the\s+(morning|afternoon|evening)\b`,
    "gi",
  );
  const withRanges = text.replace(rangePattern, (_match, label, start, end, period) => {
    return `${label} ${formatTime(start, period)} to ${formatTime(end, period)}`;
  });

  const atPattern = new RegExp(
    String.raw`\b(at)\s+(${WORD}(?:[\s-]+${WORD}){0,2})(?:\s+in\s+the\s+(morning|afternoon|evening))\b`,
    "gi",
  );
  return withRanges.replace(atPattern, (_match, label, timePhrase, period) => {
    return `${label} ${formatTime(timePhrase, period)}`;
  });
}

function normalizeDates(text: string): string {
  const pattern = new RegExp(
    String.raw`\b(${MONTHS})\s+([A-Za-z-]+)(?:\s+([A-Za-z-]+))?\b`,
    "gi",
  );
  return text.replace(pattern, (match, month, first, second) => {
    const firstKey = String(first).toLowerCase();
    const secondKey = second ? String(second).toLowerCase() : null;

    if (firstKey in ORDINALS && !secondKey) {
      return `${month} ${ORDINALS[firstKey]}`;
    }
    if (firstKey === "twenty" && secondKey && secondKey in ORDINALS) {
      return `${month} ${20 + Number.parseInt(ORDINALS[secondKey], 10)}`;
    }
    if (firstKey === "thirty" && secondKey && secondKey === "first") {
      return `${month} 31`;
    }
    if (firstKey in ORDINALS && secondKey && secondKey in ORDINALS) {
      return `${month} ${ORDINALS[firstKey]} ${ORDINALS[secondKey]}`;
    }

    return match;
  });
}

export function normalizeTranscriptForDisplay(text: string): string {
  if (text.trim().length === 0) {
    return text;
  }

  return [
    normalizeZipCodes,
    normalizePhoneNumbers,
    normalizeUnitIdentifiers,
    normalizeStreetNumbers,
    normalizeTimes,
    normalizeDates,
  ].reduce((current, normalizer) => normalizer(current), text);
}
