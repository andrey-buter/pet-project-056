export default {
  async fetch(request, env) {
    if (request.method === "POST") {
      try {
        const payload = await request.json();
        
        // --- ФЛАГ ДЕБАГА ---
        const DEBUG = env.DEBUG === "true";

        // --- Вспомогательная функция для логов ---
        const debugLog = (...args) => {
          if (DEBUG) {
            console.log("[DEBUG]", ...args);
          }
        };

        // Убедимся, что это текстовое сообщение
        if (payload.message && payload.message.text) {
          const chatId = payload.message.chat.id.toString();
          const text = payload.message.text.trim();

          // Проверка: отвечаем только вам
          if (chatId !== env.ALLOWED_CHAT_ID) {
            debugLog(`Проигнорировано сообщение от чужого чата: ${chatId}`);
            return new Response("OK");
          }

          let inputs = {};
          let replyMessage = "";

          // Проверяем, это команда или токен?
          if (text === "/run" || text === "/check" || text === "/start") {
            replyMessage = "⏳ Отправлена команда на ручной запуск проверки (со старым токеном)...";
            debugLog("Обнаружена команда /run");
          } else {
            inputs = { newToken: text };
            replyMessage = "✅ Получен новый токен! Обновляю секрет и запускаю клики...";
            debugLog("Обнаружен новый токен");
          }

          const githubRepo = env.GITHUB_REPO;
          const githubToken = env.GITHUB_PAT;
          const workflowId = "cron.yml";
          const githubBranch = env.GITHUB_BRANCH || "main";

          debugLog(`Делаю запрос к GitHub API... Репо: ${githubRepo}, Ветка: ${githubBranch}`);
          debugLog(`Inputs:`, JSON.stringify(inputs));

          const githubRes = await fetch(`https://api.github.com/repos/${githubRepo}/actions/workflows/${workflowId}/dispatches`, {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${githubToken}`,
              "Accept": "application/vnd.github.v3+json",
              "User-Agent": "Cloudflare-Worker"
            },
            body: JSON.stringify({
              ref: githubBranch,
              inputs: inputs 
            })
          });

          const githubResText = await githubRes.text();

          if (githubRes.ok) {
            debugLog(`УСПЕХ GitHub: статус ${githubRes.status}`);
            if (DEBUG) {
               replyMessage += `\n\n[DEBUG Info]\nGitHub Status: ${githubRes.status} (должно быть 204)\nGitHub Response: ${githubResText || "Пусто (Это норма)"}`;
            }
          } else {
            debugLog(`ОШИБКА GitHub: статус ${githubRes.status}, текст: ${githubResText}`);
            console.error(`[ERROR] GitHub Response Error: ${githubRes.status} ${githubResText}`);
            replyMessage = `❌ Ошибка вызова GitHub: HTTP ${githubRes.status}\n\nТекст ошибки: ${githubResText}`;
          }

          debugLog(`Отправляем итоговый ответ в Телеграм:`, replyMessage);

          await fetch(`https://api.telegram.org/bot${env.TG_BOT_TOKEN}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              chat_id: chatId,
              text: replyMessage
            })
          });
        }
        return new Response("OK");
      } catch (e) {
        console.error(`[ERROR] КРИТИЧЕСКАЯ ОШИБКА в скрипте Cloudflare: ${e.message}`);
        
        try {
          await fetch(`https://api.telegram.org/bot${env.TG_BOT_TOKEN}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              chat_id: env.ALLOWED_CHAT_ID,
              text: `💥 Скрипт Cloudflare упал с ошибкой:\n${e.message}`
            })
          });
        } catch(e2) {}

        return new Response("Error", { status: 500 });
      }
    }
    return new Response("Method not allowed", { status: 405 });
  }
};
