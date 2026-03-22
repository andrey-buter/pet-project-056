const BUZZ52_TOKEN = process.env.BUZZ52_TOKEN;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

async function sendTelegramMessage(text) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.log("Telegram credentials not provided. Skipping message:", text);
    return;
  }
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text: text,
        disable_web_page_preview: true,
      }),
    });
  } catch (e) {
    console.error("Failed to send Telegram message", e);
  }
}

async function main() {
  if (!BUZZ52_TOKEN) {
    console.error("Missing BUZZ52_TOKEN environment variable");
    process.exit(1);
  }

  const headers = {
    accept: "*/*",
    "accept-language": "en-US,en;q=0.9,ru-RU;q=0.8,ru;q=0.7,km;q=0.6",
    authorization: `Bearer ${BUZZ52_TOKEN}`,
    "cache-control": "no-cache",
    "content-type": "application/json",
    origin: "https://www.buzz52.com",
    pragma: "no-cache",
    priority: "u=1, i",
    referer: "https://www.buzz52.com/",
    "sec-ch-ua":
      '"Chromium";v="146", "Not-A.Brand";v="24", "Google Chrome";v="146"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"Windows"',
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "same-site",
    "user-agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36",
  };

  console.log("Fetching posts...");
  let postsResponse;
  try {
    postsResponse = await fetch("https://api.buzz52.com/api/posts", {
      headers,
    });
  } catch (e) {
    console.error("Error fetching posts:", e);
    return;
  }

  if (postsResponse.status === 401 || postsResponse.status === 403) {
    console.error("Token expired or unauthorized!");
    await sendTelegramMessage(
      "⚠️ Токен Buzz52 протух (Expired 401)! Пожалуйста, обновите токен в GitHub Secrets (или другим способом).",
    );
    process.exit(1);
  }

  if (!postsResponse.ok) {
    const text = await postsResponse.text();
    console.error(`Received status ${postsResponse.status}: ${text}`);
    return;
  }

  let data;
  try {
    data = await postsResponse.json();
  } catch (e) {
    console.error("Error parsing JSON:", e);
    return;
  }

  const posts = data.posts || [];
  const unclickedPosts = posts.filter((post) => post.clicked === false);

  console.log(`Found ${unclickedPosts.length} unclicked posts.`);

  if (unclickedPosts.length === 0) {
    console.log("Nothing to do.");
    // Отправляем отчёт "Отдыхаем", только если мы запустили скрипт вручную (или через Телегу)
    if (process.env.GITHUB_EVENT_NAME === 'workflow_dispatch') {
      await sendTelegramMessage(
        "ℹ️ В Buzz52 пока нет новых (непрокликанных) постов. Отдыхаем! 😴",
      );
    }
    return;
  }

  for (const post of unclickedPosts) {
    console.log(`Clicking post ${post.post_id}...`);

    try {
      const clickResponse = await fetch(
        `https://api.buzz52.com/api/posts/${post.post_id}/click`,
        {
          method: "POST",
          headers: {
            ...headers,
            "content-length": "0",
          },
        },
      );

      if (clickResponse.ok) {
        console.log(`Successfully clicked post ${post.post_id}`);
        await sendTelegramMessage(
          `✅ Пост прокликался!\nID: ${post.post_id}\nURL: ${post.post_url}`,
        );
      } else if (clickResponse.status === 401 || clickResponse.status === 403) {
        console.error("Token expired while clicking!");
        await sendTelegramMessage(
          "⚠️ Токен Buzz52 протух (Expired) прямо во время кликов! Пожалуйста, обновите токен.",
        );
        process.exit(1);
      } else {
        console.error(
          `Failed to click post ${post.post_id}. Status: ${clickResponse.status}`,
        );
      }
    } catch (e) {
      console.error(`Error requesting click for post ${post.post_id}:`, e);
    }

    // Небольшая задержка, чтобы не спамить API одновременно и не получить бан (Rate Limit)
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  console.log("Done!");
}

main();
