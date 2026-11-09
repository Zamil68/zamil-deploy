const CC_SET = new Set([
  "1","7",
  "20","27","30","31","32","33","34","36","39","40","41","43","44","45","46","47","48","49",
  "51","52","53","54","55","56","57","58","60","61","62","63","64","65","66",
  "81","82","84","86","90","91","92","93","94","95","98",
  "211","212","213","216","218","220","221","222","223","224","225","226","227","228","229",
  "230","231","232","233","234","235","236","237","238","239",
  "240","241","242","243","244","245","246","248","249",
  "250","251","252","253","254","255","256","257","258",
  "260","261","262","263","264","265","266","267","268","269",
  "290","291","297","298","299",
  "350","351","352","353","354","355","356","357","358","359",
  "370","371","372","373","374","375","376","377","378","379",
  "380","381","382","383","385","386","387","389",
  "420","421","423",
  "500","501","502","503","504","505","506","507","508","509",
  "590","591","592","593","594","595","596","597","598","599",
  "670","672","673","674","675","676","677","678","679",
  "680","681","682","683","685","686","687","688","689","690","691","692",
  "850","852","853","855","856","880","886",
  "960","961","962","963","964","965","966","967","968","970","971","972","973","974","975","976","977",
  "992","993","994","995","996","998"
]);

export function stripPlus(num: string | number): string {
  return String(num || "").replace(/^\+/, "").replace(/^00/, "").trim();
}

export function stripCC(num: string | number): string {
  const s = stripPlus(num);
  if (!s) return String(num || "");
  
  if (s.length > 3 && CC_SET.has(s.slice(0, 3))) return s.slice(3);
  if (s.length > 2 && CC_SET.has(s.slice(0, 2))) return s.slice(2);
  if (s.length > 1 && CC_SET.has(s.slice(0, 1))) return s.slice(1);
  return s;
}

export function detectCCLen(nums: string[]): number {
  if (!nums || !nums.length) return 0;
  
  const counts: Record<number, number> = {};
  for (let i = 0; i < Math.min(nums.length, 30); i++) {
    const s = stripPlus(nums[i]);
    let len = 0;
    
    if (s.length > 3 && CC_SET.has(s.slice(0, 3))) len = 3;
    else if (s.length > 2 && CC_SET.has(s.slice(0, 2))) len = 2;
    else if (s.length > 1 && CC_SET.has(s.slice(0, 1))) len = 1;
    
    counts[len] = (counts[len] || 0) + 1;
  }
  
  let best = 0;
  let maxCount = 0;
  for (const k in counts) {
    if (counts[k] > maxCount) {
      maxCount = counts[k];
      best = parseInt(k, 10);
    }
  }
  return best;
}

const COUNTRY_FLAGS: Record<string, string> = {
  "usa": "🇺🇸", "us": "🇺🇸", "united states": "🇺🇸", "america": "🇺🇸",
  "canada": "🇨🇦", "ca": "🇨🇦", "mexico": "🇲🇽", "mx": "🇲🇽",
  "brazil": "🇧🇷", "br": "🇧🇷", "argentina": "🇦🇷", "chile": "🇨🇱", "colombia": "🇨🇴",
  "peru": "🇵🇪", "venezuela": "🇻🇪", "ecuador": "🇪🇨", "bolivia": "🇧🇴", "paraguay": "🇵🇾",
  "uruguay": "🇺🇾", "cuba": "🇨🇺", "jamaica": "🇯🇲", "panama": "🇵🇦", "dominican": "🇩🇴",
  "uk": "🇬🇧", "united kingdom": "🇬🇧", "gb": "🇬🇧", "england": "🇬🇧",
  "germany": "🇩🇪", "de": "🇩🇪", "france": "🇫🇷", "fr": "🇫🇷", "spain": "🇪🇸",
  "italy": "🇮🇹", "netherlands": "🇳🇱", "belgium": "🇧🇪", "switzerland": "🇨🇭",
  "austria": "🇦🇹", "sweden": "🇸🇪", "norway": "🇳🇴", "denmark": "🇩🇰", "finland": "🇫🇮",
  "poland": "🇵🇱", "ukraine": "🇺🇦", "russia": "🇷🇺", "portugal": "🇵🇹", "greece": "🇬🇷",
  "egypt": "🇪🇬", "morocco": "🇲🇦", "algeria": "🇩🇿", "tunisia": "🇹🇳", "south africa": "🇿🇦",
  "nigeria": "🇳🇬", "kenya": "🇰🇪", "ghana": "🇬🇭", "ethiopia": "🇪🇹", "cameroon": "🇨🇲",
  "saudi arabia": "🇸🇦", "saudi": "🇸🇦", "uae": "🇦🇪", "dubai": "🇦🇪", "emirates": "🇦🇪",
  "qatar": "🇶🇦", "kuwait": "🇰🇼", "bahrain": "🇧🇭", "oman": "🇴🇲", "iraq": "🇮🇶",
  "iran": "🇮🇷", "turkey": "🇹🇷", "israel": "🇮🇱", "palestine": "🇵🇸", "jordan": "🇯🇴", "lebanon": "🇱🇧",
  "pakistan": "🇵🇰", "pk": "🇵🇰", "india": "🇮🇳", "bangladesh": "🇧🇩", "sri lanka": "🇱🇰",
  "china": "🇨🇳", "japan": "🇯🇵", "korea": "🇰🇷", "south korea": "🇰🇷", "indonesia": "🇮🇩",
  "malaysia": "🇲🇾", "singapore": "🇸🇬", "thailand": "🇹🇭", "vietnam": "🇻🇳", "philippines": "🇵🇭",
  "australia": "🇦🇺", "new zealand": "🇳🇿",
  // ── NEW: Added missing countries ──
  "afghanistan": "🇦🇫", "af": "🇦🇫", "awcc": "🇦🇫",
  "albania": "🇦🇱", "angola": "🇦🇴", "ao": "🇦🇴",
  "armenia": "🇦🇲", "azerbaijan": "🇦🇿",
  "belarus": "🇧🇾", "benin": "🇧🇯", "bhutan": "🇧🇹",
  "bosnia": "🇧🇦", "herzegovina": "🇧🇦", "bosnia and herzegovina": "🇧🇦",
  "botswana": "🇧🇼", "brunei": "🇧🇳", "bulgaria": "🇧🇬",
  "burkina faso": "🇧🇫", "burundi": "🇧🇮",
  "cambodia": "🇰🇭", "cape verde": "🇨🇻",
  "central african republic": "🇨🇫", "chad": "🇹🇩",
  "comoros": "🇰🇲", "congo": "🇨🇬", "costa rica": "🇨🇷",
  "croatia": "🇭🇷", "cyprus": "🇨🇾", "czech": "🇨🇿", "czech republic": "🇨🇿",
  "djibouti": "🇩🇯",
  "dominica": "🇩🇲", "dominican republic": "🇩🇴",
  "el salvador": "🇸🇻", "equatorial guinea": "🇬🇶", "eritrea": "🇪🇷",
  "estonia": "🇪🇪", "eswatini": "🇸🇿", "swaziland": "🇸🇿",
  "fiji": "🇫🇯", "gabon": "🇬🇦", "gambia": "🇬🇲", "georgia": "🇬🇪",
  "grenada": "🇬🇩", "guatemala": "🇬🇹", "guinea": "🇬🇳",
  "guinea-bissau": "🇬🇼", "guyana": "🇬🇾", "haiti": "🇭🇹",
  "honduras": "🇭🇳", "hungary": "🇭🇺", "iceland": "🇮🇸",
  "ireland": "🇮🇪", "ivory coast": "🇨🇮", "cote d'ivoire": "🇨🇮",
  "kazakhstan": "🇰🇿", "kiribati": "🇰🇮", "kosovo": "🇽🇰",
  "kyrgyzstan": "🇰🇬", "laos": "🇱🇦", "latvia": "🇱🇻",
  "lesotho": "🇱🇸", "liberia": "🇱🇷", "libya": "🇱🇾",
  "liechtenstein": "🇱🇮", "lithuania": "🇱🇹", "luxembourg": "🇱🇺",
  "madagascar": "🇲🇬", "malawi": "🇲🇼", "maldives": "🇲🇻",
  "mali": "🇲🇱", "malta": "🇲🇹", "marshall islands": "🇲🇭",
  "mauritania": "🇲🇷", "mauritius": "🇲🇺",
  "micronesia": "🇫🇲", "moldova": "🇲🇩", "monaco": "🇲🇨",
  "mongolia": "🇲🇳", "montenegro": "🇲🇪", "mozambique": "🇲🇿",
  "myanmar": "🇲🇲", "burma": "🇲🇲", "namibia": "🇳🇦",
  "nauru": "🇳🇷", "nepal": "🇳🇵", "nicaragua": "🇳🇮",
  "niger": "🇳🇪", "north korea": "🇰🇵", "north macedonia": "🇲🇰",
  "macedonia": "🇲🇰", "palau": "🇵🇼", "papua new guinea": "🇵🇬",
  "romania": "🇷🇴", "rwanda": "🇷🇼", "samoa": "🇼🇸",
  "san marino": "🇸🇲", "sao tome": "🇸🇹", "principe": "🇸🇹",
  "senegal": "🇸🇳", "serbia": "🇷🇸", "seychelles": "🇸🇨",
  "sierra leone": "🇸🇱", "slovakia": "🇸🇰", "slovenia": "🇸🇮",
  "solomon islands": "🇸🇧", "somalia": "🇸🇴", "sudan": "🇸🇩",
  "south sudan": "🇸🇸", "suriname": "🇸🇷",
  "syria": "🇸🇾", "tajikistan": "🇹🇯", "tanzania": "🇹🇿",
  "timor-leste": "🇹🇱", "togo": "🇹🇬", "tonga": "🇹🇴",
  "trinidad": "🇹🇹", "tobago": "🇹🇹", "trinidad and tobago": "🇹🇹",
  "turkmenistan": "🇹🇲", "tuvalu": "🇹🇻", "uganda": "🇺🇬",
  "uzbekistan": "🇺🇿", "vanuatu": "🇻🇺", "vatican": "🇻🇦",
  "yemen": "🇾🇪", "zambia": "🇿🇲", "zimbabwe": "🇿🇼",
  "taiwan": "🇹🇼", "hong kong": "🇭🇰", "macau": "🇲🇴",
  "puerto rico": "🇵🇷", "guam": "🇬🇺", "bermuda": "🇧🇲",
  "gibraltar": "🇬🇮", "greenland": "🇬🇱", "faroe islands": "🇫🇴",
  "cayman islands": "🇰🇾", "british virgin islands": "🇻🇬",
  "us virgin islands": "🇻🇮", "american samoa": "🇦🇸",
  "northern mariana islands": "🇲🇵", "falkland islands": "🇫🇰",
  "new caledonia": "🇳🇨", "french polynesia": "🇵🇫",
  "cook islands": "🇨🇰", "wallis and futuna": "🇼🇫",
  "saint lucia": "🇱🇨", "saint vincent": "🇻🇨",
  "antigua": "🇦🇬", "barbuda": "🇦🇬", "antigua and barbuda": "🇦🇬",
  "saint kitts": "🇰🇳", "nevis": "🇰🇳",
  "grenadines": "🇻🇨", "saint pierre": "🇵🇲", "miquelon": "🇵🇲",
  "mayotte": "🇾🇹", "reunion": "🇷🇪", "guadeloupe": "🇬🇵",
  "martinique": "🇲🇶", "french guiana": "🇬🇫",
  "aruba": "🇦🇼", "curacao": "🇨🇼", "sint maarten": "🇸🇽",
  "bonaire": "🇧🇶", "saba": "🇧🇶", "sint eustatius": "🇧🇶",
  "saint barthelemy": "🇧🇱", "saint martin": "🇲🇫",
  "anguilla": "🇦🇮", "montserrat": "🇲🇸",
  "turks and caicos": "🇹🇨", "british indian ocean territory": "🇮🇴",
  "south georgia": "🇬🇸", "south sandwich islands": "🇬🇸",
  "heard island": "🇭🇲", "mcdonald islands": "🇭🇲",
  "bouvet island": "🇧🇻", "christmas island": "🇨🇽",
  "cocos islands": "🇨🇨", "keeling islands": "🇨🇨",
  "norfolk island": "🇳🇫", "niue": "🇳🇺",
  "tokelau": "🇹🇰", "pitcairn": "🇵🇳",
  "svalbard": "🇸🇯", "jan mayen": "🇸🇯",
  "aland islands": "🇦🇽", "isle of man": "🇮🇲",
  "jersey": "🇯🇪", "guernsey": "🇬🇬",
  "andorra": "🇦🇩",
  "vatican city": "🇻🇦",
  "holy see": "🇻🇦",
  // ── Common range/carrier abbreviations ──
  "roshan": "🇦🇫", "mtn": "🇿🇦", "vodafone": "🇬🇧",
  "orange": "🇫🇷", "telenor": "🇳🇴", "zte": "🇨🇳", "huawei": "🇨🇳",
  "etisalat": "🇦🇪", "du": "🇦🇪", "stc": "🇸🇦", "mobily": "🇸🇦",
  "zain": "🇰🇼", "ooredoo": "🇶🇦", "batelco": "🇧🇭",
  "jazz": "🇵🇰", "telenor pk": "🇵🇰", "zong": "🇵🇰", "ufone": "🇵🇰",
  "airtel": "🇮🇳", "jio": "🇮🇳", "bsnl": "🇮🇳", "vi": "🇮🇳",
  "grameenphone": "🇧🇩", "robi": "🇧🇩", "banglalink": "🇧🇩",
  "dialog": "🇱🇰", "mobitel": "🇱🇰", "hutch": "🇱🇰",
  "celcom": "🇲🇾", "digi": "🇲🇾", "maxis": "🇲🇾", "umobile": "🇲🇾",
  "globe": "🇵🇭", "smart": "🇵🇭", "sun": "🇵🇭",
  "telkomsel": "🇮🇩", "xl": "🇮🇩", "indosat": "🇮🇩", "tri": "🇮🇩",
  "ais": "🇹🇭", "dtac": "🇹🇭", "true": "🇹🇭",
  "viettel": "🇻🇳", "mobifone": "🇻🇳", "vinaphone": "🇻🇳",
  "telstra": "🇦🇺", "optus": "🇦🇺", "vodafone au": "🇦🇺",
  "spark": "🇳🇿", "vodafone nz": "🇳🇿", "2degrees": "🇳🇿",
  "safaricom": "🇰🇪", "airtel ke": "🇰🇪",
  "mtn ng": "🇳🇬", "airtel ng": "🇳🇬", "glo": "🇳🇬", "9mobile": "🇳🇬",
  "vodacom": "🇿🇦", "mtn za": "🇿🇦", "cell c": "🇿🇦",
  "maroc telecom": "🇲🇦", "inwi": "🇲🇦", "orange ma": "🇲🇦",
  "ooredoo tn": "🇹🇳", "orange tn": "🇹🇳", "tt": "🇹🇳",
  "algérie telecom": "🇩🇿", "djezzy": "🇩🇿", "mobilis": "🇩🇿",
  "libyana": "🇱🇾", "al-madar": "🇱🇾",
  "sudani": "🇸🇩", "zain sd": "🇸🇩", "mtc": "🇸🇩",
  "ethio telecom": "🇪🇹", "safaricom et": "🇪🇹",
  "camtel": "🇨🇲", "mtn cm": "🇨🇲", "orange cm": "🇨🇲",
  "ghana telecom": "🇬🇭", "mtn gh": "🇬🇭", "airtel gh": "🇬🇭",
  "uganda telecom": "🇺🇬", "mtn ug": "🇺🇬", "airtel ug": "🇺🇬",
  "tanzania telecom": "🇹🇿", "vodafone tz": "🇹🇿", "airtel tz": "🇹🇿",
  "rwanda telecom": "🇷🇼", "mtn rw": "🇷🇼", "airtel rw": "🇷🇼",
  "burundi telecom": "🇧🇮", "econet": "🇧🇮",
  "somali telecom": "🇸🇴", "hormuud": "🇸🇴", "somtel": "🇸🇴",
  "djibouti telecom": "🇩🇯",
  "comoros telecom": "🇰🇲",
  "seychelles telecom": "🇸🇨",
  "mauritius telecom": "🇲🇺",
  "madagascar telecom": "🇲🇬",
  "mozambique telecom": "🇲🇿",
  "zambia telecom": "🇿🇲",
  "zimbabwe telecom": "🇿🇼",
  "botswana telecom": "🇧🇼",
  "namibia telecom": "🇳🇦",
  "lesotho telecom": "🇱🇸",
  "eswatini telecom": "🇸🇿",
  "malawi telecom": "🇲🇼",
  "angola telecom": "🇦🇴",
  "congo telecom": "🇨🇬",
  "drc telecom": "🇨🇩",
  "gabon telecom": "🇬🇦",
  "equatorial guinea telecom": "🇬🇶",
  "sao tome telecom": "🇸🇹",
  "cape verde telecom": "🇨🇻",
  "guinea telecom": "🇬🇳",
  "guinea-bissau telecom": "🇬🇼",
  "sierra leone telecom": "🇸🇱",
  "liberia telecom": "🇱🇷",
  "ivory coast telecom": "🇨🇮",
  "burkina faso telecom": "🇧🇫",
  "mali telecom": "🇲🇱",
  "niger telecom": "🇳🇪",
  "chad telecom": "🇹🇩",
  "central african republic telecom": "🇨🇫",
  "cameroon telecom": "🇨🇲",
  "benin telecom": "🇧🇯",
  "togo telecom": "🇹🇬",
  "senegal telecom": "🇸🇳",
  "gambia telecom": "🇬🇲",
  "mauritania telecom": "🇲🇷",
};

export function getCountryFlag(country: string): string {
  if (!country) return "🌐";
  const key = String(country).toLowerCase().replace(/[^a-z\s]/g, " ").replace(/\s+/g, " ").trim();
  
  if (COUNTRY_FLAGS[key]) return COUNTRY_FLAGS[key];
  
  const parts = key.split(/\s+/);
  for (let len = parts.length; len >= 1; len--) {
    for (let i = 0; i + len <= parts.length; i++) {
      const sub = parts.slice(i, i + len).join(" ");
      if (COUNTRY_FLAGS[sub]) return COUNTRY_FLAGS[sub];
    }
  }
  return "🌐";
}

export function splitRangeName(title: string): { country: string; detail: string; isSplitTerritory?: boolean } {
  let raw = String(title || "").trim();
  if (!raw) return { country: "Universal", detail: "" };
  
  let isSplitTerritory = false;
  const mixMatch = raw.match(/^(\d{1,4})\s*[+&]\s*(\d{1,4})\s*-\s*(.+)$/);
  if (mixMatch) {
    raw = mixMatch[3].trim();
    isSplitTerritory = true;
  }
  
  const stripped = raw.replace(/^\d+\s*-\s*/, "").replace(/^-\s*/, "").trim();
  const words = stripped.split(/\s+/);
  const countryWords: string[] = [];
  let detailStart = words.length;
  
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (/^\d/.test(w) || /^(LX|MX|RX|d)\b/i.test(w) || /^\(/.test(w)) {
      detailStart = i;
      break;
    }
    countryWords.push(w);
  }
  
  const country = countryWords.join(" ").trim() || words[0] || "Global";
  const detail = words.slice(detailStart).join(" ").trim();
  
  return { country, detail, isSplitTerritory };
}

// Legacy helpers (kept for backward compatibility with older components)
export function fmtPkTime(hhmmss: string){ const p=String(hhmmss||"").split(":"); const h=+p[0]||0,m=+p[1]||0; const pk=(h+5)%24; const ap=pk>=12?"PM":"AM"; const h12=pk%12||12; return h12+":"+String(m).padStart(2,"0")+" "+ap; }
export function otpCode(msg: string){ const m=String(msg||"").match(/\b(\d{4,8})\b/); return m?m[1]:""; }
export async function copyText(t: string){ try{ await navigator.clipboard.writeText(t); return true; }catch{ return false; } }
