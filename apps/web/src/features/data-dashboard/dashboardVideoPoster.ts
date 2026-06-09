const POSTER_PALETTE = [
  ["#263645", "#5f8aa3"],
  ["#3a3340", "#9a6f86"],
  ["#263b35", "#66a179"],
  ["#3a3526", "#b18b45"],
] as const;

function hashSeed(seed: string) {
  let hash = 0;
  for (const char of seed) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return hash;
}

export function dashboardVideoPosterDataUrl(seed: string) {
  const [from, to] = POSTER_PALETTE[hashSeed(seed) % POSTER_PALETTE.length] ?? [
    "#263645",
    "#5f8aa3",
  ];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180" role="img"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs><rect width="320" height="180" fill="url(#g)"/><rect x="16" y="16" width="288" height="148" rx="12" fill="none" stroke="rgba(255,255,255,.24)" stroke-width="2"/><circle cx="160" cy="90" r="30" fill="rgba(255,255,255,.9)"/><path d="M152 75v30l26-15z" fill="#1f2933"/></svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}
