import fetch from "node-fetch";
import TelegramBot from "node-telegram-bot-api";
import fs from "fs";

const config = JSON.parse(fs.readFileSync("./config.json", "utf8"));

const bot = new TelegramBot(config.telegram.botToken, { polling: true });
const chatId = config.telegram.chatId;

const alertState = {}; // chống spam alert

// =========================
// LẤY GIÁ THEO PAIR ADDRESS
// =========================
async function getPairData(chain, pairAddress) {
  const url = `https://api.dexscreener.com/latest/dex/pairs/${chain}/${pairAddress}`;
  const res = await fetch(url);
  const json = await res.json();

  if (!json.pair) {
    throw new Error("Pair not found");
  }

  const p = json.pair;

  return {
    price: Number(p.priceUsd),
    change24h: Number(p.priceChange?.h24 || 0),
    liquidity: Number(p.liquidity?.usd || 0),
    url: p.url
  };
}

// =========================
// CHECK ALERT 24H
// =========================
async function checkAlerts() {
  for (const token of config.tokens) {
    try {
      const d = await getPairData(token.chain, token.pairAddress);
      const change = d.change24h;
      const limit = token.alert.percentChange;
      const key = token.symbol;
      const now = Date.now();

      // reset sau 24h
      if (alertState[key] && now - alertState[key] > 86400000) {
        delete alertState[key];
      }

      if (Math.abs(change) >= limit && !alertState[key]) {
        const trend = change >= 0 ? "📈" : "📉";

        await bot.sendMessage(
          chatId,
`${trend} *ALERT ${token.symbol.toUpperCase()}*

💵 Price: $${d.price}
📊 24h Change: ${change}%
💧 Liquidity: $${Math.round(d.liquidity)}

🔗 ${d.url}
`,
          { parse_mode: "Markdown" }
        );

        alertState[key] = now;
      }

    } catch (e) {
      console.error("Alert error:", token.symbol, e.message);
    }
  }
}

// =========================
// /price COMMAND
// =========================
bot.onText(/\/price/, async msg => {
  for (const token of config.tokens) {
    try {
      const d = await getPairData(token.chain, token.pairAddress);
      const trend = d.change24h >= 0 ? "📈" : "📉";

      await bot.sendMessage(
        msg.chat.id,
`${trend} *${token.symbol.toUpperCase()}*

💵 Price: $${d.price}
📊 24h Change: ${d.change24h}%
💧 Liquidity: $${Math.round(d.liquidity)}

🔗 ${d.url}
`,
        { parse_mode: "Markdown" }
      );
    } catch {
      bot.sendMessage(msg.chat.id, `❌ Không lấy được giá ${token.symbol}`);
    }
  }
});

// =========================
// /setalert 15
// =========================
bot.onText(/\/setalert (\d+)/, (msg, match) => {
  const val = Number(match[1]);
  config.tokens.forEach(t => t.alert.percentChange = val);
  fs.writeFileSync("./config.json", JSON.stringify(config, null, 2));
  bot.sendMessage(msg.chat.id, `✅ Alert 24h set = ${val}%`);
});

// =========================
// START
// =========================
setInterval(checkAlerts, config.intervalSeconds * 1000);
console.log("🚀 Dex pair price bot running...");
